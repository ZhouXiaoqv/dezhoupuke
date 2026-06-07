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
  { id: "pattern-stripes", price: 400 },
  { id: "pattern-blocks", price: 400 },
  { id: "pattern-checker", price: 400 },
  { id: "pattern-star", price: 400 },
  { id: "pattern-burst", price: 400 },
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
  if (!cardBackId.startsWith("flag-")) return;

  const face = document.createElement("div");
  face.className = "flag-face flag-face-" + cardBackId.slice(5);
  el.appendChild(face);

  if (cardBackId === "flag-us") addUsFlagStars(face);
  if (cardBackId === "flag-cn") addChinaFlagStars(face);
}

function addUsFlagStars(face) {
  for (let row = 0; row < 9; row++) {
    const count = row % 2 === 0 ? 6 : 5;
    for (let col = 0; col < count; col++) {
      const star = document.createElement("span");
      star.className = "flag-star flag-star-us";
      const x =
        count === 6
          ? ((col + 0.5) / 6) * 40
          : ((col + 1) / 6) * 40;
      const y = ((row + 0.5) / 9) * (7 / 13) * 100;
      star.style.left = x + "%";
      star.style.top = y + "%";
      face.appendChild(star);
    }
  }
}

function addChinaFlagStars(face) {
  const stars = [
    { size: "large", x: 100 / 15, y: 10, rotate: 0 },
    { size: "small", x: 400 / 15, y: 20, rotate: -22.5 },
    { size: "small", x: 600 / 15, y: 40, rotate: -45 },
    { size: "small", x: 700 / 15, y: 70, rotate: -67.5 },
    { size: "small", x: 800 / 15, y: 90, rotate: -90 },
  ];
  stars.forEach((cfg) => {
    const star = document.createElement("span");
    star.className = "flag-star flag-star-cn " + cfg.size;
    star.style.left = cfg.x + "%";
    star.style.top = cfg.y + "%";
    star.style.transform =
      "translate(-50%, -50%) rotate(" + cfg.rotate + "deg)";
    face.appendChild(star);
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
