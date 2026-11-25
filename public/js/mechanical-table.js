// The mechanical table consumes the same filtered game snapshots as the classic table.
const MechanicalTable = (() => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const SLOTS = {
    2: [0, 5], 3: [0, 4, 5], 4: [0, 2, 5, 7], 5: [0, 2, 4, 5, 7],
    6: [0, 1, 3, 4, 5, 7], 7: [0, 1, 3, 4, 5, 6, 8],
    8: [0, 1, 2, 4, 5, 6, 7, 8],
  };
  const DENOMINATIONS = [
    [100, "#694d81"], [50, "#b84043"], [20, "#428568"],
    [10, "#397baa"], [5, "#c48732"], [1, "#77746d"],
  ];
  const PILE_POSITIONS = [
    [0, 0, 1.7], [-26, -6, 1.1], [25, -9, 1.08], [-14, 16, .75], [15, 14, .81],
    [5, -24, .94], [-39, 10, .61], [39, 8, .65], [-25, -22, .59], [29, -22, .63],
  ];
  const currency = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 12 });
  const canvas = $("mechanicalChips");
  const context = canvas.getContext("2d");
  const svg = $("mechanicalArm");
  const moving = $("mechanicalMovingCards");
  const labelLayer = $("mechanicalChipLabels");
  const result = $("mechanicalResult");
  const table = $("table");
  const container = $("table-container");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const queue = [];
  const wagers = new Map();
  const labels = new Map();
  let armTip, armJob, park, sweep, frame, state, handToDeal, finalizedHand, bounds, center;
  let groups = new Map();

  svg.innerHTML =
    '<defs><linearGradient id="armSteel" x2="0%" y2="100%"><stop stop-color="#fffaf0"/><stop offset=".49" stop-color="#e4dacc"/><stop offset="1" stop-color="#ad9d88"/></linearGradient></defs>';
  const links = Array.from({ length: 3 }, (_, index) => {
    const group = document.createElementNS(SVG_NS, "g");
    const thickness = [29, 22, 14][index];
    group.innerHTML = [
      '<rect class="arm-shadow" x="-6" y="' + (4 - thickness / 2) + '" height="' + thickness + '" rx="6"/>',
      '<rect class="arm-link" x="-6" y="' + (-thickness / 2) + '" height="' + thickness + '" rx="6"/>',
      '<rect class="arm-rail" x="8" y="' + (-thickness / 3) + '" height="2.5" rx="1"/>',
      '<rect class="arm-rail" x="8" y="' + (thickness / 4) + '" height="2.5" rx="1"/>',
    ].join("");
    svg.append(group);
    return group;
  });
  const hubs = [21, 15, 11, 7].map(radius => {
    const group = document.createElementNS(SVG_NS, "g");
    group.innerHTML = '<circle class="arm-hub" r="' + radius + '"/><circle class="arm-hub-inner" r="' +
      radius * .64 + '"/><circle class="arm-pin" r="' + radius * .21 + '"/>';
    svg.append(group);
    return group;
  });

  function enabled() {
    return container.classList.contains("mechanical-table");
  }

  function reset() {
    cancelAnimationFrame(frame);
    frame = armJob = armTip = park = sweep = state = handToDeal = finalizedHand = bounds = null;
    queue.length = 0;
    wagers.clear();
    labels.clear();
    groups.clear();
    labelLayer.replaceChildren();
    moving.replaceChildren();
    table.querySelectorAll(".mechanical-pending").forEach(card => card.classList.remove("mechanical-pending"));
    context.clearRect(0, 0, canvas.width, canvas.height);
    result.hidden = true;
  }

  function setStyle(style) {
    const active = style === "mechanical";
    if (active !== enabled()) {
      reset();
      container.classList.toggle("mechanical-table", active);
      table.querySelectorAll(".seat").forEach(seat => seat.remove());
      delete table.dataset.mechanicalViewer;
      container.querySelector(":scope > .my-hand")?.remove();
      $("tableOutfitBtn").hidden = active || !container.classList.contains("active") || !isRegistered || isSpectator;
      if (active) {
        $("interactPanel").classList.remove("active");
        $("settlementOverlay").classList.remove("active");
        window.Pets3D?.clear();
      }
    }
    return active;
  }

  function startHand(handNum) {
    if (!enabled()) return;
    reset();
    handToDeal = handNum;
  }

  function positionSeat(seat, index, count) {
    seat.dataset.mechanicalSlot = (SLOTS[count] || SLOTS[8])[index] ?? 0;
  }

  function cardBack(slot = false) {
    const el = document.createElement("div");
    el.className = "card " + (slot ? "mechanical-card-slot" : "card-back mechanical-card-back");
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  function point(rect) {
    return { x: rect.left - bounds.left + rect.width / 2, y: rect.top - bounds.top + rect.height / 2 };
  }

  function lerp(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function ease(t) {
    return t * t * (3 - 2 * t);
  }

  function nextFrame() {
    if (!frame && bounds) frame = requestAnimationFrame(draw);
  }

  function measure() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    if (bounds?.width !== rect.width || bounds?.height !== rect.height) {
      svg.setAttribute("viewBox", "0 0 " + rect.width + " " + rect.height);
    }
    bounds = rect;
    center = { x: rect.width / 2, y: rect.height * .35 };
    const ratio = Math.min(2, devicePixelRatio || 1);
    const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    return true;
  }

  function beforeRender(next) {
    if (!state || state.handNum !== next.handNum || reduced.matches || !measure()) return;
    for (const player of next.players) {
      const previousIndex = state.players.findIndex(previous => previous.id === player.id);
      if (!player.folded || state.players[previousIndex]?.folded !== false) continue;
      const originals = [...table.querySelectorAll(".seat-" + previousIndex + " :is(.my-hand,.seat-cards) .card")];
      if (!originals.length) continue;
      const ghosts = originals.map(original => {
        const rect = original.getBoundingClientRect();
        return { node: original.cloneNode(true), at: point(rect), width: rect.width };
      });
      queue.push({ kind: "fold", ghosts });
    }
  }

  function queueDeal(cards, duration) {
    if (reduced.matches || !cards.length) return;
    cards.forEach(card => card.classList.add("mechanical-pending"));
    queue.push({ kind: "deal", cards, duration });
  }

  function render(next) {
    const last = state;
    state = next;
    if (!measure()) return;
    const sameHand = last?.handNum === next.handNum;
    if (handToDeal === next.handNum) {
      const hands = next.players.map((player, index) => player.folded ? [] :
        [...table.querySelectorAll(".seat-" + index + " :is(.my-hand,.seat-cards) .card")]);
      for (let round = 0; round < 2; round++) {
        for (const hand of hands) if (hand[round]) queueDeal([hand[round]], 300);
      }
      handToDeal = null;
    }
    if (sameHand && next.community.length > last.community.length) {
      const slots = $("community").children;
      for (let i = last.community.length; i < next.community.length; i++) queueDeal([slots[i]], 420);
    }
    $("mechanicalBlinds").textContent = next.sb && next.bb ? "盲注 " + next.sb + " / " + next.bb : "";
    const oldGroups = groups;
    groups = readGroups(next);
    if (sameHand && !reduced.matches) scheduleChips(oldGroups, groups);
    syncLabels();
    nextFrame();
  }

  function readGroups(snapshot) {
    const next = new Map();
    if (snapshot.handNum === finalizedHand) return next;
    const betting = ["preflop", "flop", "turn", "river"].includes(snapshot.phase);
    const potPayments = [];
    let live = 0;
    snapshot.players.forEach((player, index) => {
      const payments = player.chipPayments ?? [player.totalBet - player.bet, player.bet];
      const streetStart = betting ? (player.streetPaymentStart ?? 1) : payments.length;
      for (let i = 0; i < streetStart; i++) potPayments.push(payments[i]);
      if (!betting || !player.bet) return;
      live += player.bet;
      const seat = table.querySelector(".seat-" + index);
      if (!seat) return;
      const origin = point(seat.querySelector(".seat-info").getBoundingClientRect());
      const dx = bounds.width / 2 - origin.x, dy = bounds.height / 2 - origin.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const radius = 106;
      const x = origin.x + dx / distance * radius;
      const y = origin.y + dy / distance * radius;
      const side = dx > 0 ? 1 : -1;
      const at = seat.dataset.mechanicalSlot === "0"
        ? { x: origin.x - 130, y: origin.y - 78 }
        : { x: x - dy / distance * 45 * side, y: y + dx / distance * 45 * side };
      next.set(player.id, { id: player.id, at, origin, amount: player.bet, name: player.name,
        payments: payments.slice(streetStart) });
    });
    const collected = Math.max(0, snapshot.pot - live);
    if (collected) next.set("pot", { id: "pot", at: center, amount: collected, name: "已收底池", payments: potPayments });
    for (const group of next.values()) group.inventory = chipInventory(group.payments, group.amount);
    return next;
  }

  function syncLabels() {
    for (const [id, label] of labels) {
      if (!groups.has(id)) {
        label.remove();
        labels.delete(id);
      }
    }
    for (const [id, group] of groups) {
      let label = labels.get(id);
      if (!label) {
        label = document.createElement("span");
        label.className = "mechanical-chip-amount";
        labelLayer.append(label);
        labels.set(id, label);
      }
      label.style.left = group.at.x + "px";
      label.style.top = group.at.y + (group.inventory.piles.length > 3 ? 24 : 15) + "px";
      if (label.dataset.amount === String(group.amount) && label.title === group.inventory.description) continue;
      label.dataset.amount = group.amount;
      const amount = currency.format(group.amount);
      label.textContent = [amount, ...group.inventory.compressed].join(" · ");
      label.title = group.inventory.description;
      label.setAttribute("aria-label", group.name + " " + amount + "（" + label.title + "）");
    }
  }

  function chipInventory(payments, amount) {
    const counts = DENOMINATIONS.map(() => 0);
    for (let payment of payments) {
      for (const [index, [value]] of DENOMINATIONS.entries()) {
        const count = Math.floor(payment / value);
        counts[index] += count;
        payment -= count * value;
      }
    }
    const description = [];
    const compressed = [];
    const runs = [];
    const cap = Math.floor(84 / Math.max(1, counts.filter(count => count > 0).length));
    let represented = 0;
    for (const [index, [value]] of DENOMINATIONS.entries()) {
      const count = counts[index];
      if (!count) continue;
      represented += value * count;
      description.push(value + " × " + currency.format(count));
      if (count > cap) compressed.push(value + "×" + currency.format(count));
      runs.push({ value, count: Math.min(count, cap) });
    }
    if (amount - represented > 1e-8) description.push("余 " + currency.format(amount - represented));
    return { ...layoutPiles(runs), description: description.join(" · "), compressed };
  }

  function layoutPiles(runs) {
    const values = runs.flatMap(({ value, count }) => Array(count).fill(value));
    if (!values.length) return { piles: [], chips: [] };

    const few = values.length <= 6;
    const count = few ? runs.length : Math.min(PILE_POSITIONS.length, Math.max(3, Math.ceil(values.length / 9)));
    const heights = few ? runs.map(run => run.count) : Array(count).fill(1);
    for (let remaining = few ? 0 : values.length - count; remaining > 0; remaining--) {
      let next = 0;
      for (let index = 1; index < count; index++) {
        if (heights[index] / PILE_POSITIONS[index][2] < heights[next] / PILE_POSITIONS[next][2]) next = index;
      }
      heights[next]++;
    }

    let chipIndex = 0;
    const piles = heights.map((height, index) => {
      const [baseX, baseY] = PILE_POSITIONS[index];
      const row = few && count <= 3;
      const x = row ? (index - (count - 1) / 2) * 26 : baseX;
      const y = row ? (index % 2) * 3 : baseY;
      const lean = Math.sin(index * 2.7 + .9) * .48;
      const chips = Array.from({ length: height }, (_, level) => ({
        value: values[chipIndex++],
        x: x + level * lean + Math.sin(level * 1.8 + index) * 1.1,
        y: y - level * 4.35 + Math.sin(level * 2.1 + index) * .65,
        angle: Math.sin(level * 1.4 + index * 3) * .065,
      }));
      return { x, y, chips };
    });
    piles.sort((a, b) => a.y - b.y);
    return { piles, chips: piles.flatMap(pile => pile.chips) };
  }

  function scheduleChips(previous, next) {
    const start = performance.now();
    const sources = [...previous.values()].filter(group => group.id !== "pot" && !next.has(group.id));
    const nextPot = next.get("pot");
    const oldPot = previous.get("pot");
    if (sources.length && nextPot && nextPot.amount > (oldPot?.amount || 0)) {
      sweep = chipMotion(nextPot, oldPot ? [oldPot, ...sources] : sources, start);
    }
    for (const [id, group] of next) {
      if (id === "pot") continue;
      const old = previous.get(id);
      if (group.amount > (old?.amount || 0)) wagers.set(id, chipMotion(group, old ? [old] : [], start));
    }
    for (const id of wagers.keys()) if (!next.has(id)) wagers.delete(id);
  }

  function chipMotion(group, sources, start) {
    const fromByValue = new Map();
    for (const source of sources) {
      for (const chip of source.inventory.chips) {
        if (!fromByValue.has(chip.value)) fromByValue.set(chip.value, []);
        fromByValue.get(chip.value).push(chipPoint(source, chip));
      }
    }
    for (const positions of fromByValue.values()) positions.reverse();
    return { start, origins: group.inventory.chips.map(chip => fromByValue.get(chip.value)?.pop()) };
  }

  function chipPoint(group, chip) {
    return { x: group.at.x + chip.x, y: group.at.y + chip.y };
  }

  function scatterPoint(at, index, spread) {
    const angle = index * 2.399963;
    const distance = Math.min(spread, Math.sqrt(index) * spread / 6.6);
    return { x: at.x + Math.cos(angle) * distance, y: at.y + Math.sin(angle) * distance * .58 };
  }

  function makeChip(value, color) {
    const sprite = document.createElement("canvas");
    sprite.width = 64;
    sprite.height = 48;
    const paint = sprite.getContext("2d");
    paint.scale(2, 2);
    paint.translate(16, 10);
    paint.beginPath();
    paint.moveTo(-13, 0);
    paint.lineTo(13, 0);
    paint.lineTo(13, 4);
    paint.ellipse(0, 4, 13, 7.4, 0, 0, Math.PI);
    paint.closePath();
    const side = paint.createLinearGradient(-13, 0, 13, 0);
    side.addColorStop(0, "#2b2525");
    side.addColorStop(.43, color);
    side.addColorStop(1, "#352b27");
    paint.fillStyle = side;
    paint.fill();
    paint.fillStyle = "#ead8b7";
    for (const x of [-10, -4, 4, 10]) {
      const y = Math.sqrt(1 - (x / 13) ** 2) * 7.4;
      paint.fillRect(x - .9, y - .5, 1.8, 3.8);
    }

    paint.beginPath();
    paint.ellipse(0, 0, 13, 7.4, 0, 0, Math.PI * 2);
    paint.fillStyle = color;
    paint.fill();
    paint.strokeStyle = "#fff0d6";
    paint.lineWidth = 2.3;
    paint.setLineDash([3.8, 4.1]);
    paint.beginPath();
    paint.ellipse(0, 0, 11.2, 5.8, 0, 0, Math.PI * 2);
    paint.stroke();
    paint.setLineDash([]);
    paint.beginPath();
    paint.ellipse(0, 0, 7.3, 4.05, 0, 0, Math.PI * 2);
    paint.fillStyle = "#fff1d6";
    paint.fill();
    paint.fillStyle = "#342b29";
    paint.font = "bold 7px monospace";
    paint.textAlign = "center";
    paint.textBaseline = "middle";
    paint.fillText(value, 0, .4);
    return sprite;
  }

  const chipSprites = new Map(DENOMINATIONS.map(([value, color]) => [value, makeChip(value, color)]));

  function drawChip({ x, y }, { value, angle }) {
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.drawImage(chipSprites.get(value), -16, -10, 32, 24);
    context.restore();
  }

  function drawPileShadows(group, opacity) {
    if (!opacity) return;
    context.save();
    context.globalAlpha = opacity;
    for (const pile of group.inventory.piles) {
      const { x, y } = chipPoint(group, pile);
      const radius = 16 + Math.min(5, pile.chips.length * .38);
      context.save();
      context.translate(x + 3, y + 6);
      context.scale(1, .55);
      const falloff = context.createRadialGradient(0, 0, 3, 0, 0, radius);
      falloff.addColorStop(0, "#3e2b1e55");
      falloff.addColorStop(1, "#3e2b1e00");
      context.fillStyle = falloff;
      context.fillRect(-radius, -radius, radius * 2, radius * 2);
      context.restore();
    }
    context.restore();
  }

  function drawChips(now) {
    context.clearRect(0, 0, bounds.width, bounds.height);
    for (const group of groups.values()) {
      const pot = group.id === "pot";
      const motion = pot ? sweep : wagers.get(group.id);
      const progress = motion ? Math.max(0, Math.min(1, (now - motion.start) / (pot ? 700 : 460))) : 1;
      drawPileShadows(group, Math.max(0, (progress - .65) / .35));
      for (const [index, chip] of group.inventory.chips.entries()) {
        const target = chipPoint(group, chip);
        if (progress === 1) {
          drawChip(target, chip);
          continue;
        }
        const source = motion.origins[index];
        const scattered = !pot && source ? source : scatterPoint(group.at, index, pot ? 82 : 54);
        const from = source || group.origin || group.at;
        const position = progress < .52 ? lerp(from, scattered, ease(progress / .52))
          : lerp(scattered, target, ease((progress - .52) / .48));
        drawChip(position, chip);
      }
      if (motion && progress === 1) {
        if (pot) sweep = null;
        else wagers.delete(group.id);
      }
    }
  }

  function pose(target) {
    const root = { x: bounds.width / 2, y: 22 };
    const travel = Math.hypot(target.x - root.x, target.y - root.y);
    const bearing = Math.atan2(target.y - root.y, target.x - root.x);
    // Telescoping links keep the parked mechanism compact and reach distant seats.
    const first = 91 + travel * .27;
    const second = 88 + travel * .25;
    const third = 26 + travel * .16;
    const wrist = { x: target.x - Math.cos(bearing + .22) * third,
      y: target.y - Math.sin(bearing + .22) * third };
    const dx = wrist.x - root.x, dy = wrist.y - root.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const projection = (first * first + distance * distance - second * second) / (2 * first * distance);
    const elbowAngle = Math.atan2(dy, dx) - Math.acos(Math.max(-1, Math.min(1, projection)));
    const elbow = { x: root.x + Math.cos(elbowAngle) * first, y: root.y + Math.sin(elbowAngle) * first };
    const joints = [root, elbow, wrist, target];
    links.forEach((link, index) => {
      const a = joints[index], b = joints[index + 1];
      const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      link.setAttribute("transform", "translate(" + a.x + " " + a.y + ") rotate(" + angle + ")");
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      for (const rect of link.children) rect.setAttribute("width", Math.max(0, length - 2 * Number(rect.getAttribute("x"))));
    });
    hubs.forEach((hub, index) => hub.setAttribute("transform", "translate(" + joints[index].x + " " + joints[index].y + ")"));
    armTip = target;
  }

  function place(node, at) {
    node.style.left = at.x + "px";
    node.style.top = at.y + "px";
  }

  function beginJob(now, dock) {
    while (queue.length) {
      const job = queue.shift();
      if (job.kind === "fold") {
        const at = job.ghosts[0].at;
        for (const ghost of job.ghosts) {
          ghost.node.classList.remove("mechanical-pending");
          ghost.node.classList.add("mechanical-carry");
          ghost.node.style.width = ghost.width + "px";
          place(ghost.node, ghost.at);
          moving.append(ghost.node);
        }
        const spark = document.createElement("i");
        spark.className = "mechanical-spark";
        place(spark, at);
        moving.append(spark);
        return { ...job, from: armTip || dock, at, spark, start: now, duration: 820 };
      }
      const cards = job.cards.filter(card => card.isConnected);
      if (!cards.length) continue;
      const rect = cards[0].getBoundingClientRect();
      const payload = cardBack();
      payload.classList.add("mechanical-carry");
      payload.style.width = rect.width + "px";
      moving.append(payload);
      return { ...job, cards, from: armTip || dock, at: point(rect), payload, start: now };
    }
    return null;
  }

  function drawArm(now) {
    const dock = { x: bounds.width / 2 + 72, y: 40 };
    armJob ||= beginJob(now, dock);
    if (!armJob) {
      if (armTip && Math.hypot(armTip.x - dock.x, armTip.y - dock.y) > 1) {
        park ||= { from: armTip, start: now };
        const progress = Math.min(1, (now - park.start) / 460);
        pose(lerp(park.from, dock, ease(progress)));
        if (progress < 1) return true;
      }
      park = null;
      pose(dock);
      return false;
    }
    park = null;
    const job = armJob;
    const t = Math.min(1, (now - job.start) / job.duration);
    if (job.kind === "fold") {
      pose(lerp(job.from, job.at, ease(Math.min(1, t / .56))));
      const burn = Math.max(0, (t - .55) / .45);
      job.spark.style.opacity = Math.sin(burn * Math.PI);
      job.spark.style.scale = String(.4 + burn * 1.2);
      for (const { node } of job.ghosts) {
        node.style.opacity = 1 - burn;
        node.style.scale = String(1 - burn * .85);
      }
      if (t === 1) {
        job.ghosts.forEach(({ node }) => node.remove());
        job.spark.remove();
      }
    } else {
      const slot = { x: bounds.width / 2, y: 43 };
      const at = t < .28 ? lerp(job.from, slot, ease(t / .28))
        : lerp(slot, job.at, ease(Math.max(0, Math.min(1, (t - .34) / .60))));
      pose(at);
      place(job.payload, at);
      job.payload.style.visibility = t < .28 ? "hidden" : "visible";
      if (t === 1) {
        job.payload.remove();
        job.cards.forEach(card => card.classList.remove("mechanical-pending"));
      }
    }
    if (t === 1) armJob = null;
    return true;
  }

  function draw(now) {
    frame = null;
    drawChips(now);
    if (drawArm(now) || sweep || wagers.size) nextFrame();
  }

  function showResult(snapshot, { winners = [], refunds = [], showedPlayerId } = {}) {
    if (!snapshot || !container.classList.contains("active")) return;
    finalizedHand = snapshot.handNum;
    sweep = null;
    wagers.clear();
    groups.clear();
    syncLabels();
    nextFrame();
    $("mechanicalResultTitle").textContent = "第 " + snapshot.handNum + " 手 · 结算";
    $("mechanicalResultPot").textContent = "底池 " + currency.format(snapshot.pot);
    $("mechanicalResultBoard").replaceChildren(...snapshot.community.map(createCardEl));
    const rows = snapshot.players.map((player, index) => {
      const row = document.createElement("li");
      const award = winners.find(winner => winner.id === player.id);
      const refund = refunds.find(entry => entry.id === player.id);
      if (award) row.classList.add("mechanical-result-winner");
      const name = document.createElement("span");
      name.textContent = player.name;
      const position = document.createElement("span");
      position.className = "mechanical-result-position";
      position.textContent = index === snapshot.dealerIdx ? "D" : index === snapshot.sbIdx ? "SB" : index === snapshot.bbIdx ? "BB" : "";
      const outcome = document.createElement("span");
      const rank = award?.revealedRank || award?.hand || player.handRank || (player.folded ? "弃牌" : "");
      outcome.textContent = [rank, award && "+" + currency.format(award.amount), refund && "退回 " + currency.format(refund.amount)].filter(Boolean).join(" · ");
      const cards = document.createElement("span");
      cards.className = "mechanical-result-hand";
      if ((!player.folded && snapshot.phase === "showdown") || showedPlayerId === player.id) {
        cards.append(...player.hand.filter(Boolean).map(createCardEl));
      }
      row.append(name, position, outcome, cards);
      return row;
    });
    $("mechanicalResultPlayers").replaceChildren(...rows);
    result.hidden = false;
  }

  $("mechanicalResultClose").addEventListener("click", () => { result.hidden = true; });
  new ResizeObserver(() => {
    if (!enabled() || !state || !measure()) return;
    groups = readGroups(state);
    syncLabels();
    nextFrame();
  }).observe(table);

  return { enabled, setStyle, reset, startHand, positionSeat, cardBack, beforeRender, render, showResult };
})();
