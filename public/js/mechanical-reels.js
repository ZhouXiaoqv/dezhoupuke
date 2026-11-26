const MechanicalReels = (() => {
  const counters = new WeakMap();
  const running = new Set();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const digits = new Intl.NumberFormat("en-US", { useGrouping: false, maximumFractionDigits: 12 });
  let frame;

  function addReel() {
    const slot = document.createElement("span");
    const strip = document.createElement("span");
    slot.className = "mechanical-reel";
    slot.setAttribute("aria-hidden", "true");
    strip.className = "mechanical-reel-strip";
    for (let index = 0; index < 30; index++) {
      const cell = document.createElement("span");
      cell.textContent = index % 10;
      strip.append(cell);
    }
    slot.append(strip);
    return { slot, strip, position: 0, target: 0, motion: null };
  }

  const modulo = value => ((value % 10) + 10) % 10;

  function paint(reel, position) {
    reel.position = modulo(position);
    reel.strip.style.setProperty("--reel-offset", -(10 + reel.position));
  }

  function sample(reel, now) {
    const motion = reel.motion;
    if (!motion) return false;
    const elapsed = Math.max(0, now - motion.start);
    const travel = Math.min(1, elapsed / motion.duration);
    if (travel < 1) {
      paint(reel, motion.from + motion.distance * (1 - (1 - travel) ** 2.6));
      return true;
    }
    const lock = motion.lock ? Math.min(1, (elapsed - motion.duration) / motion.lock) : 1;
    paint(reel, reel.target + motion.direction * Math.sin(lock * Math.PI * 2) * (1 - lock) ** 2 * .21);
    if (lock < 1) return true;
    reel.motion = null;
    reel.slot.dataset.digit = reel.target;
    return false;
  }

  function tick(now) {
    frame = null;
    for (const counter of running) {
      let changing = false;
      if (counter.element.isConnected) {
        for (const reel of counter.reels.values()) changing = sample(reel, now) || changing;
      }
      if (changing) continue;
      if (!counter.flow || !counter.element.isConnected) delete counter.element.dataset.rolling;
      running.delete(counter);
    }
    if (running.size && !frame) frame = requestAnimationFrame(tick);
  }

  function split(amount) {
    const [whole, fraction = ""] = digits.format(amount).split(".");
    return { whole, fraction };
  }

  function layout(counter, old, next) {
    const whole = counter.fixedDigits ?? Math.max(5, counter.whole || 0, old.whole.length, next.whole.length);
    const fraction = Math.max(counter.fraction || 0, old.fraction.length, next.fraction.length);
    if (counter.whole === whole && counter.fraction === fraction) return;
    const fragment = document.createDocumentFragment();
    counter.whole = whole;
    counter.fraction = fraction;
    for (let place = whole - 1; place >= -fraction; place--) {
      if (place === -1) {
        const dot = document.createElement("span");
        dot.className = "mechanical-reel-dot";
        dot.textContent = ".";
        dot.setAttribute("aria-hidden", "true");
        fragment.append(dot);
      }
      let reel = counter.reels.get(place);
      if (!reel) {
        reel = addReel();
        reel.target = digitAt(old, place);
        reel.slot.dataset.digit = reel.target;
        paint(reel, reel.target);
        counter.reels.set(place, reel);
      }
      fragment.append(reel.slot);
    }
    counter.element.replaceChildren(fragment);
  }

  function digitAt(parts, place) {
    return Number((place >= 0 ? parts.whole.at(-1 - place) : parts.fraction[-1 - place]) || 0);
  }

  function countAt(parts, place) {
    if (place >= 0) return Number(parts.whole.slice(0, Math.max(0, parts.whole.length - place)));
    return Number(parts.whole + parts.fraction.padEnd(-place, "0").slice(0, -place));
  }

  function set(element, amount, { initial = amount, instant = false, payout, fixedDigits, label = "筹码" } = {}) {
    let counter = counters.get(element);
    instant ||= reduced.matches;
    if (counter && counter.amount === amount && !instant && !payout && !counter.flow) return;
    if (!counter) {
      element.classList.add("mechanical-reels");
      counter = { element, reels: new Map(), amount: initial, fixedDigits, label };
      counters.set(element, counter);
    }
    const old = split(counter.amount);
    const next = split(amount);
    counter.flow = payout === "flow" && !instant;
    layout(counter, old, next);
    element.setAttribute("aria-label", counter.label + " " + digits.format(amount));
    element.dataset.balance = amount;
    const direction = (payout || amount >= counter.amount) ? 1 : -1;
    const now = performance.now();
    let changing = false;
    for (const [place, reel] of counter.reels) {
      const target = digitAt(next, place);
      reel.slot.classList.toggle("mechanical-reel-leading", place > 0 && place >= next.whole.length);
      if (instant) {
        reel.motion = null;
        reel.target = target;
        reel.slot.dataset.digit = target;
        paint(reel, target);
        continue;
      }
      const steps = Math.abs(countAt(next, place) - countAt(old, place));
      if (!steps && !(payout === "lock" && reel.motion)) {
        changing ||= !!reel.motion;
        continue;
      }
      sample(reel, now);
      reel.target = target;
      const turns = Math.min(Math.floor(steps / 10), place <= 0 ? (payout ? 1 : 2) : place === 1 ? 1 : 0);
      const distance = modulo((target - reel.position) * direction) + 10 * turns;
      const higher = Math.max(0, place);
      reel.motion = {
        from: reel.position, direction, distance: distance * direction,
        start: now + (payout === "lock" ? 0 : Math.min(higher * (payout ? 5 : 19), payout ? 25 : 96)),
        duration: payout === "lock" ? 54 : counter.flow ? 77 + Math.min(higher * 12, 60) : 185 + Math.min(higher * 22, 110),
        lock: payout === "lock" ? 26 : counter.flow ? 0 : 80,
      };
      changing = true;
    }
    counter.amount = amount;
    if (counter.flow) element.dataset.rolling = "up";
    if (changing) {
      if (!element.dataset.rolling || old.whole !== next.whole || old.fraction !== next.fraction) {
        element.dataset.rolling = direction > 0 ? "up" : "down";
      }
      running.add(counter);
      if (!frame) frame = requestAnimationFrame(tick);
    } else {
      running.delete(counter);
      if (!counter.flow) delete element.dataset.rolling;
    }
  }

  reduced.addEventListener("change", () => {
    if (reduced.matches) for (const counter of running) set(counter.element, counter.amount, { instant: true });
  });

  return { set };
})();
