function createMechanicalNotice(lift, label) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const stowed = "translateY(calc(100% + 2px))";
  const raised = "translateY(0px)";
  let phase = "stowed", timer, motion, pending;

  function move(keyframes, duration, onFinish) {
    const from = getComputedStyle(lift).transform;
    const end = keyframes.at(-1).transform;
    motion?.cancel();
    if (reduced.matches) {
      motion = null;
      lift.style.transform = end;
      onFinish();
      return;
    }
    const animation = motion = lift.animate([{ transform: from, ...keyframes[0] }, ...keyframes.slice(1)], {
      duration, fill: "forwards",
    });
    animation.onfinish = () => {
      if (motion !== animation) return;
      lift.style.transform = end;
      motion = null;
      animation.cancel();
      onFinish();
    };
  }

  function retract() {
    phase = "retracting";
    move([{ easing: "cubic-bezier(.4,0,.35,1)" }, { transform: stowed }], 200, () => {
      phase = "stowed";
      label.textContent = "";
      delete lift.dataset.tone;
    });
  }

  function raise(duration) {
    const { message, tone } = pending;
    pending = null;
    label.textContent = message;
    lift.dataset.tone = tone;
    phase = "rising";
    move([
      { easing: "cubic-bezier(.16,1,.3,1)" },
      { transform: "translateY(-2.5px)", offset: .79, easing: "ease-out" },
      { transform: raised },
    ], duration, () => {
      phase = "raised";
      timer = setTimeout(retract, 2500);
    });
  }

  function show(message, tone) {
    clearTimeout(timer);
    pending = { message, tone };
    if (phase === "replacing") return;
    if (phase === "stowed" || phase === "retracting") {
      raise(220);
      return;
    }
    phase = "replacing";
    move([{ easing: "ease-out" }, { transform: "translateY(25px)" }], 85, () => raise(150));
  }

  function reset() {
    clearTimeout(timer);
    motion?.cancel();
    motion = pending = null;
    phase = "stowed";
    lift.style.transform = "";
    label.textContent = "";
    delete lift.dataset.tone;
  }

  return { show, reset };
}
