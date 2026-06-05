// ===== GAME RENDERER =====
let gameState = null;
let myPlayerId = null;
let myHand = [];
let roomCode = "";
let isHost = false;
let prevPhase = "";
let prevCommunityLen = 0;
let prevPot = 0;
let prevActions = {}; // playerId -> lastAction
let prevMyHandIds = null; // track my hand cards to avoid re-animating
let lastTurnActionData = null;

// ===== ACTION LOG =====
let logPrevPhase = "";
let logPrevActions = {}; // playerId → lastAction
let logPrevPot = 0;

function addLogEntry(name, actionText, amount, pot, actionType) {
  const body = $("actionLogBody");
  // Remove empty placeholder
  const empty = body.querySelector(".action-log-empty");
  if (empty) empty.remove();

  const entry = document.createElement("div");
  entry.className = `log-entry log-${actionType}`;

  let amountStr = "";
  if (amount > 0)
    amountStr = ` <span class="log-amount">${amount}</span>`;

  entry.innerHTML = `<span class="log-name">${name}</span><span class="log-detail">${actionText}${amountStr}</span><span class="log-pot">底池${pot}</span>`;
  body.appendChild(entry);
  body.scrollTop = body.scrollHeight;

  // Flash the toggle dot
  const dot = $("logDot");
  dot.classList.add("active");
  setTimeout(() => dot.classList.remove("active"), 1500);
}

function addLogPhaseSeparator(phaseName) {
  const body = $("actionLogBody");
  const empty = body.querySelector(".action-log-empty");
  if (empty) empty.remove();

  const sep = document.createElement("div");
  sep.className = "log-phase-sep";
  sep.textContent = phaseName;
  body.appendChild(sep);
  body.scrollTop = body.scrollHeight;
}

function clearActionLog() {
  const body = $("actionLogBody");
  body.innerHTML = '<div class="action-log-empty">等待发牌...</div>';
  $("logResultBar").style.display = "none";
  logPrevPhase = "";
  logPrevActions = {};
  logPrevPot = 0;
}

function showLogResult(winners) {
  const bar = $("logResultBar");
  bar.style.display = "";
  bar.textContent = winners
    .map((w) => `${w.name}「${w.hand || ""}」+${w.amount}`)
    .join("  ");
}

function addLogPhaseIfNeeded(phase) {
  if (!phase || phase === "idle" || phase === logPrevPhase) return;
  const LOG_PHASE_NAMES = {
    preflop: "\u7ffb\u724c\u524d",
    flop: "\u7ffb\u724c",
    turn: "\u8f6c\u724c",
    river: "\u6cb3\u724c",
    showdown: "\u644a\u724c",
  };
  if (LOG_PHASE_NAMES[phase]) addLogPhaseSeparator(LOG_PHASE_NAMES[phase]);
  logPrevPhase = phase;
}

const ACTION_LOG_LABELS = {
  smallBlind: "\u5c0f\u76f2",
  bigBlind: "\u5927\u76f2",
  fold: "\u5f03\u724c",
  check: "\u8fc7\u724c",
  call: "\u8ddf\u6ce8",
  raise: "\u52a0\u6ce8",
  allin: "ALL IN",
  allinCall: "ALL IN(\u8ddf\u6ce8)",
  allinRaise: "ALL IN(\u52a0\u6ce8)",
};

function playActionSound(action) {
  if (action === "fold") SFX.fold();
  else if (action === "check") SFX.check();
  else if (action === "call") SFX.call();
  else if (action === "raise") SFX.raise();
  else if (
    action === "allin" ||
    action === "allinCall" ||
    action === "allinRaise"
  )
    SFX.allin();
}

function handleActionLog(entry) {
  if (!entry) return;
  addLogPhaseIfNeeded(entry.phase);
  playActionSound(entry.action);
  addLogEntry(
    entry.playerName || "",
    ACTION_LOG_LABELS[entry.action] || entry.action || "",
    entry.amount || 0,
    entry.pot || 0,
    entry.action === "allinCall" || entry.action === "allinRaise"
      ? "allin"
      : entry.action || "action",
  );
  if ((entry.amount || 0) > 0) bumpPot();
}

