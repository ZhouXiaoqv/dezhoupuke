// ===== NETWORK EVENT HANDLERS =====
Net.on("room:created", (d) => {
  roomCode = d.code;
  $("roomCodeDisplay").textContent = d.code;
  showScreen("roomScreen");
  toast("?????");
});

Net.on("room:joined", (d) => {
  roomCode = d.code;
  $("roomCodeDisplay").textContent = d.code;
  isSpectator = !!d.isSpectator;
  myReady = false;
  $("readyBtn").textContent = "准备";
  $("readyBtn").className = "btn btn-green";
  if (isSpectator) {
    showScreen("table");
    $("spectatorBadge").classList.add("visible");
  } else {
    showScreen("roomScreen");
  }
  toast(isSpectator ? "已进入观战模式" : "已加入房间");
});

Net.on("room:state", (d) => {
  roomCode = d.code;
  $("roomCodeDisplay").textContent = d.code;
  isHost = d.hostId === Net.playerId;
  $("scoreboardToggle").classList.toggle("visible", !!d.gameRunning);
});

Net.on("room:players", (d) => {
  const container = $("roomPlayers");
  container.innerHTML = "";
  isHost = d.hostId === Net.playerId;

  for (const p of d.players) {
    const card = document.createElement("div");
    card.className = "room-player-card";
    if (p.id === d.hostId) card.classList.add("host");
    if (p.ready) card.classList.add("ready");

    let badge = "";
    if (p.id === d.hostId)
      badge = '<div class="rp-badge host-badge">👑 房主</div>';
    else if (p.ready)
      badge = '<div class="rp-badge ready-badge">✓ 已准备</div>';
    else badge = '<div class="rp-badge">等待中</div>';

    card.innerHTML = `
<div class="rp-name">${p.avatar || "🦊"} ${p.name}${p.id === Net.playerId ? " (你)" : ""}</div>
<div class="rp-stack">${p.stack}</div>
${badge}
    `;
    container.appendChild(card);
  }

  // Show spectators
  if (d.spectators && d.spectators.length > 0) {
    const specLabel = document.createElement("div");
    specLabel.style.cssText =
      "width:100%;text-align:center;font-size:11px;color:var(--gold-dim);margin-top:8px;letter-spacing:1px";
    specLabel.textContent = `👁 ${d.spectators.length} 人观战: ${d.spectators.map((s) => s.name).join(", ")}`;
    container.appendChild(specLabel);
  }

  $("startGameBtn").style.display = isHost ? "" : "none";
});
Net.on("room:scoreboard", (d) => {
  renderScoreboard(d.scores || []);
});

Net.on("room:playerJoined", () => toast("新玩家加入"));
Net.on("room:playerLeft", (d) => toast(`${d.name} 离开了`));
Net.on("room:playerDisconnected", (d) => toast(`${d.name} 断开连接`));
Net.on("room:hostChanged", (d) => {
  isHost = d.hostId === Net.playerId;
  $("startGameBtn").style.display = isHost ? "" : "none";
  if (isHost) toast("你成为了房主");
});

Net.on("room:gameStarted", () => {
  showScreen("table");
  hideActions();
  $("scoreboardToggle").classList.add("visible");
  if (isSpectator) $("spectatorBadge").classList.add("visible");
});

