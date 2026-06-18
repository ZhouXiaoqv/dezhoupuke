// ===== BUTTON HANDLERS =====
function getWsUrl() {
  const loc = window.location;
  return `${loc.protocol === "https:" ? "wss:" : "ws:"}//${loc.host}`;
}

$("createRoomBtn").addEventListener("click", async () => {
  const name = getCurrentPlayerName();
  try {
    if (!Net.connected) await Net.connect(getWsUrl());
    if (!Net.playerId) await Net.auth(name);
    Net.send("room:create", { name, gameMode: selectedGameMode });
  } catch {
    showError("无法连接到服务器");
  }
});

$("joinRoomBtn").addEventListener("click", async () => {
  const name = getCurrentPlayerName();
  const code = $("codeInput").value.trim().toUpperCase();
  showError("");
  if (!code) {
    showError("请输入房间号");
    return;
  }
  try {
    if (!Net.connected) await Net.connect(getWsUrl());
    if (!Net.playerId) await Net.auth(name);
    Net.send("room:join", { code, name });
  } catch {
    showError("无法连接到服务器");
  }
});

$("leaveRoomBtn").addEventListener("click", () => {
  // 立即更新UI，不等待服务器响应
  showScreen("lobbyScreen");
  $("table-container").classList.remove("action-active");
  hideActions();
  hideShowHandBar();
  $("actionLogToggle").classList.remove("visible");
  $("actionLogPanel").classList.remove("open");
  $("scoreboardToggle").classList.remove("visible");
  $("scoreboardPanel").classList.remove("open");
  myReady = false;
  $("readyBtn").textContent = "准备";
  $("readyBtn").className = "btn btn-green";
  isSpectator = false;
  $("spectatorBadge").classList.remove("visible");
  toast("已离开房间");
  Net.send("room:leave");
  Net.send("room:list");
});

// Copy room code button
$("copyCodeBtn").addEventListener("click", () => {
  const code = $("roomCodeDisplay").textContent;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(() => {
      const btn = $("copyCodeBtn");
      btn.textContent = "✅ 已复制";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = "📋 复制房间号";
        btn.classList.remove("copied");
      }, 2000);
    });
  } else {
    // Fallback for older browsers
    const input = document.createElement("input");
    input.value = code;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
    toast("房间号已复制");
  }
});

// Share button (Web Share API for mobile)
$("shareBtn").addEventListener("click", async () => {
  const code = $("roomCodeDisplay").textContent;
  const shareData = {
    title: "德州扑克",
    text: `来玩德州扑克！房间号: ${code}`,
    url: window.location.href,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (err) {
      // User cancelled or error
      if (err.name !== "AbortError") toast("分享失败");
    }
  } else {
    // Fallback: copy to clipboard
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`来玩德州扑克！房间号: ${code}`);
      toast("邀请信息已复制，去粘贴分享吧");
    } else {
      toast("请手动复制房间号: " + code);
    }
  }
});
// Ready toggle — tracks ready state and toggles
let myReady = false;
$("readyBtn").addEventListener("click", () => {
  myReady = !myReady;
  Net.send("room:ready", { ready: myReady });
  $("readyBtn").textContent = myReady ? "取消准备" : "准备";
  $("readyBtn").className = myReady ? "btn btn-red" : "btn btn-green";
  // 立即更新自己的玩家卡片状态
  const myCard = document.querySelector(".room-player-card:last-child");
  if (myCard) {
    if (myReady) {
      myCard.classList.add("ready");
      const badge = myCard.querySelector(".rp-badge");
      if (badge) {
        badge.className = "rp-badge ready-badge";
        badge.textContent = "✓ 已准备";
      }
    } else {
      myCard.classList.remove("ready");
      const badge = myCard.querySelector(".rp-badge");
      if (badge) {
        badge.className = "rp-badge";
        badge.textContent = "等待中";
      }
    }
  }
});
$("startGameBtn").addEventListener("click", () => Net.send("room:start"));

// Game actions with sound feedback
// ===== TURN TIMER =====
let timerInterval = null;
const TIMER_CIRCUMFERENCE = 125.66;