function isMyTurnState(state = gameState) {
  if (!state || isSpectator || !Net.playerId) return false;
  const me = state.players?.find((p) => p.id === Net.playerId);
  const current = state.players?.[state.currentIdx];
  return (
    !!me &&
    !me.folded &&
    !me.allIn &&
    !!current &&
    current.id === Net.playerId &&
    state.phase !== "showdown" &&
    state.phase !== "idle"
  );
}

function buildTurnActionDataFromState(state = gameState) {
  if (!isMyTurnState(state)) return null;
  const me = state.players.find((p) => p.id === Net.playerId);
  const toCall = Math.max(0, (state.roundBet || 0) - (me.bet || 0));
  return {
    playerId: Net.playerId,
    toCall,
    minRaise: (state.roundBet || 0) + (state.minRaise || 0),
    maxRaise: (me.stack || 0) + (me.bet || 0),
    pot: state.pot || 0,
    gameMode: state.gameMode || lastTurnActionData?.gameMode || "classic",
    allInOrFold:
      state.allInOrFold ?? lastTurnActionData?.allInOrFold ?? false,
  };
}

function restoreActionPanelIfMyTurn({ notify = false } = {}) {
  const actionData = buildTurnActionDataFromState();
  if (!actionData) return false;
  const wasActive = $("actionPanel").classList.contains("active");
  lastTurnActionData = { ...lastTurnActionData, ...actionData };
  showActions(lastTurnActionData);
  if (notify && !wasActive) {
    SFX.yourTurn();
    if (navigator.vibrate) navigator.vibrate(60);
  }
  return true;
}

// Toggle logic
$("actionLogToggle").addEventListener("click", () => {
  $("actionLogPanel").classList.toggle("open");
});
$("actionLogClose").addEventListener("click", () => {
  $("actionLogPanel").classList.remove("open");
});
$("scoreboardToggle").addEventListener("click", () => {
  $("scoreboardPanel").classList.toggle("open");
});
$("scoreboardClose").addEventListener("click", () => {
  $("scoreboardPanel").classList.remove("open");
});

function renderScoreboard(scores = []) {
  const body = $("scoreboardBody");
  if (!body) return;
  if (!scores.length) {
    body.innerHTML =
      '<div class="action-log-empty">&#26242;&#26080;&#35760;&#24405;</div>';
    return;
  }
  body.innerHTML = "";
  for (const s of scores) {
    const row = document.createElement("div");
    row.className = "score-row";
    const score = Number(s.score || 0);
    const cls = score > 0 ? "positive" : score < 0 ? "negative" : "zero";
    row.innerHTML = `<span class="score-name"></span><span class="score-value ${cls}">${score > 0 ? "+" : ""}${score}</span>`;
    row.querySelector(".score-name").textContent = s.name || "";
    body.appendChild(row);
  }
}

