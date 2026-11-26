/**
 * @typedef {{x:number,y:number,angle?:number,lift?:number}} ArmTarget
 * @typedef {{pose:ArmTarget,socket:ArmTarget,tangent:{x:number,y:number},element:HTMLElement|null,
 *   target:ArmTarget,mode:"slide"|"drop"|"none"}} ArmRelease
 * @typedef {{target:ArmTarget|function():ArmTarget,source?:ArmTarget|function():ArmTarget,valid?:function():boolean,
 *   payload?:HTMLElement|function():HTMLElement,
 *   payloadOffset?:{x:number,y:number}|function(HTMLElement):{x:number,y:number},
 *   wristAngle?:number|function():number,
 *   onGrab?:function(HTMLElement):void,onCarry?:function(ArmRelease):void,
 *   onRelease?:function(ArmRelease):boolean|void,onLand?:function():void,
 *   onComplete?:function():void,onCancel?:function():void}} ArmTask
 *
 * Targets use table-relative CSS pixels. A target callback lets a moving table
 * slot supply fresh coordinates at phase boundaries and during payload landing.
 * The optional release hook can return true to take ownership of the payload.
 * onComplete marks the end of arm motion for the task. onLand marks payload arrival.
 */
function createMechanicalArmActions({ rig, layer, presets, bay, home }) {
  const { motion, hardware } = rig;
  const { easing, interpolate, angleDelta } = MechanicalArmMotion;
  const queue = [];
  const flights = [];
  let active, lastPreset, returning, initialized;

  function resolve(value) {
    return typeof value === "function" ? value() : value;
  }

  function direction(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    return distance > .01 ? { x: dx / distance, y: dy / distance, distance }
      : { x: 0, y: 1, distance: 0 };
  }

  function pathControls(from, to, bend) {
    if (!bend) return undefined;
    const { x, y, distance } = direction(from, to);
    const offset = Math.sign(x || 1) * Math.sign(bend) * Math.min(Math.abs(bend), distance * .55);
    return [
      { x: from.x + x * distance * .31 - y * offset, y: from.y + y * distance * .31 + x * offset },
      { x: to.x - x * distance * .28, y: to.y - y * distance * .28 },
    ];
  }

  function place(element, { x, y, angle = 0 }) {
    element.style.left = x + "px";
    element.style.top = y + "px";
    element.style.rotate = angle + "deg";
  }

  function cue(stage, now, details) {
    const { lamp, releaseLamp } = active.preset;
    hardware({ stage, lamp: stage === "release" ? releaseLamp || "#efbf69" : lamp, ...details }, now);
  }

  function payloadPose(frame, element) {
    const mount = active.task.payloadOffset;
    const offset = typeof mount === "function" ? mount(element) : mount;
    if (!offset) return frame.pose;
    const radians = frame.pose.angle * Math.PI / 180;
    const cos = Math.cos(radians), sin = Math.sin(radians);
    return { ...frame.pose, x: frame.pose.x + offset.x * cos - offset.y * sin,
      y: frame.pose.y + offset.x * sin + offset.y * cos };
  }

  function aimCarriage(now) {
    const target = resolve(active.task.target);
    motion.slideTo((target.x - bay().x) * .12, 125, now);
    active.slid = true;
  }

  function grab(frame) {
    const element = resolve(active.task.payload);
    if (!element) return;
    active.payload = element;
    element.classList.add("mechanical-carry");
    place(element, payloadPose(frame, element));
    layer.append(element);
    active.task.onGrab?.(element);
  }

  function feedback(frame, target, element = active.payload) {
    return { pose: element ? payloadPose(frame, element) : frame.pose, socket: frame.pose,
      tangent: frame.tangent, element: element ?? null,
      target, mode: active.preset.release.mode };
  }

  function release(now, frame) {
    if (active.released) return;
    active.released = true;
    const { task, preset, payload } = active;
    const event = feedback(frame, resolve(task.target));
    active.payload = null;
    cue("release", now, { hatch: false, eject: !!payload && event.mode !== "none" });
    if (task.onRelease?.(event) === true) return;
    if (!payload || event.mode === "none") {
      payload?.remove();
      task.onLand?.();
      return;
    }
    payload.dataset.armFlight = event.mode;
    flights.push({ task, payload, event, start: now, settings: preset.release, curve: easing(preset.release.easing) });
  }

  function updateFlights(now) {
    for (let index = flights.length - 1; index >= 0; index--) {
      const { task, payload, event, start, curve, settings } = flights[index];
      if (task.valid?.() === false) {
        payload.remove();
        task.onCancel?.();
        flights.splice(index, 1);
        continue;
      }
      const progress = Math.min(1, (now - start) / settings.duration);
      const t = curve(progress);
      const target = resolve(task.target);
      const vector = direction(event.pose, target);
      const launch = vector.distance * .40;
      const flightPath = event.mode === "slide" ? [
        { x: event.pose.x + event.tangent.x * launch, y: event.pose.y + event.tangent.y * launch },
        { x: target.x - vector.x * launch * .43, y: target.y - vector.y * launch * .43 },
      ] : undefined;
      const point = interpolate(event.pose, target, t, flightPath);
      if (event.mode === "drop") {
        point.y -= 4 * progress * (1 - progress) * (settings.arcHeight ?? 12);
      }
      const angle = event.pose.angle + angleDelta(event.pose.angle, target.angle ?? 0) * t;
      place(payload, { ...point, angle });
      if (progress === 1) {
        payload.remove();
        task.onLand?.();
        flights.splice(index, 1);
      }
    }
  }

  const primitives = {
    pickup(phase, now) {
      const fromBay = !active.chained && !active.task.source && phase.hatch;
      let contact = now + (active.chained ? phase.chainedDuration ?? 25 : phase.duration + motion.followDelay);
      if (!active.chained) {
        motion.move(resolve(active.task.source) ?? bay(), { ...phase, easing: [0.4, 0, 0.2, 1] }, now);
      }
      let feeding = false, touched = false;
      return {
        duration: contact - now + 50,
        advance(time, frame, step) {
          if (fromBay && !feeding && time >= contact - 80) {
            feeding = true;
            cue("feed", time, { hatch: true, feed: phase.feed === "card" });
            contact = Math.max(contact, time + 80);
            step.until = contact + 50;
          }
          if (!touched && time >= contact) {
            touched = true;
            step.until = time + 50;
            cue("grasp", time);
            grab(frame);
          }
        },
        arrive(time) { cue("carry", time, { hatch: false }); },
      };
    },
    travel(phase, now) {
      if (!active.slid) aimCarriage(now);
      const from = motion.pose;
      const target = resolve(active.task.target);
      const vector = direction(from, target);
      const clearance = Math.min(phase.shortOf ?? 0, vector.distance * .55);
      const end = { x: target.x - vector.x * clearance, y: target.y - vector.y * clearance,
        lift: phase.lift ?? target.lift ?? from.lift,
      };
      const wristAngle = resolve(active.task.wristAngle) ?? phase.wristAngle ?? phase.angle ?? target.angle ??
        Math.atan2(vector.y, vector.x) * 180 / Math.PI;
      const bend = active.chained ? phase.chainedBend ?? phase.bend : phase.bend;
      const controls = typeof phase.controls === "function" ? phase.controls(from, end) : phase.controls;
      motion.move(end, { ...phase, wristAngle, controls: controls ?? pathControls(from, end, bend) }, now);
      const releaseTime = phase.releaseAt === undefined ? null : now + phase.duration * phase.releaseAt + motion.followDelay;
      return { duration: Math.max(phase.duration, releaseTime ? releaseTime - now : 0), releaseTime };
    },
    brake(phase, now) {
      motion.move({}, { ...phase, reboundDuration: phase.duration, state: "holding" }, now);
      return { duration: phase.duration };
    },
    hold(phase, now) {
      motion.move({}, { ...phase, state: "holding" }, now);
      return { duration: phase.duration };
    },
    release(phase, now, frame) {
      release(now, frame);
      return { duration: 0 };
    },
  };

  function nextPhase(now, frame) {
    while (active.phaseIndex < active.preset.phases.length) {
      const phase = active.preset.phases[active.phaseIndex++];
      const step = primitives[phase.kind](phase, now, frame);
      if (!step.duration) continue;
      active.step = { ...step, until: now + step.duration };
      return;
    }
    active.payload?.remove();
    active.task.onComplete?.();
    lastPreset = active.preset;
    active = null;
  }

  function startNext(now, frame) {
    while (queue.length) {
      const { task, preset } = queue.shift();
      if (task.valid?.() === false) {
        task.onCancel?.();
        continue;
      }
      active = { task, preset, phaseIndex: 0,
        chained: !!preset.chain && lastPreset?.chain === preset.chain && !returning };
      returning = false;
      cue(preset.phases[0]?.kind === "pickup" ? "prepare" : "aim", now, { hatch: false, press: true });
      nextPhase(now, frame);
      return;
    }
  }

  /** @param {string} name @param {ArmTask|ArmTask[]} tasks */
  function enqueue(name, tasks) {
    const preset = presets[name];
    if (!Object.hasOwn(presets, name)) throw new RangeError("Unknown arm action: " + name);
    for (const task of Array.isArray(tasks) ? tasks : [tasks]) queue.push({ task, preset });
  }

  function tick(now) {
    if (!initialized) {
      motion.reset(home(), now);
      initialized = true;
    }
    let frame = motion.tick(now);
    if (active?.task.valid?.() === false) {
      active.payload?.remove();
      const flightIndex = flights.findIndex(flight => flight.task === active.task);
      if (flightIndex >= 0) {
        flights[flightIndex].payload.remove();
        flights.splice(flightIndex, 1);
      }
      active.task.onCancel?.();
      lastPreset = active.preset;
      active = null;
      hardware({}, now);
    }
    if (!active && queue.length) {
      startNext(now, frame);
      frame = motion.tick(now);
    }
    if (active) {
      const { step, task } = active;
      step.advance?.(now, frame, step);
      const { payload } = active;
      if (payload) {
        const carried = feedback(frame, resolve(task.target));
        place(payload, carried.pose);
        task.onCarry?.(carried);
      }
      if (step.releaseTime != null && now >= step.releaseTime) release(now, frame);
      if (now >= step.until) {
        step.arrive?.(now, frame);
        nextPhase(now, frame);
      }
    }
    updateFlights(now);
    if (!active && !queue.length) {
      if (lastPreset && !returning) {
        const { duration } = lastPreset.home;
        hardware({ stage: "returning", jawDeadline: now + duration + motion.followDelay }, now);
        motion.move(home(), { ...lastPreset.home, state: "returning" }, now);
        returning = true;
        lastPreset = null;
      } else if (returning && !frame.active) {
        returning = false;
        hardware({}, now);
      }
    }
    return !!active || !!queue.length || !!flights.length || !!returning;
  }

  function reset() {
    const tasks = new Set(queue.map(entry => entry.task));
    for (const flight of flights) {
      flight.payload.remove();
      tasks.add(flight.task);
    }
    if (active) {
      active.payload?.remove();
      tasks.add(active.task);
    }
    for (const task of tasks) task.onCancel?.();
    queue.length = flights.length = 0;
    active = lastPreset = null;
    returning = initialized = false;
    hardware();
  }

  return { enqueue, tick, reset };
}