Net.on("room:list", (d) => {
  const list = $("publicRoomList");
  if (!list) return;

  if (d.rooms.length === 0) {
    list.innerHTML =
      '<div class="room-list-empty">暂无公开房间，创建一个吧</div>';
    return;
  }

  list.innerHTML = "";
  for (const r of d.rooms) {
    const card = document.createElement("div");
    card.className = "room-card";

    const statusClass = r.gameRunning ? "playing" : "waiting";
    const statusText = r.gameRunning ? "🎮 游戏中" : "⏳ 等待中";
    const modeLabel = {
      classic: "",
      turbo: "🔥急速",
      shortdeck: "🃏短牌",
      highroller: "💎高额",
      allinfold: "⚡All-in/Fold",
    };
    const modeClass = "mode-" + (r.gameMode || "classic");
    const modeBadge =
      r.gameMode && r.gameMode !== "classic"
        ? '<span class="game-mode-badge ' +
          modeClass +
          '">' +
          (modeLabel[r.gameMode] || "") +
          "</span>"
        : "";

    card.innerHTML = `
<div class="room-card-left">
  <div class="room-card-code">${r.code} ${modeBadge}</div>
  <div class="room-card-host">房主: ${r.hostName}</div>
</div>
<div class="room-card-right">
  <div class="room-card-players">${r.playerCount}/${r.maxPlayers}</div>
  <div class="room-card-status ${statusClass}">${statusText}</div>
</div>
    `;

    card.addEventListener("click", async () => {
      const name = getCurrentPlayerName();
      try {
        if (!Net.connected) await Net.connect(getWsUrl());
        if (!Net.playerId) await Net.auth(name);
        Net.send("room:join", { code: r.code, name });
        toast(`正在加入 ${r.code}...`);
      } catch {
        showError("无法连接到服务器");
      }
    });
    list.appendChild(card);
  }
});

// Auto-refresh room list every 5 seconds when on lobby screen
let roomListRefreshInterval = null;
function startRoomListRefresh() {
  if (roomListRefreshInterval) clearInterval(roomListRefreshInterval);
  roomListRefreshInterval = setInterval(() => {
    if (Net.connected && $("lobbyScreen").classList.contains("active")) {
      Net.send("room:list");
    }
  }, 5000);
}
function stopRoomListRefresh() {
  if (roomListRefreshInterval) {
    clearInterval(roomListRefreshInterval);
    roomListRefreshInterval = null;
  }
}

Net.on("room:error", (d) => {
  showError(d.message);
  toast(d.message);
});
Net.on("room:left", () => {
  $("actionLogToggle").classList.remove("visible");
  $("actionLogPanel").classList.remove("open");
  $("scoreboardToggle").classList.remove("visible");
  $("scoreboardPanel").classList.remove("open");
  myReady = false;
  $("readyBtn").textContent = "准备";
  $("readyBtn").className = "btn btn-green";
  showScreen("lobbyScreen");
  isSpectator = false;
  $("spectatorBadge").classList.remove("visible");
  Net.send("room:list");
  toast("已离开房间");
});
Net.on("room:destroyed", () => {
  $("actionLogToggle").classList.remove("visible");
  $("actionLogPanel").classList.remove("open");
  $("scoreboardToggle").classList.remove("visible");
  $("scoreboardPanel").classList.remove("open");
  myReady = false;
  $("readyBtn").textContent = "准备";
  $("readyBtn").className = "btn btn-green";
  showScreen("lobbyScreen");
  toast("房间已解散");
});

Net.on("game:state", (state) => renderGame(state));
Net.on("game:actionLog", (entry) => handleActionLog(entry));

Net.on("game:yourTurn", (d) => {
  if (isSpectator) return;
  if (d.playerId !== Net.playerId) return;
  lastTurnActionData = d;
  showActions(d);
  SFX.yourTurn();
  if (navigator.vibrate) navigator.vibrate(100);
});

Net.on("game:handStart", (d) => {
  lastTurnActionData = null;
  hideActions();
  hideShowHandBar();
  toast(`第 ${d.handNum} 手开始`);
  // Deal sounds staggered
  for (let i = 0; i < 4; i++) setTimeout(() => SFX.deal(), i * 120);
  // Reset tracking
  prevPhase = "";
  prevCommunityLen = 0;
  prevPot = 0;
  prevActions = {};
  prevMyHandIds = null;
  window._prevOtherHands = {};
  // Action log
  clearActionLog();
  $("actionLogToggle").classList.add("visible");
  $("scoreboardToggle").classList.add("visible");
});

