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
   *   dip?:number,bob?:number,wristAngle?:number,wristDuration?:number,
   *   wristEasing?:(number[]|function(number):number),state?:"moving"|"holding"|"returning"}} ArmMove
   *
   * The driver takes Cartesian poses only. Its sample includes the displayed tip and
   * tangent, so an object released partway through a command starts at the drawn pose.
   */
  function create({ draw = () => {}, elbowDelay = 45, wristDelay = 55 } = {}) {
    let root = { x: 0, y: 0 };
    let home = { x: 0, y: 0, angle: 0, lift: 0 };
    let output;
    const slides = [];
    const motions = [];

    function slideAt(time) {
      const slide = slides.findLast(move => move.start <= time);
      if (!slide) return 0;
      const t = clamp((time - slide.start) / slide.duration);
      return mix(slide.from, slide.to, t * t * (3 - 2 * t));
    }

    function slideTo(offset, duration, time) {
      slides.push({ from: slideAt(time), to: Math.max(-12, Math.min(12, offset)),
        start: time, duration: Math.max(1, duration) });
    }

    function sample(time) {
      const command = motions.findLast(motion => motion.start <= time);
      if (!command) return home;
      const { start, duration, curve, wristCurve, wristDuration, from, to, controls, rebound, reboundDuration, dip, bob } = command;
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
        angle: from.angle + angleDelta(from.angle, to.angle) * wristCurve(clamp(elapsed / wristDuration)) + rebound * damped,
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
      slides.length = 0;
      home = { angle: 0, lift: 0, ...pose };
      return tick(time);
    }

    /** @param {ArmPose} pose @param {ArmMove} options */
    function move(pose, options, time) {
      const from = sample(time);
      const to = { ...from, ...pose };
      to.angle = options.wristAngle ?? to.angle;
      const { duration, controls, dip = 0, bob = 0, rebound = 0, reboundDuration = duration } = options;
      motions.push({ start: time, duration, controls, dip, bob, rebound,
        reboundDuration: Math.max(1, reboundDuration), from, to, curve: easing(options.easing),
        wristCurve: easing(options.wristEasing ?? options.easing), wristDuration: Math.max(1, options.wristDuration ?? duration),
        state: options.state || "moving" });
    }

    function tick(time) {
      const tipTime = time - wristDelay;
      const tip = sample(tipTime);
      const near = sample(tipTime - 10);
      const far = sample(tipTime + 10);
      const latest = motions.at(-1);
      const active = !!latest && time < latest.start +
        Math.max(latest.duration, latest.wristDuration, latest.rebound ? latest.reboundDuration : 0) + wristDelay;
      const dx = far.x - near.x, dy = far.y - near.y;
      const length = Math.hypot(dx, dy);
      const bearing = tip.angle * Math.PI / 180;
      const tangent = length > .001 ? { x: dx / length, y: dy / length }
        : { x: Math.cos(bearing), y: Math.sin(bearing) };
      const offset = slideAt(time);
      const shoulder = { x: root.x + offset, y: root.y };
      const delayedShoulder = { x: root.x + slideAt(time - elbowDelay), y: root.y };
      const { wrist } = solve(shoulder, tip);
      const { elbow } = solve(delayedShoulder, sample(time - elbowDelay));
      output = { pose: tip, joints: [shoulder, elbow, wrist, tip], tangent, active, time, offset,
        state: active ? latest.state : "idle" };
      draw(output);
      while (motions.length > 1 && motions[1].start < tipTime - 10) motions.shift();
      while (slides.length > 1 && slides[1].start < time - elbowDelay) slides.shift();
      return output;
    }

    return { resize, reset, move, slideTo, tick, get pose() { return output?.pose || home; }, followDelay: wristDelay };
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
  const chrome = material("Piston", [[0, "#857c70"], [.28, "#fffcf1"], [.5, "#d9d6cb"], [1, "#888477"]]);
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

  function offset(origin, angle, x, y = 0) {
    const direction = angle * Math.PI / 180;
    const cos = Math.cos(direction), sin = Math.sin(direction);
    return { x: origin.x + x * cos - y * sin, y: origin.y + x * sin + y * cos };
  }

  function axis(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y;
    return { length: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) * 180 / Math.PI };
  }

  function cylinder(parent, { name, bore, barrelLength }) {
    const group = svgElement(parent, "g", { id: name });
    const half = bore / 2;
    const rod = rect(group, 0, -half * .49, 1, half * .98, 1.4, chrome, "#685e50");
    const barrel = rect(group, 0, -half, barrelLength, bore, half * .45, inset, "#514536");
    const collar = rect(group, 0, -half - .6, 5, bore + 1.2, 1.1, bronze, "#685544");
    const gleam = rect(group, 2, -half * .64, barrelLength - 6, .85, .35, "#cab89c");
    rect(group, -3.5, -half + .1, 7, bore - .2, 1.7, edge, "#6a5947");
    return (from, to) => {
      const { length, angle } = axis(from, to);
      position(group, from, angle);
      const body = Math.min(barrelLength, length * .9);
      barrel.setAttribute("width", body);
      collar.setAttribute("x", Math.max(0, body - 4));
      gleam.setAttribute("width", Math.max(0, body - 6));
      rod.setAttribute("width", length);
    };
  }

  const hydraulicId = svg.id + "Hydraulic";
  const updateHydraulic = cylinder(svg, { name: hydraulicId, bore: 11, barrelLength: 61 });

  function upperLink(parent) {
    const edgePlate = svgElement(parent, "path", { fill: edge, stroke: "#665746", transform: "translate(0 4.4)" });
    const bevel = svgElement(parent, "path", { fill: ivory, stroke: "#8d795f" });
    const face = svgElement(parent, "path", { fill: brushed, stroke: "#fffaeb", "stroke-width": .9 });
    const ribWell = rect(parent, 13, 9, 1, 7, 2, edge, "#aa9477");
    const rib = rect(parent, 15, 9.8, 1, 4.8, 1.5, ivory, "#f7ecd5");
    const ribLight = rect(parent, 19, 10.6, 1, .85, .4, "#fff8e8");
    const clipId = svg.id + "InspectionSlots";
    const clip = svgElement(defs, "clipPath", { id: clipId });
    const windows = [0, 1].map(() => [
      rect(parent, 0, -15, 1, 23, 5, inset),
      rect(clip, 0, -15, 1, 23, 5, "white"),
    ]);
    const cutout = svgElement(parent, "g", { "clip-path": `url(#${clipId})` });
    const revealed = svgElement(cutout, "use", { href: `#${hydraulicId}` });
    windows.forEach(window => window.push(rect(parent, 0, -15, 1, 23, 5, "none", "#b8a486")));
    const screws = [-17.1, 17.1].flatMap(y => [.23, .43, .62, .81].map(x => ({ x, y, node: bolt(parent, 0, 0, 1.45) })));
    function resize(length) {
      const outline = beveledPlate(length, 20, 9);
      edgePlate.setAttribute("d", outline);
      bevel.setAttribute("d", outline);
      face.setAttribute("d", beveledPlate(length, 17, 11));
      for (const [part, start] of [[ribWell, 13], [rib, 15], [ribLight, 19]]) {
        part.setAttribute("width", Math.max(0, length - 2 * start));
      }
      const holeZone = Math.max(0, length - 44);
      const holeWidth = holeZone * .45;
      windows.forEach((window, index) => window.forEach(panel => {
        panel.setAttribute("width", holeWidth);
        panel.setAttribute("x", 22 + holeZone * (index ? .53 : .015));
      }));
      screws.forEach(({ x, y, node }) => position(node, { x: x * length, y }));
    }
    return { resize, expose(from, angle) {
      const inverse = offset({ x: 0, y: 0 }, -angle, -from.x, -from.y);
      position(revealed, inverse, -angle);
    } };
  }

  function trussLink(parent) {
    const brace = cylinder(parent, { name: svg.id + "DiagonalLink", bore: 6, barrelLength: 23 });
    const rails = [11, 8].map((width, index) => {
      const rail = svgElement(parent, "g", { class: "arm-parallel-link", "data-link": index === 0 ? "main" : "auxiliary" });
      const half = width / 2;
      const sections = [
        rect(rail, -4, -half + 2.6, 1, width, 3.8, edge, "#625646"),
        rect(rail, -4, -half, 1, width, 3.8, index === 0 ? ivory : bronze, "#89765e"),
        rect(rail, 6, -half + 1.1, 1, width - 2.4, 2.8, brushed, "#f9eed7"),
      ];
      const fasteners = [.24, .5, .76].map(() => bolt(rail, 0, 0, 1.5));
      return (from, to) => {
        const { length, angle } = axis(from, to);
        position(rail, from, angle);
        sections.forEach((part, index) => part.setAttribute("width", Math.max(0, length + (index === 2 ? -12 : 8))));
        fasteners.forEach((fastener, index) => position(fastener, { x: length * [.24, .5, .76][index], y: 0 }));
      };
    });
    return (atElbow, atWrist) => {
      rails.forEach((rail, index) => rail(atElbow[index], atWrist[index]));
      brace(MechanicalArmMotion.interpolate(atElbow[0], atWrist[0], .42),
        MechanicalArmMotion.interpolate(atElbow[1], atWrist[1], .62));
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

  const link = () => svgElement(svg, "g", { class: "arm-segment" });
  const upper = link();
  const upperParts = upperLink(upper);
  const updateTruss = trussLink(link());
  const wrist = link();
  const updateWrist = wristLink(wrist);
  const radii = [24, 19, 14.5];
  const hubs = radii.map(radius => {
    const hub = svgElement(svg, "g", { class: "arm-hinge" });
    svgElement(hub, "circle", { r: radius, cy: 4, fill: edge, stroke: "#73604c" });
    svgElement(hub, "circle", { r: radius, fill: ivory, stroke: "#8c785e" });
    svgElement(hub, "circle", { r: radius * .91, fill: brushed, stroke: "#fcf0d6", "stroke-width": .8 });
    svgElement(hub, "circle", { r: radius * .77, fill: inset, stroke: bronze, "stroke-width": 1.2 });
    svgElement(hub, "circle", { r: radius * .64, fill: ivory, stroke: "#5b5041", "stroke-width": .75 });
    const marks = radius >= 19 ? 18 : 12;
    const dial = svgElement(hub, "g", { class: "arm-bearing-dial" });
    const rotor = svgElement(hub, "g", { class: "arm-bearing-rotor" });
    const ticks = Array.from({ length: marks }, (_, index) => {
      const angle = index / marks * Math.PI * 2;
      const dx = Math.cos(angle), dy = Math.sin(angle);
      return `M${dx * radius * .47} ${dy * radius * .47}L${dx * radius * .59} ${dy * radius * .59}`;
    }).join("");
    svgElement(dial, "path", { d: ticks, fill: "none", stroke: "#776550", "stroke-width": .7 });
    const gear = Array.from({ length: 48 }, (_, index) => {
      const angle = index / 48 * Math.PI * 2;
      const depth = radius * (index % 4 === 0 || index % 4 === 3 ? .35 : .42);
      return `${Math.cos(angle) * depth},${Math.sin(angle) * depth}`;
    }).join(" ");
    svgElement(rotor, "polygon", { points: gear, fill: bronze, stroke: "#887154", "stroke-width": .6 });
    svgElement(rotor, "circle", { r: radius * .295, fill: edge, stroke: "#fff1d1", "stroke-width": .65 });
    svgElement(rotor, "path", { d: `M${-radius * .22} 0h${radius * .44}M0 ${-radius * .22}v${radius * .44}`,
      fill: "none", stroke: "#352e27", "stroke-width": Math.max(1, radius * .055), "stroke-linecap": "round" });
    return { hub, dial, rotor, turn: null };
  });
  const pinSpacing = 13;
  const eccentricPins = [3.2, 2.65].map(radius => {
    const crank = svgElement(svg, "g", { class: "arm-eccentric-pins" });
    // The bridge is split around the visible center screw.
    rect(crank, -17, -2.6, 8.4, 5.2, 2.1, edge, "#dfc6a0");
    rect(crank, 8.6, -2.6, 8.4, 5.2, 2.1, edge, "#dfc6a0");
    bolt(crank, -pinSpacing, 0, radius);
    bolt(crank, pinSpacing, 0, radius);
    return crank;
  });
  const hydraulicFoot = bolt(svg, 0, 0, 4.35);
  const hydraulicLug = bolt(svg, 0, 0, 3.9);

  const gripper = svgElement(svg, "g", { class: "arm-gripper" });
  rect(gripper, -15, -7, 23, 20, 4, edge, "#635749");
  rect(gripper, -15, -10, 23, 20, 4, ivory, "#917d63");
  rect(gripper, -12, -3.9, 23, 7.8, 2.4, inset, "#af9c82");
  rect(gripper, -9, -6.7, 11.5, 1, .5, "#fff1d7");
  rect(gripper, -8, 5.2, 12, 1.2, .5, bronze);
  const ejector = svgElement(gripper, "g", { class: "arm-ejector" });
  rect(ejector, 5, -1.55, 10.6, 3.1, 1.2, chrome, "#5b4d3f");
  rect(ejector, 13.4, -2.05, 2.7, 4.1, .8, chrome, "#5b4d3f");
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
  let upperLength = -1, wristLength = -1;
  const carriage = base.querySelector(".mechanical-shoulder-carriage");
  const button = base.querySelector(".mechanical-press-button");
  const lampGlass = base.querySelector(".mechanical-lamp-glass");
  let jawMove = { from: .3, to: .3, start: 0, duration: 1 };
  let ejectAt = -Infinity;
  let buttonTap, lampFlash;
  const apertures = {
    idle: [.30, 250], returning: [.30, 285], aim: [.30, 160], prepare: [.80, 68],
    feed: [.80, 68], grasp: [.15, 50], carry: [.15, 50], release: [1, 27],
  };

  function jawAt(now) {
    const fraction = Math.max(0, Math.min(1, (now - jawMove.start) / jawMove.duration));
    return jawMove.from + (jawMove.to - jawMove.from) * (1 - (1 - fraction) ** 2);
  }

  function renderHardware(now) {
    const openness = jawAt(now);
    const aperture = Math.round(openness * 1000) / 10;
    if (gripper.dataset.aperture !== String(aperture)) {
      gripper.dataset.aperture = aperture;
      jaws.forEach((jaw, index) => {
        const sign = index ? 1 : -1;
        position(jaw, { x: 2, y: sign * 4.7 }, sign * (2 + openness * 29));
      });
    }
    const elapsed = Math.max(0, now - ejectAt);
    const stroke = elapsed <= 22 ? 3 * elapsed / 22 : 3 * Math.max(0, 1 - (elapsed - 22) / 66) ** 2;
    const travel = Math.round(stroke * 100) / 100;
    if (ejector.dataset.stroke !== String(travel)) {
      ejector.dataset.stroke = travel;
      position(ejector, { x: travel, y: 0 });
    }
  }

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

  function draw({ pose, joints, state, time, offset: carriageOffset }) {
    renderHardware(time);
    if (svg.dataset.armState !== state) svg.dataset.armState = state;
    if (painted && painted.angle === pose.angle && painted.lift === pose.lift &&
        joints.every((joint, index) => joint.x === painted.joints[index].x && joint.y === painted.joints[index].y)) return;
    painted = { angle: pose.angle, lift: pose.lift, joints };
    const [shoulder, elbow, socket] = joints;
    const upperAxis = axis(shoulder, elbow);
    const forearmAxis = axis(elbow, socket);
    const wristAxis = axis(socket, pose);
    position(upper, shoulder, upperAxis.angle);
    if (Math.abs(upperLength - upperAxis.length) > .08) {
      upperLength = upperAxis.length;
      upperParts.resize(upperLength);
    }
    position(wrist, socket, wristAxis.angle);
    if (Math.abs(wristLength - wristAxis.length) > .08) {
      wristLength = wristAxis.length;
      updateWrist(wristLength);
    }

    // Matching eccentric offsets at both ends form a true planar parallelogram.
    const radians = Math.PI / 180;
    const pinAngle = forearmAxis.angle + 90 + 22 * Math.sin((upperAxis.angle - forearmAxis.angle) * radians) +
      13 * Math.sin((pose.angle - forearmAxis.angle) * radians);
    const elbowPins = [-pinSpacing, pinSpacing].map(x => offset(elbow, pinAngle, x));
    const wristPins = [-pinSpacing, pinSpacing].map(x => offset(socket, pinAngle, x));
    updateTruss(elbowPins, wristPins);
    position(eccentricPins[0], elbow, pinAngle);
    position(eccentricPins[1], socket, pinAngle);

    const anchor = { x: shoulder.x + 10, y: shoulder.y - 23 };
    const lug = offset(elbowPins[0], forearmAxis.angle, 9);
    updateHydraulic(anchor, lug);
    upperParts.expose(shoulder, upperAxis.angle);
    position(hydraulicFoot, anchor);
    position(hydraulicLug, lug);
    carriage?.setAttribute("transform", `translate(${carriageOffset} 0)`);

    const drive = [upperAxis.angle, forearmAxis.angle - upperAxis.angle, pose.angle - forearmAxis.angle];
    const gears = [1, -30 / 18, 24 / 12];
    hubs.forEach((joint, index) => {
      const baseAngle = [0, upperAxis.angle, forearmAxis.angle][index];
      joint.turn = joint.turn === null ? drive[index] : joint.turn + MechanicalArmMotion.angleDelta(joint.turn, drive[index]);
      position(joint.hub, joints[index]);
      joint.dial.setAttribute("transform", `rotate(${baseAngle + joint.turn / 12})`);
      joint.rotor.setAttribute("transform", `rotate(${baseAngle + joint.turn * gears[index]})`);
    });
    position(gripper, pose, pose.angle);

    const reach = Math.hypot(pose.x - joints[0].x, pose.y - joints[0].y);
    const altitude = 4 + pose.lift * .21 + reach * .022;
    project(ambientShadow, joints, pose.angle, altitude + 6, 5.2 + altitude * .43, .19);
    project(bodyShadow, joints, pose.angle, altitude, 1.8 + altitude * .33, Math.max(.11, .26 - altitude * .007));
  }

  function hardware({ stage = "idle", lamp = "", hatch, feed = false, press = false, eject = false } = {}, now = performance.now()) {
    const [openness, duration] = apertures[stage];
    if (jawMove.to !== openness) jawMove = { from: jawAt(now), to: openness, start: now, duration };
    if (stage === "idle" || stage === "returning") hatch = false;
    if (hatch !== undefined) {
      const hatchState = hatch ? "open" : "closed";
      if (base.dataset.hatch !== hatchState) base.dataset.hatch = hatchState;
    }
    base.dataset.armStage = stage;
    base.dataset.feeding = String(feed);
    base.style.setProperty("--arm-lamp", lamp || "#66816d");
    if (eject) ejectAt = now;
    if (press && button) {
      buttonTap?.cancel();
      buttonTap = button.animate([{ transform: "translateY(0)" }, { transform: "translateY(2px)", offset: .34 },
        { transform: "translateY(0)" }], { duration: 145 });
    }
    if (stage === "release" && lampGlass) {
      lampFlash?.cancel();
      lampFlash = lampGlass.animate([{ opacity: 1 }, { opacity: .44, offset: .37 }, { opacity: 1, offset: .68 },
        { opacity: .76 }], { duration: 150 });
    }
  }

  const motion = MechanicalArmMotion.create({ draw });
  return { motion, hardware, resize(width, height) {
    const viewBox = "0 0 " + width + " " + height;
    svg.setAttribute("viewBox", viewBox);
    shadow.setAttribute("viewBox", viewBox);
    motion.resize({ x: width / 2, y: 22 });
  } };
}
