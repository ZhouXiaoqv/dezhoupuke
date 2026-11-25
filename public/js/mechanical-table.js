// The mechanical table consumes the same filtered game snapshots as the classic table.
const MechanicalTable = (() => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const SLOTS = {
    2: [0, 5], 3: [0, 4, 5], 4: [0, 2, 5, 7], 5: [0, 2, 4, 5, 7],
    6: [0, 1, 3, 4, 5, 7], 7: [0, 1, 3, 4, 5, 6, 8],
    8: [0, 1, 2, 4, 5, 6, 7, 8],
  };
  const DENOMINATIONS = [[100, "#4c405c"], [50, "#a13f47"], [20, "#427560"], [10, "#396b92"], [5, "#b17b35"]];
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
  let armTip, armJob, sweep, frame, state, handToDeal, finalizedHand, bounds, center;
  let groups = new Map();
  let renderedGroups = new Map();

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
    frame = armJob = armTip = sweep = state = handToDeal = finalizedHand = bounds = null;
    queue.length = 0;
    wagers.clear();
    labels.clear();
    groups.clear();
    renderedGroups.clear();
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
    center = { x: rect.width / 2, y: rect.height * .32 };
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
        for (const hand of hands) if (hand[round]) queueDeal([hand[round]], 102);
      }
      handToDeal = null;
    }
    if (sameHand && next.community.length > last.community.length) {
      const slots = $("community").children;
      for (let i = last.community.length; i < next.community.length; i++) queueDeal([slots[i]], 175);
    }
    $("mechanicalBlinds").textContent = next.sb && next.bb ? "盲注 " + next.sb + " / " + next.bb : "";
    const oldGroups = groups;
    groups = readGroups(next);
    if (sameHand && !reduced.matches) scheduleChips(oldGroups, groups);
    syncLabels();
    nextFrame();
  }

  function chipInventory(amount) {
    let remainder = amount;
    const countByValue = [];
    const pieces = [];
    const compressed = [];
    for (const [value, color] of DENOMINATIONS) {
      const count = Math.floor(remainder / value);
      if (!count) continue;
      remainder -= count * value;
      countByValue.push(value + " × " + currency.format(count));
      const visible = Math.min(count, 84);
      if (visible < count) compressed.push(value + "×" + currency.format(count));
      for (let i = 0; i < visible; i++) pieces.push({ value, color });
    }
    if (remainder > 0) countByValue.push("余 " + currency.format(remainder));
    return { pieces, description: countByValue.join(" · "), compressed };
  }

  function readGroups(snapshot) {
    const next = new Map();
    if (snapshot.handNum === finalizedHand) return next;
    const betting = ["preflop", "flop", "turn", "river"].includes(snapshot.phase);
    let live = 0;
    snapshot.players.forEach((player, index) => {
      if (!betting || !player.bet) return;
      live += player.bet;
      const seat = table.querySelector(".seat-" + index + " .seat-info");
      if (!seat) return;
      const origin = point(seat.getBoundingClientRect());
      const dx = bounds.width / 2 - origin.x, dy = bounds.height / 2 - origin.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const radius = 106;
      const x = origin.x + dx / distance * radius;
      const y = origin.y + dy / distance * radius;
      const side = dx > 0 ? 1 : -1;
      const at = seat.closest(".seat").dataset.mechanicalSlot === "0"
        ? { x: origin.x - 130, y: origin.y - 78 }
        : { x: x - dy / distance * 45 * side, y: y + dx / distance * 45 * side };
      next.set(player.id, { id: player.id, at, origin, amount: player.bet, name: player.name });
    });
    const collected = Math.max(0, snapshot.pot - live);
    if (collected) next.set("pot", { id: "pot", at: center, amount: collected, name: "已收底池" });
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
      label.style.top = group.at.y + 13 + "px";
      if (label.dataset.amount === String(group.amount)) continue;
      group.inventory = chipInventory(group.amount);
      label.dataset.amount = group.amount;
      const amount = currency.format(group.amount);
      label.textContent = [amount, ...group.inventory.compressed].join(" · ");
      label.title = group.inventory.description;
      label.setAttribute("aria-label", group.name + " " + amount + "（" + label.title + "）");
    }
    const nextRendered = new Map();
    for (const group of groups.values()) {
      group.inventory ??= renderedGroups.get(group.id)?.inventory || chipInventory(group.amount);
      nextRendered.set(group.id, group);
    }
    renderedGroups = nextRendered;
  }

  function scheduleChips(previous, next) {
    const start = performance.now();
    const sources = [...previous.values()].filter(group => group.id !== "pot" && !next.has(group.id));
    const nextPot = next.get("pot");
    if (sources.length && nextPot && nextPot.amount > (previous.get("pot")?.amount || 0)) {
      sweep = { start, sources, oldPot: previous.get("pot") };
    }
    for (const [id, group] of next) {
      if (id === "pot") continue;
      const old = previous.get(id);
      if (group.amount > (old?.amount || 0)) wagers.set(id, { start, old, added: chipInventory(group.amount - (old?.amount || 0)) });
    }
    for (const id of wagers.keys()) if (!next.has(id)) wagers.delete(id);
  }

  function stackPoint(at, index, count) {
    const depth = Math.min(10, Math.max(1, Math.ceil(Math.sqrt(count) * 1.9)));
    const columns = Math.min(6, Math.ceil(count / depth));
    const col = Math.floor(index / depth);
    return { x: at.x + ((col % columns) - (columns - 1) / 2) * 23,
      y: at.y + Math.floor(col / columns) * 13 + (col % 2) * 3 - (index % depth) * 3.2 };
  }

  function scatterPoint(at, index, spread) {
    const angle = index * 2.399963;
    const distance = Math.min(spread, Math.sqrt(index) * spread / 6.6);
    return { x: at.x + Math.cos(angle) * distance, y: at.y + Math.sin(angle) * distance * .58 };
  }

  function drawChip({ x, y }, { color, value }) {
    context.beginPath();
    context.ellipse(x, y + 3, 12, 7, 0, 0, Math.PI * 2);
    context.fillStyle = "#302b29";
    context.fill();
    context.beginPath();
    context.ellipse(x, y, 12, 7, 0, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.strokeStyle = "#fff2d9";
    context.lineWidth = 1.5;
    context.setLineDash([3, 2.5]);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = "#fff2d9";
    context.font = "bold 7px monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(value, x, y + .5);
  }

  function drawStack(group, regroup = 1, spread = 70) {
    if (!group) return;
    const pieces = group.inventory.pieces;
    pieces.forEach((chip, index) => {
      const stacked = stackPoint(group.at, index, pieces.length);
      drawChip(regroup === 1 ? stacked : lerp(scatterPoint(group.at, index, spread), stacked, ease(regroup)), chip);
    });
  }

  function drawChips(now) {
    context.clearRect(0, 0, bounds.width, bounds.height);
    for (const group of groups.values()) {
      const wager = wagers.get(group.id);
      if (group.id === "pot" && sweep) {
        const progress = Math.min(1, (now - sweep.start) / 660);
        if (progress < .52) {
          drawStack(sweep.oldPot);
          let offset = 0;
          for (const source of sweep.sources) {
            const pieces = source.inventory.pieces;
            pieces.forEach((chip, index) => drawChip(lerp(stackPoint(source.at, index, pieces.length),
              scatterPoint(group.at, offset + index, 88), ease(progress / .52)), chip));
            offset += pieces.length;
          }
        } else {
          drawStack(group, (progress - .52) / .48, 88);
          if (progress >= 1) sweep = null;
        }
      } else if (wager) {
        const progress = Math.min(1, (now - wager.start) / 420);
        if (progress < .52) {
          drawStack(wager.old);
          wager.added.pieces.forEach((chip, index) => drawChip(lerp(group.origin,
            scatterPoint(group.at, index, 65), ease(progress / .52)), chip));
        } else {
          drawStack(group, (progress - .52) / .48, 65);
          if (progress >= 1) wagers.delete(group.id);
        }
      } else {
        drawStack(group);
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
        return { ...job, from: armTip || dock, at, spark, start: now, duration: 430 };
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
        pose(lerp(armTip, dock, .26));
        return true;
      }
      pose(dock);
      return false;
    }
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
      const at = t < .30 ? lerp(job.from, slot, ease(t / .30)) : lerp(slot, job.at, ease((t - .30) / .70));
      pose(at);
      place(job.payload, at);
      job.payload.style.visibility = t < .30 ? "hidden" : "visible";
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
