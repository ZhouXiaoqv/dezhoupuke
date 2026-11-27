// The mechanical table consumes the same filtered game snapshots as the classic table.
const MechanicalTable = (() => {
  const STATIONS = ["bottom", "bottom", "left", "left", "top", "top", "right", "right", "bottom"];
  const STATION_IDS = STATIONS.map((_, slot) => slot);
  const SLOTS = {
    1: [0], 2: [0, 5], 3: [0, 4, 5], 4: [0, 2, 5, 7], 5: [0, 2, 4, 5, 7],
    6: [0, 1, 2, 4, 5, 7], 7: [0, 1, 2, 4, 5, 7, 8],
    8: [0, 1, 2, 4, 5, 6, 7, 8], 9: STATION_IDS,
  };
  const SEAT_ROLES = [
    ["dealerIdx", "D", "庄家"], ["sbIdx", "SB", "小盲"], ["bbIdx", "BB", "大盲"],
  ];
  const DENOMINATIONS = [
    [100, "#694d81"], [50, "#b84043"], [20, "#428568"],
    [10, "#397baa"], [5, "#c48732"], [1, "#77746d"],
  ];
  const CHIP_SCALE = 1.23;
  const WAGER_SCATTER_MS = 145;
  const WAGER_FLIGHT_MS = 390;
  const POT_SWEEP_MS = 700;
  const PILE_POSITIONS = [
    [0, 0, 1.7], [-26, -6, 1.1], [25, -9, 1.08], [-14, 16, .75], [15, 14, .81],
    [5, -24, .94], [-39, 10, .61], [39, 8, .65], [-25, -22, .59], [29, -22, .63],
  ];
  const currency = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 12 });
  const signedCurrency = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 12, signDisplay: "exceptZero" });
  const canvas = $("mechanicalChips");
  const context = canvas.getContext("2d");
  const payoutCanvas = $("mechanicalPayout");
  const payoutContext = payoutCanvas.getContext("2d");
  const moving = $("mechanicalMovingCards");
  const feedLayer = $("mechanicalBayCards");
  const recycleLayer = $("mechanicalRecycledCards");
  const printLayer = $("mechanicalPrintFeed");
  const community = $("community");
  const communityStation = $("communityStation");
  const potMeter = $("mechanicalPotMeter");
  const potReels = $("mechanicalPotReels");
  const labelLayer = $("mechanicalChipLabels");
  const result = $("mechanicalResult");
  const receiptTemplate = $("mechanicalReceiptTemplate");
  const table = $("table");
  const baySeam = table.querySelector(".mechanical-bay-seam");
  const recyclerSeam = table.querySelector(".mechanical-recycle-seam");
  const printerOpening = table.querySelector(".mechanical-printer-opening");
  const container = $("table-container");
  const stage = $("gameStage");
  const desk = $("actionPanel");
  const autoCall = $("autoCallControl");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const handReels = $("mechanicalHandReels");
  const phaseLabel = $("mechanicalPhaseLabel");
  const flipPhase = createSplitFlap(phaseLabel);
  const strength = $("mechanicalStrength");
  const strengthLamps = [...strength.querySelectorAll(".mechanical-strength-glass > i")];
  const strengthWindows = strength.querySelector(".mechanical-strength-windows");
  const strengthFlaps = Array.from({ length: 3 }, () => {
    const cell = phaseLabel.cloneNode(true);
    cell.removeAttribute("id");
    cell.removeAttribute("role");
    const print = document.createElement("span");
    print.className = "mechanical-strength-letter";
    cell.append(print);
    strengthWindows.append(cell);
    const flip = createSplitFlap(cell);
    flip("", false);
    return flip;
  });
  const blindValue = $("mechanicalBlindValue");
  const phaseNames = {
    idle: "等待开局", preflop: "翻牌前", flop: "翻牌圈", turn: "转牌圈",
    river: "河牌圈", showdown: "摊牌", show_choice: "亮牌选择",
  };
  let instrumentRoom, instrumentHand, instrumentPhase;
  let strengthRank = -1, strengthLevel = 0, strengthTimer;
  const wagers = new Map();
  const labels = new Map();
  const payouts = new Map();
  const seats = new Map();
  const wagerZones = new Map();
  let sweep, frame, state, handToDeal, finalizedHand, bounds, center, latestReceipt;
  let receiptCountdown;
  let cardBatch;
  let turnClock, submittedDeadline;
  let stageScale = 1;
  let potArea;
  let groups = new Map();
  let chipsDirty = true;
  const deliveries = new Map();
  const { jawReach } = MechanicalArmMotion;
  let bayPort, recyclerPort, printerPort;
  const recycleMouth = () => recyclerPort;
  const base = $("mechanicalBase");
  const notice = createMechanicalNotice($("mechanicalNoticeLift"), $("mechanicalNoticeText"));
  const rig = createMechanicalArmRig($("mechanicalArm"), $("mechanicalArmShadow"), base);
  const printOutlet = {
    pose: () => ({ ...printerPort, angle: -90, lift: 4 }),
    layer: printLayer,
    setFeeding(active) { base.toggleAttribute("data-printing", active); },
  };
  const arm = createMechanicalArmActions({
    rig,
    layer: moving,
    feedLayer,
    recycleLayer,
    presets: MechanicalArmPresets.active,
    bay: () => ({ ...bayPort, angle: -90, lift: 4 }),
    recycleMouth,
    home: () => ({ park: true }),
  });

  function enabled() {
    return container.classList.contains("mechanical-table");
  }

  function animatesArm() {
    return enabled() && !reduced.matches;
  }

  function clearHandEffects() {
    retireCardBatch();
    clearTurnClock();
    submittedDeadline = undefined;
    clearHandStrength();
    sweep = state = handToDeal = finalizedHand = null;
    deliveries.clear();
    wagers.clear();
    labels.clear();
    groups.clear();
    labelLayer.replaceChildren();
    context.clearRect(0, 0, canvas.width, canvas.height);
    MechanicalReels.set(potReels, 0, { instant: true, minDigits: 5, label: "底池" });
    potMeter.removeAttribute("title");
    chipsDirty = true;
    clearReceipt();
  }

  function reset() {
    cancelAnimationFrame(frame);
    notice.reset();
    clearPayouts();
    frame = bounds = null;
    latestReceipt = null;
    cardBatch = null;
    arm.reset();
    clearHandEffects();
    moving.replaceChildren();
    feedLayer.replaceChildren();
    recycleLayer.replaceChildren();
    printLayer.replaceChildren();
    table.querySelectorAll(".mechanical-pending").forEach(card => card.classList.remove("mechanical-pending"));
    if (enabled()) bindSeats([]);
  }

  function setStyle(style) {
    const active = style === "mechanical";
    if (active !== enabled()) {
      TableDrawers.reset();
      reset();
      container.classList.toggle("mechanical-table", active);
      if (container.classList.contains("active")) hideActions();
      table.querySelectorAll(".seat").forEach(seat => seat.remove());
      community.replaceChildren();
      delete table.dataset.mechanicalViewer;
      container.querySelector(":scope > .my-hand")?.remove();
      $("tableOutfitBtn").hidden = active || !container.classList.contains("active") || !isRegistered || isSpectator;
      if (active) {
        fitStage();
        bindSeats([]);
        $("interactPanel").classList.remove("active");
        $("settlementOverlay").classList.remove("active");
        window.Pets3D?.clear();
      }
    }
    return active;
  }

  function startHand(handNum) {
    if (!enabled()) return;
    clearHandEffects();
    handToDeal = handNum;
  }

  function seatPlan(ordered) {
    const preferred = SLOTS[ordered.length] ?? [];
    if (ordered.length < 2) return preferred;
    const previous = new Map([...seats].map(([slot, seat]) => [seat.dataset.playerId, slot]));
    const held = ordered.map(({ player }) => previous.get(player.id));
    if (held.every(slot => slot === undefined)) return preferred;
    if (held[0] === 0 && held.every((slot, index) => !index || slot > held[index - 1])) return held;

    // The local seat is fixed at zero. Fill the other slots in turn order while
    // keeping as many returning players as possible in their current stations.
    const available = STATION_IDS.slice(1);
    let best = preferred, lowestCost = Infinity;
    for (let mask = 0; mask < (1 << available.length); mask++) {
      const candidate = [0, ...available.filter((_, i) => mask & (1 << i))];
      if (candidate.length !== ordered.length) continue;
      const cost = candidate.reduce((sum, slot, i) => sum + Math.abs(slot - preferred[i]) +
        (held[i] !== undefined && slot !== held[i] ? 100 : 0), 0);
      if (cost < lowestCost) {
        lowestCost = cost;
        best = candidate;
      }
    }
    return best;
  }

  function bindSeats(players, viewerIndex = 0) {
    const indexed = players.map((player, index) => ({ player, index }));
    const ordered = [...indexed.slice(viewerIndex), ...indexed.slice(0, viewerIndex)];
    const slots = seatPlan(ordered);
    const occupants = new Map(ordered.map((occupant, index) => [slots[index], occupant]));
    const occupied = [];
    for (const slot of STATION_IDS) {
      let seat = seats.get(slot);
      if (!seat) {
        seat = document.createElement("div");
        seat.className = `seat seat-pos-${slot}`;
        seat.dataset.mechanicalSlot = slot;
        seat.dataset.mechanicalEdge = STATIONS[slot];
        seat.append(createSeatInfo());
        seats.set(slot, seat);
      }
      if (!seat.isConnected) table.append(seat);
      const occupant = occupants.get(slot);
      const id = occupant?.player.id;
      const changed = seat.dataset.playerId !== id;
      if (changed) {
        seat.querySelector(":is(.my-hand,.seat-cards)")?.remove();
        seat.querySelector(".seat-bet")?.remove();
        seat.className = `seat seat-pos-${slot}`;
      }
      const previousIndex = seat.dataset.playerIndex;
      const indexChanged = previousIndex !== String(occupant?.index);
      if (!changed && indexChanged && previousIndex !== undefined) seat.classList.remove(`seat-${previousIndex}`);
      if (occupant) {
        seat.dataset.playerId = id;
        seat.dataset.playerIndex = occupant.index;
        if (changed || indexChanged) seat.classList.add(`seat-${occupant.index}`);
        occupied[occupant.index] = { seat, changed };
      } else if (changed) {
        delete seat.dataset.playerId;
        delete seat.dataset.playerIndex;
        const medallion = seat.querySelector(".seat-medallion");
        renderAvatar(medallion, "");
        medallion.style.borderColor = "";
        const name = seat.querySelector(".seat-player-name");
        name.textContent = name.title = "";
        MechanicalReels.set(seat.querySelector(".seat-stack"), 0, { instant: true });
        updateSeatMarkers(seat, -1, {});
      }
    }
    return occupied;
  }

  function createSeatInfo() {
    const info = document.createElement("div");
    info.className = "seat-info";
    // Start halfway along the top edge and follow the avatar's inward bevel clockwise.
    const clockOutline = "M22.5 1.5 H36 A7.5 7.5 0 0 1 43.5 9 V36 A7.5 7.5 0 0 1 36 43.5 " +
      "H9 A7.5 7.5 0 0 1 1.5 36 V9 A7.5 7.5 0 0 1 9 1.5 Z";
    info.innerHTML = `
      <span class="mechanical-seat-tongue" aria-hidden="true"></span>
      <div class="mechanical-seat-body">
        <div class="mechanical-seat-avatar">
          <span class="seat-medallion" aria-hidden="true"></span>
          <svg class="mechanical-seat-clock" viewBox="0 0 45 45" aria-hidden="true">
            <path class="mechanical-clock-track" d="${clockOutline}"/>
            <path class="mechanical-clock-needle" d="${clockOutline}" pathLength="100"/>
          </svg>
        </div>
        <div class="mechanical-seat-plate">
          <span class="mechanical-seat-fasteners" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span class="mechanical-seat-lamp" aria-hidden="true"></span>
          <span class="mechanical-seat-roles">${SEAT_ROLES.map(([key, symbol, label]) =>
            `<span class="mechanical-seat-role" data-seat-role="${key}" role="img" aria-label="${label}熄灭" title="${label}">${symbol}</span>`
          ).join("")}</span>
          <div class="seat-name"><span class="seat-player-name"></span></div>
          <div class="seat-stack"></div>
        </div>
      </div>`;
    MechanicalReels.set(info.querySelector(".seat-stack"), 0, { minDigits: 5, instant: true });
    return info;
  }

  function updateSeatMarkers(info, index, snapshot) {
    for (const role of info.querySelectorAll("[data-seat-role]")) {
      const lit = snapshot[role.dataset.seatRole] === index;
      if (role.hasAttribute("data-lit") === lit) continue;
      role.toggleAttribute("data-lit", lit);
      role.setAttribute("aria-label", role.title + (lit ? "点亮" : "熄灭"));
    }
  }

  function clearTurnClock() {
    if (!turnClock) return;
    const { seat, dial } = turnClock;
    delete seat.dataset.turnClock;
    delete seat.dataset.turnWarning;
    dial.style.removeProperty("--clock-offset");
    seat.querySelector(".mechanical-seat-lamp").removeAttribute("title");
    turnClock = null;
  }

  function syncTurn(turn) {
    const seat = [...seats.values()].find(node => node.dataset.playerId === turn?.playerId && node.dataset.playerId);
    if (!turn || !seat || turn.remainingMs <= 0) {
      clearTurnClock();
      return;
    }
    const end = performance.now() + turn.remainingMs;
    if (turnClock?.deadline === turn.deadline && turnClock.seat === seat) {
      turnClock.end = Math.min(turnClock.end, end);
      return;
    }
    clearTurnClock();
    turnClock = { ...turn, seat, end, dial: seat.querySelector(".mechanical-seat-clock") };
    seat.dataset.turnClock = "";
    drawTurnClock(performance.now());
    nextFrame();
  }

  function canAct(turn) {
    // The standalone layout preview has no server clock.
    return turn === undefined || (!!turnClock && turnClock.deadline === turn?.deadline &&
      turnClock.deadline !== submittedDeadline && turnClock.playerId === Net.playerId && performance.now() < turnClock.end);
  }

  function submitTurn(deadline) {
    submittedDeadline = deadline;
  }

  function acceptTurnPrompt(deadline) {
    if (turnClock?.deadline === deadline && submittedDeadline === deadline) submittedDeadline = undefined;
  }

  function drawTurnClock(now) {
    if (!turnClock) return;
    const { seat, dial, end, durationMs, playerId, deadline } = turnClock;
    const remaining = Math.max(0, end - now);
    if (!remaining) {
      clearTurnClock();
      if (playerId === Net.playerId && !isSpectator) {
        submittedDeadline = deadline;
        hideActions();
      }
      return;
    }
    const elapsed = 1 - Math.min(1, remaining / durationMs);
    dial.style.setProperty("--clock-offset", (-100 * elapsed).toFixed(2));
    const second = Math.ceil(remaining / 1000);
    if (second === turnClock.second) return;
    turnClock.second = second;
    seat.toggleAttribute("data-turn-warning", second <= 5);
    seat.querySelector(".mechanical-seat-lamp").title = `剩余 ${second} 秒`;
    if (second <= 5 && playerId === Net.playerId && deadline !== submittedDeadline && !isSpectator && !document.hidden) SFX.ratchet();
  }

  function cardBack(slot = false) {
    const el = document.createElement("div");
    el.className = "card " + (slot ? "mechanical-card-slot" : "card-back mechanical-card-back");
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  function communitySlot(index) {
    if (community.children[index]) return community.children[index];
    const slot = document.createElement("div");
    slot.className = "mechanical-board-slot";
    community.append(slot);
    return slot;
  }

  function point(rect) {
    return { x: rect.left - bounds.left + rect.width / 2, y: rect.top - bounds.top + rect.height / 2 };
  }

  function fitStage() {
    const width = stage.offsetWidth, height = stage.offsetHeight;
    if (!width || !height) return;
    const host = container.getBoundingClientRect();
    const style = getComputedStyle(container);
    const left = parseFloat(style.paddingLeft), right = parseFloat(style.paddingRight);
    const top = parseFloat(style.paddingTop);
    let bottom = parseFloat(style.paddingBottom);
    const usableWidth = host.width - left - right;
    const x = host.left + left + usableWidth / 2;
    let scale = Math.min(1, usableWidth / width, (host.height - top - bottom) / height);

    // Dock the desk on the cruise box's baseline. On narrow windows, clear the
    // independent box with the whole stage if their footprints would overlap.
    const control = autoCall.getBoundingClientRect();
    const footprints = [stageBox(table), stageBox(desk), stageBox(strength)];
    for (const slot of [1, 2, 3]) {
      const plate = seats.get(slot)?.querySelector(".seat-info");
      if (plate) footprints.push(stageBox(plate));
    }
    const overlapsControl = footprints.some(box =>
      x + (box.left - width / 2) * scale < control.right + 8 &&
      host.bottom - bottom - (height - box.bottom) * scale > control.top - 8);
    if (overlapsControl) {
      bottom = host.bottom - control.top + 8;
      scale = Math.min(scale, (host.height - top - bottom) / height);
    }
    // Keep the coordinate transform invertible if the viewport collapses completely.
    stageScale = Math.max(.001, scale);
    stage.style.setProperty("--stage-bottom", `${bottom}px`);
    stage.style.setProperty("--stage-scale", stageScale);
    document.documentElement.style.setProperty("--mechanical-desk-clearance", `${bottom + (height - desk.offsetTop) * stageScale + 14}px`);
  }

  // Browser rectangles include the stage transform. The rig, canvases, and masks
  // share the fixed design coordinate system, even through a resize in flight.
  function stageBox(element) {
    const origin = stage.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return { left: (rect.left - origin.left) / stageScale, top: (rect.top - origin.top) / stageScale,
      right: (rect.right - origin.left) / stageScale, bottom: (rect.bottom - origin.top) / stageScale,
      width: rect.width / stageScale, height: rect.height / stageScale };
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

  function measurePort(layer, opening, anchor = .5, offset = 0) {
    const rect = stageBox(opening);
    const left = rect.left - bounds.left;
    const y = rect.top + rect.height * anchor - bounds.top + offset;
    layer.style.clipPath = `inset(${y}px ${bounds.right - rect.right}px 0 ${left}px)`;
    return { x: left + rect.width / 2, y, width: rect.width };
  }

  function measurePot() {
    const top = Math.max(0, stageBox(base).bottom - bounds.top - 20);
    const bottom = stageBox(potMeter).top - bounds.top - 5;
    const height = Math.max(1, bottom - top);
    const width = Math.min(bounds.width * .68, stageBox(communityStation).width + 156);
    center = { x: bounds.width / 2, y: top + height / 2 + Math.min(9, height * .18) };
    potArea = { width, height };
  }

  function measure() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return false;
    if (bounds?.width !== width || bounds?.height !== height) {
      rig.resize(width, height);
    }
    const { left, top } = stageBox(canvas);
    bounds = { left, top, right: left + width, width, height };
    bayPort = measurePort(feedLayer, baySeam);
    recyclerPort = measurePort(recycleLayer, recyclerSeam);
    printerPort = measurePort(printLayer, printerOpening, 1, .5);
    measurePot();
    const ratio = Math.min(2, devicePixelRatio || 1);
    const pixelsWide = Math.round(width * ratio), pixelsHigh = Math.round(height * ratio);
    if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) {
      canvas.width = pixelsWide;
      canvas.height = pixelsHigh;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    return true;
  }

  function seatCards(seat) {
    return [...table.querySelectorAll(".seat-" + seat + " :is(.my-hand,.seat-cards) .card")];
  }

  const seatCardKey = (id, slot) => "seat:" + id + ":" + slot;
  const boardCardKey = slot => "board:" + slot;

  function cardGeometry(card) {
    const rect = stageBox(card);
    const style = getComputedStyle(card);
    const scale = parseFloat(style.scale) || 1;
    return { ...point(rect), width: parseFloat(style.width) * scale, height: parseFloat(style.height) * scale };
  }

  function standardCardSize() {
    const style = getComputedStyle(community.querySelector(".card"));
    return { width: parseFloat(style.width), height: parseFloat(style.height) };
  }

  function sizePayload(card, { width, height }) {
    card.style.width = width + "px";
    card.style.height = height + "px";
    return card;
  }

  function cardWristAngle({ y }) {
    return y >= 135 ? 90 : -90;
  }

  function beforeRender(next) {
    // A timed-out gate can advance the server before a slow view finishes its queue.
    if (cardBatch?.id !== next.cardGate?.id) retireCardBatch();
    if (!animatesArm() || !measure()) return;
    if (["showdown", "show_choice"].includes(next.phase)) preparePayout(next);
    if (!state || state.handNum !== next.handNum) return;
    for (const player of next.players) {
      const previousIndex = state.players.findIndex(previous => previous.id === player.id);
      if (!player.folded || state.players[previousIndex]?.folded !== false) continue;
      const originals = seatCards(previousIndex);
      for (const index of [0, 1]) {
        const delivery = deliveries.get(seatCardKey(player.id, index));
        const card = originals[index] ?? delivery?.card;
        if (card) queueFold(card, delivery);
      }
    }
  }

  function queueFold(card, delivery) {
    const at = delivery ? delivery.target() : cardGeometry(card);
    const standard = standardCardSize();
    const sheet = sizePayload(card.cloneNode(true), standard);
    sheet.classList.remove("mechanical-pending", "seat-card-deal", "card-flip-in");
    sheet.classList.add("mechanical-carry", "mechanical-fold-card");
    let source = at;
    sheet.style.scale = String(source.height / standard.height);
    placeEffect(sheet, at);
    if (delivery) {
      sheet.style.visibility = "hidden";
      delivery.onArrival = () => {
        source = delivery.target();
        sheet.style.scale = String(source.height / standard.height);
        placeEffect(sheet, source);
        sheet.style.visibility = "";
      };
    }
    let paper;
    const cleanup = () => {
      sheet.remove();
      paper?.remove();
    };
    const angle = cardWristAngle(at);
    const pointAtMouth = exposed => {
      const mouth = recycleMouth();
      return { ...mouth, y: mouth.y + standard.height * exposed + jawReach, angle: -90, lift: 2 };
    };
    arm.enqueue("fold", {
      ready: () => !delivery || delivery.landed,
      source: () => ({ ...MechanicalArmMotion.advance(source, angle, -source.height / 2 - jawReach), angle, lift: 2 }),
      approach() {
        const front = pointAtMouth(1);
        return { ...front, y: front.y + 4 };
      },
      target: () => pointAtMouth(.40),
      payload: sheet,
      feedLength: standard.height,
      payloadOffset: () => ({ x: standard.height * Number(sheet.style.scale) / 2 + jawReach, y: 0 }),
      payloadAngle: -angle,
      onRelease() { paper = shredPaper(); },
      onLand: cleanup,
      onCancel: cleanup,
    });
  }

  function placeEffect(node, { x, y }) {
    node.style.left = x + "px";
    node.style.top = y + "px";
    moving.append(node);
  }

  function shredPaper() {
    const paper = document.createElement("span");
    paper.className = "mechanical-spark";
    placeEffect(paper, recycleMouth());
    for (const [x, y, turn] of [[-13, 12, 70], [-7, 22, -115], [1, 10, 130], [9, 18, -60], [14, 9, 105]]) {
      const bit = document.createElement("i");
      paper.append(bit);
      bit.animate([
        { opacity: 0, transform: "translate(0, 0)" },
        { opacity: .8, offset: .22 },
        { opacity: 0, transform: `translate(${x}px, ${y}px) rotate(${turn}deg)` },
      ], { duration: 265, delay: 65, easing: "ease-out", fill: "both" });
    }
    return paper;
  }

  function setStrengthLevel(level) {
    strengthLevel = level;
    strengthLamps.forEach((lamp, index) => lamp.toggleAttribute("data-lit", index < level));
    strength.toggleAttribute("data-royal", strengthRank === 9 && level === 9);
  }

  function clearHandStrength() {
    if (strengthRank < 0) return;
    clearTimeout(strengthTimer);
    strengthRank = -1;
    strength.hidden = true;
    strength.removeAttribute("aria-label");
    setStrengthLevel(0);
    strengthFlaps.forEach(flip => flip("", false));
  }

  function updateHandStrength(animate = !reduced.matches && !document.hidden) {
    const me = !isSpectator && !state?.isSpectatorView && state?.players.find(player => player.id === Net.playerId);
    if (!me?.hand?.[0] || !me.hand[1] || me.folded || [0, 1].some(slot => deliveries.has(seatCardKey(me.id, slot)))) {
      clearHandStrength();
      return;
    }
    const board = state.community.filter((_, index) => !deliveries.has(boardCardKey(index)));
    const rank = evaluateHand([...me.hand, ...board])?.rank ?? Number(me.hand[0].rank === me.hand[1].rank);
    if (rank === strengthRank && animate) return;

    clearTimeout(strengthTimer);
    const level = Math.min(rank + 1, 9);
    const lettered = HAND_NAMES[Math.min(rank, 8)];
    strengthRank = rank;
    strength.hidden = false;
    strength.setAttribute("aria-label", `手牌强度 ${HAND_NAMES[rank]} ${level}/9`);
    strengthFlaps.forEach((flip, index) => {
      const glyph = lettered[index] ?? "";
      if (glyph !== strengthWindows.children[index].getAttribute("aria-label") || !animate) {
        flip(glyph, animate);
      }
    });

    if (!animate || level <= strengthLevel) setStrengthLevel(level);
    else {
      const step = () => {
        setStrengthLevel(strengthLevel + 1);
        if (strengthLevel < level) strengthTimer = setTimeout(step, 40);
      };
      step();
    }
  }

  function confirmCardBatch(batch) {
    if (batch !== cardBatch || batch.pending.size) return;
    if (!batch.sent && !isSpectator && Net.connected && gameState?.cardGate?.id === batch.id) {
      batch.sent = true;
      Net.send("game:cardsReady", { id: batch.id });
    }
  }

  function finishCardBatch(batch) {
    if (batch) for (const land of batch.pending) land(false);
  }

  function retireCardBatch() {
    const previous = cardBatch;
    cardBatch = null;
    finishCardBatch(previous);
  }

  function queueCards(action, slots, batch = null) {
    if (!animatesArm() || (batch && document.hidden)) return;
    arm.enqueue(action, slots.map(({ key, card }) => {
      const faceUp = card.classList.contains("card-front") &&
        (action === "reveal" || (!isSpectator && !!card.closest(".my-hand")));
      let last = cardGeometry(card);
      const entry = {
        card,
        target() {
          if (entry.card.isConnected) last = cardGeometry(entry.card);
          return last;
        },
      };
      let standard, carrier;
      deliveries.set(key, entry);
      card.classList.add("mechanical-pending");
      function land(animate) {
        if (entry.landed) return;
        const current = deliveries.get(key) === entry;
        if (current) deliveries.delete(key);
        entry.card.classList.remove("mechanical-pending");
        entry.landed = true;
        entry.onArrival?.();
        if (animate && action === "reveal" && entry.card.isConnected) {
          entry.card.classList.add("mechanical-card-seated");
        }
        if (batch) {
          batch.pending.delete(land);
          confirmCardBatch(batch);
        }
        if (current && (faceUp || action === "reveal")) updateHandStrength();
      }
      batch?.pending.add(land);
      return {
        valid: () => !entry.landed,
        target() {
          const target = entry.target();
          const wristAngle = cardWristAngle(target);
          carrier?.toggleAttribute("data-reverse-art", wristAngle > 0);
          return { ...target, wristAngle, angle: wristAngle + 90 };
        },
        feedLength: () => standard.height,
        payload() {
          standard = standardCardSize();
          if (!faceUp) return sizePayload(cardBack(), standard);
          carrier = document.createElement("div");
          carrier.className = "card mechanical-turnable-card";
          carrier.setAttribute("aria-hidden", "true");
          const plane = document.createElement("div");
          plane.className = "mechanical-card-roll-plane";
          const front = entry.card.cloneNode(true);
          front.classList.remove("mechanical-pending", "mechanical-card-seated", "card-flip-in");
          plane.append(cardBack(), front);
          carrier.append(plane);
          return sizePayload(carrier, standard);
        },
        payloadOffset: () => ({ x: standard.height / 2 + jawReach, y: 0 }),
        payloadAngle: 90,
        payloadRoll: faceUp ? 180 : 0,
        onTurnover: SFX.flip,
        onRelease: () => SFX.deal(),
        onLand: () => land(true),
        onCancel: () => land(false),
      };
    }));
  }

  function createSplitFlap(cell) {
    const [upper, lower, folding, falling, print] = cell.children;
    let fold, fall;
    return (label, animate) => {
      fold?.cancel();
      fall?.cancel();
      const previous = cell.getAttribute("aria-label");
      cell.setAttribute("aria-label", label);
      cell.toggleAttribute("data-blank", !label);
      upper.firstElementChild.textContent = label;
      lower.firstElementChild.textContent = animate ? previous : label;
      if (print) {
        print.textContent = label;
        cell.toggleAttribute("data-flipping", animate);
      }
      if (!animate) return;

      const half = 110;
      folding.firstElementChild.textContent = previous;
      falling.firstElementChild.textContent = label;
      fold = folding.animate([
        { transform: "scaleY(1)", filter: "brightness(1)" },
        { transform: "scaleY(0)", filter: "brightness(.72)" },
      ], { duration: half, fill: "backwards", easing: "cubic-bezier(.48,.05,.82,.42)" });
      const settling = falling.animate([
        { transform: "scaleY(0)", filter: "brightness(.78)" },
        { transform: "scaleY(1)", filter: "brightness(1)", offset: .84 },
        { transform: "scaleY(.965)", filter: "brightness(.98)", offset: .92 },
        { transform: "scaleY(1)", filter: "brightness(1)" },
      ], { duration: half, delay: half, fill: "both", easing: "cubic-bezier(.22,.54,.54,1)" });
      fall = settling;
      settling.onfinish = () => {
        if (fall !== settling) return;
        lower.firstElementChild.textContent = label;
        if (print) cell.removeAttribute("data-flipping");
        settling.cancel();
        fold = fall = null;
      };
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
    fitStage();
    if (!measure()) return;
    renderInstruments(next);
    const sameHand = last?.handNum === next.handNum;
    const freshDeal = handToDeal === next.handNum;
    if (last && !sameHand) deliveries.clear();
    const newBatch = next.cardGate && cardBatch?.id !== next.cardGate.id
      ? cardBatch = { ...next.cardGate, pending: new Set() }
      : null;
    const hands = next.players.map((player, index) => player.folded ? [] :
      seatCards(index).map((card, slot) => ({ key: seatCardKey(player.id, slot), card })));
    const board = [...community.querySelectorAll(".card")].map((card, slot) => ({ key: boardCardKey(slot), card }));
    const winningIds = new Set(next.phase === "showdown" ? next.winners?.map(winner => winner.id) : []);
    const bestCards = new Set(next.players.filter(player => winningIds.has(player.id) && player.hand.length === 2 && player.hand.every(Boolean))
      .flatMap(player => evaluateHand([...player.hand, ...next.community])?.cards ?? []));
    board.forEach(({ card }, index) => card.parentElement.toggleAttribute("data-highlighted", bestCards.has(next.community[index])));
    for (const { key, card } of [...hands.flat(), ...board]) {
      const delivery = deliveries.get(key);
      if (!delivery || delivery.card === card) continue;
      delivery.card = card;
      card.classList.remove("card-flip-in");
      card.classList.add("mechanical-pending");
    }
    if (newBatch?.boardFrom === null || (!next.cardGate && freshDeal)) {
      const cards = [0, 1].flatMap(round => hands.map(hand => hand[round]).filter(Boolean));
      queueCards("deal", cards, newBatch);
      handToDeal = null;
    }
    if (newBatch && newBatch.boardFrom !== null) {
      queueCards("reveal", board.slice(newBatch.boardFrom, next.community.length), newBatch);
    } else if (!next.cardGate && sameHand && next.community.length > last.community.length) {
      queueCards("reveal", board.slice(last.community.length, next.community.length));
    }
    if (cardBatch && !cardBatch.pending.size) confirmCardBatch(cardBatch);
    updateHandStrength();
    const oldGroups = groups;
    placeWagerZones();
    groups = readGroups(next);
    MechanicalReels.set(potReels, next.pot);
    potMeter.dataset.amount = next.pot;
    if ((sameHand || freshDeal) && !reduced.matches && !document.hidden) {
      scheduleChips(sameHand ? oldGroups : new Map(), groups);
    } else {
      wagers.clear();
      sweep = null;
    }
    const payout = payouts.get(next.handNum);
    if (payout && payout.start === undefined) {
      payout.pot = groups.get("pot");
      payout.sweep = sweep;
      payout.start = Math.max(performance.now() + 280, sweep ? sweep.start + POT_SWEEP_MS : 0);
      sweep = null;
    }
    syncLabels();
    nextFrame();
  }

  function preparePayout(next) {
    if (payouts.has(next.handNum) || finalizedHand === next.handNum || !next.pot) return;
    const accounts = new Map();
    for (const transfer of [...(next.winners || []), ...(next.refunds || [])]) {
      const player = next.players.find(player => player.id === transfer.id);
      if (!player || !(transfer.amount > 0)) continue;
      let account = accounts.get(player.id);
      if (!account) {
        account = { id: player.id, amount: 0, counts: Array(DENOMINATIONS.length).fill(0), final: player.stack,
          winner: next.winners?.some(winner => winner.id === player.id) };
        accounts.set(player.id, account);
      }
      account.amount += transfer.amount;
      const counts = transfer.chips || paymentCounts([transfer.amount]);
      counts.forEach((count, index) => { account.counts[index] += count; });
    }
    if (!accounts.size) return;
    for (const account of accounts.values()) {
      account.balanceBeforePayout = account.shown = account.final - account.amount;
    }
    payouts.set(next.handNum, { handNum: next.handNum, accounts });
  }

  function updateStack(element, player, snapshot, changed) {
    const account = payouts.get(snapshot.handNum)?.accounts.get(player.id);
    for (const payout of payouts.values()) {
      const earlier = payout.accounts.get(player.id);
      if (earlier && earlier !== account) earlier.element = element;
    }
    if (account) {
      account.final = player.stack;
      if (changed || account.element !== element) {
        account.element = element;
        MechanicalReels.set(element, account.shown, { instant: changed, payout: account.delivered === false ? "flow" : undefined });
      }
      return;
    }
    const initial = handToDeal === snapshot.handNum && snapshot.phase === "preflop"
      ? player.stack + player.bet : player.stack;
    if (changed) MechanicalReels.set(element, initial, { instant: true });
    MechanicalReels.set(element, player.stack, { initial });
  }

  function finalizePot(handNum) {
    if (state?.handNum !== handNum) return;
    finalizedHand = handNum;
    if (groups.delete("pot")) syncLabels();
  }

  function pulseWinner(account, now, hits) {
    const body = account.element.closest(".mechanical-seat-body");
    const rapid = hits > 1 || now - account.lastImpact < 42;
    account.lastImpact = now;
    if (account.pulse?.effect.target === body && account.pulse.playState === "running") {
      account.pulse.updatePlaybackRate(rapid ? .85 : .95);
      return;
    }
    account.pulse = body.animate([
      { transform: "scale(1)", filter: "drop-shadow(0 0 0 #e5a64100)" },
      { transform: rapid ? "scale(1.022)" : "scale(1.05)",
        filter: rapid ? "drop-shadow(0 0 5px #e5a64179)" : "drop-shadow(0 0 9px #e5a641b0)", offset: .27 },
      { transform: "scale(1)", filter: "drop-shadow(0 0 0 #e5a64100)" },
    ], { duration: 144, easing: "cubic-bezier(.22,.75,.36,1)" });
  }

  function absorbChips(payout, account, { credit, final, hits }, now) {
    account.delivered = final;
    account.shown = final ? account.final : account.balanceBeforePayout + credit;
    const { element } = account;
    if (!payoutSeat(account)) return;
    if (account.winner) pulseWinner(account, now, hits);
    if (state?.handNum === payout.handNum) MechanicalReels.set(element, account.shown, { payout: final ? "lock" : "flow" });
  }

  function payoutSeat({ element, id }) {
    const seat = element?.isConnected ? element.closest(".seat") : null;
    return seat?.dataset.playerId === id ? seat : null;
  }

  function drawPayouts(now) {
    const surfaceWidth = payoutCanvas.clientWidth, surfaceHeight = payoutCanvas.clientHeight;
    const ratio = Math.min(2, devicePixelRatio || 1);
    const width = Math.round(surfaceWidth * ratio), height = Math.round(surfaceHeight * ratio);
    if (payoutCanvas.width !== width || payoutCanvas.height !== height) {
      payoutCanvas.width = width;
      payoutCanvas.height = height;
      payoutContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    payoutContext.clearRect(0, 0, surfaceWidth, surfaceHeight);
    const offset = { x: bounds.left, y: bounds.top };
    const origin = { x: offset.x + center.x, y: offset.y + center.y };
    let animatedChips = 0;
    for (const payout of payouts.values()) {
      if (payout.start === undefined || now < payout.start) continue;
      if (!payout.timeline) {
        payout.timeline = createMechanicalPayout([...payout.accounts.values()], payout.pot?.inventory.piles ?? [], now,
          DENOMINATIONS.map(([value]) => value));
        payout.sweep = null;
      }
      const { timeline } = payout;
      const remaining = timeline.remaining;
      const active = timeline.draw(now, {
        origin,
        targetAt(account) {
          const seat = payoutSeat(account);
          if (seat) account.anchor = point(stageBox(seat.querySelector(".seat-medallion")));
          return account.anchor && { x: offset.x + account.anchor.x, y: offset.y + account.anchor.y };
        },
        drawChip: (at, value, angle, scale) => drawChip(at, { value, angle, scale }, payoutContext),
        hit(account, progress, final, lag) {
          if (account.winner && !document.hidden) SFX.potImpact(progress, final, lag);
        },
        arrive: (account, impact) => absorbChips(payout, account, impact, now),
      });
      if (timeline.remaining !== remaining) {
        chipsDirty = true;
        if (!timeline.remaining) finalizePot(payout.handNum);
      }
      if (active) animatedChips += timeline.count;
      else finishPayout(payout, timeline.count === 0);
    }
    if (animatedChips) payoutCanvas.dataset.chips = animatedChips;
    else delete payoutCanvas.dataset.chips;
  }

  function finishPayout(payout, instant = false) {
    if (state?.handNum === payout.handNum) {
      for (const account of payout.accounts.values()) {
        if (payoutSeat(account) && (instant || !account.delivered)) {
          MechanicalReels.set(account.element, account.final, { payout: "lock", instant });
        }
      }
    }
    finalizePot(payout.handNum);
    payouts.delete(payout.handNum);
    chipsDirty = true;
  }

  function clearPayouts() {
    for (const payout of payouts.values()) finishPayout(payout, true);
    payoutContext.clearRect(0, 0, payoutCanvas.width, payoutCanvas.height);
    delete payoutCanvas.dataset.chips;
  }

  function placeWagerZones() {
    const { width, height, left, top } = bounds;
    const drop = 8;
    const zoneWidth = 92, zoneHeight = 74;
    const halfWidth = zoneWidth / 2, halfHeight = zoneHeight / 2;
    const board = stageBox(communityStation);
    const upperSeat = seats.get(3);
    const topSeat = seats.get(4);
    const tongueAt = seat => point(stageBox(seat.querySelector(".mechanical-seat-tongue")));
    const leftUpper = tongueAt(upperSeat);
    const leftLower = tongueAt(seats.get(2));
    const topLeft = tongueAt(topSeat);
    const bottomLeft = tongueAt(seats.get(1));
    // Reserve the full two-card width even while the arm is still delivering the hand.
    const topCardWidth = parseFloat(getComputedStyle(topSeat).getPropertyValue("--seat-card-width"));
    const sideCardWidth = parseFloat(getComputedStyle(upperSeat).getPropertyValue("--seat-card-width"));
    const sideAvatar = stageBox(upperSeat.querySelector(".mechanical-seat-avatar"));
    const sidePlate = stageBox(upperSeat.querySelector(".mechanical-seat-plate"));
    const topHandEdge = topLeft.x - topCardWidth - 2;
    const topLaneEnd = topHandEdge - 8;
    const railInset = Math.max(8, sideAvatar.right - left + 1);
    const preferredScale = Math.max(.38, (topLaneEnd - railInset) / 92);
    const clearHandScale = Math.max(.25, (topHandEdge - railInset - 2) / 92);
    const topScale = Math.min(1, preferredScale, clearHandScale);
    const topHalfWidth = 46 * topScale, topHalfHeight = 37 * topScale;
    const topBandY = topLeft.y + 77;
    const topX = Math.max(railInset + topHalfWidth, topLaneEnd - topHalfWidth);
    const nearSideHand = topX - topHalfWidth < leftUpper.x + sideCardWidth * 2 + 14;
    const nearSidePlate = topX - topHalfWidth < sidePlate.right - left;
    const sideHandTop = leftUpper.y - sideCardWidth * 5 / 7;
    const topWager = { x: topX, y: Math.min(topBandY + topHalfHeight + drop,
      nearSideHand ? sideHandTop - topHalfHeight - 4 : Infinity,
      nearSidePlate ? sidePlate.top - top - topHalfHeight - 13 : Infinity) };
    const upper = { x: Math.min(leftUpper.x + 152, board.left - left - halfWidth - 8),
      y: Math.max(leftUpper.y + 16, topBandY + zoneHeight + halfHeight + 6) + drop };
    const lower = { x: leftLower.x + 62, y: leftLower.y - 30 - halfHeight };
    const boardBottom = board.bottom - top;
    const bottom = { x: bottomLeft.x - 20, y: bottomLeft.y - 69 - halfHeight + drop };
    const hero = { x: width / 2 - 70 - halfWidth, y: Math.max(boardBottom + halfHeight + 6, height - 117) + drop };
    const mirror = ({ x, y }) => ({ x: width - x, y });
    [hero, bottom, lower, upper, topWager, mirror(topWager), mirror(upper), mirror(lower), mirror(bottom)]
      .forEach((at, slot) => {
        const chipScale = STATIONS[slot] === "top" ? topScale : 1;
        const tongue = tongueAt(seats.get(slot));
        const outlet = { x: Math.max(17, Math.min(width - 17, tongue.x)),
          y: Math.max(14, Math.min(height - 14, tongue.y)) };
        wagerZones.set(slot, { at, outlet, scale: chipScale, direction: slot >= 5 ? -1 : 1,
          width: 92 * chipScale, height: 74 * chipScale });
      });
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
      const zone = wagerZones.get(Number(seat?.dataset.mechanicalSlot));
      if (!zone) return;
      next.set(player.id, { id: player.id, at: zone.at, zone, amount: player.bet, name: player.name, counts });
    });
    const collected = Math.max(0, snapshot.pot - live);
    if (collected) next.set("pot", { id: "pot", at: center, amount: collected, name: "已收底池",
      counts: potCounts ?? paymentCounts(potPayments) });
    for (const group of next.values()) group.inventory = chipInventory(group.counts, group.amount, group.zone);
    return next;
  }

  function syncLabels() {
    chipsDirty = true;
    potMeter.title = groups.get("pot")?.inventory.description || "";
    for (const [id, label] of labels) {
      if (!groups.has(id)) {
        label.remove();
        labels.delete(id);
      }
    }
    for (const [id, group] of groups) {
      if (id === "pot") continue;
      let label = labels.get(id);
      if (!label) {
        label = document.createElement("span");
        label.className = "mechanical-chip-amount";
        if (group.zone) label.classList.add("mechanical-wager-amount");
        labelLayer.append(label);
        labels.set(id, label);
      }
      label.style.left = group.at.x + "px";
      label.style.top = group.at.y + group.inventory.labelOffset + "px";
      label.style.maxWidth = group.zone.width - 6 + "px";
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

  function chipInventory(counts, amount, zone) {
    // Custom fractional wagers can pool into a whole unit before a street is collected.
    const represented = counts.reduce((total, count, index) => total + count * DENOMINATIONS[index][0], 0);
    if (represented - amount > 1e-8) {
      counts = counts.slice();
      counts[counts.length - 1] -= Math.ceil(represented - amount - 1e-8);
    }
    const description = [];
    const runs = [];
    let displayedValue = 0;
    for (const [index, [value]] of DENOMINATIONS.entries()) {
      const count = counts[index];
      if (count <= 0) continue;
      displayedValue += value * count;
      description.push(value + " × " + currency.format(count));
      runs.push({ value, count });
    }
    if (amount - displayedValue > 1e-8) description.push("余 " + currency.format(amount - displayedValue));
    const count = runs.reduce((total, run) => total + run.count, 0);
    const inventory = zone ? layoutWagerPiles(runs, count, zone) : layoutPotPiles(runs, count);
    return { ...inventory, description: description.join(" · ") };
  }

  function layoutWagerPiles(runs, count, { scale, height, direction }) {
    const rise = Math.max(54, Math.min(96, count * .42));
    const { piles, chips } = buildPiles(runs, rise);
    let labelOffset = height / 2 - 7;
    if (chips.length) {
      let left = Infinity, right = -Infinity;
      for (const chip of chips) {
        left = Math.min(left, chip.x);
        right = Math.max(right, chip.x);
      }
      const floor = Math.max(...piles.map(pile => pile.y));
      const spread = Math.min(1, 58 / Math.max(1, right - left));
      let bottom = -Infinity;
      // Bring the stacks closer together at large wagers and keep the chip faces full size.
      for (const part of [...piles, ...chips]) {
        part.x = (part.x - (left + right) / 2) * spread * direction * scale;
        part.y = (part.y - Math.max(0, floor - 9)) * scale;
        part.scale = scale;
        bottom = Math.max(bottom, part.y);
      }
      labelOffset = Math.max(labelOffset, bottom + 14 * CHIP_SCALE * scale + 8);
    }
    return { piles, chips, labelOffset };
  }

  function buildPiles(runs, maxRise, positions = PILE_POSITIONS) {
    const values = runs.flatMap(({ value, count }) => Array(count).fill(value));
    if (!values.length) return { piles: [], chips: [] };

    const few = values.length <= 6;
    const count = few ? runs.length : Math.min(positions.length, Math.max(3, Math.ceil(values.length / 9)));
    const heights = few ? runs.map(run => run.count) : Array(count).fill(1);
    for (let remaining = few ? 0 : values.length - count; remaining > 0; remaining--) {
      let next = 0;
      for (let index = 1; index < count; index++) {
        if (heights[index] / positions[index][2] < heights[next] / positions[next][2]) next = index;
      }
      heights[next]++;
    }

    let chipIndex = 0;
    const piles = heights.map((height, index) => {
      const [baseX, baseY] = positions[index];
      const row = few && count <= 3;
      const x = row ? (index - (count - 1) / 2) * 32 : baseX * 1.14;
      const y = row ? (index % 2) * 3 : baseY;
      const steps = Math.max(1, height - 1);
      const lean = Math.sin(index * 2.7 + .9) * .48 * Math.min(1, 24 / steps);
      const rise = Math.min(5, maxRise / steps);
      const wobble = Math.min(.65, rise * .3);
      const chips = Array.from({ length: height }, (_, level) => ({
        value: values[chipIndex++],
        x: x + level * lean + Math.sin(level * 1.8 + index) * 1.1,
        y: y - level * rise + Math.sin(level * 2.1 + index) * wobble,
        angle: Math.sin(level * 1.4 + index * 3) * .065,
      }));
      return { x, y, chips };
    });
    piles.sort((a, b) => a.y - b.y);
    return { piles, chips: piles.flatMap(pile => pile.chips) };
  }

  function layoutPotPiles(runs, count) {
    const { width, height } = potArea;
    const positions = PILE_POSITIONS.slice();
    // Fill the center first, then stagger more piles outward on both sides of the board.
    const rows = [[0, -19, .89], [9, 1, 1.05], [-3, 16, .76]];
    for (let column = 0; positions.length < Math.ceil(count / 9); column++) {
      const distance = 60 + column * 28;
      if ((distance + 9) * 1.14 + 22 > width / 2) break;
      for (const [offset, y, weight] of rows) {
        const x = distance + offset;
        positions.push([-x, y, weight], [x, y - 2, weight]);
      }
    }
    const compact = height < 60;
    const rise = Math.max(14, Math.min(64, height - 49));
    const { piles, chips } = buildPiles(runs, rise, positions);
    if (!chips.length) return { piles, chips };
    const parts = [...piles, ...chips];
    const depth = compact ? .55 : 1;
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const chip of chips) {
      left = Math.min(left, chip.x - 22);
      right = Math.max(right, chip.x + 22);
      top = Math.min(top, chip.y * depth - 12);
      bottom = Math.max(bottom, chip.y * depth + 24);
    }
    const spread = Math.min(1, width / (right - left));
    const scale = Math.min(spread, height / (bottom - top));
    for (const part of parts) {
      part.x = (part.x - (left + right) / 2) * spread;
      part.y = (part.y * depth - (top + bottom) / 2) * scale;
      part.scale = scale;
    }
    return { piles, chips };
  }

  function scheduleChips(previous, next) {
    const start = performance.now();
    const sources = [...previous.values()].filter(group => group.id !== "pot" && !next.has(group.id))
      .sort((a, b) => a.at.y - b.at.y);
    const nextPot = next.get("pot");
    const oldPot = previous.get("pot");
    if (sources.length && nextPot && nextPot.amount > (oldPot?.amount || 0)) {
      const outgoing = sources.map(group => ({ group, motion: wagers.get(group.id) }));
      const ready = Math.max(start, sweep ? sweep.start + POT_SWEEP_MS : start,
        ...outgoing.map(({ motion }) => motion?.end ?? start));
      const origins = matchChipSources(nextPot, oldPot ? [oldPot, ...sources] : sources).map(source => source && {
        ...chipPoint(source.group, source.chip), angle: source.chip.angle, scale: source.chip.scale,
      });
      // The server can open a new street in the same tick as a call. Keep the last
      // chips flying to their wager before sweeping them up on the visual timeline.
      sweep = { start: ready, origins, outgoing, oldPot, previous: sweep };
    }
    for (const [id, group] of next) {
      if (id === "pot") continue;
      const old = previous.get(id);
      if (group.amount > (old?.amount || 0)) wagers.set(id, wagerMotion(group, old, wagers.get(id), start));
    }
    for (const id of wagers.keys()) if (!next.has(id)) wagers.delete(id);
  }

  function matchChipSources(group, sources) {
    const fromByValue = new Map();
    for (const source of sources) {
      for (const [index, chip] of source.inventory.chips.entries()) {
        if (!fromByValue.has(chip.value)) fromByValue.set(chip.value, []);
        fromByValue.get(chip.value).push({ group: source, chip, index });
      }
    }
    for (const positions of fromByValue.values()) positions.reverse();
    return group.inventory.chips.map(chip => fromByValue.get(chip.value)?.pop());
  }

  function wagerMotion(group, old, previous, now) {
    const sources = matchChipSources(group, old ? [old] : []);
    const additions = sources.reduce((total, source) => total + (source ? 0 : 1), 0);
    const span = Math.min(290, Math.max(0, additions - 1) * 23);
    let flightIndex = 0;
    let end = now, shadowAt = Infinity;
    const particles = sources.map((source, index) => {
      let particle;
      if (source) {
        const earlier = previous?.particles[source.index];
        if (earlier?.scatter && now < earlier.start + WAGER_SCATTER_MS) particle = earlier;
        else {
          const airborne = earlier?.airborne && now < earlier.end;
          const from = wagerPosition(source.group, source.chip, earlier, now);
          const start = !airborne && additions ? now + WAGER_FLIGHT_MS - 130 : now;
          particle = { from, start, end: airborne ? earlier.end : start + 160, airborne };
        }
      } else {
        const progress = flightIndex / Math.max(1, additions - 1);
        const start = now + span * (1 - (1 - progress) ** 1.4);
        const scatter = scatterPoint({ x: 0, y: 0 }, flightIndex + 9, 22 + 19 * group.zone.scale);
        particle = { start, end: start + WAGER_FLIGHT_MS, scatter, airborne: true };
        flightIndex++;
      }
      end = Math.max(end, particle.end);
      shadowAt = Math.min(shadowAt, particle.airborne ? particle.end : now - 80);
      return particle;
    });
    return { end, particles, shadowAt };
  }

  function wagerPosition(group, chip, motion, now) {
    const target = chipPoint(group, chip);
    if (!motion || now >= motion.end) return { ...target, angle: chip.angle };
    const elapsed = now - motion.start;
    if (motion.from) {
      const t = ease(Math.max(0, elapsed / (motion.end - motion.start)));
      return { ...lerp(motion.from, target, t), angle: motion.from.angle + (chip.angle - motion.from.angle) * t };
    }
    if (elapsed < 0) return null;
    const { outlet } = group.zone;
    const middle = lerp(outlet, group.at, .61);
    const scattered = { x: middle.x + motion.scatter.x, y: middle.y + motion.scatter.y };
    if (elapsed < WAGER_SCATTER_MS) {
      const t = elapsed / WAGER_SCATTER_MS;
      const position = lerp(outlet, scattered, 1 - (1 - t) ** 2);
      return { x: position.x, y: position.y - 13 * Math.sin(Math.PI * t), angle: motion.scatter.x * .014 * t };
    }
    const t = (elapsed - WAGER_SCATTER_MS) / (WAGER_FLIGHT_MS - WAGER_SCATTER_MS);
    const position = lerp(scattered, target, 1 - (1 - t) ** 2.3);
    return { x: position.x, y: position.y - 5 * Math.sin(Math.PI * t),
      angle: motion.scatter.x * .014 * (1 - t) + chip.angle * t };
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

  function drawChip({ x, y }, { value, angle, scale = 1 }, target = context, opacity = 1) {
    const size = CHIP_SCALE * scale;
    target.save();
    target.globalAlpha = opacity;
    target.translate(x, y);
    target.rotate(angle);
    target.drawImage(chipSprites.get(value), -16 * size, -10 * size, 32 * size, 24 * size);
    target.restore();
  }

  function drawPileShadows(group, opacity, piles = group.inventory.piles) {
    if (!opacity) return;
    context.save();
    context.globalAlpha = opacity;
    for (const pile of piles) {
      if (!pile.chips.length) continue;
      const { x, y } = chipPoint(group, pile);
      const scale = pile.scale ?? 1;
      const radius = (20 + Math.min(8, pile.chips.length * .45)) * scale;
      const shadowOffset = group.zone ? 1 : scale;
      context.save();
      context.translate(x + 4 * shadowOffset, y + 9 * shadowOffset);
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

  function drawWager(group, motion, now) {
    if (!motion || now >= motion.end) {
      drawSettledChips(group);
      return true;
    }
    drawPileShadows(group, ease(Math.max(0, Math.min(1, (now - motion.shadowAt) / 80))));
    for (const [index, chip] of group.inventory.chips.entries()) {
      const position = wagerPosition(group, chip, motion.particles[index], now);
      if (position) drawChip(position, { value: chip.value, angle: position.angle, scale: chip.scale });
    }
    return false;
  }

  function drawSettledChips(group, piles = group.inventory.piles) {
    drawPileShadows(group, 1, piles);
    for (const pile of piles) {
      for (const chip of pile.chips) drawChip(chipPoint(group, chip), chip);
    }
  }

  function drawPot(group, motion, now) {
    if (!motion || now >= motion.start + POT_SWEEP_MS) {
      drawSettledChips(group);
      return true;
    }
    if (now < motion.start) {
      for (const { group: wager, motion: flight } of motion.outgoing) drawWager(wager, flight, now);
      if (motion.oldPot) drawPot({ ...motion.oldPot, at: center }, motion.previous, now);
      return false;
    }
    const { at } = group;
    const progress = (now - motion.start) / POT_SWEEP_MS;
    drawPileShadows(group, Math.max(0, (progress - .65) / .35));
    for (const [index, chip] of group.inventory.chips.entries()) {
      const target = chipPoint(group, chip);
      const source = motion.origins[index];
      const scattered = scatterPoint(at, index, Math.min(55, potArea.height * .52));
      const from = source || at;
      const position = progress < .52 ? lerp(from, scattered, ease(progress / .52))
        : lerp(scattered, target, ease((progress - .52) / .48));
      const t = ease(progress);
      drawChip(position, source ? { value: chip.value, angle: source.angle + (chip.angle - source.angle) * t,
        scale: source.scale + (chip.scale - source.scale) * t } : chip);
    }
    return false;
  }

  function drawChips(now) {
    context.clearRect(0, 0, bounds.width, bounds.height);
    // Within the wagers, the piles farther down the felt cover those behind them.
    const depthOrder = [...groups.values()].filter(group => group.zone).sort((a, b) => a.at.y - b.at.y);
    for (const group of depthOrder) {
      if (drawWager(group, wagers.get(group.id), now)) wagers.delete(group.id);
    }
    // A settling hand owns its pot even if a new hand is already gathering bets.
    for (const payout of payouts.values()) {
      if (!payout.pot) continue;
      const group = { ...payout.pot, at: center };
      if (!payout.timeline) {
        if (drawPot(group, payout.sweep, now)) payout.sweep = null;
        continue;
      }
      drawSettledChips(group, payout.timeline.piles);
    }
    const pot = groups.get("pot");
    if (pot && !payouts.has(state?.handNum) && drawPot(pot, sweep, now)) sweep = null;
  }

  function draw(now) {
    frame = null;
    drawTurnClock(now);
    if (payouts.size) drawPayouts(now);
    if (chipsDirty || sweep || wagers.size || [...payouts.values()].some(payout => payout.sweep)) {
      drawChips(now);
      chipsDirty = false;
    }
    if (arm.tick(now) || sweep || wagers.size || payouts.size || turnClock) nextFrame();
  }

  function printReceipt(snapshot, settlement) {
    const { winners = [], refunds = [], showedPlayerId } = settlement;
    const paper = receiptTemplate.content.firstElementChild.cloneNode(true);
    paper.querySelector("h2").textContent = `第 ${String(snapshot.handNum).padStart(3, "0")} 手 · 结算单`;
    paper.querySelector(".mechanical-receipt-pot").textContent = "总底池 " + currency.format(snapshot.pot);
    const board = paper.querySelector(".mechanical-result-board");
    board.replaceChildren(...snapshot.community.map(createCardEl));
    if (!snapshot.community.length) board.textContent = "本手未发公共牌";
    const rows = snapshot.players.map((player, index) => {
      const row = document.createElement("li");
      const award = winners.find(winner => winner.id === player.id);
      const refund = refunds.find(entry => entry.id === player.id);
      if (award) row.classList.add("mechanical-result-winner");
      const identity = document.createElement("span");
      identity.className = "mechanical-receipt-identity";
      const name = document.createElement("span");
      const position = SEAT_ROLES.find(([key]) => snapshot[key] === index)?.[1];
      name.textContent = position ? `${player.name} · ${position}` : player.name;
      const rank = document.createElement("small");
      rank.textContent = award?.revealedRank || award?.hand || player.handRank || (player.folded ? "弃牌" : "—");
      identity.append(name, rank);
      const balance = document.createElement("span");
      balance.className = "mechanical-receipt-balance";
      const net = (award?.amount ?? 0) + (refund?.amount ?? 0) - player.totalBet;
      balance.textContent = signedCurrency.format(net);
      if (refund) {
        const returned = document.createElement("small");
        returned.textContent = "退回 " + currency.format(refund.amount);
        balance.append(returned);
      }
      const cards = document.createElement("span");
      cards.className = "mechanical-result-hand";
      if ((!player.folded && snapshot.phase === "showdown") || showedPlayerId === player.id) {
        cards.append(...player.hand.filter(Boolean).map(createCardEl));
      }
      if (award) {
        const stamp = document.createElement("span");
        stamp.className = "mechanical-receipt-stamp";
        stamp.textContent = "获胜";
        row.append(stamp);
      }
      row.append(identity, cards, balance);
      return row;
    });
    paper.querySelector("ul").replaceChildren(...rows);
    const time = paper.querySelector("time");
    const printedAt = new Date();
    time.dateTime = printedAt.toISOString();
    time.textContent = printedAt.toLocaleTimeString("zh-CN", { hour12: false });
    return paper;
  }

  function mountReceipt(paper) {
    const carrier = document.createElement("div");
    carrier.className = "mechanical-receipt-payload";
    carrier.inert = true;
    carrier.append(paper);
    moving.append(carrier);
    const { width, height } = stageBox(paper);
    carrier.remove();
    // Leave room at both ends of the slit and keep the pull within the arm's reach.
    const scale = Math.min(1, (printerPort.width - 16) / width, 312 / height);
    carrier.style.width = width * scale + "px";
    carrier.style.height = height * scale + "px";
    paper.style.transform = `scale(${scale})`;
    return carrier;
  }

  function presentReceipt(ticket, carrier) {
    if (ticket !== latestReceipt || ticket.presented) {
      carrier?.remove();
      return;
    }
    const { paper } = ticket;
    const from = carrier && stageBox(carrier);
    ticket.presented = true;
    paper.style.transform = "";
    result.replaceChildren(paper);
    carrier?.remove();
    result.hidden = false;
    if (!from?.width || reduced.matches) {
      finishReceiptPresentation(ticket);
      return;
    }
    const to = stageBox(paper);
    const dx = from.left + (from.width - to.width) / 2 - to.left;
    const dy = from.top + (from.height - to.height) / 2 - to.top;
    ticket.animation = paper.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width})` },
      { transform: "translate(0, 0) scale(1)" },
    ], { duration: 280, easing: "cubic-bezier(.22,.76,.29,1)" });
    ticket.animation.onfinish = () => finishReceiptPresentation(ticket);
  }

  function reportReceiptReady(ticket) {
    if (ticket.ready && ticket.id && !isSpectator && Net.connected) Net.send("game:receiptReady", { receiptId: ticket.id });
  }

  function finishReceiptPresentation(ticket) {
    if (ticket !== latestReceipt || ticket.ready) return;
    ticket.ready = true;
    ticket.animation = null;
    reportReceiptReady(ticket);
    refreshNextHand();
  }

  function showReceiptInstantly(ticket) {
    const payout = payouts.get(ticket.handNum);
    if (payout) {
      finishPayout(payout, true);
      drawPayouts(performance.now());
    }
    if (ticket.presented) {
      ticket.animation?.finish();
      finishReceiptPresentation(ticket);
    } else presentReceipt(ticket);
  }

  function clearReceipt() {
    if (receiptCountdown) clearInterval(receiptCountdown);
    receiptCountdown = null;
    latestReceipt = null;
    result.replaceChildren();
    result.hidden = true;
  }

  function refreshNextHand() {
    const ticket = latestReceipt;
    if (!ticket?.ready) return;
    const remaining = ticket.endsAt === undefined ? null : Math.max(0, Math.ceil((ticket.endsAt - performance.now()) / 1000));
    const host = isHost && !isSpectator;
    const starting = remaining === 0 && ticket.canStart !== false;
    ticket.button.disabled = !host || starting || !Net.connected;
    if (starting) ticket.button.textContent = "正在开局…";
    else if (remaining === 0 && !host) ticket.button.textContent = "等待玩家入座";
    else {
      const label = host ? "开始下一手" : "等待房主开始";
      ticket.button.textContent = remaining > 0 ? `${label} · ${remaining}s` : label;
    }
    if (remaining === 0 && receiptCountdown) {
      clearInterval(receiptCountdown);
      receiptCountdown = null;
    }
  }

  function syncNextHand({ receiptId, remainingMs, nextHandDelay, canStart }) {
    const ticket = latestReceipt;
    if (!ticket || ticket.id !== receiptId) return;
    ticket.canStart = canStart;
    const delay = receiptId ? remainingMs : nextHandDelay * 1000;
    if (Number.isFinite(delay)) {
      ticket.endsAt = Math.min(ticket.endsAt ?? Infinity, performance.now() + delay);
      if (!receiptCountdown) receiptCountdown = setInterval(refreshNextHand, 200);
    }
    refreshNextHand();
  }

  function restoreReceipt(snapshot, settlement) {
    if (latestReceipt?.id === settlement.receiptId) {
      reportReceiptReady(latestReceipt);
      return;
    }
    if (state?.handNum !== snapshot.handNum) renderGame(snapshot);
    showResult(snapshot, settlement, true);
  }

  function showResult(snapshot, settlement = {}, instant = false) {
    if (!snapshot || !container.classList.contains("active") || latestReceipt?.handNum === snapshot.handNum) return;
    if (!payouts.has(snapshot.handNum)) {
      finalizedHand = snapshot.handNum;
      sweep = null;
      wagers.clear();
      groups.clear();
      syncLabels();
    }
    const paper = printReceipt(snapshot, settlement);
    const button = paper.querySelector(".mechanical-receipt-next");
    const ticket = latestReceipt = { handNum: snapshot.handNum, id: settlement.receiptId, paper, button };
    button.addEventListener("click", () => {
      if (ticket === latestReceipt && ticket.ready && isHost && !isSpectator) Net.send("game:nextHand", { receiptId: ticket.id });
    });
    if (!instant && !document.hidden && animatesArm() && (bounds || measure())) {
      let length;
      arm.enqueue("receipt", {
        valid: () => latestReceipt === ticket && !ticket.presented,
        target: printOutlet.pose,
        ready: () => !payouts.has(ticket.handNum),
        outlet: printOutlet,
        payload: () => mountReceipt(ticket.paper),
        feedLength(carrier) { return length = parseFloat(carrier.style.height); },
        payloadOffset: () => ({ x: length / 2 + jawReach, y: 0 }),
        payloadAngle: 90,
        onRelease({ element }) {
          presentReceipt(ticket, element);
          return true;
        },
        onCancel() {
          if (latestReceipt === ticket && !ticket.presented) presentReceipt(ticket);
        },
      });
    } else showReceiptInstantly(ticket);
    nextFrame();
  }
  const geometryObserver = new ResizeObserver(() => {
    if (enabled()) fitStage();
  });
  geometryObserver.observe(container);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      finishCardBatch(cardBatch);
      updateHandStrength(false);
      if (latestReceipt && !latestReceipt.ready) showReceiptInstantly(latestReceipt);
    } else refreshNextHand();
  });

  reduced.addEventListener("change", () => {
    if (!enabled() || !reduced.matches) return;
    finishCardBatch(cardBatch);
    flipPhase(phaseLabel.getAttribute("aria-label"), false);
    updateHandStrength(false);
    clearPayouts();
    wagers.clear();
    sweep = null;
    chipsDirty = true;
    arm.reset();
    nextFrame();
  });

  return { enabled, animatesArm, setStyle, reset, notify: notice.show, startHand, bindSeats, updateSeatMarkers, syncTurn, canAct, submitTurn, acceptTurnPrompt,
    cardBack, communitySlot, beforeRender, updateStack, render, showResult, restoreReceipt, syncNextHand, refreshNextHand, clearHandStrength };
})();
