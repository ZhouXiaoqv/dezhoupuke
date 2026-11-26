// ===== SOUND SYSTEM (Web Audio API — no external files) =====
const SFX = (() => {
  let ctx = null;
  let enabled = true;
  let masterGain = null;
  let activated = false;
  let lastPotHit = -Infinity, lastDetent = -Infinity;
  const samples = new Map();

  function activate(event) {
    if (!event.isTrusted) return;
    activated = true;
    ensureCtx();
  }
  for (const type of ["pointerdown", "keydown", "click"]) document.addEventListener(type, activate, { capture: true, passive: true });

  function ensureCtx() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!activated || !Audio) return null;
    if (!ctx) {
      ctx = new Audio();
      masterGain = ctx.createGain();
      masterGain.gain.value = enabled ? .5 : 0;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
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
    if (!c) return;
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
    if (!c) return;
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
    if (!c) return;
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

  const strikeShapes = {
    clay: { duration: .044, ring: 92, frequencies: [590, 1340, 2460], grit: .23 },
    detent: { duration: .019, ring: 190, frequencies: [1360, 2660, 3950], grit: .38 },
    lock: { duration: .038, ring: 112, frequencies: [430, 1040, 2460], grit: .34 },
  };

  function strike(c, kind, volume, rate = 1, start = c.currentTime) {
    if (!samples.has(kind)) {
      const { duration, ring, frequencies, grit } = strikeShapes[kind];
      const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * duration), c.sampleRate);
      const channel = buffer.getChannelData(0);
      let filtered = 0;
      for (let i = 0; i < channel.length; i++) {
        const t = i / c.sampleRate;
        filtered += .54 * (Math.random() * 2 - 1 - filtered);
        const resonance = frequencies.reduce((sum, f, index) => sum +
          Math.sin(2 * Math.PI * f * t) * Math.exp(-(ring + index * 59) * t) * [.58, .28, .14][index], 0);
        channel[i] = Math.min(1, t * 2800) * (resonance + filtered * grit * Math.exp(-760 * t));
      }
      samples.set(kind, buffer);
    }
    const source = c.createBufferSource();
    const gain = c.createGain();
    source.buffer = samples.get(kind);
    source.playbackRate.value = rate;
    gain.gain.value = volume;
    source.connect(gain).connect(masterGain);
    source.start(start);
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
    wagerChip() {
      const c = enabled && ensureCtx();
      if (c?.state !== "running") return;
      strike(c, "clay", .31, .94 + Math.random() * .09);
      strike(c, "clay", .10, 1.10, c.currentTime + .016);
    },
    potImpact(progress, final, lag) {
      if (lag > 75) return;
      const c = enabled && ensureCtx();
      if (c?.state !== "running") return;
      const gap = c.currentTime - lastPotHit;
      const start = Math.max(c.currentTime, lastPotHit + .006);
      lastPotHit = start;
      strike(c, "clay", gap > .027 ? .20 : .086, 1.03 + .24 * progress, start);
      if (final) strike(c, "lock", .25, .91, start + .012);
    },
    ratchet() {
      const c = enabled && ensureCtx();
      if (c?.state !== "running" || c.currentTime - lastDetent < .019) return;
      lastDetent = c.currentTime;
      strike(c, "detent", .10);
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
function syncSoundToggle(on) {
  $("soundToggle").setAttribute("aria-pressed", String(on));
  $("soundToggleGlyph").textContent = on ? "🔊" : "🔇";
}
syncSoundToggle(SFX.isEnabled());
$("soundToggle").addEventListener("click", () => syncSoundToggle(SFX.toggle()));