Net.on("game:showdown", (d) => {
  lastTurnActionData = null;
  hideActions();
  hideShowHandBar();
  const winners = d.winners
    .map((w) => `${w.name}「${w.hand}」+${w.amount}`)
    .join(", ");
  toast(`摊牌: ${winners}`);
  showLogResult(d.winners);
  // Win celebration particles
  setTimeout(() => {
    for (const w of d.winners) {
      const seatEl = document.querySelector(`.seat.winner .seat-info`);
      if (seatEl) spawnWinParticles(seatEl);
    }
  }, 300);
});

Net.on("game:handEnd", (d) => {
  lastTurnActionData = null;
  hideActions();
  hideShowHandBar();
  hideNextHandBar();
  const winners = d.winners
    .map((w) => `${w.name} +${w.amount}`)
    .join(", ");
  toast(winners ? `本手结束: ${winners}` : "本手结束");
  showLogResult(d.winners);
  const myId = Net.playerId;
  const iWon = d.winners.some((w) => w.id === myId);
  if (iWon) SFX.win();
  else SFX.lose();

  // Show settlement overlay
  if (d.winners.length > 0) {
    showSettlement(d.winners);
    if (iWon) {
      setTimeout(() => {
        const mySeat = document.querySelector(".seat.winner .seat-info");
        if (mySeat) spawnWinParticles(mySeat);
      }, 200);
    }
  }
});

Net.on("game:showHandOption", (d) => {
  if (isSpectator) return;
  if (d.playerId !== Net.playerId) return;
  hideActions();
  showShowHandBar(d.timeout || 8);
  if (navigator.vibrate) navigator.vibrate(60);
});

Net.on("game:handShown", (d) => {
  toast(`${d.name || "玩家"} 展示了手牌`);
});

Net.on("game:waitingForNext", (d) => {
  hideShowHandBar();
  $("settlementOverlay").classList.remove("active");
  showNextHandBar(d.nextHandDelay || 15);
});

Net.on("error", (d) => toast(d.message));
Net.on("disconnect", () => {
  $("connDot").className = "connection-dot offline";
  if (!appInBackground) {
    toast("??????????????..");
  }
  attemptReconnect();
});

// User system handlers
Net.on("user:registered", (d) => {
  authToken = d.token;
  userProfile = d.profile;
  isRegistered = true;
  localStorage.setItem("poker_token", d.token);
  Net.playerId = d.playerId;
  Net.playerName = d.username;
  updateUserArea();
  showAvatarBtn(true);
  Net.send("room:list");
  startRoomListRefresh();
  toast("注册成功！欢迎 " + d.username);
});

Net.on("user:loggedIn", (d) => {
  authToken = d.token;
  userProfile = d.profile;
  isRegistered = true;
  localStorage.setItem("poker_token", d.token);
  Net.playerId = d.playerId;
  Net.playerName = d.username;
  updateUserArea();
  showAvatarBtn(true);
  Net.send("room:list");
  startRoomListRefresh();
  toast("登录成功！欢迎回来 " + d.username);
});

Net.on("user:profile", (d) => {
  userProfile = d.profile;
  renderProfile(d.profile);
});

Net.on("user:error", (d) => {
  showError(d.message);
  toast(d.message);
});

Net.on("user:achievement", (d) => {
  showAchievementToast(d.achievement);
  // Update profile if loaded
  if (userProfile) {
    userProfile.achievements.push(d.achievement);
  }
});

function updateUserArea() {
  const area = $("userArea");
  if (!area) return;
  if (isRegistered && userProfile) {
    area.innerHTML =
      '<div class="user-panel"><div class="user-badge" id="userBadgeClick"><span class="user-icon">👤</span>' +
      userProfile.username +
      " · " +
      userProfile.stats.handsWon +
      '胜</div><button class="logout-btn" id="logoutBtn" type="button">登出</button></div>';
    $("userBadgeClick").addEventListener("click", () => {
      $("profileOverlay").classList.add("active");
      Net.send("user:profile");
    });
    $("logoutBtn").addEventListener("click", () => {
      logoutUser();
    });
  } else {
    area.innerHTML = "";
  }
  updateLobbyVisibility();
}