function startTurnTimer(timeLimit) {
  stopTurnTimer();
  const timer = $("turnTimer");
  const fg = $("timerFg");
  const num = $("timerNum");
  if (!timer || !fg || !num) return;
  timer.classList.add("active");
  let remaining = timeLimit || 45;
  num.textContent = remaining;
  fg.style.strokeDashoffset = "0";
  fg.classList.remove("warn");
  num.classList.remove("warn");
  timerInterval = setInterval(() => {
    remaining--;
    if (remaining < 0) remaining = 0;
    num.textContent = remaining;
    const offset =
      TIMER_CIRCUMFERENCE * (1 - remaining / (timeLimit || 45));
    fg.style.strokeDashoffset = offset;
    if (remaining <= 5) {
      fg.classList.add("warn");
      num.classList.add("warn");
      if (remaining <= 3 && typeof SFX !== "undefined") SFX.yourTurn();
    }
    if (remaining <= 0) {
      stopTurnTimer();
      if ($("actionPanel").classList.contains("active")) {
        toast("超时自动弃牌");
        $("btnFold").click();
      }
    }
  }, 1000);
}

function stopTurnTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const timer = $("turnTimer");
  if (timer) timer.classList.remove("active");
}

// ===== SETTLEMENT OVERLAY =====
function showSettlement(winners) {
  const overlay = $("settlementOverlay");
  if (!overlay || !winners || winners.length === 0) return;
  const w = winners[0];
  $("settlementWinner").textContent = w.name || "";
  $("settlementHand").textContent = w.hand || "";
  $("settlementAmount").textContent = "+" + (w.amount || 0);
  overlay.classList.add("active");
  setTimeout(() => overlay.classList.remove("active"), 8000);
}
$("settlementClose").addEventListener("click", () => {
  $("settlementOverlay").classList.remove("active");
});

// ===== SHOW HAND CHOICE BAR =====
let showHandCountdown = null;
function showShowHandBar(timeout) {
  const bar = $("showHandBar");
  if (!bar) return;
  hideShowHandBar();
  bar.classList.add("active");
  let remaining = timeout || 8;
  const text = $("showHandText");
  if (text) text.textContent = "要展示手牌吗? " + remaining + "s";
  showHandCountdown = setInterval(() => {
    remaining--;
    if (text) {
      text.textContent =
        remaining > 0 ? "要展示手牌吗? " + remaining + "s" : "默认不展示...";
    }
    if (remaining <= 0) hideShowHandBar();
  }, 1000);
}
function hideShowHandBar() {
  if (showHandCountdown) {
    clearInterval(showHandCountdown);
    showHandCountdown = null;
  }
  const bar = $("showHandBar");
  if (bar) bar.classList.remove("active");
}
$("showHandYes").addEventListener("click", () => {
  hideShowHandBar();
  SFX.btnClick();
  Net.send("game:showHand", { show: true });
});
$("showHandNo").addEventListener("click", () => {
  hideShowHandBar();
  SFX.btnClick();
  Net.send("game:showHand", { show: false });
});

// ===== NEXT HAND BAR =====
let nextHandCountdown = null;
function showNextHandBar(delay) {
  const bar = $("nextHandBar");
  if (!bar) return;
  bar.classList.add("active");
  let remaining = delay;
  $("nextHandText").textContent = "下一手 " + remaining + "s";
  nextHandCountdown = setInterval(() => {
    remaining--;
    $("nextHandText").textContent =
      remaining > 0 ? "下一手 " + remaining + "s" : "开始中...";
    if (remaining <= 0) {
      clearInterval(nextHandCountdown);
      nextHandCountdown = null;
      bar.classList.remove("active");
    }
  }, 1000);
}
function hideNextHandBar() {
  if (nextHandCountdown) {
    clearInterval(nextHandCountdown);
    nextHandCountdown = null;
  }
  const bar = $("nextHandBar");
  if (bar) bar.classList.remove("active");
}
$("nextHandSkip").addEventListener("click", () => {
  hideNextHandBar();
  Net.send("game:nextHand", {});
});

