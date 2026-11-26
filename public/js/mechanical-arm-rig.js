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

  const radians = Math.PI / 180;
  const limits = [25, 155];
  const tubes = [140, 168, 171];
  const strokes = [tubes[1] - 18, tubes[2] - 18];
  const upperMin = tubes[0], upperMax = upperMin + strokes[0] + strokes[1];
  const forearm = 76, tool = 28, wristStroke = 32;
  const gripAngle = (2 + .15 * 29) * radians;
  const jawReach = 2 + 20 * Math.cos(gripAngle) - 1.7 * Math.sin(gripAngle);
  const railMin = -199, railMax = 91;
  const parkRail = 68;
  const parking = { shoulder: 157.5, elbow: -135, upper: upperMin, angle: 8, lift: 0, extension: 0, park: 1 };
  const clampRail = x => Math.max(railMin, Math.min(railMax, x));

  function advance(point, angle, length) {
    return { x: point.x + Math.cos(angle * radians) * length, y: point.y + Math.sin(angle * radians) * length };
  }

  function forward(root, shoulder, elbow, wrist) {
    const hinge = advance(root, shoulder.shoulder, shoulder.upper);
    const socket = advance(hinge, shoulder.shoulder + elbow.elbow, forearm);
    const tip = { ...advance(socket, wrist.angle, tool + wrist.extension), angle: wrist.angle,
      lift: wrist.lift, extension: wrist.extension };
    return { pose: tip, grip: advance(tip, wrist.angle, jawReach), joints: [root, hinge, socket, tip] };
  }

  function solve(root, tip, minBend = limits[0], maxBend = limits[1]) {
    const socket = advance(tip, tip.angle, -tool - tip.extension);
    const dx = socket.x - root.x;
    const dy = socket.y - root.y;
    const distance = Math.hypot(dx, dy);
    // Choose the sleeve extension for a right-angle elbow first, then use the bend for the remaining reach.
    const square = distance ** 2 - forearm ** 2;
    const upper = Math.min(upperMax, Math.max(upperMin, Math.sqrt(Math.max(0, square))));
    const cosine = (square - upper ** 2) / (2 * upper * forearm);
    const requested = Math.acos(Math.max(-1, Math.min(1, cosine))) / radians;
    const bend = -Math.min(maxBend, Math.max(minBend, requested)) * radians;
    const along = upper + forearm * Math.cos(bend), across = forearm * Math.sin(bend);
    return { shoulder: (Math.atan2(dy, dx) - Math.atan2(across, along)) / radians, elbow: bend / radians,
      upper, angle: tip.angle, lift: tip.lift, extension: tip.extension, park: 0 };
  }

  function jointMix(from, to, t) {
    return {
      shoulder: from.shoulder + angleDelta(from.shoulder, to.shoulder) * t,
      elbow: mix(from.elbow, to.elbow, t),
      upper: mix(from.upper, to.upper, t),
      angle: from.angle + angleDelta(from.angle, to.angle) * t,
      lift: mix(from.lift, to.lift, t), extension: mix(from.extension, to.extension, t), park: mix(from.park, to.park, t),
    };
  }

  /**
   * @typedef {{x?:number,y?:number,angle?:number,lift?:number,extension?:number,park?:boolean}} ArmPose
   * @typedef {{duration:number,easing?:(number[]|function(number):number),
   *   controls?:ArmPose[],rebound?:number,reboundDuration?:number,
   *   dip?:number,bob?:number,wristAngle?:number,wristDuration?:number,jointPath?:boolean,aligned?:boolean,aim?:boolean,toolOnly?:boolean,
   *   wristEasing?:(number[]|function(number):number),state?:"moving"|"holding"|"returning"}} ArmMove
   *
   * The driver accepts Cartesian targets or the built-in parking pose. The tip and
   * release tangent always come from the displayed joint configuration.
   */
  function create({ draw = () => {}, elbowDelay = 45, wristDelay = 55 } = {}) {
    const followDelay = Math.max(elbowDelay, wristDelay);
    let root = { x: 0, y: 0 };
    let initial = parking;
    let initialOffset = 0;
    let output;
    const slides = [];
    const motions = [];

    function slideAt(time) {
      const slide = slides.findLast(move => move.start <= time);
      if (!slide) return initialOffset;
      const t = clamp((time - slide.start) / slide.duration);
      return mix(slide.from, slide.to, t * t * (3 - 2 * t));
    }

    function slideTo(offset, duration, time) {
      slides.push({ from: slideAt(time), to: clampRail(offset),
        start: time, duration: Math.max(1, duration) });
    }

    function aimAt(target, duration, time) {
      const wrist = advance(target, target.angle, -tool - target.extension);
      const height = wrist.y - root.y;
      const anchor = wrist.x - root.x;
      const clearance = Math.sqrt(Math.max(0, 113 ** 2 - height ** 2));
      const current = slideAt(time);
      const candidates = [anchor - clearance, anchor + clearance].filter(x => x >= railMin && x <= railMax);
      const nearest = candidates.sort((a, b) => Math.abs(a - current) - Math.abs(b - current))[0];
      slideTo(nearest ?? anchor, duration, time);
    }

    function sampleCommand(command, time) {
      if (!command) return initial;
      const { start, span, knots } = command;
      const position = clamp((time - start) / span) * (knots.length - 1);
      const index = Math.floor(position);
      if (index === knots.length - 1) return knots[index];
      return jointMix(knots[index], knots[index + 1], position - index);
    }

    function sample(time) {
      return sampleCommand(motions.findLast(motion => motion.start <= time), time);
    }

    function servo(time, lag) {
      const delay = command => command?.toolOnly ? 0 : command?.aligned ? followDelay : lag;
      const command = motions.findLast(move => move.start + delay(move) <= time);
      return sampleCommand(command, time - delay(command));
    }

    function resize(origin) {
      root = origin;
    }

    const shoulderAt = time => ({ x: root.x + slideAt(time), y: root.y });

    function reset(pose, time = 0) {
      motions.length = 0;
      slides.length = 0;
      initialOffset = pose.park ? parkRail : 0;
      initial = pose.park ? parking : solve(shoulderAt(time), { angle: 0, lift: 0, extension: 0, ...pose });
      return tick(time);
    }

    /** @param {ArmPose} pose @param {ArmMove} options */
    function move(pose, options, time) {
      const [main, elbow, wrist] = [servo(time, 0), servo(time, elbowDelay), servo(time, wristDelay)];
      const from = { ...main, elbow: elbow.elbow, angle: wrist.angle, extension: wrist.extension, lift: wrist.lift };
      const start = forward(shoulderAt(time), from, from, from).pose;
      const { duration, controls, dip = 0, bob = 0, rebound = 0, reboundDuration = duration, state = "moving" } = options;
      const target = { ...start, ...pose, angle: options.wristAngle ?? pose.angle ?? start.angle,
        extension: Math.max(0, Math.min(wristStroke, pose.extension ?? start.extension)) };
      const curve = easing(options.easing);
      const wristCurve = easing(options.wristEasing ?? options.easing);
      const wristDuration = options.wristDuration ?? duration;
      const span = Math.max(1, duration, wristDuration, rebound ? reboundDuration : 0);
      if (state === "returning") slideTo(pose.park ? parkRail : 0, Math.min(350, duration), time);
      else if (options.aim) aimAt(target, duration, time);
      const followsPath = pose.x !== undefined || pose.y !== undefined || bob || dip || target.angle !== start.angle;
      const jointPath = options.jointPath || from.park;
      const endRoot = shoulderAt(time + duration);
      const end = followsPath && !pose.park ? solve(endRoot, target) : from;
      const minBend = Math.min(45, -from.elbow, -end.elbow);
      const maxBend = Math.max(135, -from.elbow, -end.elbow);
      // Bake the Cartesian path into bounded joint poses. The live servo samples only angles and link lengths.
      const steps = Math.ceil(span / 8);
      const knots = [from];
      for (let index = 1; index <= steps; index++) {
        const elapsed = span * index / steps;
        const progress = duration ? clamp(elapsed / duration) : 1;
        const t = clamp(curve(progress));
        const wristProgress = wristDuration ? clamp(elapsed / wristDuration) : 1;
        const wobble = rebound ? clamp(elapsed / Math.max(1, reboundDuration)) : 1;
        const damped = Math.sin(wobble * Math.PI * 3) * (1 - wobble) ** 2 * 1.35;
        const angle = start.angle + angleDelta(start.angle, target.angle) * wristCurve(wristProgress);
        const extension = mix(start.extension, target.extension, t);
        let next;
        if (pose.park) {
          next = jointMix(from, parking, t);
        } else if (followsPath) {
          const point = jointPath ? target : interpolate(start, target, t, controls);
          const y = point.y + dip * Math.sin(Math.PI * clamp((progress - .25) / .75)) -
            bob * Math.sin(progress * Math.PI) ** 2;
          const goal = solve(jointPath ? endRoot : shoulderAt(time + elapsed),
            { x: point.x, y, angle: jointPath ? target.angle : angle, lift: target.lift,
              extension: jointPath ? target.extension : extension }, minBend, maxBend);
          next = jointPath ? jointMix(from, goal, t) : { ...goal, lift: mix(start.lift, target.lift, t) };
          if (jointPath) next.angle = angle;
        } else {
          next = { ...from, angle, extension, lift: mix(start.lift, target.lift, t) };
        }
        next.angle += rebound * damped;
        knots.push(next);
      }
      motions.push({ start: time, span, knots, state, aligned: options.aligned, toolOnly: options.toolOnly });
    }

    function configuration(time) {
      return forward(shoulderAt(time), servo(time, 0), servo(time, elbowDelay), servo(time, wristDelay));
    }

    function tick(time) {
      const now = configuration(time);
      const near = configuration(time - 10).pose;
      const far = configuration(time + 10).pose;
      const latest = motions.at(-1);
      const active = !!latest && time < latest.start + latest.span + (latest.toolOnly ? 0 : followDelay);
      const dx = far.x - near.x, dy = far.y - near.y;
      const length = Math.hypot(dx, dy);
      const bearing = now.pose.angle * radians;
      const tangent = length > .001 ? { x: dx / length, y: dy / length }
        : { x: Math.cos(bearing), y: Math.sin(bearing) };
      output = { ...now, tangent, active, time, offset: slideAt(time), park: sample(time - wristDelay).park,
        state: active ? latest.state : "idle" };
      draw(output);
      while (motions.length > 1 && motions[1].start < time - followDelay - 10) motions.shift();
      while (slides.length > 1 && slides[1].start < time - 10) slides.shift();
      return output;
    }

    function extend(extension, duration, time) {
      move({ extension }, { duration, toolOnly: true, easing: [.4, 0, .2, 1] }, time);
    }

    return { resize, reset, move, extend, slideTo, tick, get pose() { return output?.pose; }, followDelay };
  }

  return { create, easing, interpolate, angleDelta, advance, tubes, strokes, forearm, tool, jawReach, wristStroke };
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

  const { tubes, strokes, forearm, tool, wristStroke } = MechanicalArmMotion;

  function clipGroup(parent, name, x, y, width, height) {
    const id = svg.id + name;
    const clip = svgElement(defs, "clipPath", { id });
    rect(clip, x, y, width, height, 0, "white");
    return svgElement(parent, "g", { "clip-path": `url(#${id})` });
  }

  function upperLink(parent) {
    const [outerLength, middleLength, innerLength] = tubes;
    const total = strokes[0] + strokes[1];
    parent = clipGroup(parent, "SleeveGuide", -12, -30, outerLength + total + 24, 65);
    rect(parent, 4, -15, outerLength - 5, 31, 6, inset, "#615648");
    for (const y of [-9, 1]) rect(parent, 20, y, outerLength - 32, 3, 1, chrome, "#665d50");

    const sleeve = (index, length, half, finish, openings = []) => {
      const stage = svgElement(parent, "g", { "data-arm-sleeve": index });
      const skin = svgElement(stage, "g");
      if (openings.length) {
        const maskId = svg.id + "SleeveMask" + index;
        const mask = svgElement(defs, "mask", { id: maskId, maskUnits: "userSpaceOnUse",
          x: -10, y: -29, width: length + 20, height: 60, "mask-type": "luminance" });
        rect(mask, -10, -29, length + 20, 60, 0, "white");
        for (const [x, width, openingHalf] of openings) {
          rect(mask, x, -openingHalf - 2, width, openingHalf * 2, 3, "black");
          rect(stage, x, -openingHalf - 2, width, openingHalf * 2, 3, "none", "#837362");
        }
        skin.setAttribute("mask", "url(#" + maskId + ")");
      }
      svgElement(skin, "path", { d: beveledPlate(length, half, 7), fill: edge,
        stroke: "#625443", transform: "translate(0 3)" });
      svgElement(skin, "path", { d: beveledPlate(length, half, 7), fill: finish, stroke: "#85735c" });
      rect(skin, 11, -half + 2, length - 22, 1, .5, "#fff5e0");
      rect(skin, 9, half - 6, length - 18, 3, 1.5, index === 2 ? chrome : bronze);
      rect(skin, length - 10, -half, 8, half * 2, 3, ivory, "#6c5d4b");
      return stage;
    };

    // The smallest member is drawn first and slides behind the mouths of the larger members.
    const inner = sleeve(2, innerLength, 8.5, chrome);
    rect(inner, 9, -2.5, innerLength - 20, 4.6, 1.6, chrome, "#817a70");
    const middle = sleeve(1, middleLength, 13, brushed, [[20, 35, 4], [69, 67, 4]]);
    for (let x = 15; x < middleLength - 14; x += 7) {
      svgElement(middle, "path", { d: "M" + x + " 7v" + (x % 14 === 1 ? 4 : 2),
        stroke: "#78654e", "stroke-width": .8 });
    }
    const windows = [[29, 34, 8], [72, 48, 8]];
    const outer = sleeve(0, outerLength, 19, ivory, windows);
    for (const x of [21, 64, 70, 124]) {
      for (const y of [-14, 12]) bolt(outer, x, y, 1.55);
    }

    // The cylinder is fixed to the shoulder axis. The piston travels with the elbow pin.
    const actuatorClip = svg.id + "ActuatorWindows";
    const clip = svgElement(defs, "clipPath", { id: actuatorClip });
    for (const [x, width, half] of windows) rect(clip, x, -half - 2, width, half * 2, 3, "white");
    const actuator = svgElement(parent, "g", { class: "arm-hydraulic", "clip-path": `url(#${actuatorClip})` });
    rect(actuator, 7, -10, outerLength - 18, 17, 1, inset);
    const piston = svgElement(actuator, "g", { class: "arm-hydraulic-piston" });
    rect(piston, -(total + 46), -6, total + 46, 7, 2, chrome, "#5f574c");
    for (let x = -(total + 40); x < -10; x += 26) rect(piston, x, -5.5, 1.2, 6, 0, "#968a7a");
    rect(actuator, 7, -8, 75, 12, 3, inset, "#6c6254");
    rect(actuator, 77, -9, 8, 14, 2, bronze, "#6c6254");
    bolt(actuator, 9, -2.5, 3);
    bolt(piston, 0, -2.5, 2.6);

    return extension => {
      const progress = Math.max(0, Math.min(1, (extension - outerLength) / total));
      const middleOffset = outerLength - middleLength + strokes[0] * progress;
      const innerOffset = middleOffset + middleLength - innerLength + strokes[1] * progress;
      position(middle, { x: middleOffset, y: 0 });
      position(inner, { x: innerOffset, y: 0 });
      position(piston, { x: extension, y: 0 });
    };
  }

  function trussLink(parent) {
    const diagonal = svgElement(parent, "g", { class: "arm-diagonal-link" });
    const braceRod = svgElement(diagonal, "g");
    rect(braceRod, -23, -2.1, 23, 4.2, 1.5, chrome, "#817869");
    rect(diagonal, 0, -3.5, 20, 7, 2.8, edge, "#625646");
    const rails = [11, 8].map((width, index) => {
      const rail = svgElement(parent, "g", { class: "arm-parallel-link", "data-link": index === 0 ? "main" : "auxiliary" });
      const half = width / 2;
      rect(rail, -4, -half + 2.6, forearm + 8, width, 3.8, edge, "#625646");
      rect(rail, -4, -half, forearm + 8, width, 3.8, index === 0 ? ivory : bronze, "#89765e");
      rect(rail, 6, -half + 1.1, forearm - 12, width - 2.4, 2.8, brushed, "#f9eed7");
      for (const fraction of [.24, .5, .76]) bolt(rail, forearm * fraction, 0, 1.5);
      return rail;
    });
    return (elbowPins, wristPins) => {
      const from = MechanicalArmMotion.interpolate(elbowPins[0], wristPins[0], .38);
      const to = MechanicalArmMotion.interpolate(elbowPins[1], wristPins[1], .62);
      const brace = axis(from, to);
      position(diagonal, from, brace.angle);
      position(braceRod, { x: brace.length, y: 0 });
      rails.forEach((rail, index) => position(rail, elbowPins[index], axis(elbowPins[index], wristPins[index]).angle));
    };
  }

  function wristLink(parent) {
    const slide = clipGroup(parent, "WristGuide", tool - 13, -9, wristStroke + 10, 18);
    const rods = svgElement(slide, "g", { class: "arm-wrist-rods" });
    for (const y of [-6, 3]) rect(rods, tool - 12 - wristStroke, y, wristStroke + 2, 3.8, 1.3, chrome, "#6d675c");
    rect(parent, -5, -8.4, tool - 4, 20, 4, edge, "#665747");
    rect(parent, -5, -11, tool - 4, 19, 4, ivory, "#9a856b");
    rect(parent, tool - 17, -9, 10, 16, 2, inset, "#ece0c6");
    for (const y of [-5.2, 2]) rect(parent, tool - 14.5, y, 6, 3.2, 1, chrome, "#696052");
    return extension => position(rods, { x: extension, y: 0 });
  }

  const truss = svgElement(svg, "g", { class: "arm-segment arm-forearm" });
  const updateTruss = trussLink(truss);
  // The wrapper stays in table space, so the local cast shadow falls across the truss before the sleeve is painted.
  const raisedSleeve = svgElement(svg, "g", { class: "arm-raised-sleeve" });
  const upper = svgElement(raisedSleeve, "g", { class: "arm-segment" });
  const slideSleeves = upperLink(upper);
  const wrist = svgElement(svg, "g", { class: "arm-segment arm-wrist" });
  const slideWrist = wristLink(wrist);
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

  const gripper = svgElement(svg, "g", { class: "arm-gripper" });
  rect(gripper, -15, -5.5, 8, 11, 2, roller, "#917d63");
  const head = svgElement(gripper, "g", { class: "arm-gripper-head" });
  rect(head, -15, -7, 23, 20, 4, edge, "#635749");
  rect(head, -15, -10, 23, 20, 4, ivory, "#917d63");
  rect(head, -12, -3.9, 23, 7.8, 2.4, inset, "#af9c82");
  rect(head, -9, -6.7, 11.5, 1, .5, "#fff1d7");
  rect(head, -8, 5.2, 12, 1.2, .5, bronze);
  const ejector = svgElement(head, "g", { class: "arm-ejector" });
  rect(ejector, 5, -1.55, 10.6, 3.1, 1.2, chrome, "#5b4d3f");
  rect(ejector, 13.4, -2.05, 2.7, 4.1, .8, chrome, "#5b4d3f");
  const jaws = [-1, 1].map(sign => {
    const jaw = svgElement(head, "g", { class: "arm-jaw" });
    svgElement(jaw, "path", { d: `M1 ${-sign * 3}H14L20 ${sign * 1.7}L18 ${sign * 3.1}H10L7 ${sign * 2}H1Z`,
      fill: ivory, stroke: "#81715d", "stroke-width": .75 });
    rect(jaw, 10, -2.6, 5.2, 5.2, 1.5, roller, "#594d3f");
    svgElement(jaw, "path", { d: "M11.3 -1.5v3m2-3v3", stroke: "#fdebc9", opacity: .65, "stroke-width": .55 });
    bolt(jaw, 5.1, 0, 1.35);
    return jaw;
  });
  const headEdge = svgElement(gripper, "g", { opacity: 0 });
  rect(headEdge, -13, -2.6, 21, 5.2, 1.25, chrome, "#75664f");
  rect(headEdge, 6, -.9, 15, 1.8, .7, bronze);

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
  let paintedRoll;
  function rollGripper(angle) {
    if (angle === paintedRoll) return;
    paintedRoll = angle;
    const radians = angle * Math.PI / 180;
    // Orthographic projection of a rigid head turning around its longitudinal axis.
    const crossSection = Math.cos(radians);
    head.setAttribute("transform", `scale(1 ${crossSection.toFixed(4)})`);
    headEdge.setAttribute("opacity", Math.abs(Math.sin(radians)) ** 12);
    for (const { clamp } of [ambientShadow, bodyShadow]) clamp.setAttribute("ry", 3 + 6 * Math.abs(crossSection));
  }
  let painted;
  const carriage = base.querySelector(".mechanical-shoulder-carriage");
  const leadScrew = base.querySelector(".mechanical-lead-screw");
  const button = base.querySelector(".mechanical-press-button");
  const lampGlass = base.querySelector(".mechanical-lamp-glass");
  let jawMove = { from: .3, to: .3, start: 0, duration: 1 };
  let ejectAt = -Infinity;
  let buttonTap, lampFlash;
  const apertures = {
    idle: [.30, 250], returning: [.30, 180], aim: [.30, 160], prepare: [.80, 68],
    feed: [.80, 68], grasp: [.15, 50], carry: [.15, 50], release: [1, 27], recycle: [.80, 37],
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

  function draw({ pose, joints, state, time, park, offset: carriageOffset }) {
    renderHardware(time);
    if (svg.dataset.armState !== state) svg.dataset.armState = state;
    if (painted && painted.angle === pose.angle && painted.lift === pose.lift && painted.park === park &&
        joints.every((joint, index) => joint.x === painted.joints[index].x && joint.y === painted.joints[index].y)) return;
    if (painted?.park !== park) {
      raisedSleeve.style.filter = park ? `drop-shadow(1px 5px 2.4px rgb(71 49 32 / ${(.37 * park).toFixed(3)}))` : "";
    }
    painted = { angle: pose.angle, lift: pose.lift, park, joints };
    const [shoulder, elbow, socket] = joints;
    const upperAxis = axis(shoulder, elbow);
    const forearmAxis = axis(elbow, socket);
    position(upper, shoulder, upperAxis.angle);
    slideSleeves(upperAxis.length);
    position(wrist, socket, pose.angle);
    slideWrist(pose.extension);
    const { angleDelta } = MechanicalArmMotion;
    const pinAngle = forearmAxis.angle + 90 + angleDelta(upperAxis.angle, forearmAxis.angle) * .09
      + angleDelta(forearmAxis.angle, pose.angle) * .045;
    const pins = point => [-pinSpacing, pinSpacing].map(x => offset(point, pinAngle, x));
    updateTruss(pins(elbow), pins(socket));
    position(eccentricPins[0], elbow, pinAngle);
    position(eccentricPins[1], socket, pinAngle);
    carriage?.setAttribute("transform", `translate(${carriageOffset} 0)`);
    leadScrew?.setAttribute("patternTransform", `translate(${carriageOffset % 6} 0)`);

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
    const altitude = 4 + pose.lift * .21 + reach * .022 - 2.6 * park;
    project(ambientShadow, joints, pose.angle, altitude + 6, 5.2 + altitude * .43, .19);
    project(bodyShadow, joints, pose.angle, altitude, 1.8 + altitude * .33, Math.max(.11, .26 - altitude * .007));
  }

  function hardware({ stage = "idle", lamp = "", hatch, feed = false, press = false, eject = false, jawDeadline } = {}, now = performance.now()) {
    const [openness, duration] = apertures[stage];
    if (jawMove.to !== openness) {
      jawMove = { from: jawAt(now), to: openness, start: Math.max(now, (jawDeadline ?? now) - duration), duration };
    }
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
  return { motion, hardware, rollGripper, setRecyclerBusy(busy) {
    base.dataset.recycler = busy ? "busy" : "idle";
  }, resize(width, height) {
    const viewBox = "0 0 " + width + " " + height;
    svg.setAttribute("viewBox", viewBox);
    shadow.setAttribute("viewBox", viewBox);
    // The carriage datum is x=240 in the cabinet's centered 374 px viewBox.
    motion.resize({ x: width / 2 + (240 - 374 / 2), y: -20 });
  } };
}
