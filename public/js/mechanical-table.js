// The mechanical table consumes the same filtered game snapshots as the classic table.
const MechanicalTable = (() => {
  const SLOTS = {
    2: [0, 5], 3: [0, 4, 5], 4: [0, 2, 5, 7], 5: [0, 2, 4, 5, 7],
    6: [0, 1, 3, 4, 5, 7], 7: [0, 1, 3, 4, 5, 6, 8],
    8: [0, 1, 2, 4, 5, 6, 7, 8],
  };
  const DENOMINATIONS = [
    [100, "#694d81"], [50, "#b84043"], [20, "#428568"],
    [10, "#397baa"], [5, "#c48732"], [1, "#77746d"],
  ];
  const CHIP_SCALE = 1.23;
  const PILE_POSITIONS = [
    [0, 0, 1.7], [-26, -6, 1.1], [25, -9, 1.08], [-14, 16, .75], [15, 14, .81],
    [5, -24, .94], [-39, 10, .61], [39, 8, .65], [-25, -22, .59], [29, -22, .63],
  ];
  const currency = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 12 });
  const canvas = $("mechanicalChips");
  const context = canvas.getContext("2d");
  const payoutCanvas = $("mechanicalPayout");
  const payoutContext = payoutCanvas.getContext("2d");
  const moving = $("mechanicalMovingCards");
  const feedLayer = $("mechanicalBayCards");
  const recycleLayer = $("mechanicalRecycledCards");
  const labelLayer = $("mechanicalChipLabels");
  const result = $("mechanicalResult");
  const table = $("table");
  const container = $("table-container");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const handReels = $("mechanicalHandReels");
  const phaseLabel = $("mechanicalPhaseLabel");
  const [upperFlap, lowerFlap, foldingFlap, fallingFlap] = phaseLabel.children;
  const blindValue = $("mechanicalBlindValue");
  const phaseNames = {
    idle: "等待开局", preflop: "翻牌前", flop: "翻牌圈", turn: "转牌圈",
    river: "河牌圈", showdown: "摊牌", show_choice: "亮牌选择",
  };
  let instrumentRoom, instrumentHand, instrumentPhase, phaseAnimations = [];
  const wagers = new Map();
  const labels = new Map();
  let sweep, frame, state, handToDeal, finalizedHand, bounds, center, payout, pendingResult;
  let groups = new Map();
  let chipsDirty = true;
  const rig = createMechanicalArmRig($("mechanicalArm"), $("mechanicalArmShadow"), $("mechanicalBase"));
  const arm = createMechanicalArmActions({
    rig,
    layer: moving,
    feedLayer,
    recycleLayer,
    presets: MechanicalArmPresets.active,
    bay: () => ({ x: bounds.width / 2 - 30, y: 43, angle: 0, lift: 4 }),
    home: () => ({ park: true }),
  });

  function enabled() {
    return container.classList.contains("mechanical-table");
  }

  function animatesArm() {
    return enabled() && !reduced.matches;
  }

  function reset() {
    cancelAnimationFrame(frame);
    pendingResult = null;
    finishPayout(true);
    frame = sweep = state = handToDeal = finalizedHand = bounds = null;
    arm.reset();
    wagers.clear();
    labels.clear();
    groups.clear();
    labelLayer.replaceChildren();
    moving.replaceChildren();
    feedLayer.replaceChildren();
    recycleLayer.replaceChildren();
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
      rig.resize(rect.width, rect.height);
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
    if (!state || state.handNum !== next.handNum || !animatesArm() || !measure()) return;
    preparePayout(next);
    for (const player of next.players) {
      const previousIndex = state.players.findIndex(previous => previous.id === player.id);
      if (!player.folded || state.players[previousIndex]?.folded !== false) continue;
      const originals = [...table.querySelectorAll(".seat-" + previousIndex +
        " :is(.my-hand,.seat-cards) .card:not(.mechanical-pending)")];
      if (!originals.length) continue;
      queueFold(originals);
    }
  }

  function queueFold(cards) {
    const rects = cards.map(card => card.getBoundingClientRect());
    const first = point(rects[0]);
    const fromAbove = first.y > bounds.height * .64;
    const fromRight = !fromAbove && first.x < bounds.width / 2;
    const anchor = fromRight ? rects.at(-1) : rects[0];
    const at = point(anchor);
    const bite = (fromAbove ? anchor.height : anchor.width) / 2 + 17;
    const angle = fromAbove ? 90 : fromRight ? 180 : 0;
    const radians = angle * Math.PI / 180;
    const cos = Math.cos(radians), sin = Math.sin(radians);
    const hand = document.createElement("div");
    hand.className = "mechanical-carry mechanical-fold-hand";
    hand.style.rotate = angle + "deg";
    cards.forEach((card, index) => {
      const rect = rects[index];
      const node = card.cloneNode(true);
      const position = point(rect);
      node.classList.remove("seat-card-deal", "card-flip-in");
      node.classList.add("mechanical-carry");
      node.style.width = rect.width + "px";
      const dx = position.x - at.x, dy = position.y - at.y;
      node.style.left = (dx * cos + dy * sin) + "px";
      node.style.top = (dy * cos - dx * sin) + "px";
      node.style.rotate = -angle + "deg";
      hand.append(node);
    });
    placeEffect(hand, at);
    let spark;
    const cleanup = () => {
      hand.remove();
      spark?.remove();
    };
    arm.enqueue("fold", {
      source: { x: at.x - cos * bite, y: at.y - sin * bite, angle, lift: 2 },
      target: () => ({ x: bounds.width / 2 - 30 - bite, y: 73, angle: 0 }),
      payload: hand,
      payloadOffset: { x: bite, y: 0 },
      onRelease({ pose }) {
        spark = document.createElement("i");
        spark.className = "mechanical-spark";
        placeEffect(spark, pose);
        spark.animate([
          { opacity: 0, scale: .25 }, { opacity: .65, scale: .55, offset: .25 }, { opacity: 0, scale: .83 },
        ], { duration: 185, fill: "forwards" });
      },
      onLand: cleanup,
      onCancel: cleanup,
    });
  }

  function placeEffect(node, { x, y }) {
    node.style.left = x + "px";
    node.style.top = y + "px";
    moving.append(node);
  }

  function queueCards(action, cards) {
    if (!animatesArm()) return;
    arm.enqueue(action, cards.map(card => {
      card.classList.add("mechanical-pending");
      return {
        target: () => point(card.getBoundingClientRect()),
        valid: () => card.isConnected,
        payload() {
          const back = cardBack();
          back.style.width = card.getBoundingClientRect().width + "px";
          return back;
        },
        payloadOffset: card => ({ x: 12 + parseFloat(card.style.width) * .43, y: 0 }),
        onRelease: () => SFX.deal(),
        onLand() {
          card.classList.remove("mechanical-pending");
          if (action === "reveal") {
            card.classList.add("card-flip-in");
            SFX.flip();
          }
        },
        onCancel: () => card.classList.remove("mechanical-pending"),
      };
    }));
  }

  function flipPhase(label, animate) {
    phaseAnimations.forEach(animation => animation.cancel());
    phaseAnimations = [];
    const previous = phaseLabel.getAttribute("aria-label");
    phaseLabel.setAttribute("aria-label", label);
    upperFlap.firstElementChild.textContent = label;
    lowerFlap.firstElementChild.textContent = animate ? previous : label;
    if (!animate) return;

    const half = 110;
    foldingFlap.firstElementChild.textContent = previous;
    fallingFlap.firstElementChild.textContent = label;
    const fold = foldingFlap.animate([
      { transform: "scaleY(1)", filter: "brightness(1)" },
      { transform: "scaleY(0)", filter: "brightness(.72)" },
    ], { duration: half, fill: "backwards", easing: "cubic-bezier(.48,.05,.82,.42)" });
    const fall = fallingFlap.animate([
      { transform: "scaleY(0)", filter: "brightness(.78)" },
      { transform: "scaleY(1)", filter: "brightness(1)", offset: .84 },
      { transform: "scaleY(.965)", filter: "brightness(.98)", offset: .92 },
      { transform: "scaleY(1)", filter: "brightness(1)" },
    ], { duration: half, delay: half, fill: "both", easing: "cubic-bezier(.22,.54,.54,1)" });
    phaseAnimations = [fold, fall];
    fall.onfinish = () => {
      if (phaseAnimations[1] !== fall) return;
      lowerFlap.firstElementChild.textContent = label;
      fall.cancel();
      phaseAnimations = [];
    };
  }

  function renderInstruments({ handNum, phase, sb, bb }) {
    const newSession = instrumentRoom !== roomCode || instrumentHand == null || handNum < instrumentHand;
    if (newSession) {
      const initial = handToDeal === handNum ? Math.max(0, handNum - 1) : handNum;
      MechanicalReels.set(handReels, initial, { instant: true, fixedDigits: 3, label: "局数" });
    }
    if (newSession || handNum !== instrumentHand) MechanicalReels.set(handReels, handNum);
    instrumentRoom = roomCode;
    instrumentHand = handNum;

    if (newSession || instrumentPhase !== phase) {
      flipPhase(phaseNames[phase] || phase, !newSession && !reduced.matches);
      instrumentPhase = phase;
    }

    const blinds = sb && bb ? `${sb} / ${bb}` : "—";
    if (blindValue.textContent !== blinds) {
      blindValue.textContent = blinds;
      blindValue.toggleAttribute("data-compact", blinds.length > 8);
    }
  }

  function render(next) {
    const last = state;
    state = next;
    if (!measure()) return;
    renderInstruments(next);
    const sameHand = last?.handNum === next.handNum;
    if (handToDeal === next.handNum) {
      const hands = next.players.map((player, index) => player.folded ? [] :
        [...table.querySelectorAll(".seat-" + index + " :is(.my-hand,.seat-cards) .card")]);
      const cards = [0, 1].flatMap(round => hands.map(hand => hand[round]).filter(Boolean));
      queueCards("deal", cards);
      handToDeal = null;
    }
    if (sameHand && next.community.length > last.community.length) {
      const slots = [...$("community").children];
      queueCards("reveal", slots.slice(last.community.length, next.community.length));
    }
    const oldGroups = groups;
    groups = readGroups(next);
    if (sameHand && !reduced.matches) scheduleChips(oldGroups, groups);
    if (payout && !payout.start) payout.start = Math.max(performance.now() + 280, sweep ? sweep.start + 700 : 0);
    syncLabels();
    nextFrame();
  }

  function preparePayout(next) {
    if (payout || finalizedHand === next.handNum || !next.pot ||
        !["showdown", "show_choice"].includes(next.phase) || ["showdown", "show_choice"].includes(state.phase)) return;
    const accounts = new Map();
    for (const transfer of [...(next.winners || []), ...(next.refunds || [])]) {
      const player = next.players.find(player => player.id === transfer.id);
      if (!player || !(transfer.amount > 0)) continue;
      let account = accounts.get(player.id);
      if (!account) {
        account = { amount: 0, counts: Array(DENOMINATIONS.length).fill(0), final: player.stack,
          winner: next.winners?.some(winner => winner.id === player.id) };
        accounts.set(player.id, account);
      }
      account.amount += transfer.amount;
      const counts = transfer.chips || paymentCounts([transfer.amount]);
      counts.forEach((count, index) => { account.counts[index] += count; });
    }
    if (!accounts.size) return;
    for (const [id, account] of accounts) {
      account.shown = state.players.find(player => player.id === id)?.stack ?? account.final - account.amount;
      account.balanceBeforePayout = account.shown;
      account.credited = 0;
    }
    payout = { handNum: next.handNum, accounts };
  }

  function updateStack(element, player, snapshot) {
    const account = payout?.accounts.get(player.id);
    if (account) {
      account.element = element;
      account.final = player.stack;
      MechanicalReels.set(element, account.shown);
      return;
    }
    const initial = handToDeal === snapshot.handNum && snapshot.phase === "preflop"
      ? player.stack + player.bet : player.stack;
    MechanicalReels.set(element, player.stack, { initial });
  }

  function startPayout(now) {
    payout.source = groups.get("pot")?.inventory.chips || [];
    payout.timeline = createMechanicalPayout([...payout.accounts.values()], payout.source, now,
      DENOMINATIONS.map(([value]) => value));
    payout.startedAt = now;
    payoutCanvas.dataset.chips = payout.timeline.count;
    finalizedHand = payout.handNum;
    sweep = null;
    wagers.clear();
    groups.clear();
    syncLabels();
  }

  function absorbChip(account, value) {
    account.credited += value;
    account.shown = account.credited + 1e-9 >= account.amount ? account.final
      : account.balanceBeforePayout + account.credited;
    const element = account.element;
    if (!element?.isConnected) return;
    if (!account.hit && account.winner) {
      account.hit = true;
      element.closest(".seat-info").animate([
        { transform: "scale(1)", filter: "drop-shadow(0 0 0 #e5a64100)" },
        { transform: "scale(1.05)", filter: "drop-shadow(0 0 11px #e5a641ba)", offset: .35 },
        { transform: "scale(.995)", filter: "drop-shadow(0 0 3px #e5a64155)", offset: .75 },
        { transform: "scale(1)", filter: "drop-shadow(0 0 0 #e5a64100)" },
      ], { duration: 330, easing: "cubic-bezier(.22,.75,.36,1)" });
    }
    MechanicalReels.set(element, account.shown, { impact: true });
  }

  function drawPayout(now) {
    if (!payout.timeline) {
      if (now < payout.start) return;
      startPayout(now);
    }
    const rect = payoutCanvas.getBoundingClientRect();
    const ratio = Math.min(2, devicePixelRatio || 1);
    const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio);
    if (payoutCanvas.width !== width || payoutCanvas.height !== height) {
      payoutCanvas.width = width;
      payoutCanvas.height = height;
      payoutContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    payoutContext.clearRect(0, 0, rect.width, rect.height);
    const origin = { x: bounds.left - rect.left + center.x, y: bounds.top - rect.top + center.y };
    const fade = Math.max(0, 1 - (now - payout.startedAt) / 160);
    if (fade) {
      for (const chip of payout.source) drawChip({ x: origin.x + chip.x, y: origin.y + chip.y }, chip, payoutContext, fade);
    }
    const active = payout.timeline.draw(now, {
      origin,
      targetAt(account) {
        const target = account.element?.closest(".seat-info")?.querySelector(".seat-medallion")?.getBoundingClientRect();
        return target && { x: target.x - rect.left + target.width / 2, y: target.y - rect.top + target.height / 2 };
      },
      drawChip: (point, value, angle, opacity) => drawChip(point, { value, angle }, payoutContext, opacity),
      arrive: absorbChip,
    });
    if (!active) finishPayout();
  }

  function finishPayout(instant = false) {
    if (!payout) return;
    for (const { element, final } of payout.accounts.values()) {
      if (element?.isConnected) MechanicalReels.set(element, final, { impact: true, instant });
    }
    payout = null;
    payoutContext.clearRect(0, 0, payoutCanvas.width, payoutCanvas.height);
    delete payoutCanvas.dataset.chips;
    if (pendingResult) {
      const { snapshot, settlement } = pendingResult;
      pendingResult = null;
      showResult(snapshot, settlement);
    }
  }

  function readGroups(snapshot) {
    const next = new Map();
    if (snapshot.handNum === finalizedHand) return next;
    const betting = ["preflop", "flop", "turn", "river"].includes(snapshot.phase);
    const potPayments = [];
    const potCounts = snapshot.potChips?.slice();
    let live = 0;
    snapshot.players.forEach((player, index) => {
      const payments = player.chipPayments ?? [player.totalBet - player.bet, player.bet];
      const streetStart = betting ? (player.streetPaymentStart ?? 1) : payments.length;
      if (!potCounts) for (let i = 0; i < streetStart; i++) potPayments.push(payments[i]);
      if (!betting || !player.bet) return;
      live += player.bet;
      const counts = player.betChips ?? paymentCounts(payments.slice(streetStart));
      if (potCounts) counts.forEach((count, index) => { potCounts[index] -= count; });
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
        ? { x: origin.x - 145, y: origin.y - 78 }
        : { x: x - dy / distance * 45 * side, y: y + dx / distance * 45 * side };
      next.set(player.id, { id: player.id, at, origin, amount: player.bet, name: player.name, counts });
    });
    const collected = Math.max(0, snapshot.pot - live);
    if (collected) next.set("pot", { id: "pot", at: center, amount: collected, name: "已收底池",
      counts: potCounts ?? paymentCounts(potPayments) });
    for (const group of next.values()) group.inventory = chipInventory(group.counts, group.amount);
    return next;
  }

  function syncLabels() {
    chipsDirty = true;
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
      label.style.top = group.at.y + (group.inventory.piles.length > 3 ? 28 : 19) + "px";
      if (label.dataset.amount === String(group.amount) && label.title === group.inventory.description) continue;
      label.dataset.amount = group.amount;
      const amount = currency.format(group.amount);
      label.textContent = amount;
      label.title = group.inventory.description;
      label.setAttribute("aria-label", group.name + " " + amount + "（" + label.title + "）");
    }
  }

  function paymentCounts(payments) {
    const counts = DENOMINATIONS.map(() => 0);
    for (let payment of payments) {
      for (const [index, [value]] of DENOMINATIONS.entries()) {
        const count = Math.floor(payment / value);
        counts[index] += count;
        payment -= count * value;
      }
    }
    return counts;
  }

  function chipInventory(counts, amount) {
    // Custom fractional wagers can pool into a whole unit before a street is collected.
    const represented = counts.reduce((total, count, index) => total + count * DENOMINATIONS[index][0], 0);
    if (represented - amount > 1e-8) {
      counts = counts.slice();
      counts[counts.length - 1] -= Math.ceil(represented - amount - 1e-8);
    }
    const description = [];
    const runs = [];
    let visibleBudget = 108;
    const visibleCounts = counts.map((count, index) => ({ count, index })).filter(entry => entry.count > 0)
      .sort((a, b) => a.count - b.count);
    const caps = counts.map(() => 0);
    visibleCounts.forEach(({ count, index }, position) => {
      caps[index] = Math.min(count, Math.floor(visibleBudget / (visibleCounts.length - position)));
      visibleBudget -= caps[index];
    });
    let displayedValue = 0;
    for (const [index, [value]] of DENOMINATIONS.entries()) {
      const count = counts[index];
      if (!count) continue;
      displayedValue += value * count;
      description.push(value + " × " + currency.format(count));
      runs.push({ value, count: caps[index] });
    }
    if (amount - displayedValue > 1e-8) description.push("余 " + currency.format(amount - displayedValue));
    return { ...layoutPiles(runs), description: description.join(" · ") };
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
      const x = row ? (index - (count - 1) / 2) * 32 : baseX * 1.14;
      const y = row ? (index % 2) * 3 : baseY;
      const lean = Math.sin(index * 2.7 + .9) * .48;
      const chips = Array.from({ length: height }, (_, level) => ({
        value: values[chipIndex++],
        x: x + level * lean + Math.sin(level * 1.8 + index) * 1.1,
        y: y - level * 5.0 + Math.sin(level * 2.1 + index) * .65,
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
    sprite.width = 96;
    sprite.height = 72;
    const paint = sprite.getContext("2d");
    paint.scale(3, 3);
    paint.translate(16, 10);
    paint.beginPath();
    paint.moveTo(-13, 0);
    paint.lineTo(13, 0);
    paint.lineTo(13, 4.4);
    paint.ellipse(0, 4.4, 13, 7.4, 0, 0, Math.PI);
    paint.closePath();
    const side = paint.createLinearGradient(-13, 0, 13, 0);
    side.addColorStop(0, "#2b2525");
    side.addColorStop(.43, color);
    side.addColorStop(1, "#352b27");
    paint.fillStyle = side;
    paint.fill();
    paint.fillStyle = "#f4dfbb";
    for (const x of [-10, -4, 4, 10]) {
      const y = Math.sqrt(1 - (x / 13) ** 2) * 7.4;
      paint.fillRect(x - 1.15, y - .5, 2.3, 4.2);
    }
    const seam = paint.createLinearGradient(0, 3, 0, 12);
    seam.addColorStop(0, "#2a201700");
    seam.addColorStop(1, "#22180f9c");
    paint.beginPath();
    paint.ellipse(0, 3.7, 12.7, 7.7, 0, 0, Math.PI);
    paint.fillStyle = seam;
    paint.fill();

    paint.beginPath();
    paint.ellipse(0, 0, 13, 7.4, 0, 0, Math.PI * 2);
    paint.fillStyle = color;
    paint.fill();
    paint.strokeStyle = "#fff0d6";
    paint.lineWidth = 2.75;
    paint.setLineDash([4.3, 3.6]);
    paint.beginPath();
    paint.ellipse(0, 0, 11.2, 5.8, 0, 0, Math.PI * 2);
    paint.stroke();
    paint.setLineDash([]);
    paint.beginPath();
    paint.ellipse(0, 0, 8.0, 4.5, 0, 0, Math.PI * 2);
    paint.fillStyle = "#fff1d6";
    paint.fill();
    paint.fillStyle = "#342b29";
    paint.font = "900 8.25px monospace";
    paint.textAlign = "center";
    paint.textBaseline = "middle";
    paint.fillText(value, 0, .4);
    return sprite;
  }

  const chipSprites = new Map(DENOMINATIONS.map(([value, color]) => [value, makeChip(value, color)]));

  function drawChip({ x, y }, { value, angle }, target = context, opacity = 1) {
    target.save();
    target.globalAlpha = opacity;
    target.translate(x, y);
    target.rotate(angle);
    target.drawImage(chipSprites.get(value), -16 * CHIP_SCALE, -10 * CHIP_SCALE, 32 * CHIP_SCALE, 24 * CHIP_SCALE);
    target.restore();
  }

  function drawPileShadows(group, opacity) {
    if (!opacity) return;
    context.save();
    context.globalAlpha = opacity;
    for (const pile of group.inventory.piles) {
      const { x, y } = chipPoint(group, pile);
      const radius = 20 + Math.min(8, pile.chips.length * .45);
      context.save();
      context.translate(x + 4, y + 9);
      context.scale(1, .57);
      const falloff = context.createRadialGradient(0, 0, 3, 0, 0, radius);
      falloff.addColorStop(0, "#3e2b1e76");
      falloff.addColorStop(.48, "#3e2b1e3c");
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

  function draw(now) {
    frame = null;
    if (payout) drawPayout(now);
    if (chipsDirty || sweep || wagers.size) {
      drawChips(now);
      chipsDirty = false;
    }
    if (arm.tick(now) || sweep || wagers.size || payout) nextFrame();
  }

  function showResult(snapshot, settlement = {}) {
    if (!snapshot || !container.classList.contains("active")) return;
    if (payout?.handNum === snapshot.handNum) {
      pendingResult = { snapshot, settlement };
      return;
    }
    const { winners = [], refunds = [], showedPlayerId } = settlement;
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

  reduced.addEventListener("change", () => {
    if (!enabled()) return;
    arm.reset();
    if (reduced.matches) {
      flipPhase(phaseLabel.getAttribute("aria-label"), false);
      finishPayout(true);
    }
    nextFrame();
  });

  return { enabled, animatesArm, setStyle, reset, startHand, positionSeat, cardBack, beforeRender, updateStack, render, showResult };
})();