function renderProfile(profile) {
  const s = profile.stats;
  $("profileStats").innerHTML = `
    <div class="stat-card"><div class="stat-value">${s.handsPlayed}</div><div class="stat-label">总场次</div></div>
    <div class="stat-card"><div class="stat-value">${s.handsWon}</div><div class="stat-label">胜场</div></div>
    <div class="stat-card"><div class="stat-value">${s.handsPlayed > 0 ? Math.round((s.handsWon / s.handsPlayed) * 100) : 0}%</div><div class="stat-label">胜率</div></div>
    <div class="stat-card"><div class="stat-value">${s.totalWon > 0 ? "+" : ""}${s.totalWon}</div><div class="stat-label">总盈利</div></div>
    <div class="stat-card"><div class="stat-value">${s.biggestPot}</div><div class="stat-label">最大底池</div></div>
    <div class="stat-card"><div class="stat-value">${s.bestHand || "-"}</div><div class="stat-label">最佳牌型</div></div>
  `;

  const ACHIEVEMENTS = {
    first_win: { name: "初次胜利", desc: "赢得第一手牌", icon: "🏆" },
    ten_wins: { name: "十胜将军", desc: "累计赢得10手牌", icon: "🎖️" },
    fifty_wins: { name: "半百英雄", desc: "累计赢得50手牌", icon: "⭐" },
    hundred_wins: {
      name: "百战百胜",
      desc: "累计赢得100手牌",
      icon: "💎",
    },
    royal_flush: { name: "皇家降临", desc: "获得皇家同花顺", icon: "👑" },
    straight_flush: { name: "同花顺子", desc: "获得同花顺", icon: "🌟" },
    four_kind: { name: "四条天王", desc: "获得四条", icon: "🔥" },
    full_house: { name: "葫芦娃", desc: "获得葫芦", icon: "🏠" },
    flush: { name: "同花达人", desc: "获得同花", icon: "♠" },
    all_in_5: { name: "全押狂人", desc: "累计All-in 5次", icon: "💰" },
    all_in_20: { name: "赌神附体", desc: "累计All-in 20次", icon: "🎰" },
    big_pot: { name: "大赢家", desc: "赢得超过500的底池", icon: "💵" },
    huge_pot: {
      name: "超级赢家",
      desc: "赢得超过2000的底池",
      icon: "🤑",
    },
    play_50: { name: "身经百战", desc: "累计打满50手牌", icon: "📊" },
    play_200: { name: "牌桌老手", desc: "累计打满200手牌", icon: "🎓" },
    win_streak_3: { name: "三连胜", desc: "连续赢得3手牌", icon: "🔥" },
    win_streak_5: { name: "五连胜", desc: "连续赢得5手牌", icon: "⚡" },
    comeback: {
      name: "绝地翻盘",
      desc: "筹码低于500时赢回超过1000",
      icon: "🔄",
    },
    bluff_master: {
      name: "诈唬大师",
      desc: "用高牌赢下一手",
      icon: "🎭",
    },
    first_game: { name: "初入江湖", desc: "完成第一局游戏", icon: "🃏" },
  };

  const unlockedIds = new Set(profile.achievements.map((a) => a.id));
  let html = "";
  for (const [id, ach] of Object.entries(ACHIEVEMENTS)) {
    const unlocked = unlockedIds.has(id);
    html +=
      '<div class="achievement-card ' +
      (unlocked ? "unlocked" : "locked") +
      '"><div class="achievement-icon">' +
      ach.icon +
      '</div><div class="achievement-name">' +
      ach.name +
      '</div><div class="achievement-desc">' +
      ach.desc +
      "</div></div>";
  }
  $("achievementsGrid").innerHTML = html;
}

function showAchievementToast(ach) {
  const toast = document.createElement("div");
  toast.className = "achievement-toast";
  toast.innerHTML =
    '<div class="achieve-toast-label">🏅 成就解锁</div><div class="achieve-toast-name">' +
    (ach.icon || "") +
    " " +
    ach.name +
    '</div><div class="achieve-toast-desc">' +
    ach.desc +
    "</div>";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}

// ===== RECONNECT =====
// attemptReconnect is defined in app.js (uses token-based session restore)
