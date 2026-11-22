// ===== EMOTION EFFECTS =====
// One fixed canvas and one rAF loop draw every in-room emotion. Each emotion
// is a rig registered from emotionRigs.js: SVG parts from
// public/assets/emotions/<id>/ plus procedural particles. An effect runs a
// wind-up at the sender, the flight, then the rig's impact timeline.
const EmotionFx = (() => {
  const ASSET_BASE = "assets/emotions";
  const RASTER_PX = 320;
  const MAX_DPR = 2;
  const WINDUP_MS = 150;
  const SOUND_GAP_MS = 70;
  const TAU = Math.PI * 2;

  const rigs = new Map();
  const partCache = new Map();
  const effects = [];
  const lastSoundAt = new Map();
  let canvas = null;
  let ctx = null;
  let rafId = 0;
  let dpr = 1;
  let unit = 1;
  let lastFrame = 0;

  // ---------- assets ----------

  function loadPart(url) {
    if (partCache.has(url)) return partCache.get(url);
    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    })
      .then((img) => {
        // Rasterize once so drawing never re-renders the SVG.
        const w = img.naturalWidth || 128;
        const h = img.naturalHeight || 128;
        const scale = RASTER_PX / Math.max(w, h);
        const raster = document.createElement("canvas");
        raster.width = Math.round(w * scale);
        raster.height = Math.round(h * scale);
        raster.getContext("2d").drawImage(img, 0, 0, raster.width, raster.height);
        return raster;
      })
      .catch(() => {
        // Drop the failed entry so the next emotion retries the download.
        partCache.delete(url);
        return null;
      });
    partCache.set(url, promise);
    return promise;
  }

  function loadRigParts(id, rig) {
    const names = Object.keys(rig.parts || {});
    return Promise.all(
      names.map((name) => loadPart(`${ASSET_BASE}/${id}/${rig.parts[name]}`)),
    ).then((list) => {
      const parts = {};
      names.forEach((name, i) => (parts[name] = list[i]));
      return parts;
    });
  }

  function preload(emotions) {
    for (const emotion of emotions || []) {
      const rig = rigs.get(emotion?.id);
      if (rig) loadRigParts(emotion.id, rig);
    }
  }

  function itemUrl(emotion) {
    return emotion?.id ? `${ASSET_BASE}/${emotion.id}/icon.svg` : "";
  }

  // ---------- canvas ----------

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.className = "emotion-fx-layer";
    canvas.setAttribute("aria-hidden", "true");
    canvas.hidden = true;
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
  }

  function resize() {
    dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    // The backing store is in device pixels; the element must stay at CSS
    // viewport size or drawing coordinates scale away from the seats.
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    // Rig sizes are authored for a ~720px short side; phones scale down.
    unit = clamp(Math.min(window.innerWidth, window.innerHeight) / 720, 0.72, 1.1);
  }

  function startLoop() {
    if (rafId) return;
    canvas.hidden = false;
    lastFrame = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  // ---------- math ----------

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function rand(lo, hi) {
    return lo + Math.random() * (hi - lo);
  }
  function progress(t, start, duration) {
    return clamp((t - start) / duration, 0, 1);
  }
  const ease = {
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
    inBack: (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
    outBounce: (t) => {
      const n = 7.5625;
      const d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    },
  };

  // ---------- drawing helpers for rigs ----------

  // Draws a rasterized part at (x, y) with the given CSS width; ax/ay pick
  // the anchor inside the part (0.5, 0.5 is the center).
  function drawPart(e, name, x, y, width, o = {}) {
    const img = e.parts?.[name];
    if (!img) return;
    const alpha = o.alpha ?? 1;
    if (alpha <= 0) return;
    const w = width;
    const h = (width * img.height) / img.width;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    ctx.scale(o.sx ?? 1, o.sy ?? 1);
    ctx.drawImage(img, -w * (o.ax ?? 0.5), -h * (o.ay ?? 0.5), w, h);
    ctx.restore();
  }

  function partAspect(e, name) {
    const img = e.parts?.[name];
    return img ? img.height / img.width : 1;
  }

  function path(points) {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }

  function heartPath(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.35);
    ctx.bezierCurveTo(x - s * 1.1, y - s * 0.35, x - s * 0.55, y - s * 1.05, x, y - s * 0.45);
    ctx.bezierCurveTo(x + s * 0.55, y - s * 1.05, x + s * 1.1, y - s * 0.35, x, y + s * 0.35);
    ctx.closePath();
  }

  function starPath(x, y, outer, inner, points, rot = -Math.PI / 2) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 ? inner : outer;
      const a = rot + (i * Math.PI) / points;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  // Smooth closed blob through jittered radii; used for splats and puffs.
  function blobPath(x, y, radii, scale, squashY = 1, rot = 0) {
    const n = radii.length;
    const pts = radii.map((r, i) => {
      const a = rot + (i / n) * TAU;
      return [x + Math.cos(a) * r * scale, y + Math.sin(a) * r * scale * squashY];
    });
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    ctx.beginPath();
    const start = mid(pts[n - 1], pts[0]);
    ctx.moveTo(start[0], start[1]);
    for (let i = 0; i < n; i++) {
      const next = mid(pts[i], pts[(i + 1) % n]);
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], next[0], next[1]);
    }
    ctx.closePath();
  }

  function softGlow(x, y, radius, color, alpha) {
    if (alpha <= 0 || radius <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  // ---------- particles ----------

  // kinds: dot, drop, shard, petal, heart, sparkle, star, smoke, ring, part
  function spawn(e, p) {
    e.particles.push({
      x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0,
      size: 4, grow: 0, rot: 0, vr: 0,
      sway: 0, swayHz: 1, phase: Math.random() * TAU,
      life: 600, age: 0, alpha: 1, fadeIn: 0,
      layer: "front", color: "#fff", stroke: null,
      ...p,
      baseX: p.x ?? 0,
    });
  }

  function updateParticles(e, dt) {
    const s = dt / 1000;
    for (let i = e.particles.length - 1; i >= 0; i--) {
      const p = e.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        e.particles.splice(i, 1);
        continue;
      }
      const damp = Math.max(0, 1 - p.drag * s);
      p.vx *= damp;
      p.vy = p.vy * damp + p.g * s;
      p.baseX += p.vx * s;
      p.y += p.vy * s;
      p.x = p.baseX + Math.sin(p.phase + (p.age / 1000) * p.swayHz * TAU) * p.sway;
      p.rot += p.vr * s;
    }
  }

  function drawParticles(e, layer) {
    for (const p of e.particles) {
      if (p.layer !== layer) continue;
      const t = p.age / p.life;
      let a = p.alpha * (1 - ease.inCubic(t));
      if (p.fadeIn) a *= clamp(p.age / p.fadeIn, 0, 1);
      if (a <= 0.01) continue;
      const size = p.size * (1 + p.grow * t);
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.stroke) {
        ctx.strokeStyle = p.stroke;
        ctx.lineWidth = Math.max(1, size * 0.22);
        ctx.lineJoin = "round";
      }
      switch (p.kind) {
        case "drop": {
          // Teardrop whose tail trails its velocity.
          ctx.rotate(Math.atan2(p.vy, p.vx) - p.rot + Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(0, size * 1.6);
          ctx.bezierCurveTo(size * 0.9, size * 0.2, size, -size, 0, -size);
          ctx.bezierCurveTo(-size, -size, -size * 0.9, size * 0.2, 0, size * 1.6);
          ctx.fill();
          if (p.stroke) ctx.stroke();
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.beginPath();
          ctx.arc(-size * 0.3, -size * 0.2, size * 0.28, 0, TAU);
          ctx.fill();
          break;
        }
        case "shard":
          path(p.points.map(([x, y]) => [x * size, y * size]));
          ctx.fill();
          if (p.stroke) ctx.stroke();
          break;
        case "petal":
          ctx.beginPath();
          ctx.moveTo(0, -size);
          ctx.bezierCurveTo(size * 0.9, -size * 0.6, size * 0.7, size * 0.8, 0, size);
          ctx.bezierCurveTo(-size * 0.7, size * 0.8, -size * 0.9, -size * 0.6, 0, -size);
          ctx.fill();
          if (p.stroke) ctx.stroke();
          break;
        case "heart":
          heartPath(0, 0, size);
          ctx.fill();
          if (p.stroke) ctx.stroke();
          ctx.fillStyle = "rgba(255,255,255,0.65)";
          ctx.beginPath();
          ctx.ellipse(-size * 0.42, -size * 0.38, size * 0.18, size * 0.12, -0.6, 0, TAU);
          ctx.fill();
          break;
        case "sparkle":
          starPath(0, 0, size, size * 0.28, 4);
          ctx.fill();
          break;
        case "star":
          starPath(0, 0, size, size * 0.48, 5);
          ctx.fill();
          if (p.stroke) ctx.stroke();
          break;
        case "ring":
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.width * (1 - t);
          ctx.beginPath();
          ctx.arc(0, 0, lerp(p.r0, p.r1, ease.outCubic(t)), 0, TAU);
          ctx.stroke();
          break;
        case "part":
          drawPart(e, p.part, 0, 0, size);
          break;
        default:
          ctx.beginPath();
          ctx.arc(0, 0, size, 0, TAU);
          ctx.fill();
          if (p.stroke) ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ---------- reactions ----------

  function shake(e, strength = 1) {
    const el = e.targetEl;
    if (!el?.isConnected || typeof el.animate !== "function") return;
    const d = 7 * strength;
    el.animate(
      [
        { transform: "translate(0, 0)" },
        { transform: `translate(${-d}px, ${d * 0.3}px) rotate(-3deg)` },
        { transform: `translate(${d * 0.8}px, ${-d * 0.2}px) rotate(2.5deg)` },
        { transform: `translate(${-d * 0.5}px, 0) rotate(-1.5deg)` },
        { transform: `translate(${d * 0.25}px, 0) rotate(0.5deg)` },
        { transform: "translate(0, 0)" },
      ],
      { duration: 420, easing: "ease-out" },
    );
  }

  function pulse(e, color) {
    const el = e.targetEl;
    if (!el?.isConnected || typeof el.animate !== "function") return;
    el.animate(
      [
        { transform: "scale(1)", filter: "brightness(1) drop-shadow(0 0 0 transparent)" },
        { transform: "scale(1.09)", filter: `brightness(1.15) drop-shadow(0 0 10px ${color})`, offset: 0.35 },
        { transform: "scale(1)", filter: "brightness(1) drop-shadow(0 0 0 transparent)" },
      ],
      { duration: 640, easing: "ease-out" },
    );
  }

  function sound(name) {
    const now = performance.now();
    if (now - (lastSoundAt.get(name) ?? -Infinity) < SOUND_GAP_MS) return;
    lastSoundAt.set(name, now);
    SFX.emotion(name);
  }

  // ---------- flight ----------

  function flightDuration(f, distance) {
    if (distance < 1) return 0;
    const scale = f.durationScale ?? 1;
    if (f.motion === "float") return clamp(distance * 1.45, 600, 1050) * scale;
    if (f.motion === "hop") return clamp(distance * 1.15, 520, 900) * scale;
    return clamp(distance * 1.05, 420, 780) * scale;
  }

  // Pose along the path at p in [0, 1]. Throws arc and spin, floats glide
  // on an S-curve, hops bounce with squash on every landing.
  function flightPose(e, p) {
    const f = e.flight;
    const { from, to } = e;
    const t = f.motion === "float" ? ease.inOutSine(p) : p;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    let gx = from.x + dx * t;
    let gy = from.y + dy * t;
    if (f.sCurve) {
      const off = f.sCurve * unit * Math.sin(TAU * t) * e.sign;
      gx += (-dy / len) * off;
      gy += (dx / len) * off;
    }
    let lift;
    let rot = e.baseRot;
    let sx = 1;
    let sy = 1;
    let scale;
    if (f.motion === "throw") {
      lift = e.arc * 4 * p * (1 - p);
      rot += e.spin * TAU * p;
      scale = 0.85 + 0.15 * p + 0.25 * Math.sin(Math.PI * p);
    } else if (f.motion === "hop") {
      const hops = f.hops || 2;
      const phase = Math.abs(Math.sin(hops * Math.PI * p));
      lift = e.arc * 0.75 * phase;
      const contact = 1 - clamp(phase / 0.25, 0, 1);
      sx = 1 + 0.18 * contact;
      sy = 1 - 0.2 * contact;
      rot += 0.18 * Math.sin(hops * Math.PI * p) * e.sign;
      scale = 0.9 + 0.1 * p;
    } else {
      lift = e.arc * 0.5 * Math.sin(Math.PI * p);
      rot += (f.sway || 0) * Math.sin(TAU * p) * e.sign;
      scale = 0.88 + 0.12 * p + 0.12 * Math.sin(Math.PI * p);
    }
    return {
      p, x: gx, y: gy - lift, groundX: gx, groundY: gy, lift,
      rot, sx: sx * scale, sy: sy * scale,
      dirX: dx / len, dirY: dy / len,
    };
  }

  function drawShadow(pose, width) {
    const k = 1 - Math.min(0.6, pose.lift / (150 * unit));
    ctx.save();
    ctx.globalAlpha = 0.2 * k;
    ctx.fillStyle = "#2a1a08";
    ctx.beginPath();
    ctx.ellipse(pose.groundX, pose.groundY + width * 0.55, width * 0.42 * k, width * 0.12 * k, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawActor(e, pose, alpha = 1) {
    if (e.rig.drawActor) {
      ctx.save();
      ctx.globalAlpha *= alpha;
      e.rig.drawActor(e, pose, kit);
      ctx.restore();
      return;
    }
    drawPart(e, e.rig.actor, pose.x, pose.y, e.rig.actorWidth * unit, {
      rot: pose.rot, sx: pose.sx, sy: pose.sy, alpha,
    });
  }

  // ---------- effect lifecycle ----------

  // Each repeat gets its own landing offset, arc, and spin so a rapid series
  // of the same emotion stays individually visible.
  function play({ from, to, emotion, targetEl }) {
    if (!from || !to || !emotion) return;
    ensureCanvas();
    const rig = rigs.get(emotion.id) || fallbackRig;
    const flight = rig.flight || fallbackRig.flight;
    const land = { x: to.x + rand(-12, 12) * unit, y: to.y + rand(-8, 8) * unit };
    const dist = Math.hypot(land.x - from.x, land.y - from.y);
    const dirX = dist ? (land.x - from.x) / dist : 0;
    const dirY = dist ? (land.y - from.y) / dist : 0;
    const pull = 9 * unit;
    const e = {
      id: emotion.id,
      emotion,
      rig,
      flight,
      origin: from,
      // The flight starts from the wind-up's pulled-back point.
      from: { x: from.x - dirX * pull, y: from.y - dirY * pull },
      to: land,
      dirX,
      dirY,
      targetEl,
      parts: null,
      sign: Math.random() < 0.5 ? -1 : 1,
      baseRot: (flight.baseRot || 0) + rand(-0.15, 0.15),
      arc: clamp(dist * 0.24, 26, 96) * unit * (flight.arc ?? 1) * rand(0.85, 1.15),
      spin: 0,
      flightMs: flightDuration(flight, dist),
      start: 0,
      now: 0,
      impacted: false,
      particles: [],
      state: {},
    };
    e.spin = e.sign * rand(...(flight.spin || [0, 0]));
    const ready = rig === fallbackRig ? Promise.resolve({}) : loadRigParts(emotion.id, rig);
    ready.then((parts) => {
      e.parts = parts;
      if (Object.values(parts).some((part) => !part)) {
        e.rig = fallbackRig;
        e.flight = fallbackRig.flight;
      }
      e.rig.setup?.(e, kit);
      e.start = performance.now();
      effects.push(e);
      startLoop();
    });
  }

  function totalMs(e) {
    return WINDUP_MS + e.flightMs + e.rig.impactMs;
  }

  // Alpha for impact elements fading out between start and end (impact ms).
  function fade(e, t, start, end) {
    return 1 - progress(t, start, end - start);
  }

  function tick(now) {
    const dt = Math.min(50, now - lastFrame);
    lastFrame = now;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    for (let i = effects.length - 1; i >= 0; i--) {
      // Effects that finished while the tab was hidden end without side effects.
      if (now - effects[i].start >= totalMs(effects[i])) effects.splice(i, 1);
    }

    for (const e of effects) {
      const elapsed = now - e.start;
      e.now = now;
      updateParticles(e, dt);
      drawParticles(e, "back");
      if (elapsed < WINDUP_MS) {
        drawWindup(e, elapsed / WINDUP_MS);
      } else if (elapsed < WINDUP_MS + e.flightMs) {
        const pose = flightPose(e, (elapsed - WINDUP_MS) / e.flightMs);
        e.lastPose = pose;
        drawFlight(e, pose, now);
      } else {
        const t = elapsed - WINDUP_MS - e.flightMs;
        if (!e.impacted) {
          e.impacted = true;
          e.rig.onImpact?.(e, kit);
        }
        ctx.save();
        e.rig.drawImpact(e, t, kit);
        ctx.restore();
      }
      drawParticles(e, "front");
    }

    if (effects.length) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.hidden = true;
    }
  }

  function drawWindup(e, p) {
    const back = 9 * unit * ease.outCubic(p);
    const grow = ease.outBack(p);
    const pose = {
      p: 0,
      x: e.origin.x - e.dirX * back,
      y: e.origin.y - e.dirY * back,
      lift: 0,
      rot: e.baseRot - e.sign * 0.25 * p,
      sx: grow * (1 + 0.1 * p),
      sy: grow * (1 - 0.1 * p),
      dirX: e.dirX,
      dirY: e.dirY,
    };
    pose.groundX = pose.x;
    pose.groundY = pose.y;
    drawActor(e, pose);
  }

  function drawFlight(e, pose, now) {
    if (e.flight.shadow !== false) drawShadow(pose, (e.rig.actorWidth || 40) * unit);
    e.rig.duringFlight?.(e, pose, kit, now);
    if (e.flight.trail) {
      for (const [lag, alpha] of [[0.09, 0.12], [0.045, 0.26]]) {
        if (pose.p > lag) drawActor(e, flightPose(e, pose.p - lag), alpha);
      }
    }
    drawActor(e, pose);
  }

  // Used when no rig exists or a part failed to load: emoji flight and pop.
  const fallbackRig = {
    flight: { motion: "float", arc: 0.6 },
    actorWidth: 40,
    impactMs: 700,
    drawActor(e, pose) {
      ctx.save();
      ctx.translate(pose.x, pose.y);
      ctx.rotate(pose.rot || 0);
      ctx.scale(pose.sx ?? 1, pose.sy ?? 1);
      ctx.font = `${Math.round(30 * unit)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(e.emotion.emoji || "✨", 0, 0);
      ctx.restore();
    },
    drawImpact(e, t) {
      const s = 1 + 0.6 * ease.outBack(progress(t, 0, 220));
      ctx.globalAlpha = 1 - progress(t, 400, 300);
      fallbackRig.drawActor(e, { x: e.to.x, y: e.to.y, rot: 0, sx: s, sy: s });
    },
  };

  function register(id, rig) {
    rigs.set(id, rig);
  }

  function activeCount() {
    return effects.length;
  }

  const kit = {
    get ctx() {
      return ctx;
    },
    get unit() {
      return unit;
    },
    TAU, clamp, lerp, rand, progress, ease,
    drawPart, partAspect, path, heartPath, starPath, blobPath, softGlow,
    spawn, shake, pulse, sound, fade,
  };

  return { play, preload, itemUrl, register, activeCount, kit };
})();