// ===== PRESET RAISE BUTTONS =====
window.addEventListener("resize", () =>
  requestAnimationFrame(syncActionPanelOffset),
);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () =>
    requestAnimationFrame(syncActionPanelOffset),
  );
}

(function () {
  const presets = document.getElementById("raisePresets");
  if (!presets) return;
  presets.addEventListener("click", (e) => {
    const btn = e.target.closest(".raise-preset-btn");
    if (!btn) return;
    const amount = btn.dataset.amount;
    if (amount === "allin") {
      $("btnAllin").click();
    } else if (amount === "custom") {
      // Show custom input field (triggers keyboard on mobile)
      const customInput = $("customRaiseInput");
      if (customInput) {
        const isShowing = customInput.style.display === "flex";
        customInput.style.display = isShowing ? "none" : "flex";
        requestAnimationFrame(() =>
          requestAnimationFrame(syncActionPanelOffset),
        );
        if (!isShowing) {
          const inp = $("customRaiseAmount");
          if (inp) {
            inp.value = "";
            inp.focus();
          }
        }
      }
    } else {
      const val = parseInt(amount);
      if (!isNaN(val)) {
        hideActions();
        SFX.btnClick();
        Net.send("game:action", { action: "raise", amount: val });
      }
    }
  });
})();

// Custom raise confirm button
if ($("customRaiseConfirm")) {
  $("customRaiseConfirm").addEventListener("click", (e) => {
    const inp = $("customRaiseAmount");
    if (!inp) return;
    const val = parseInt(inp.value, 10);
    const minRaise = parseInt(inp.min || "0", 10);
    const maxRaise = parseInt(inp.max || "0", 10);
    if (isNaN(val) || val <= 0) {
      toast("请输入有效金额");
      inp.focus();
      return;
    }
    if (val < minRaise || (maxRaise > 0 && val > maxRaise)) {
      toast(`请输入 ${minRaise}${maxRaise > 0 ? " - " + maxRaise : ""} 之间的金额`);
      inp.focus();
      return;
    }
    hideActions();
    SFX.btnClick();
    Net.send("game:action", { action: "raise", amount: val });
  });
}

$("btnFold").addEventListener("click", () => {
  hideActions();
  SFX.btnClick();
  Net.send("game:action", { action: "fold" });
});
$("btnCheck").addEventListener("click", () => {
  hideActions();
  SFX.btnClick();
  Net.send("game:action", { action: "check" });
});
$("btnCall").addEventListener("click", () => {
  hideActions();
  SFX.btnClick();
  const mySeat = getMySeatEl();
  if (mySeat) {
    spawnChipFly(mySeat, "#d4a840");
    spawnChipFly(mySeat, "#cc3333");
  }
  Net.send("game:action", { action: "call" });
});
$("btnAllin").addEventListener("click", () => {
  hideActions();
  SFX.btnClick();
  const mySeat = getMySeatEl();
  if (mySeat)
    for (let i = 0; i < 8; i++)
      setTimeout(() => spawnChipFly(mySeat), i * 80);
  Net.send("game:action", { action: "allin" });
});
$("btnRaise").addEventListener("click", () => {
  const amount = parseInt($("raiseRange").value);
  hideActions();
  SFX.btnClick();
  const mySeat = getMySeatEl();
  if (mySeat) {
    spawnChipFly(mySeat, "#d4a840");
    spawnChipFly(mySeat);
    setTimeout(() => spawnChipFly(mySeat), 100);
  }
  Net.send("game:action", { action: "raise", amount });
});
$("raiseRange").addEventListener("input", (e) => {
  $("raiseValue").textContent = e.target.value;
});

// ===== SPECTATE BUTTON =====
let isSpectator = false;

$("spectateLink").addEventListener("click", async (e) => {
  e.preventDefault();
  const name = getCurrentPlayerName("观众");
  const code = $("codeInput").value.trim().toUpperCase();
  showError("");
  if (!code) {
    showError("请输入房间号");
    return;
  }
  try {
    if (!Net.connected) await Net.connect(getWsUrl());
    if (!Net.playerId) await Net.auth(name);
    Net.send("room:spectate", { code, name });
  } catch {
    showError("无法连接到服务器");
  }
});

