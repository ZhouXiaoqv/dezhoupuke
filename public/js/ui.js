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

const EMOTION_CATALOG = [
  {
    id: "coffee",
    emoji: "\u2615",
    label: "\u5496\u5561",
    animationSlug: "coffee",
    cost: 10,
    charmDelta: 2,
  },
  {
    id: "rose",
    emoji: "\ud83c\udf39",
    label: "\u73ab\u7470\u82b1",
    animationSlug: "rose",
    cost: 5,
    charmDelta: 1,
  },
  {
    id: "laugh",
    emoji: "\ud83d\ude02",
    label: "\u7b11\u54ed",
    animationSlug: "laugh-cry",
    cost: 0,
    charmDelta: 0,
    unlimited: true,
  },
  {
    id: "egg",
    emoji: "\ud83e\udd5a",
    label: "\u9e21\u86cb",
    animationSlug: "egg",
    cost: 5,
    charmDelta: -1,
  },
  {
    id: "slipper",
    emoji: "\ud83e\ude74",
    label: "\u62d6\u978b",
    animationSlug: "slipper",
    cost: 10,
    charmDelta: -2,
  },
];
const EMOTION_BY_ID = Object.fromEntries(
  EMOTION_CATALOG.map((item) => [item.id, item]),
);

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
  {
    id: "dragonboat-1",
    price: 0,
    type: "image",
    imageUrl: "assets/cardbacks/dragonboat-1.png",
    name: "\u7aef\u5348\u724c\u80cc\u4e00",
  },
];
const PET_CATALOG = [
  { id: "beaver", name: "Beaver", modelUrl: "assets/pets/models/animal-beaver.glb", previewUrl: "assets/pets/previews/animal-beaver.png" },
  { id: "bee", name: "Bee", modelUrl: "assets/pets/models/animal-bee.glb", previewUrl: "assets/pets/previews/animal-bee.png" },
  { id: "bunny", name: "Bunny", modelUrl: "assets/pets/models/animal-bunny.glb", previewUrl: "assets/pets/previews/animal-bunny.png" },
  { id: "cat", name: "Cat", modelUrl: "assets/pets/models/animal-cat.glb", previewUrl: "assets/pets/previews/animal-cat.png" },
  { id: "caterpillar", name: "Caterpillar", modelUrl: "assets/pets/models/animal-caterpillar.glb", previewUrl: "assets/pets/previews/animal-caterpillar.png" },
  { id: "chick", name: "Chick", modelUrl: "assets/pets/models/animal-chick.glb", previewUrl: "assets/pets/previews/animal-chick.png" },
  { id: "cow", name: "Cow", modelUrl: "assets/pets/models/animal-cow.glb", previewUrl: "assets/pets/previews/animal-cow.png" },
  { id: "crab", name: "Crab", modelUrl: "assets/pets/models/animal-crab.glb", previewUrl: "assets/pets/previews/animal-crab.png" },
  { id: "deer", name: "Deer", modelUrl: "assets/pets/models/animal-deer.glb", previewUrl: "assets/pets/previews/animal-deer.png" },
  { id: "dog", name: "Dog", modelUrl: "assets/pets/models/animal-dog.glb", previewUrl: "assets/pets/previews/animal-dog.png" },
  { id: "elephant", name: "Elephant", modelUrl: "assets/pets/models/animal-elephant.glb", previewUrl: "assets/pets/previews/animal-elephant.png" },
  { id: "fish", name: "Fish", modelUrl: "assets/pets/models/animal-fish.glb", previewUrl: "assets/pets/previews/animal-fish.png" },
  { id: "fox", name: "Fox", modelUrl: "assets/pets/models/animal-fox.glb", previewUrl: "assets/pets/previews/animal-fox.png" },
  { id: "giraffe", name: "Giraffe", modelUrl: "assets/pets/models/animal-giraffe.glb", previewUrl: "assets/pets/previews/animal-giraffe.png" },
  { id: "hog", name: "Hog", modelUrl: "assets/pets/models/animal-hog.glb", previewUrl: "assets/pets/previews/animal-hog.png" },
  { id: "koala", name: "Koala", modelUrl: "assets/pets/models/animal-koala.glb", previewUrl: "assets/pets/previews/animal-koala.png" },
  { id: "lion", name: "Lion", modelUrl: "assets/pets/models/animal-lion.glb", previewUrl: "assets/pets/previews/animal-lion.png" },
  { id: "monkey", name: "Monkey", modelUrl: "assets/pets/models/animal-monkey.glb", previewUrl: "assets/pets/previews/animal-monkey.png" },
  { id: "panda", name: "Panda", modelUrl: "assets/pets/models/animal-panda.glb", previewUrl: "assets/pets/previews/animal-panda.png" },
  { id: "parrot", name: "Parrot", modelUrl: "assets/pets/models/animal-parrot.glb", previewUrl: "assets/pets/previews/animal-parrot.png" },
  { id: "penguin", name: "Penguin", modelUrl: "assets/pets/models/animal-penguin.glb", previewUrl: "assets/pets/previews/animal-penguin.png" },
  { id: "pig", name: "Pig", modelUrl: "assets/pets/models/animal-pig.glb", previewUrl: "assets/pets/previews/animal-pig.png" },
  { id: "polar", name: "Polar", modelUrl: "assets/pets/models/animal-polar.glb", previewUrl: "assets/pets/previews/animal-polar.png" },
  { id: "tiger", name: "Tiger", modelUrl: "assets/pets/models/animal-tiger.glb", previewUrl: "assets/pets/previews/animal-tiger.png" },
];
window.PET_CATALOG = PET_CATALOG;
let shopCatalog = null;
let holidayGifts = [];