function renderGame(state) {
  gameState = state;
  const table = $("table");

  // Detect phase transitions for sounds/animations
  const phaseChanged = state.phase !== prevPhase;
  const communityGrew = state.community.length > prevCommunityLen;
  const potGrew = state.pot > prevPot;
  if (phaseChanged) addLogPhaseIfNeeded(state.phase);

  // Phase separator for action log (before actions, so order is correct)
  if (false && phaseChanged && state.phase !== "idle") {
    const LOG_PHASE_NAMES = {
      preflop: "— 翻牌前 —",
      flop: "— 翻牌 —",
      turn: "— 转牌 —",
      river: "— 河牌 —",
      showdown: "— 摊牌 —",
    };
    if (LOG_PHASE_NAMES[state.phase])
      addLogPhaseSeparator(LOG_PHASE_NAMES[state.phase]);
  }

  // Action log: detect blind posts (SB/BB don't set lastAction on server)
  if (false && logPrevPhase === "" && state.phase === "preflop" && state.pot > 0) {
    if (state.sbIdx !== undefined) {
      const sbP = state.players[state.sbIdx];
      if (sbP && sbP.bet > 0)
        addLogEntry(sbP.name, "小盲", sbP.bet, state.pot, "blind");
    }
    if (state.bbIdx !== undefined) {
      const bbP = state.players[state.bbIdx];
      if (bbP && bbP.bet > 0)
        addLogEntry(bbP.name, "大盲", bbP.bet, state.pot, "blind");
    }
  }

  // Detect action changes for sounds + action log
  const ACTION_LABELS = {
    fold: "弃牌",
    check: "过牌",
    call: "跟注",
    raise: "加注",
    allin: "ALL IN",
    winner: "🏆 赢家",
  };
  if (false) for (const p of state.players) {
    const prev = prevActions[p.id];
    if (p.lastAction && p.lastAction !== prev && p.lastAction !== "") {
      // Trigger sound based on action
      if (p.lastAction === "fold") SFX.fold();
      else if (p.lastAction === "check") SFX.check();
      else if (p.lastAction === "call") SFX.call();
      else if (p.lastAction === "raise") SFX.raise();
      else if (p.lastAction === "allin") SFX.allin();

      // Action log entry
      const label = ACTION_LABELS[p.lastAction] || p.lastAction;
      let amount = 0;
      if (["call", "raise", "allin"].includes(p.lastAction))
        amount = p.bet;
      addLogEntry(p.name, label, amount, state.pot, p.lastAction);
    }
  }

  // Pot bump on increase
  if (potGrew && prevPot > 0) bumpPot();

  // Phase change sounds
  if (phaseChanged) {
    if (
      state.phase === "flop" ||
      state.phase === "turn" ||
      state.phase === "river"
    ) {
      // Card flip sounds with stagger
      const newCards = state.community.length - prevCommunityLen;
      for (let i = 0; i < newCards; i++) {
        setTimeout(() => SFX.flip(), i * 200 + 100);
      }
    }
    if (state.phase === "showdown") {
      setTimeout(() => SFX.win(), 600);
    }
  }

  // Update tracking
  prevPhase = state.phase;
  logPrevPhase = state.phase;
  prevCommunityLen = state.community.length;
  prevPot = state.pot;
  for (const p of state.players) prevActions[p.id] = p.lastAction;

  // Only remove seats/dealer/blinds if player count changed (prevents flickering)
  const existingSeats = table.querySelectorAll(".seat");
  const playerCountChanged =
    existingSeats.length !== state.players.length ||
    [...existingSeats].some(
      (el, i) => el.dataset.playerId !== state.players[i]?.id,
    );

  if (playerCountChanged) {
    table
      .querySelectorAll(".seat,.dealer-btn,.blind-btn")
      .forEach((el) => el.remove());
  } else {
    // Only remove dealer and blind buttons (they get repositioned)
    table
      .querySelectorAll(".dealer-btn,.blind-btn")
      .forEach((el) => el.remove());
  }

  const isMyTurn = isMyTurnState(state);
  if (isMyTurn) table.classList.add("table-your-turn");
  else table.classList.remove("table-your-turn");
  const turnLabel = $("turnLabel");
  if (isMyTurn) turnLabel.classList.add("visible");
  else turnLabel.classList.remove("visible");
  if (!isMyTurn) {
    lastTurnActionData = null;
    if ($("actionPanel").classList.contains("active")) hideActions();
  } else if (!$("actionPanel").classList.contains("active")) {
    restoreActionPanelIfMyTurn();
  }

  const me = state.players.find((p) => p.id === Net.playerId);
  // Detect if my hand cards actually changed (new deal vs re-render)
  const currentHandIds =
    me?.hand
      ?.filter((c) => c)
      .map((c) => c.suit + "-" + c.rank)
      .join(",") || "";
  const myHandChanged = currentHandIds !== prevMyHandIds;
  if (me && me.hand && me.hand[0]) {
    myHand = me.hand;
    prevMyHandIds = currentHandIds;
  }

  // Track which players we've seen cards for (to avoid re-animating other players)
  if (!window._prevOtherHands) window._prevOtherHands = {};

  // Seats
  state.players.forEach((p, i) => {
    let seat = table.querySelector(`.seat-${i}`);
    const seatExisted = seat && !playerCountChanged;

    if (!seatExisted) {
      seat = document.createElement("div");
      seat.className = `seat seat-${i}`;
      seat.dataset.playerId = p.id;
    }

    // Update classes
    seat.classList.toggle("folded", !!p.folded);
    seat.classList.toggle("disconnected", !p.connected);
    seat.classList.toggle(
      "active",
      state.currentIdx === i &&
        state.phase !== "showdown" &&
        state.phase !== "idle",
    );
    seat.classList.toggle("winner", p.lastAction === "winner");

    const cardsDiv = seatExisted
      ? p.id === Net.playerId
        ? seat.querySelector(".my-hand") ||
          table.parentNode.querySelector(":scope > .my-hand")
        : seat.querySelector(".seat-cards")
      : null;
    const existingInfo = seatExisted
      ? seat.querySelector(".seat-info")
      : null;

    // Rebuild cards only if seat is new or cards changed
    let cardsEl = cardsDiv;
    // For other players: compute card signature to detect changes
    let otherCardSig = "";
    if (p.id !== Net.playerId) {
      if (p.hand && p.hand[0]) {
        otherCardSig =
          "f:" +
          p.hand
            .filter((c) => c)
            .map((c) => c.suit + "-" + c.rank)
            .join(",");
      } else if (!p.folded && state.phase !== "idle") {
        otherCardSig = "b:2";
      } else {
        otherCardSig = "e";
      }
    }
    const otherCardsChanged =
      p.id !== Net.playerId
        ? otherCardSig !== (window._prevOtherHands[p.id] || "")
        : false;
    const needsCardRebuild =
      !cardsEl ||
      (p.id === Net.playerId ? myHandChanged : otherCardsChanged);
    if (needsCardRebuild) {
      if (cardsEl) cardsEl.remove();
      cardsEl = document.createElement("div");
      if (p.id === Net.playerId) cardsEl.className = "my-hand";
      else cardsEl.className = "seat-cards";

      if (p.id === Net.playerId) {
        for (const card of p.hand || []) {
          if (card) {
            const el = createCardEl(card);
            if (myHandChanged) el.classList.add("seat-card-deal");
            cardsEl.appendChild(el);
          }
        }
      } else if (p.hand && p.hand[0]) {
        const isNew = !cardsDiv;
        for (const card of p.hand) {
          const el = card ? createCardEl(card) : createCardBackEl();
          if (isNew || otherCardsChanged)
            el.classList.add("card-flip-in");
          cardsEl.appendChild(el);
        }
      } else if (!p.folded && state.phase !== "idle") {
        const isNew = !cardsDiv;
        for (let j = 0; j < 2; j++) {
          const el = createCardBackEl();
          if (isNew || otherCardsChanged) {
            el.classList.add("seat-card-deal");
            el.style.animationDelay = `${j * 0.15}s`;
          }
          cardsEl.appendChild(el);
        }
      }
      // Store signature after rebuild
      if (p.id !== Net.playerId)
        window._prevOtherHands[p.id] = otherCardSig;
    }

    // Player color and avatar
    const seatColor =
      p.avatarColor || PLAYER_COLORS[i % PLAYER_COLORS.length];
    const seatAvatar =
      p.avatar || PLAYER_AVATARS[i % PLAYER_AVATARS.length];

    // Update info (always update - it's lightweight innerHTML change)
    const actionMap = {
      fold: "弃牌",
      check: "过牌",
      call: "跟注",
      raise: "加注",
      allin: "ALL IN",
      winner: "🏆 WIN",
    };
    const actionClass = p.lastAction ? `act-${p.lastAction}` : "";
    const isActive_ =
      state.currentIdx === i &&
      state.phase !== "showdown" &&
      state.phase !== "idle";

    let infoEl = existingInfo;
    if (!infoEl) {
      infoEl = document.createElement("div");
      infoEl.className = "seat-info";
    }
    infoEl.style.borderLeftWidth = "3px";
    infoEl.style.borderLeftStyle = "solid";
    infoEl.style.borderLeftColor = seatColor;
    if (isActive_) {
      infoEl.style.borderColor = seatColor;
      infoEl.style.borderLeftColor = seatColor;
      infoEl.style.boxShadow = `0 0 20px ${seatColor}66, 0 0 40px ${seatColor}33`;
    } else if (p.lastAction === "winner") {
      infoEl.style.borderColor = "#40e080";
      infoEl.style.boxShadow = "0 0 24px rgba(64,224,128,0.4)";
    } else {
      infoEl.style.boxShadow = "none";
      infoEl.style.borderColor = "";
    }
    infoEl.innerHTML = `
<div class="seat-name" style="color:${seatColor}"><span style="color:${seatColor}">●</span> ${seatAvatar} ${p.name}${p.id === Net.playerId ? " (你)" : ""}</div>
<div class="seat-stack">${p.stack}</div>
<div class="seat-action ${actionClass} ${p.lastAction ? "seat-action-anim" : ""}">${actionMap[p.lastAction] || ""}</div>
    `;

    // Assemble seat if new
    if (!seatExisted) {
      if (p.id === Net.playerId) {
        seat.appendChild(cardsEl);
        seat.appendChild(infoEl);
      } else {
        seat.appendChild(infoEl);
        seat.appendChild(cardsEl);
        // Add interact trigger button for other players
        const trigBtn = document.createElement("div");
        trigBtn.className = "interact-trigger";
        trigBtn.textContent = "😊";
        trigBtn.style.right = "4px";
        trigBtn.style.top = "50%";
        trigBtn.style.transform = "translateY(-50%)";
        trigBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showInteractPanel(p.id, seat);
        });
        seat.appendChild(trigBtn);
        if (window.innerWidth > 700) {
          trigBtn.style.display = "none";
          seat.addEventListener(
            "mouseenter",
            () => (trigBtn.style.display = "flex"),
          );
          seat.addEventListener("mouseleave", () => {
            if (!interactPanel.classList.contains("active"))
              trigBtn.style.display = "none";
          });
        } else {
          trigBtn.style.display = "flex";
        }
      }
    } else {
      // Seat existed — re-append rebuilt elements if needed
      if (needsCardRebuild && cardsEl) seat.appendChild(cardsEl);
      if (!existingInfo && infoEl)
        seat.insertBefore(infoEl, seat.firstChild);
    }

    // Bet display
    const existingBet = seat.querySelector(".seat-bet");
    if (p.bet > 0) {
      if (existingBet && existingBet.textContent == p.bet) {
        // Bet unchanged — do nothing
      } else {
        if (existingBet) existingBet.remove();
        const bet = document.createElement("div");
        bet.className = "seat-bet chip-fly";
        bet.textContent = p.bet;
        seat.appendChild(bet);
        SFX.chip();
      }
    } else if (existingBet) {
      existingBet.remove();
    }

    if (!seatExisted) table.appendChild(seat);
  });

  // Move my hand cards outside the table (fixed at bottom of screen, Dou Dizhu style)
  const myHandEl = table.querySelector(".my-hand");
  if (myHandEl) {
    const container = $("table-container");
    container.appendChild(myHandEl);
  }

  const isMobile = window.innerWidth <= 700;

  // Dealer button
  const dBtn = document.createElement("div");
  dBtn.className = "dealer-btn";
  dBtn.textContent = "D";
  const dpDesktop = [
    { bottom: "55px", left: "calc(50% + 60px)" },
    { left: "120px", top: "calc(40% + 40px)" },
    { left: "calc(15% + 70px)", top: "45px" },
    { left: "50%", top: "45px", transform: "translateX(-50%)" },
    { right: "calc(15% + 70px)", top: "45px" },
    { right: "120px", top: "calc(40% + 40px)" },
  ];
  const dpMobile = [
    { bottom: "55px", left: "calc(50% + 50px)" },
    { left: "80px", top: "calc(40% + 30px)" },
    { left: "calc(10% + 50px)", top: "30px" },
    { left: "50%", top: "30px", transform: "translateX(-50%)" },
    { right: "calc(10% + 50px)", top: "30px" },
    { right: "80px", top: "calc(40% + 30px)" },
  ];
  const dp = isMobile ? dpMobile : dpDesktop;
  Object.assign(dBtn.style, dp[state.dealerIdx] || dp[0]);
  table.appendChild(dBtn);

  // Small blind button — attach to seat
  if (state.sbIdx !== undefined && state.sbIdx !== null) {
    const sbSeat = table.querySelector(`.seat-${state.sbIdx}`);
    if (sbSeat) {
      const sbBtn = document.createElement("div");
      sbBtn.className = "blind-btn blind-sb";
      sbBtn.textContent = "SB";
      sbBtn.style.position = "absolute";
      sbBtn.style.top = "-8px";
      sbBtn.style.right = "-4px";
      sbSeat.appendChild(sbBtn);
    }
  }

  // Big blind button — attach to seat
  if (state.bbIdx !== undefined && state.bbIdx !== null) {
    const bbSeat = table.querySelector(`.seat-${state.bbIdx}`);
    if (bbSeat) {
      const bbBtn = document.createElement("div");
      bbBtn.className = "blind-btn blind-bb";
      bbBtn.textContent = "BB";
      bbBtn.style.position = "absolute";
      bbBtn.style.top = "-8px";
      bbBtn.style.right = "-4px";
      bbSeat.appendChild(bbBtn);
    }
  }

  // Community cards with flip animation
  const comm = $("community");
  comm.innerHTML = "";
  for (let i = 0; i < 5; i++) {
    if (i < state.community.length) {
      const el = createCardEl(state.community[i]);
      if (communityGrew && i >= prevCommunityLen) {
        // Newly revealed: flip animation
        el.classList.add("card-flip-in");
        el.style.animationDelay = `${(i - prevCommunityLen) * 0.2}s`;
      } else {
        // Already visible: subtle entrance
        el.classList.add("card-dealing");
        el.style.animationDelay = `${i * 0.06}s`;
      }
      comm.appendChild(el);
    } else {
      const ph = document.createElement("div");
      ph.className = "card card-placeholder";
      comm.appendChild(ph);
    }
  }

  // Pot
  $("potAmount").textContent = state.pot;

  // Status
  const phaseNames = {
    idle: "等待",
    preflop: "翻牌前",
    flop: "翻牌",
    turn: "转牌",
    river: "河牌",
    showdown: "摊牌",
  };
  $("statusBar").innerHTML =
    `<span class="connection-dot ${Net.connected ? "online" : "offline"}"></span>第 ${state.handNum} 手 · ${phaseNames[state.phase] || state.phase}`;

  // Hand rank label
  updateHandLabel(state);
}

function updateHandLabel(state) {
  const label = $("handRankLabel");
  const me = state.players.find((p) => p.id === Net.playerId);
  if (!me || me.folded || !myHand || myHand.length < 2) {
    label.classList.remove("visible");
    return;
  }

  if (state.community.length >= 3) {
    const validCards = [...myHand, ...state.community].filter((c) => c);
    if (validCards.length >= 5) {
      const ev = evaluateHand(validCards);
      label.textContent = ev.name;
      label.classList.add("visible");
    }
  } else if (state.community.length === 0) {
    const r1 = myHand[0]?.rankStr,
      r2 = myHand[1]?.rankStr;
    if (r1 && r2) {
      const suited = myHand[0].suit === myHand[1].suit;
      label.textContent = `${r1}${r2}${suited ? " 同花" : ""}`;
      label.classList.add("visible");
    }
  } else {
    label.classList.remove("visible");
  }
}
