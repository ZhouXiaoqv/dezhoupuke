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

const DEFAULT_CARD_BACK = "default-blue";
const CARD_BACK_SHOP = [
  { id: "solid-white", price: 200 },
  { id: "solid-purple", price: 200 },
  { id: "solid-pink", price: 200 },
  { id: "solid-yellow", price: 200 },
  { id: "solid-magenta", price: 200 },
  { id: "solid-black", price: 200 },
  { id: "solid-beige", price: 200 },
  { id: "flag-us", price: 600 },
  { id: "flag-cn", price: 600 },
  { id: "flag-jp", price: 600 },
  { id: "flag-uk", price: 600 },
  { id: "flag-br", price: 600 },
  { id: "flag-ru", price: 600 },
  { id: "flag-fr", price: 600 },
  { id: "flag-de", price: 600 },
  { id: "pattern-diagonal-pop", price: 400 },
  { id: "pattern-diagonal-lime", price: 400 },
  { id: "pattern-vertical-candy", price: 400 },
  { id: "pattern-vertical-ocean", price: 400 },
  { id: "pattern-diagonal-peach", price: 400 },
  { id: "pattern-diagonal-coral", price: 400 },
  { id: "pattern-vertical-electric", price: 400 },
  { id: "pattern-vertical-caramel", price: 400 },
  { id: "pattern-night-stars", price: 400 },
  { id: "pattern-geo-party", price: 400 },
  { id: "pattern-geo-retro", price: 400 },
  { id: "pattern-checker-beige", price: 400 },
  { id: "pattern-checker-red", price: 400 },
  { id: "pattern-checker-brick", price: 400 },
  { id: "pattern-checker-lava", price: 400 },
  { id: "pattern-checker-peach", price: 400 },
  { id: "pattern-checker-coral", price: 400 },
  { id: "pattern-checker-electric", price: 400 },
  { id: "pattern-checker-caramel", price: 400 },
  { id: "pattern-checker-classic-beige", price: 400 },
  { id: "pattern-checker-classic-red", price: 400 },
];
const CARD_BACK_CATALOG = [
  { id: DEFAULT_CARD_BACK, price: 0 },
  ...CARD_BACK_SHOP,
];

function getCardBackDef(id) {
  return (
    CARD_BACK_CATALOG.find((item) => item.id === id) ||
    CARD_BACK_CATALOG[0]
  );
}

function getOwnedCardBacks(profile = userProfile) {
  const owned = Array.isArray(profile?.ownedCardBacks)
    ? profile.ownedCardBacks
    : [];
  return [...new Set([DEFAULT_CARD_BACK, ...owned])].filter((id) =>
    CARD_BACK_CATALOG.some((item) => item.id === id),
  );
}

function getEquippedCardBack(profile = userProfile) {
  const equipped = profile?.equippedCardBack || DEFAULT_CARD_BACK;
  return getOwnedCardBacks(profile).includes(equipped)
    ? equipped
    : DEFAULT_CARD_BACK;
}

function getCardBackClass(id) {
  return "card-back-" + getCardBackDef(id).id;
}

function createCardBackPreview(id) {
  const el = document.createElement("div");
  el.className = "card-back-preview card-back " + getCardBackClass(id);
  el.dataset.cardBack = getCardBackDef(id).id;
  decorateCardBack(el, id);
  return el;
}

function decorateCardBack(el, id) {
  const cardBackId = getCardBackDef(id).id;
  if (cardBackId.startsWith("flag-")) {
    const face = document.createElement("div");
    face.className = "flag-face flag-face-" + cardBackId.slice(5);
    el.appendChild(face);
  }
  if (cardBackId === "pattern-night-stars") {
    addPatternShapes(el, [
      ["star", 20, 22, 18],
      ["star", 64, 18, 12],
      ["star", 78, 42, 15],
      ["star", 36, 57, 11],
      ["star", 60, 72, 18],
    ]);
  }
  if (cardBackId === "pattern-geo-party") {
    addPatternShapes(el, [
      ["circle", 18, 22, 22],
      ["triangle", 68, 18, 24],
      ["square", 42, 48, 20],
      ["circle", 78, 66, 18],
      ["triangle", 24, 76, 20],
    ]);
  }
  if (cardBackId === "pattern-geo-retro") {
    addPatternShapes(el, [
      ["square", 18, 20, 24],
      ["circle", 72, 26, 20],
      ["triangle", 48, 48, 26],
      ["square", 76, 72, 18],
      ["circle", 24, 76, 18],
    ]);
  }
}

function addPatternShapes(el, shapes) {
  shapes.forEach(([type, x, y, size], index) => {
    const shape = document.createElement("span");
    shape.className = "pattern-shape pattern-shape-" + type;
    shape.style.left = x + "%";
    shape.style.top = y + "%";
    shape.style.width = size + "%";
    shape.style.setProperty("--shape-index", index);
    el.appendChild(shape);
  });
}

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