function getCardBackDef(id) {
  return (
    CARD_BACK_CATALOG.find((item) => item.id === id) ||
    CARD_BACK_CATALOG[0]
  );
}

function syncShopCatalog(catalog) {
  if (!catalog || typeof catalog !== "object") return;
  shopCatalog = catalog;
  if (Array.isArray(catalog.cardBacks)) {
    catalog.cardBacks.forEach((item) => {
      if (!item || !item.id) return;
      const existing = CARD_BACK_CATALOG.find((entry) => entry.id === item.id);
      if (existing) Object.assign(existing, item);
      else CARD_BACK_CATALOG.push({ ...item });
    });
  }
  if (Array.isArray(catalog.pets)) {
    catalog.pets.forEach((item) => {
      if (!item || !item.id) return;
      const existing = PET_CATALOG.find((entry) => entry.id === item.id);
      if (existing) Object.assign(existing, item);
      else PET_CATALOG.push({ ...item });
    });
  }
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

function getPetDef(id) {
  return PET_CATALOG.find((item) => item.id === id) || null;
}

function getOwnedPets(profile = userProfile) {
  const owned = Array.isArray(profile?.ownedPets) ? profile.ownedPets : [];
  return [...new Set(owned)].filter((id) =>
    PET_CATALOG.some((item) => item.id === id),
  );
}

function getEquippedPet(profile = userProfile) {
  const equipped = profile?.equippedPet || "";
  return getOwnedPets(profile).includes(equipped) ? equipped : "";
}

function createPetPreview(id) {
  const def = getPetDef(id);
  const el = document.createElement("div");
  el.className = "pet-preview";
  el.dataset.pet = def?.id || "";
  if (!def) {
    el.classList.add("pet-preview-none");
    el.textContent = "\u65e0";
    return el;
  }
  const img = document.createElement("img");
  img.src = def.previewUrl;
  img.alt = def.name || def.id;
  el.appendChild(img);
  return el;
}

function getCardBackClass(id) {
  const def = getCardBackDef(id);
  return def.type === "image" ? "card-back-image" : "card-back-" + def.id;
}

function createCardBackPreview(id) {
  const el = document.createElement("div");
  el.className = "card-back-preview card-back " + getCardBackClass(id);
  el.dataset.cardBack = getCardBackDef(id).id;
  decorateCardBack(el, id);
  return el;
}

function decorateCardBack(el, id) {
  const def = getCardBackDef(id);
  const cardBackId = def.id;
  if (def.type === "image" && def.imageUrl) {
    el.classList.add("card-back-image");
    el.style.backgroundImage = `url("${def.imageUrl}")`;
    return;
  }
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
