// ===== EMOTION RIGS =====
// Per-emotion choreography for EmotionFx. Sizes are CSS px at unit 1 and
// times are ms from impact. Each rig lists its SVG parts in
// public/assets/emotions/<id>/.
(() => {
  const { register, kit } = EmotionFx;
  const { TAU, lerp, rand, progress, ease } = kit;
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // Runs callback once for each entry in times (ms) as t passes it.
  function schedule(state, key, times, t, callback) {
    state[key] = state[key] ?? 0;
    while (state[key] < times.length && t >= times[state[key]]) {
      callback(state[key]);
      state[key]++;
    }
  }

  function ring(e, color, r1, life = 260, width = 5) {
    const u = kit.unit;
    kit.spawn(e, { kind: "ring", x: e.to.x, y: e.to.y, r0: 8 * u, r1: r1 * u, width: width * u, color, life });
  }

  function sparkleBurst(e, x, y, count, colors, speed = [60, 140]) {
    const u = kit.unit;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + rand(-0.3, 0.3);
      const v = rand(...speed) * u;
      kit.spawn(e, {
        kind: "sparkle", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        drag: 3, size: rand(3, 6) * u, color: pick(colors),
        vr: rand(-4, 4), life: rand(380, 560),
      });
    }
  }

  // ---------- Egg: lob, crack, splat, drip ----------
  const EGG_WIDTH = 38;
  const EGG_HIT_STOP = 60;

  register("egg", {
    parts: { egg: "egg.svg", shellTop: "shell-top.svg", shellBottom: "shell-bottom.svg" },
    actor: "egg",
    actorWidth: EGG_WIDTH,
    flight: { motion: "throw", arc: 1.1, spin: [1.4, 2.2], trail: true },
    impactMs: 1750,
    setup(e) {
      const u = kit.unit;
      const s = e.state;
      s.radius = rand(30, 36) * u;
      s.lobes = Array.from({ length: 11 }, (_, i) => (i % 2 ? rand(0.7, 0.88) : rand(1, 1.22)));
      s.lobeRot = rand(0, TAU);
      s.yolk = { x: rand(-6, 6) * u, y: rand(-6, 2) * u };
      s.satellites = Array.from({ length: 5 }, () => ({
        a: rand(0, TAU), d: rand(1.3, 1.65), r: rand(2.5, 5) * u,
      }));
      const count = Math.random() < 0.5 ? 2 : 3;
      s.drips = Array.from({ length: count }, (_, i) => ({
        x: lerp(-0.5, 0.5, i / (count - 1)) * s.radius + rand(-4, 4) * u,
        w: rand(6, 9) * u,
        len: rand(16, 34) * u,
        delay: rand(0, 240),
      }));
    },
    onImpact(e) {
      kit.sound("splat");
      kit.shake(e, 1);
    },
    drawImpact(e, t) {
      const ctx = kit.ctx;
      const u = kit.unit;
      const s = e.state;
      const { x, y } = e.to;
      if (t < EGG_HIT_STOP) {
        // Hit-stop: the egg flattens against the target for a beat.
        kit.drawPart(e, "egg", x, y, EGG_WIDTH * u, { rot: e.lastPose?.rot ?? 0, sx: 1.32, sy: 0.7 });
        return;
      }
      if (!s.burst) {
        s.burst = true;
        burstEgg(e);
      }
      const tt = t - EGG_HIT_STOP;
      ctx.globalAlpha = kit.fade(e, t, 1200, 1750);
      if (ctx.globalAlpha <= 0) return;
      const R = s.radius;
      const grow = ease.outBack(progress(tt, 0, 170), 2.2);
      const white = ctx.createRadialGradient(x - R * 0.3, y - R * 0.35, 0, x, y, R * 1.3);
      white.addColorStop(0, "#ffffff");
      white.addColorStop(0.6, "#fff8ea");
      white.addColorStop(1, "#f0dfbc");
      const edge = "rgba(160, 122, 66, 0.7)";

      // Drips sit behind the splat so they seem to run out from under it.
      const dripTop = y + R * 0.4;
      ctx.fillStyle = white;
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1.6 * u;
      for (const d of s.drips) {
        const p = ease.outCubic(progress(tt, 180 + d.delay, 1000));
        if (p <= 0) continue;
        const dx = x + d.x;
        const bottom = dripTop + d.len * p;
        ctx.beginPath();
        ctx.moveTo(dx - d.w / 2, dripTop);
        ctx.lineTo(dx - d.w * 0.36, bottom);
        ctx.arc(dx, bottom, d.w * 0.6, Math.PI, 0, true);
        ctx.lineTo(dx + d.w / 2, dripTop);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      const radii = s.lobes.map((r) => r * R);
      ctx.fillStyle = "rgba(90, 55, 10, 0.16)";
      kit.blobPath(x, y + 3 * u, radii, grow, 0.86, s.lobeRot);
      ctx.fill();
      ctx.fillStyle = white;
      kit.blobPath(x, y, radii, grow, 0.86, s.lobeRot);
      ctx.fill();
      ctx.lineWidth = 2 * u;
      ctx.stroke();
      ctx.lineWidth = 1.4 * u;
      for (const sat of s.satellites) {
        ctx.beginPath();
        ctx.arc(
          x + Math.cos(sat.a) * sat.d * R * grow,
          y + Math.sin(sat.a) * sat.d * R * 0.86 * grow,
          sat.r * grow, 0, TAU,
        );
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      kit.blobPath(x - R * 0.28, y - R * 0.3, radii, grow * 0.34, 0.7, s.lobeRot);
      ctx.fill();

      // The yolk lands a beat later and wobbles like jelly.
      const yg = ease.outBack(progress(tt, 30, 180), 2.6);
      if (yg <= 0) return;
      const wob = 1 + 0.16 * Math.exp(-tt / 220) * Math.sin((tt / 1000) * TAU * 5.5);
      const r = R * 0.42 * yg;
      const yx = x + s.yolk.x;
      const yy = y + s.yolk.y;
      const yolk = ctx.createRadialGradient(yx - r * 0.35, yy - r * 0.4, r * 0.1, yx, yy, r * 1.05);
      yolk.addColorStop(0, "#fff4b0");
      yolk.addColorStop(0.45, "#ffcc2a");
      yolk.addColorStop(1, "#f08c00");
      ctx.fillStyle = yolk;
      ctx.strokeStyle = "#c46a00";
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.ellipse(yx, yy, r * wob, (r / wob) * 0.92, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.beginPath();
      ctx.ellipse(yx - r * 0.36, yy - r * 0.38, r * 0.3, r * 0.17, -0.5, 0, TAU);
      ctx.fill();
    },
  });

  function burstEgg(e) {
    const u = kit.unit;
    const { x, y } = e.to;
    ring(e, "rgba(255, 255, 255, 0.95)", 54, 260, 5);
    ring(e, "rgba(255, 196, 60, 0.8)", 40, 320, 3);
    kit.spawn(e, {
      kind: "part", part: "shellTop", x: x - 4 * u, y: y - 8 * u,
      vx: e.sign * rand(80, 150) * u, vy: -rand(230, 300) * u, g: 950 * u,
      vr: e.sign * rand(6, 10), rot: rand(-0.4, 0.4), size: 30 * u, life: 720,
    });
    kit.spawn(e, {
      kind: "part", part: "shellBottom", x: x + 4 * u, y: y + 4 * u,
      vx: -e.sign * rand(70, 130) * u, vy: -rand(150, 220) * u, g: 950 * u,
      vr: -e.sign * rand(5, 8), rot: rand(-0.4, 0.4), size: 30 * u, life: 720,
    });
    for (let i = 0; i < 6; i++) {
      kit.spawn(e, {
        kind: "shard", x, y,
        points: [[0, -1], [rand(0.6, 1), rand(0.3, 0.8)], [rand(-1, -0.6), rand(0.3, 0.7)]],
        vx: rand(-230, 230) * u, vy: rand(-300, -90) * u, g: 1000 * u,
        vr: rand(-12, 12), size: rand(4, 7) * u, life: rand(500, 760),
        color: "#fbeed3", stroke: "#7a5532",
      });
    }
    for (let i = 0; i < 12; i++) {
      const a = rand(0, TAU);
      const v = rand(120, 300) * u;
      const yolk = i % 3 === 0;
      kit.spawn(e, {
        kind: "drop", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80 * u, g: 900 * u,
        size: rand(2.5, 4.5) * u, life: rand(450, 700),
        color: yolk ? "#ffc62e" : "#fffaf0", stroke: yolk ? "#c86f00" : "rgba(160,122,66,0.7)",
      });
    }
  }

  // ---------- Slipper: spinning throw, smack, bounce off, dizzy stars ----------
  const SLIPPER_WIDTH = 26;
  const SLIPPER_HIT_STOP = 70;

  register("slipper", {
    parts: { slipper: "slipper.svg" },
    actor: "slipper",
    actorWidth: SLIPPER_WIDTH,
    flight: { motion: "throw", arc: 0.55, spin: [2.4, 3.2], trail: true, durationScale: 0.9 },
    impactMs: 1700,
    setup(e) {
      const u = kit.unit;
      const away = e.dirX >= 0 ? -1 : 1;
      e.state.hitRot = rand(-0.5, 0.5);
      e.state.burstRot = rand(0, TAU);
      e.state.bounce = {
        vx: away * rand(110, 170) * u,
        vy: -rand(240, 300) * u,
        vr: away * rand(8, 12),
      };
    },
    duringFlight(e, pose) {
      // Speed lines trail the slipper against its direction of travel.
      const ctx = kit.ctx;
      const u = kit.unit;
      ctx.save();
      ctx.strokeStyle = "rgba(60, 105, 150, 0.45)";
      ctx.lineCap = "round";
      ctx.lineWidth = 2.5 * u;
      const nx = -pose.dirY;
      const ny = pose.dirX;
      [[-9, 24], [0, 34], [9, 26]].forEach(([side, back]) => {
        const bx = pose.x - pose.dirX * back * u + nx * side * u;
        const by = pose.y - pose.dirY * back * u + ny * side * u;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - pose.dirX * 16 * u, by - pose.dirY * 16 * u);
        ctx.stroke();
      });
      ctx.restore();
    },
    onImpact(e) {
      kit.sound("whack");
      kit.shake(e, 1.3);
    },
    drawImpact(e, t) {
      const ctx = kit.ctx;
      const u = kit.unit;
      const s = e.state;
      const { x, y } = e.to;

      // Comic impact star behind the slipper.
      const burstScale = t < SLIPPER_HIT_STOP
        ? ease.outBack(t / SLIPPER_HIT_STOP)
        : 1 + 0.3 * progress(t, SLIPPER_HIT_STOP, 230);
      const burstAlpha = 1 - progress(t, SLIPPER_HIT_STOP + 40, 200);
      if (burstAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = burstAlpha;
        ctx.lineJoin = "round";
        kit.starPath(x, y, 36 * u * burstScale, 19 * u * burstScale, 9, s.burstRot);
        ctx.fillStyle = "#ffe14d";
        ctx.strokeStyle = "#e08a00";
        ctx.lineWidth = 3 * u;
        ctx.fill();
        ctx.stroke();
        kit.starPath(x, y, 20 * u * burstScale, 11 * u * burstScale, 9, s.burstRot);
        ctx.fillStyle = "#fff7c2";
        ctx.fill();
        ctx.restore();
      }

      if (t < SLIPPER_HIT_STOP) {
        kit.drawPart(e, "slipper", x, y, SLIPPER_WIDTH * u, { rot: s.hitRot, sx: 1.3, sy: 0.76 });
        return;
      }
      if (!s.burst) {
        s.burst = true;
        ring(e, "rgba(255, 255, 255, 0.95)", 50, 240, 5);
        for (let i = 0; i < 6; i++) {
          const a = rand(0, TAU);
          const v = rand(60, 120) * u;
          kit.spawn(e, {
            kind: "smoke", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 3,
            size: rand(4, 7) * u, grow: 1.2, life: 460,
            color: "rgba(240, 236, 226, 0.95)", stroke: "rgba(150, 140, 125, 0.5)",
          });
        }
      }

      // The slipper rebounds and tumbles off.
      const tt = t - SLIPPER_HIT_STOP;
      const sec = tt / 1000;
      const recover = progress(tt, 0, 120);
      kit.drawPart(
        e, "slipper",
        x + s.bounce.vx * sec,
        y + s.bounce.vy * sec + 0.5 * 1500 * u * sec * sec,
        SLIPPER_WIDTH * u,
        {
          rot: s.hitRot + s.bounce.vr * sec,
          sx: lerp(1.3, 1, recover),
          sy: lerp(0.76, 1, recover),
          alpha: 1 - progress(tt, 380, 280),
        },
      );

      // Dizzy stars orbit above the nameplate.
      const appear = ease.outBack(progress(tt, 120, 220));
      const alpha = kit.fade(e, t, 1300, 1700);
      if (appear <= 0 || alpha <= 0) return;
      const cx = x;
      const cy = y - 24 * u;
      ctx.save();
      ctx.globalAlpha = alpha * 0.35;
      ctx.strokeStyle = "#8a7a5a";
      ctx.lineWidth = 1.4 * u;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 26 * u * appear, 8 * u * appear, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
      for (let i = 0; i < 3; i++) {
        const a = sec * TAU * 1.15 + (i * TAU) / 3;
        const depth = (Math.sin(a) + 1) / 2;
        ctx.save();
        ctx.globalAlpha = alpha * (0.55 + 0.45 * depth);
        ctx.lineJoin = "round";
        kit.starPath(
          cx + Math.cos(a) * 26 * u * appear,
          cy + Math.sin(a) * 8 * u * appear,
          (5 + 2.5 * depth) * u * appear,
          (2.4 + 1.2 * depth) * u * appear,
          5, sec * 4,
        );
        ctx.fillStyle = "#ffe14d";
        ctx.strokeStyle = "#c77c00";
        ctx.lineWidth = 1.6 * u;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    },
  });

  // ---------- Rose: sparkling glide, bloom, hearts and falling petals ----------
  const ROSE_WIDTH = 30;
  const BLOOM_WIDTH = 50;

  register("rose", {
    parts: { bud: "bud.svg", bloom: "bloom.svg" },
    actor: "bud",
    actorWidth: ROSE_WIDTH,
    flight: { motion: "float", arc: 0.8, sCurve: 16, sway: 0.25 },
    impactMs: 1900,
    setup(e) {
      e.state.settle = rand(-0.25, 0.25);
    },
    duringFlight(e, pose, _kit, now) {
      const s = e.state;
      if (now < (s.nextEmit ?? 0)) return;
      s.nextEmit = now + 40;
      const u = kit.unit;
      kit.spawn(e, {
        kind: "sparkle", layer: "back",
        x: pose.x + rand(-7, 7) * u, y: pose.y - rand(8, 16) * u,
        vy: rand(-20, 10) * u, vr: rand(-3, 3),
        size: rand(3, 6) * u, color: pick(["#ffd54f", "#ff8fab", "#ffffff"]),
        life: rand(380, 600), fadeIn: 60,
      });
    },
    onImpact(e) {
      kit.sound("chime");
      kit.pulse(e, "#ff4f7b");
      ring(e, "rgba(255, 140, 175, 0.9)", 62, 440, 4);
      sparkleBurst(e, e.to.x, e.to.y - 6 * kit.unit, 7, ["#ffd54f", "#ff8fab", "#fff3f6"]);
    },
    drawImpact(e, t) {
      const u = kit.unit;
      const s = e.state;
      const { x, y } = e.to;
      const alpha = kit.fade(e, t, 1350, 1900);

      kit.softGlow(x, y, lerp(20, 72, ease.outCubic(progress(t, 0, 500))) * u,
        "rgba(255, 120, 160, 0.85)", 0.7 * (1 - progress(t, 150, 700)) * alpha);

      schedule(s, "hearts", [120, 230, 340, 450, 560], t, () => {
        kit.spawn(e, {
          kind: "heart", x: x + rand(-14, 14) * u, y: y - 14 * u,
          vy: -rand(55, 85) * u, sway: rand(6, 10) * u, swayHz: rand(1.2, 1.8),
          size: rand(6, 10) * u, grow: 0.2, fadeIn: 120, life: rand(1000, 1300),
          color: pick(["#ff4f7b", "#ff8fab"]), stroke: "#b3123f",
        });
      });
      schedule(s, "petals", [300, 420, 560, 700, 850, 1000], t, () => {
        kit.spawn(e, {
          kind: "petal", x: x + rand(-18, 18) * u, y: y - 6 * u,
          vy: rand(25, 45) * u, g: 15 * u, sway: rand(10, 16) * u, swayHz: rand(0.8, 1.3),
          vr: rand(-2.5, 2.5), rot: rand(0, TAU), size: rand(5, 7) * u, life: 1300,
          color: "#e8325f", stroke: "#8a0d30",
        });
      });

      if (alpha <= 0) return;
      const cross = progress(t, 0, 200);
      const bloom = lerp(0.75, 1.12, ease.outBack(progress(t, 0, 320), 2.4))
        + 0.025 * Math.sin((t / 1000) * TAU * 1.2);
      const rot = s.settle * (1 - ease.outCubic(progress(t, 0, 500)))
        + 0.04 * Math.sin((t / 1000) * TAU * 0.8);
      const rise = -6 * u * progress(t, 1200, 600);
      kit.drawPart(e, "bud", x, y, ROSE_WIDTH * u, { rot, alpha: (1 - cross) * alpha });
      kit.drawPart(e, "bloom", x, y + rise, BLOOM_WIDTH * u * bloom, { rot, alpha: cross * alpha });
    },
  });

  // ---------- Coffee: a cup served on a saucer, steam and latte heart ----------
  const CUP_WIDTH = 42;

  // The cup is drawn around its image center; the saucer sits under its base.
  function drawCoffee(e, x, y, width, o = {}) {
    const ctx = kit.ctx;
    const u = kit.unit;
    const h = width * kit.partAspect(e, "cup");
    const bodyX = -0.053 * width;
    const alpha = o.alpha ?? 1;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    kit.drawPart(e, "saucer", bodyX, h * 0.43, width * 1.12, {
      ay: 0.52, sx: o.saucerSx ?? 1, sy: o.saucerSy ?? 1,
    });
    kit.drawPart(e, "cup", 0, 0, width);

    if (o.heart) {
      kit.heartPath(bodyX, -0.214 * h, 5.5 * u * o.heart);
      ctx.fillStyle = "#f6e3c8";
      ctx.strokeStyle = "#c48a57";
      ctx.lineWidth = 1.2 * u;
      ctx.fill();
      ctx.stroke();
    }

    // Steam wisps curl up from the rim.
    const base = ctx.globalAlpha;
    const time = (e.now || performance.now()) / 1000;
    const rim = -0.24 * h;
    const height = (o.steam ?? 1) * 24 * u;
    ctx.lineCap = "round";
    [-0.15, 0, 0.15].forEach((offset, i) => {
      const a = 0.5 + 0.5 * Math.sin(time * 2.2 + i * 2.1);
      ctx.beginPath();
      for (let k = 0; k <= 10; k++) {
        const f = k / 10;
        const px = bodyX + offset * width + Math.sin(i * 1.7 + f * 4.5 - time * 3.2) * 3.2 * u * f;
        const py = rim - 4 * u - f * height;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.globalAlpha = base * 0.35 * a;
      ctx.strokeStyle = "#7a6048";
      ctx.lineWidth = 3.4 * u;
      ctx.stroke();
      ctx.globalAlpha = base * 0.9 * a;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.7 * u;
      ctx.stroke();
    });
    ctx.restore();
  }

  register("coffee", {
    parts: { cup: "cup.svg", saucer: "saucer.svg" },
    actorWidth: CUP_WIDTH,
    flight: { motion: "float", arc: 0.5, sway: 0.06 },
    impactMs: 2000,
    drawActor(e, pose) {
      drawCoffee(e, pose.x, pose.y, CUP_WIDTH * kit.unit * pose.sx, { rot: pose.rot, steam: 0.7 });
    },
    onImpact(e) {
      kit.pulse(e, "#ffb74d");
    },
    drawImpact(e, t) {
      const u = kit.unit;
      const s = e.state;
      const { x, y } = e.to;
      const alpha = kit.fade(e, t, 1450, 2000);

      // Set down with a small bounce; the saucer flattens on contact.
      const drop = -12 * u * (1 - ease.outBounce(progress(t, 0, 320)));
      const squash = Math.sin(Math.PI * progress(t, 100, 140));
      if (!s.clinked && t >= 110) {
        s.clinked = true;
        kit.sound("clink");
        sparkleBurst(e, x - 16 * u, y - 14 * u, 2, ["#ffd54f", "#ffffff"], [30, 60]);
        sparkleBurst(e, x + 18 * u, y - 10 * u, 2, ["#ffd54f", "#ffffff"], [30, 60]);
      }
      schedule(s, "hearts", [450], t, () => {
        kit.spawn(e, {
          kind: "heart", x: x - 2 * u, y: y - 20 * u,
          vy: -60 * u, sway: 6 * u, swayHz: 1.4, size: 7 * u, grow: 0.3,
          fadeIn: 120, life: 1200, color: "#ff8a65", stroke: "#c8553a",
        });
      });
      if (alpha <= 0) return;

      kit.softGlow(x, y, 58 * u, "rgba(255, 190, 110, 0.8)",
        0.5 * (0.8 + 0.2 * Math.sin((t / 1000) * TAU * 1.5)) * alpha);
      const pulse = progress(t, 300, 380);
      drawCoffee(e, x, y + drop, CUP_WIDTH * u * lerp(1, 1.15, ease.outCubic(progress(t, 0, 300))), {
        alpha,
        steam: 1,
        saucerSx: 1 + 0.08 * squash,
        saucerSy: 1 - 0.16 * squash,
        heart: pulse > 0 && pulse < 1 ? 1 + 0.5 * Math.sin(Math.PI * pulse) : 0,
      });
    },
  });

  // ---------- Laugh: bouncing hops, belly laugh with tear streams, pop ----------
  const FACE_WIDTH = 38;
  const LAUGH_POP_AT = 1180;

  // Face part plus animated features in the face's 120-unit coordinates.
  function drawFace(e, x, y, width, o = {}) {
    const ctx = kit.ctx;
    const open = o.open ?? 0.6;
    ctx.save();
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    ctx.scale(o.sx ?? 1, o.sy ?? 1);
    kit.drawPart(e, "face", 0, 0, width);
    ctx.scale(width / 120, width / 120);
    ctx.translate(-60, -60);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.strokeStyle = "#5a3510";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(30, 50);
    ctx.quadraticCurveTo(40, 36, 50, 50);
    ctx.moveTo(70, 50);
    ctx.quadraticCurveTo(80, 36, 90, 50);
    ctx.stroke();

    const depth = 18 + 40 * open;
    ctx.beginPath();
    ctx.moveTo(30, 66);
    ctx.lineTo(90, 66);
    ctx.bezierCurveTo(88, 66 + depth, 32, 66 + depth, 30, 66);
    ctx.closePath();
    ctx.fillStyle = "#6b2412";
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "#fff";
    ctx.fillRect(28, 64, 64, 8);
    ctx.fillStyle = "#ff6b6b";
    ctx.beginPath();
    ctx.ellipse(60, 66 + depth * 0.78, 15, 4 + 5 * open, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#6fd0ff";
    ctx.strokeStyle = "#2a86c8";
    ctx.lineWidth = 2.5;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(60 + side * 38, 52);
      ctx.scale(side, 1);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-5, 10, -12, 16, -14, 24);
      ctx.bezierCurveTo(-16, 32, -8, 36, -4, 32);
      ctx.bezierCurveTo(2, 28, 2, 18, 0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  register("laugh", {
    parts: { face: "face.svg" },
    actorWidth: FACE_WIDTH,
    flight: { motion: "hop", arc: 1, hops: 2 },
    impactMs: 1650,
    drawActor(e, pose) {
      const open = 0.45 + 0.25 * Math.sin((e.now || 0) / 90);
      drawFace(e, pose.x, pose.y, FACE_WIDTH * kit.unit, { rot: pose.rot, sx: pose.sx, sy: pose.sy, open });
    },
    onImpact(e) {
      kit.sound("giggle");
      kit.pulse(e, "#ffd23f");
    },
    drawImpact(e, t) {
      const u = kit.unit;
      const s = e.state;
      const { x, y } = e.to;
      const env = progress(t, 0, 180);
      const grow = 1 + 0.6 * ease.outBack(progress(t, 0, 240), 2);
      const shrink = 1 - ease.inBack(progress(t, LAUGH_POP_AT, 200));
      const rot = 0.24 * Math.sin((t / 1000) * TAU * 3.2) * env;
      const bob = -5 * u * Math.abs(Math.sin((t / 1000) * TAU * 6.4)) * env;
      const open = 0.55 + 0.45 * Math.abs(Math.sin((t / 1000) * TAU * 4.8));
      const width = FACE_WIDTH * u * grow * Math.max(0, shrink);

      // Tears stream from both eye corners while it laughs.
      if (t > 150 && t < 1100 && t >= (s.nextTear ?? 0)) {
        s.nextTear = t + 55;
        for (const side of [-1, 1]) {
          const lx = side * (38 / 120) * width;
          const ly = (-8 / 120) * width;
          kit.spawn(e, {
            kind: "drop",
            x: x + lx * Math.cos(rot) - ly * Math.sin(rot),
            y: y + bob + lx * Math.sin(rot) + ly * Math.cos(rot),
            vx: side * rand(90, 150) * u, vy: -rand(70, 140) * u, g: 650 * u,
            size: rand(3, 4.5) * u, life: rand(500, 700),
            color: "#7fd6ff", stroke: "#2a86c8",
          });
        }
      }
      if (!s.popped && t >= LAUGH_POP_AT + 120) {
        s.popped = true;
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU + rand(-0.3, 0.3);
          const v = rand(50, 110) * u;
          kit.spawn(e, {
            kind: "smoke", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 4,
            size: rand(5, 9) * u, grow: 1, life: 420,
            color: "rgba(255, 248, 220, 0.95)", stroke: "rgba(200, 170, 90, 0.5)",
          });
        }
        sparkleBurst(e, x, y, 5, ["#ffd23f", "#ffffff"]);
      }
      if (width <= 0.5) return;
      const wobble = 0.04 * Math.sin((t / 1000) * TAU * 6.4);
      drawFace(e, x, y + bob, width, { rot, open, sx: 1 + wobble, sy: 1 - wobble });
    },
  });
})();
