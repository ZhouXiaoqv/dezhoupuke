// Coordinates are CSS pixels relative to the table. Angles are degrees clockwise from +x.
const MechanicalArmMotion = (() => {
  const clamp = t => Math.max(0, Math.min(1, t));
  const mix = (a, b, t) => a + (b - a) * t;
  const angleDelta = (a, b) => ((b - a + 180) % 360 + 360) % 360 - 180;

  function bezier(t, a, b, c, d) {
    const rest = 1 - t;
    return rest ** 3 * a + 3 * rest ** 2 * t * b + 3 * rest * t ** 2 * c + t ** 3 * d;
  }

  function easing(value) {
    if (!Array.isArray(value)) return typeof value === "function" ? value : t => t;
    const [x1, y1, x2, y2] = value;
    return progress => {
      if (progress <= 0 || progress >= 1) return progress;
      // CSS-style easing solves the curve for x before sampling y.
      let left = 0, right = 1;
      for (let i = 0; i < 14; i++) {
        const u = (left + right) / 2;
        if (bezier(u, 0, x1, x2, 1) < progress) left = u;
        else right = u;
      }
      return bezier((left + right) / 2, 0, y1, y2, 1);
    };
  }

  function interpolate(a, b, t, controls) {
    if (!controls) return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) };
    const [first, second] = controls;
    return { x: bezier(t, a.x, first.x, second.x, b.x), y: bezier(t, a.y, first.y, second.y, b.y) };
  }

  function solve(root, tip) {
    const travel = Math.hypot(tip.x - root.x, tip.y - root.y);
    const angle = tip.angle * Math.PI / 180;
    const extension = 27 + travel * .115;
    const wrist = { x: tip.x - Math.cos(angle) * extension, y: tip.y - Math.sin(angle) * extension };
    const dx = wrist.x - root.x, dy = wrist.y - root.y;
    const distance = Math.max(.1, Math.hypot(dx, dy));
    let upper = 93 + travel * .28, lower = 91 + travel * .25;
    const stretch = Math.max(1, (distance + 8) / (upper + lower));
    upper *= stretch;
    lower *= stretch;
    const cosine = (upper ** 2 + distance ** 2 - lower ** 2) / (2 * upper * distance);
    const shoulder = Math.atan2(dy, dx) - Math.acos(Math.max(-1, Math.min(1, cosine)));
    const elbow = { x: root.x + Math.cos(shoulder) * upper, y: root.y + Math.sin(shoulder) * upper };
    return { elbow, wrist };
  }

  /**
   * @typedef {{x:number,y:number,angle?:number,lift?:number}} ArmPose
   * @typedef {{duration:number,easing?:(number[]|function(number):number),
   *   controls?:ArmPose[],rebound?:number,reboundDuration?:number,
   *   dip?:number,bob?:number,state?:"moving"|"holding"|"returning"}} ArmMove
   *
   * The driver takes Cartesian poses only. Its sample includes the displayed tip and
   * tangent, so an object released partway through a command starts at the drawn pose.
   */
  function create({ draw = () => {}, elbowDelay = 45, wristDelay = 55 } = {}) {
    let root = { x: 0, y: 0 };
    let home = { x: 0, y: 0, angle: 0, lift: 0 };
    let output;
    const motions = [];

    function sample(time) {
      const command = motions.findLast(motion => motion.start <= time);
      if (!command) return home;
      const { start, duration, curve, from, to, controls, rebound, reboundDuration, dip, bob } = command;
      const elapsed = time - start;
      const progress = duration ? clamp(elapsed / duration) : 1;
      const t = curve(progress);
      const point = interpolate(from, to, t, controls);
      const charge = Math.sin(Math.PI * clamp((progress - .25) / .75));
      const wobble = rebound ? clamp(elapsed / reboundDuration) : 1;
      const damped = wobble === 1 ? 0 : Math.sin(wobble * Math.PI * 3) * (1 - wobble) ** 2 * 1.35;
      return {
        x: point.x,
        y: point.y + dip * charge - bob * Math.sin(progress * Math.PI) ** 2,
        angle: from.angle + angleDelta(from.angle, to.angle) * t + rebound * damped,
        lift: mix(from.lift, to.lift, t),
      };
    }

    function resize(origin) {
      const dx = origin.x - root.x;
      const shift = point => ({ ...point, x: point.x + dx });
      home = shift(home);
      for (const motion of motions) {
        motion.from = shift(motion.from);
        motion.to = shift(motion.to);
        motion.controls = motion.controls?.map(shift);
      }
      root = origin;
    }

    function reset(pose, time = 0) {
      motions.length = 0;
      home = { angle: 0, lift: 0, ...pose };
      return tick(time);
    }

    /** @param {ArmPose} pose @param {ArmMove} options */
    function move(pose, options, time) {
      const from = sample(time);
      const to = { ...from, ...pose };
      const { duration, controls, dip = 0, bob = 0, rebound = 0, reboundDuration = duration } = options;
      motions.push({ start: time, duration, controls, dip, bob, rebound,
        reboundDuration: Math.max(1, reboundDuration), from, to, curve: easing(options.easing),
        state: options.state || "moving" });
    }

    function tick(time) {
      const tipTime = time - wristDelay;
      const tip = sample(tipTime);
      const near = sample(tipTime - 10);
      const far = sample(tipTime + 10);
      const latest = motions.at(-1);
      const active = !!latest && time < latest.start +
        Math.max(latest.duration, latest.rebound ? latest.reboundDuration : 0) + wristDelay;
      const dx = far.x - near.x, dy = far.y - near.y;
      const length = Math.hypot(dx, dy);
      const bearing = tip.angle * Math.PI / 180;
      const tangent = length > .001 ? { x: dx / length, y: dy / length }
        : { x: Math.cos(bearing), y: Math.sin(bearing) };
      const { wrist } = solve(root, tip);
      const { elbow } = solve(root, sample(time - elbowDelay));
      output = { pose: tip, joints: [root, elbow, wrist, tip], tangent, active,
        state: active ? latest.state : "idle" };
      draw(output);
      while (motions.length > 1 && motions[1].start < tipTime - 10) motions.shift();
      return output;
    }

    return { resize, reset, move, tick, get pose() { return output?.pose || home; }, followDelay: wristDelay };
  }

  return { create, easing, interpolate, angleDelta };
})();

