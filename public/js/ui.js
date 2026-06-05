// ===== USER SYSTEM =====
let authToken = localStorage.getItem("poker_token") || null;
let userProfile = null;
let isRegistered = false;
let selectedGameMode = "classic";
let restoreInFlight = null;
let appInBackground = false;
let logoutUser = () => {};

const MODE_DESCS = {
  classic: "经典德州扑克，标准盲注",
  turbo: "🔥 急速模式 — 更高盲注，更少筹码，节奏更快",
  shortdeck: "🃏 短牌模式 — 去掉2-5，只有6-A共36张牌",
  highroller: "💎 高额模式 — 盲注50/100，起始筹码10000",
  allinfold: "⚡ All-in/Fold — 只能全押或弃牌，没有中间选项",
};

// ===== PLAYER VISUAL CONSTANTS =====
const PLAYER_COLORS = [
  "#4fc3f7",
  "#ff7043",
  "#66bb6a",
  "#ffd54f",
  "#ab47bc",
  "#26c6da",
];
const PLAYER_AVATARS = ["🦊", "🐯", "🐻", "🦅", "🐬", "🦁"];

// ===== UI HELPERS =====
function $(id) {
  return document.getElementById(id);
}
function showScreen(id) {
  const shouldKeepActionOffset =
    id === "table" && $("actionPanel")?.classList.contains("active");
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  $("table-container").classList.remove("active", "action-active");
  if (id === "table") {
    $("table-container").classList.add("active");
    if (shouldKeepActionOffset) {
      $("table-container").classList.add("action-active");
      requestAnimationFrame(syncActionPanelOffset);
    }
  } else {
    $(id).classList.add("active");
  }
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

function showError(msg) {
  const le = $("lobbyError");
  if (le) le.textContent = msg;
  const ce = $("createScreenError");
  if (ce) ce.textContent = msg;
}

function getCurrentPlayerName(fallback = "玩家") {
  return (
    (userProfile && userProfile.username) || Net.playerName || fallback
  );
}

function updateLobbyVisibility() {
  const loggedIn = !!(isRegistered && userProfile);
  const userArea = $("userArea");
  const topBar = $("lobbyTopBar");
  const authSection = $("authSection");
  const actionGrid = $("actionGrid");
  const joinBar = $("joinBar");
  if (userArea) userArea.style.display = loggedIn ? "" : "none";
  if (topBar) topBar.style.display = loggedIn ? "" : "none";
  if (authSection) authSection.style.display = loggedIn ? "none" : "";
  if (actionGrid) actionGrid.style.display = loggedIn ? "" : "none";
  if (joinBar) joinBar.style.display = loggedIn ? "flex" : "none";
}

// Auth tabs
document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".auth-tab")
      .forEach((t) => t.classList.remove("active"));
    document
      .querySelectorAll(".auth-form")
      .forEach((f) => f.classList.remove("active"));
    tab.classList.add("active");
    const formId = tab.dataset.tab + "Form";
    const form = $(formId);
    if (form) form.classList.add("active");
  });
});

// Login handler
$("loginBtn").addEventListener("click", async () => {
  const username = $("loginUser").value.trim();
  const password = $("loginPass").value;
  if (!username || !password) {
    showError("请输入用户名和密码");
    return;
  }
  try {
    if (!Net.connected) await Net.connect(getWsUrl());
    Net.send("user:login", { username, password });
  } catch {
    showError("无法连接到服务器");
  }
});

// Register handler
$("registerBtn").addEventListener("click", async () => {
  const username = $("regUser").value.trim();
  const password = $("regPass").value;
  if (!username) {
    showError("请输入用户名");
    return;
  }
  if (!password || password.length < 4) {
    showError("密码至少4个字符");
    return;
  }
  try {
    if (!Net.connected) await Net.connect(getWsUrl());
    Net.send("user:register", { username, password });
  } catch {
    showError("无法连接到服务器");
  }
});