// ===== CREATE ROOM SCREEN NAVIGATION =====
(function () {
  function navigateToCreateScreen(autoLoadRooms) {
    showScreen("createRoomScreen");
    if (autoLoadRooms && Net.connected) {
      Net.send("room:list");
      toast("加载公开房间...");
    }
  }

  const cardLobby = document.getElementById("cardLobby");
  const cardCreate = document.getElementById("cardCreate");

  if (cardLobby) {
    cardLobby.addEventListener("click", () =>
      navigateToCreateScreen(true),
    );
  }
  if (cardCreate) {
    cardCreate.addEventListener("click", () =>
      navigateToCreateScreen(false),
    );
  }

  // Back button
  const backBtn = document.getElementById("createBackBtn");
  if (backBtn) {
    backBtn.addEventListener("click", () => showScreen("lobbyScreen"));
  }
})();

// ===== GAME EXIT BUTTON =====
(function () {
  const exitBtn = document.getElementById("gameExitBtn");
  if (exitBtn) {
    exitBtn.addEventListener("click", () => {
      if (confirm("确定退出当前游戏？")) {
        Net.send("room:leave");
      }
    });
  }
})();

// Refresh room list button
$("refreshRoomList").addEventListener("click", () => {
  if (Net.connected) {
    Net.send("room:list");
    toast("刷新中...");
  }
});

// ===== LEADERBOARD =====
$("leaderboardBtn").addEventListener("click", () => {
  $("leaderboardOverlay").classList.add("active");
  Net.send("stats:get", { sortBy: "totalWon" });
});

$("lbClose").addEventListener("click", () => {
  $("leaderboardOverlay").classList.remove("active");
});

document.querySelectorAll(".lb-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".lb-tab")
      .forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    Net.send("stats:get", { sortBy: tab.dataset.sort });
  });
});

Net.on("stats:leaderboard", (d) => {
  const body = $("lbBody");
  const empty = $("lbEmpty");
  if (!d.leaderboard || d.leaderboard.length === 0) {
    body.innerHTML = "";
    empty.style.display = "";
    return;
  }
  empty.style.display = "none";
  body.innerHTML = d.leaderboard
    .map((p) => {
      const rankClass =
        p.rank === 1
          ? "gold"
          : p.rank === 2
            ? "silver"
            : p.rank === 3
              ? "bronze"
              : "";
      const medal =
        p.rank === 1
          ? "🥇"
          : p.rank === 2
            ? "🥈"
            : p.rank === 3
              ? "🥉"
              : p.rank;
      return `<tr>
<td class="lb-rank ${rankClass}">${medal}</td>
<td class="lb-name">${p.name}</td>
<td class="lb-num">${p.handsPlayed}</td>
<td class="lb-num">${p.handsWon}</td>
<td class="lb-num">${p.winRate}%</td>
<td class="lb-highlight">${p.totalWon > 0 ? "+" : ""}${p.totalWon}</td>
<td style="color:var(--dim);font-size:12px">${p.bestHand}</td>
    </tr>`;
    })
    .join("");
});

// Close leaderboard on escape
document.addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" &&
    $("leaderboardOverlay").classList.contains("active")
  ) {
    $("leaderboardOverlay").classList.remove("active");
  }
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (!$("actionPanel").classList.contains("active")) return;
  if (e.key === "f") $("btnFold").click();
  if (e.key === "c") {
    if ($("btnCheck").style.display !== "none") $("btnCheck").click();
    else $("btnCall").click();
  }
  if (e.key === "r") $("btnRaise").click();
  if (e.key === "a") $("btnAllin").click();
});

// Game mode selector
document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".mode-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedGameMode = btn.dataset.mode;
    $("modeDesc").textContent = MODE_DESCS[selectedGameMode] || "";
  });
});

// How to play button
$("howToPlayBtn").addEventListener("click", () => {
  $("introOverlay").classList.add("active");
});
$("introClose").addEventListener("click", () => {
  $("introOverlay").classList.remove("active");
});
