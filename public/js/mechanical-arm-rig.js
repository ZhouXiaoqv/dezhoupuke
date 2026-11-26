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
  const defs = svgElement(svg, "defs");
  function material(name, stops) {
    const id = svg.id + name;
    const gradient = svgElement(defs, "linearGradient", { id, x1: 0, x2: 0, y1: 0, y2: "100%" });
    for (const [offset, color] of stops) svgElement(gradient, "stop", { offset, "stop-color": color });
    return "url(#" + id + ")";
  }
  const ivory = material("Ivory", [[0, "#fffbf0"], [.21, "#eee1cc"], [.66, "#e1d3bc"], [1, "#baa78b"]]);
  const edge = material("Edge", [[0, "#b5a187"], [.62, "#82705c"], [1, "#54483d"]]);
  const inset = material("Inset", [[0, "#282725"], [.44, "#524c42"], [1, "#867966"]]);
  const bronze = material("Bronze", [[0, "#f1d5a1"], [.58, "#bba078"], [1, "#806c52"]]);
  const roller = material("Roller", [[0, "#746657"], [.42, "#e1d3bc"], [.64, "#988870"], [1, "#4b4137"]]);
  const grainId = svg.id + "Brushed";
  const grain = svgElement(defs, "pattern", { id: grainId, width: 19, height: 8, patternUnits: "userSpaceOnUse" });
  svgElement(grain, "path", { d: "M0 1h13m2 0h4M2 5h6m3 2h8", fill: "none", stroke: "#786350", opacity: .22, "stroke-width": .42 });
  svgElement(grain, "path", { d: "M4 3h13m-14 3h10", fill: "none", stroke: "#fffbed", opacity: .68, "stroke-width": .48 });
  const brushed = "url(#" + grainId + ")";

  function rect(parent, x, y, width, height, rx, fill, stroke = "none") {
    return svgElement(parent, "rect", { x, y, width, height, rx, fill, stroke });
  }

  function bolt(parent, x, y, radius) {
    const screw = svgElement(parent, "g");
    svgElement(screw, "circle", { r: radius, fill: inset, stroke: "#f7ebd2", "stroke-width": .45 });
    svgElement(screw, "circle", { r: radius * .64, fill: bronze });
    svgElement(screw, "path", { d: `M${-radius * .43} ${radius * .22}l${radius * .86} ${-radius * .44}`,
      stroke: "#433b31", "stroke-width": .65 });
    position(screw, { x, y });
    return screw;
  }

  function beveledPlate(length, half, chamfer) {
    const right = length + 6;
    return `M-6 ${-half + chamfer}L${-6 + chamfer} ${-half}H${right - chamfer}` +
      `L${right} ${-half + chamfer}V${half - chamfer}L${right - chamfer} ${half}H${-6 + chamfer}L-6 ${half - chamfer}Z`;
  }

  function upperLink(parent) {
    const edgePlate = svgElement(parent, "path", { fill: edge, stroke: "#665746", transform: "translate(0 4.4)" });
    const bevel = svgElement(parent, "path", { fill: ivory, stroke: "#8d795f" });
    const face = svgElement(parent, "path", { fill: brushed, stroke: "#fffaeb", "stroke-width": .9 });
    const ribWell = rect(parent, 13, 1, 1, 10, 3, edge, "#aa9477");
    const rib = rect(parent, 15, 2, 1, 6, 2.3, ivory, "#f7ecd5");
    const ribLight = rect(parent, 19, 3, 1, 1, .5, "#fff8e8");
    const holes = [0, 1].map(() => rect(parent, 0, -11, 1, 8.5, 4, inset, "#b8a486"));
    const screws = [-15, 14.5].flatMap(y => [.23, .43, .62, .81].map(x => ({ x, y, node: bolt(parent, 0, 0, 1.7) })));
    return length => {
      const outline = beveledPlate(length, 20, 9);
      edgePlate.setAttribute("d", outline);
      bevel.setAttribute("d", outline);
      face.setAttribute("d", beveledPlate(length, 17, 11));
      for (const [part, start] of [[ribWell, 13], [rib, 15], [ribLight, 19]]) {
        part.setAttribute("width", Math.max(0, length - 2 * start));
      }
      const holeZone = Math.max(0, length - 44);
      const holeWidth = Math.min(51, holeZone * .39);
      holes.forEach((hole, index) => {
        hole.setAttribute("width", holeWidth);
        hole.setAttribute("x", 22 + holeZone * (index ? .54 : .04));
      });
      screws.forEach(({ x, y, node }) => position(node, { x: x * length, y }));
    };
  }

  function trussLink(parent) {
    const braceDepth = svgElement(parent, "path", { fill: "none", stroke: "#5d5245", "stroke-width": 6.5,
      "stroke-linecap": "round", "stroke-linejoin": "round", transform: "translate(0 2.4)" });
    const brace = svgElement(parent, "path", { class: "arm-truss-brace", fill: "none", stroke: "#ac9678",
      "stroke-width": 5.2, "stroke-linecap": "round", "stroke-linejoin": "round" });
    const highlight = svgElement(parent, "path", { fill: "none", stroke: "#ecdbbf", "stroke-width": 1.15, transform: "translate(0 -1)" });
    const rails = [-16, 7].map(y => [
      rect(parent, -6, y + 3.3, 1, 10, 4.2, edge, "#625646"),
      rect(parent, -6, y, 1, 10, 4.2, ivory, "#89765e"),
      rect(parent, -5, y + 1.2, 1, 7, 3.2, brushed, "#f9eed7"),
    ]);
    const ends = [0, 1].map(() => rect(parent, 0, -17, 9, 36, 3.5, ivory, "#8d7b63"));
    const fasteners = [-11, 12].flatMap(y => [.24, .50, .76].map(x => ({ x, y, node: bolt(parent, 0, 0, 1.75) })));
    return length => {
      const diagonal = `M4 11L${length * .28} -10L${length * .52} 11L${length * .75} -10L${length - 4} 11`;
      for (const part of [braceDepth, brace, highlight]) part.setAttribute("d", diagonal);
      rails.forEach(parts => parts.forEach((part, index) => part.setAttribute("width", length + (index === 2 ? 10 : 12))));
      ends[0].setAttribute("x", 6);
      ends[1].setAttribute("x", length - 15);
      fasteners.forEach(({ x, y, node }) => position(node, { x: x * length, y }));
    };
  }

  function wristLink(parent) {
    const body = [
      rect(parent, -5, -8.4, 1, 20, 5, edge, "#665747"),
      rect(parent, -5, -11, 1, 19, 5, ivory, "#9a856b"),
      rect(parent, 0, -5, 1, 8, 2.4, inset, "#b9a58b"),
      rect(parent, 3, -3.2, 1, 1.9, .9, bronze),
    ];
    return length => body.forEach((part, index) => part.setAttribute("width", Math.max(0, length + [9, 9, -4, -8][index])));
  }

  const links = [upperLink, trussLink, wristLink].map(build => {
    const link = svgElement(svg, "g", { class: "arm-segment" });
    return { link, resize: build(link), length: -1 };
  });
  const radii = [24, 19, 14.5];
  const hubs = radii.map(radius => {
    const hub = svgElement(svg, "g", { class: "arm-hinge" });
    svgElement(hub, "circle", { r: radius, cy: 4, fill: edge, stroke: "#73604c" });
    svgElement(hub, "circle", { r: radius, fill: ivory, stroke: "#8c785e" });
    svgElement(hub, "circle", { r: radius * .91, fill: brushed, stroke: "#fcf0d6", "stroke-width": .8 });
    svgElement(hub, "circle", { r: radius * .77, fill: inset, stroke: bronze, "stroke-width": 1.2 });
    svgElement(hub, "circle", { r: radius * .64, fill: ivory, stroke: "#5b5041", "stroke-width": .75 });
    const marks = radius >= 19 ? 18 : 12;
    const rotor = svgElement(hub, "g", { class: "arm-bearing-rotor" });
    const ticks = Array.from({ length: marks }, (_, index) => {
      const angle = index / marks * Math.PI * 2;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      return `M${dx * radius * .47} ${dy * radius * .47}L${dx * radius * .59} ${dy * radius * .59}`;
    }).join("");
    svgElement(rotor, "path", { d: ticks, fill: "none", stroke: "#776550", "stroke-width": .7 });
    svgElement(rotor, "circle", { r: radius * .35, fill: edge, stroke: "#fff1d1", "stroke-width": .75 });
    svgElement(rotor, "path", { d: `M${-radius * .22} 0h${radius * .44}M0 ${-radius * .22}v${radius * .44}`,
      fill: "none", stroke: "#352e27", "stroke-width": Math.max(1, radius * .055), "stroke-linecap": "round" });
    return { hub, rotor };
  });

  const gripper = svgElement(svg, "g", { class: "arm-gripper" });
  rect(gripper, -15, -7, 23, 20, 4, edge, "#635749");
  rect(gripper, -15, -10, 23, 20, 4, ivory, "#917d63");
  rect(gripper, -12, -3.9, 23, 7.8, 2.4, inset, "#af9c82");
  rect(gripper, -9, -6.7, 11.5, 1, .5, "#fff1d7");
  rect(gripper, -8, 5.2, 12, 1.2, .5, bronze);
  const jaws = [-1, 1].map(sign => {
    const jaw = svgElement(gripper, "g", { class: "arm-jaw" });
    svgElement(jaw, "path", { d: `M1 ${-sign * 3}H14L20 ${sign * 1.7}L18 ${sign * 3.1}H10L7 ${sign * 2}H1Z`,
      fill: ivory, stroke: "#81715d", "stroke-width": .75 });
    rect(jaw, 10, -2.6, 5.2, 5.2, 1.5, roller, "#594d3f");
    svgElement(jaw, "path", { d: "M11.3 -1.5v3m2-3v3", stroke: "#fdebc9", opacity: .65, "stroke-width": .55 });
    bolt(jaw, 5.1, 0, 1.35);
    return jaw;
  });

  const shadowDefs = svgElement(shadow, "defs");
  function projectedLayer(name, color) {
    const id = shadow.id + name;
    const filter = svgElement(shadowDefs, "filter", { id, filterUnits: "userSpaceOnUse" });
    const blur = svgElement(filter, "feGaussianBlur", { stdDeviation: 5 });
    const plane = svgElement(shadow, "g", { filter: `url(#${id})` });
    const segments = [38, 26, 18].map(width => svgElement(plane, "line", {
      stroke: color, "stroke-width": width, "stroke-linecap": "round",
    }));
    const bearings = radii.map(r => svgElement(plane, "circle", { r, fill: color }));
    const clamp = svgElement(plane, "ellipse", { rx: 19, ry: 9, fill: color });
    return { filter, plane, blur, segments, bearings, clamp };
  }
  const ambientShadow = projectedLayer("Ambient", "#6d543b");
  const bodyShadow = projectedLayer("Body", "#423628");
  let painted;

  function project(layer, joints, angle, altitude, softness, opacity) {
    const projected = joints.map(({ x, y }, index) => ({
      x: x + altitude * (.4 + index * .19),
      y: y + altitude * (.43 + index * .24),
    }));
    // Keep each blur surface around the projected silhouette, with room for its falloff.
    const padding = 25 + softness * 3.5;
    const xs = projected.map(point => point.x), ys = projected.map(point => point.y);
    const x = Math.floor((Math.min(...xs) - padding) / 32) * 32;
    const y = Math.floor((Math.min(...ys) - padding) / 32) * 32;
    const width = Math.ceil((Math.max(...xs) + padding) / 32) * 32 - x;
    const height = Math.ceil((Math.max(...ys) + padding) / 32) * 32 - y;
    const region = `${x},${y},${width},${height}`;
    if (layer.region !== region) {
      layer.filter.setAttribute("x", x);
      layer.filter.setAttribute("y", y);
      layer.filter.setAttribute("width", width);
      layer.filter.setAttribute("height", height);
      layer.region = region;
    }
    layer.blur.setAttribute("stdDeviation", softness.toFixed(2));
    layer.plane.setAttribute("opacity", opacity.toFixed(3));
    layer.segments.forEach((segment, index) => {
      const a = projected[index], b = projected[index + 1];
      segment.setAttribute("x1", a.x);
      segment.setAttribute("y1", a.y);
      segment.setAttribute("x2", b.x);
      segment.setAttribute("y2", b.y);
    });
    layer.bearings.forEach((bearing, index) => position(bearing, projected[index]));
    position(layer.clamp, projected[3], angle);
  }

  function draw({ pose, joints, state }) {
    if (svg.dataset.armState !== state) svg.dataset.armState = state;
    if (painted && painted.angle === pose.angle && painted.lift === pose.lift &&
        joints.every((joint, index) => joint.x === painted.joints[index].x && joint.y === painted.joints[index].y)) return;
    painted = { angle: pose.angle, lift: pose.lift, joints };
    const bearings = links.map((segment, index) => {
      const start = joints[index], end = joints[index + 1];
      const dx = end.x - start.x, dy = end.y - start.y;
      const length = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      position(segment.link, start, angle);
      if (Math.abs(segment.length - length) > .08) {
        segment.resize(length);
        segment.length = length;
      }
      return angle;
    });
    hubs.forEach(({ hub, rotor }, index) => {
      position(hub, joints[index]);
      rotor.setAttribute("transform", `rotate(${bearings[index]})`);
    });
    position(gripper, pose, pose.angle);

    const reach = Math.hypot(pose.x - joints[0].x, pose.y - joints[0].y);
    const altitude = 4 + pose.lift * .21 + reach * .022;
    project(ambientShadow, joints, pose.angle, altitude + 6, 5.2 + altitude * .43, .19);
    project(bodyShadow, joints, pose.angle, altitude, 1.8 + altitude * .33, Math.max(.11, .26 - altitude * .007));
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