function createMechanicalArmRig(svg, shadow, base) {
  const ns = "http://www.w3.org/2000/svg";
  const svgElement = (parent, tag, attributes = {}) => {
    const el = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
    parent.append(el);
    return el;
  };
  const position = (element, { x, y }, angle = 0) => {
    element.setAttribute("transform", "translate(" + x + " " + y + ") rotate(" + angle + ")");
  };
  const steelId = svg.id + "Steel", darkId = svg.id + "Edge", blurId = shadow.id + "Blur";
  const defs = svgElement(svg, "defs");
  for (const [id, stops] of [
    [steelId, [[0, "#fffdf6"], [.31, "#f0e6d5"], [.60, "#d4c5ae"], [1, "#aa987e"]]],
    [darkId, [[0, "#b6a48c"], [.54, "#8a7660"], [1, "#5c4d41"]]],
  ]) {
    const gradient = svgElement(defs, "linearGradient", { id, x1: 0, x2: 0, y1: 0, y2: "100%" });
    for (const [offset, color] of stops) svgElement(gradient, "stop", { offset, "stop-color": color });
  }
  const shadowDefs = svgElement(shadow, "defs");
  const filter = svgElement(shadowDefs, "filter", { id: blurId, x: "-35%", y: "-60%", width: "170%", height: "220%" });
  const blur = svgElement(filter, "feGaussianBlur", { stdDeviation: 5 });
  const shadowPlane = svgElement(shadow, "g", { filter: "url(#" + blurId + ")" });
  const segments = [34, 27, 19].map(width => svgElement(shadowPlane, "line", {
    stroke: "#514331", "stroke-width": width, "stroke-linecap": "round",
  }));
  const jawsShadow = svgElement(shadowPlane, "ellipse", { rx: 18, ry: 10, fill: "#514331" });

  const links = [31, 24, 16].map((width, index) => {
    const link = svgElement(svg, "g", { class: "arm-segment" });
    const plates = [
      svgElement(link, "rect", { x: -7, y: 5 - width / 2, height: width + 2, rx: 6, fill: "url(#" + darkId + ")" }),
      svgElement(link, "rect", { x: -7, y: -width / 2, height: width, rx: 6, fill: "url(#" + steelId + ")", class: "arm-link-face" }),
      svgElement(link, "rect", { x: 7, y: -width * .28, height: width * .56, rx: 3, class: "arm-inset" }),
      svgElement(link, "rect", { x: 15, y: -width * .19, height: 2, rx: 1, class: "arm-rail" }),
      svgElement(link, "rect", { x: 15, y: width * .12, height: 2, rx: 1, class: "arm-rail" }),
    ];
    const bolts = [0, 1].map(() => svgElement(link, "circle", { r: index === 2 ? 1.5 : 2, cy: -width * .34, class: "arm-pin" }));
    return { link, plates, bolts };
  });
  const hubs = [23, 17, 12].map(radius => {
    const hub = svgElement(svg, "g", { class: "arm-hinge" });
    svgElement(hub, "circle", { r: radius, cy: 4, fill: "url(#" + darkId + ")" });
    svgElement(hub, "circle", { r: radius, fill: "url(#" + steelId + ")", class: "arm-link-face" });
    svgElement(hub, "circle", { r: radius * .72, class: "arm-hub-ring" });
    svgElement(hub, "circle", { r: radius * .49, class: "arm-hub-inner" });
    svgElement(hub, "circle", { r: radius * .19, class: "arm-pin" });
    return hub;
  });
  const gripper = svgElement(svg, "g", { class: "arm-gripper" });
  svgElement(gripper, "rect", { x: -12, y: -7, width: 17, height: 15, rx: 3, fill: "url(#" + steelId + ")", class: "arm-link-face" });
  const jaws = [-1, 1].map(sign => svgElement(gripper, "path", {
    d: "M0 0 H12 L16 " + (-sign * 3) + " H20 L16 " + (sign * 3) + " H0 Z",
    fill: "url(#" + darkId + ")", class: "arm-jaw",
  }));

  function draw({ pose, joints, state }) {
    if (svg.dataset.armState !== state) svg.dataset.armState = state;
    links.forEach(({ link, plates, bolts }, index) => {
      const start = joints[index], end = joints[index + 1];
      const dx = end.x - start.x, dy = end.y - start.y;
      const length = Math.hypot(dx, dy);
      position(link, start, Math.atan2(dy, dx) * 180 / Math.PI);
      plates.forEach(plate => {
        const inset = Number(plate.getAttribute("x"));
        plate.setAttribute("width", Math.max(0, length - 2 * inset));
      });
      bolts[0].setAttribute("cx", 11);
      bolts[1].setAttribute("cx", Math.max(11, length - 11));
    });
    hubs.forEach((hub, index) => position(hub, joints[index]));
    position(gripper, pose, pose.angle);

    const reach = Math.hypot(pose.x - joints[0].x, pose.y - joints[0].y);
    const altitude = 3 + pose.lift * .15 + reach * .011;
    blur.setAttribute("stdDeviation", (2.5 + altitude * .43).toFixed(2));
    shadowPlane.setAttribute("opacity", Math.max(.12, .31 - altitude * .009).toFixed(3));
    segments.forEach((segment, index) => {
      const a = joints[index], b = joints[index + 1];
      const dropA = altitude * (.4 + index * .22), dropB = dropA + altitude * .22;
      for (const [name, value] of Object.entries({ x1: a.x + dropA * .65, y1: a.y + dropA, x2: b.x + dropB * .65, y2: b.y + dropB })) {
        segment.setAttribute(name, value);
      }
    });
    position(jawsShadow, { x: pose.x + altitude * .7, y: pose.y + altitude }, pose.angle);
  }

  function hardware({ lamp = "", hatch = false, grip = false } = {}) {
    const hatchState = hatch ? "open" : "closed";
    if (base.dataset.hatch !== hatchState) base.dataset.hatch = hatchState;
    base.style.setProperty("--arm-lamp", lamp || "#66816d");
    base.classList.toggle("mechanical-base-active", !!lamp);
    jaws.forEach((jaw, index) => position(jaw, { x: 0, y: (index ? 1 : -1) * (grip ? 3 : 6) }));
  }

  const motion = MechanicalArmMotion.create({ draw });
  return { motion, hardware, resize(width, height) {
    const viewBox = "0 0 " + width + " " + height;
    svg.setAttribute("viewBox", viewBox);
    shadow.setAttribute("viewBox", viewBox);
    motion.resize({ x: width / 2, y: 22 });
  } };
}
