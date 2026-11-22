// ===== SOUND SYSTEM (Web Audio API — no external files) =====
const SFX = (() => {
  let ctx = null;
  let enabled = true;
  let masterGain = null;

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.5;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function noise(
    duration,
    freq,
    type = "sine",
    volume = 0.3,
    detune = 0,
  ) {
    if (!enabled) return;
    const c = ensureCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      c.currentTime + duration,
    );
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + duration);
  }

  function burst(
    duration,
    freqStart,
    freqEnd,
    type = "sine",
    volume = 0.2,
  ) {
    if (!enabled) return;
    const c = ensureCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      freqEnd,
      c.currentTime + duration,
    );
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      c.currentTime + duration,
    );
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + duration);
  }

  function click(duration = 0.05) {
    if (!enabled) return;
    const c = ensureCtx();
    const buf = c.createBuffer(1, c.sampleRate * duration, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] =
        (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.01));
    }
    const src = c.createBufferSource();
    const gain = c.createGain();
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 3000;
    filter.Q.value = 2;
    src.buffer = buf;
    gain.gain.value = 0.4;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    src.start();
  }

  return {
    deal() {
      click(0.04);
      setTimeout(() => noise(0.08, 800, "triangle", 0.12), 30);
    },
    flip() {
      noise(0.06, 1200, "sine", 0.15);
      setTimeout(() => noise(0.04, 2000, "sine", 0.08), 50);
    },
    chip() {
      noise(0.05, 4000, "square", 0.06);
      noise(0.03, 6000, "sine", 0.04, 50);
    },
    check() {
      noise(0.06, 600, "sine", 0.12);
    },
    fold() {
      burst(0.15, 400, 200, "sine", 0.1);
    },
    call() {
      noise(0.08, 800, "triangle", 0.1);
      setTimeout(() => noise(0.06, 1000, "triangle", 0.08), 60);
    },
    raise() {
      noise(0.06, 1000, "square", 0.08);
      setTimeout(() => noise(0.06, 1400, "square", 0.06), 60);
      setTimeout(() => noise(0.06, 1800, "sine", 0.05), 120);
    },
    bigRaise() {
      if (!enabled) return;
      click(0.035);
      burst(0.19, 520, 1040, "triangle", 0.13);
      setTimeout(() => noise(0.24, 1568, "sine", 0.12), 130);
    },
    allin() {
      if (!enabled) return;
      burst(0.36, 150, 62, "sine", 0.28);
      [392, 494, 587, 784].forEach((note, i) =>
        setTimeout(() => noise(0.26, note, "triangle", 0.12), i * 80));
      setTimeout(() => noise(0.32, 1568, "sine", 0.09), 375);
    },
    yourTurn() {
      noise(0.1, 880, "sine", 0.15);
      setTimeout(() => noise(0.1, 1100, "sine", 0.12), 100);
    },
    win() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) =>
        setTimeout(() => noise(0.25, f, "sine", 0.12), i * 120),
      );
    },
    lose() {
      burst(0.4, 400, 150, "sawtooth", 0.08);
    },
    btnClick() {
      click(0.02);
    },
    // One short impact cue per emotion, named by the rigs in emotionRigs.js.
    emotion(name) {
      if (!enabled) return;
      if (name === "splat") {
        click(0.04);
        burst(0.16, 300, 80, "triangle", 0.14);
      } else if (name === "whack") {
        click(0.03);
        burst(0.12, 700, 150, "square", 0.08);
      } else if (name === "chime") {
        [1047, 1319, 1568].forEach((f, i) =>
          setTimeout(() => noise(0.25, f, "sine", 0.06), i * 70));
      } else if (name === "clink") {
        noise(0.15, 2637, "sine", 0.08);
        setTimeout(() => noise(0.12, 3136, "sine", 0.05), 60);
      } else if (name === "giggle") {
        [760, 680, 820, 700].forEach((f, i) =>
          setTimeout(() => burst(0.08, f * 1.15, f, "triangle", 0.07), i * 80));
      }
    },
    toggle() {
      enabled = !enabled;
      if (masterGain) masterGain.gain.value = enabled ? 0.5 : 0;
      return enabled;
    },
    isEnabled() {
      return enabled;
    },
  };
})();

// Sound toggle
$("soundToggle").addEventListener("click", () => {
  const on = SFX.toggle();
  $("soundToggle").textContent = on ? "🔊" : "🔇";
});
