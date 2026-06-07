// ===== TABLE SCENE SELECTOR =====
const TABLE_SCENES = [
  {
    id: "classic",
    name: "经典绿毡",
    desc: "Casino Classic",
    cls: "scene-classic",
    preview: "linear-gradient(135deg,#1a6b3c,#0f4d2a)",
  },
  {
    id: "macau",
    name: "澳门永利",
    desc: "Wynn Macau",
    cls: "scene-macau",
    preview: "linear-gradient(135deg,#6b5a1a,#4d400f)",
  },
  {
    id: "vegas",
    name: "拉斯维加斯",
    desc: "Las Vegas Strip",
    cls: "scene-vegas",
    preview: "linear-gradient(135deg,#8b1a1a,#6b0f0f)",
  },
  {
    id: "monaco",
    name: "摩纳哥",
    desc: "Monte Carlo",
    cls: "scene-monaco",
    preview: "linear-gradient(135deg,#1a4a6b,#0f3550)",
  },
  {
    id: "underground",
    name: "地下赌场",
    desc: "Underground",
    cls: "scene-underground",
    preview: "linear-gradient(135deg,#2a2a2a,#1a1a1a)",
  },
  {
    id: "atlantic",
    name: "大西洋城",
    desc: "Atlantic City",
    cls: "scene-atlantic",
    preview: "linear-gradient(135deg,#1a6b6b,#0f4d4d)",
  },
  {
    id: "club",
    name: "私人会所",
    desc: "Private Club",
    cls: "scene-club",
    preview: "linear-gradient(135deg,#6b1a3c,#4d0f2a)",
  },
  {
    id: "royale",
    name: "皇家赌场",
    desc: "Casino Royale",
    cls: "scene-royale",
    preview: "linear-gradient(135deg,#0a0a0a,#d4a840)",
  },
  {
    id: "space",
    name: "太空舱",
    desc: "Space Station",
    cls: "scene-space",
    preview: "linear-gradient(135deg,#2a1a5a,#1a0f40)",
  },
  {
    id: "bamboo",
    name: "竹林雅室",
    desc: "Bamboo Room",
    cls: "scene-bamboo",
    preview: "linear-gradient(135deg,#3a6b3c,#2a4d2a)",
  },
];

let currentScene = "classic";
let customTableImage = localStorage.getItem("poker_custom_table_image") || "";

function refreshSceneSelection() {
  const grid = $("sceneGrid");
  if (!grid) return;
  grid.querySelectorAll(".scene-option").forEach((opt) => {
    opt.classList.toggle("selected", opt.dataset.sceneId === currentScene);
  });
}

function initSceneSelector() {
  const grid = $("sceneGrid");
  if (!grid) return;
  grid.innerHTML = "";
  TABLE_SCENES.forEach((scene) => {
    const opt = document.createElement("div");
    opt.className =
      "scene-option" + (scene.id === currentScene ? " selected" : "");
    opt.dataset.sceneId = scene.id;
    opt.innerHTML = `
<div class="scene-preview" style="background:${scene.preview}"></div>
<div class="scene-name">${scene.name}</div>
<div class="scene-desc">${scene.desc}</div>
    `;
    opt.addEventListener("click", () => {
      selectScene(scene.id);
      refreshSceneSelection();
    });
    grid.appendChild(opt);
  });
  updateCustomScenePreview();
}

function selectScene(sceneId) {
  currentScene = sceneId;
  const container = $("table-container");
  if (!container) return;
  // Remove all scene classes
  TABLE_SCENES.forEach((s) => container.classList.remove(s.cls));
  container.classList.remove("scene-custom-image");
  // Apply selected scene
  const scene = TABLE_SCENES.find((s) => s.id === sceneId);
  if (scene) container.classList.add(scene.cls);
  applyCustomTableImage(sceneId === "custom" ? customTableImage : "");
}

function applyCustomTableImage(imageData) {
  const table = $("table");
  if (!table) return;
  if (imageData) {
    table.style.setProperty("--custom-table-image", `url("${imageData}")`);
    $("table-container")?.classList.add("scene-custom-image");
  } else {
    table.style.removeProperty("--custom-table-image");
    $("table-container")?.classList.remove("scene-custom-image");
  }
}

function updateCustomScenePreview() {
  const panel = document.querySelector(".custom-scene-panel");
  const preview = $("customScenePreview");
  const clearBtn = $("customSceneClear");
  if (panel) panel.classList.toggle("selected", currentScene === "custom");
  if (preview) {
    preview.style.background = customTableImage
      ? `center / cover url("${customTableImage}")`
      : "linear-gradient(135deg,#242424,#101010)";
  }
  if (clearBtn) clearBtn.disabled = !customTableImage;
}

function selectCustomTableImage(imageData) {
  try {
    localStorage.setItem("poker_custom_table_image", imageData);
  } catch (_) {
    toast("图片太大，保存失败");
    return;
  }
  customTableImage = imageData;
  currentScene = "custom";
  TABLE_SCENES.forEach((s) => $("table-container")?.classList.remove(s.cls));
  applyCustomTableImage(customTableImage);
  refreshSceneSelection();
  updateCustomScenePreview();
  toast("自定义桌面已保存");
}

function clearCustomTableImage() {
  customTableImage = "";
  localStorage.removeItem("poker_custom_table_image");
  if (currentScene === "custom") selectScene("classic");
  updateCustomScenePreview();
  refreshSceneSelection();
  toast("自定义桌面已清除");
}

function resizeTableImage(file, done) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const maxW = 1600;
      const maxH = 1000;
      const scale = Math.min(1, maxW / img.width, maxH / img.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      done(canvas.toDataURL("image/jpeg", 0.86));
    };
    img.onerror = () => toast("图片读取失败");
    img.src = reader.result;
  };
  reader.onerror = () => toast("图片读取失败");
  reader.readAsDataURL(file);
}

function openSceneModal() {
  initSceneSelector();
  const modal = $("sceneModal");
  if (modal) modal.classList.add("active");
}

function closeSceneModal() {
  const modal = $("sceneModal");
  if (modal) modal.classList.remove("active");
}

if ($("sceneBtn"))
  $("sceneBtn").addEventListener("click", openSceneModal);
if ($("sceneClose"))
  $("sceneClose").addEventListener("click", closeSceneModal);
if ($("sceneModal"))
  $("sceneModal").addEventListener("click", (e) => {
    if (e.target === $("sceneModal")) closeSceneModal();
  });
if ($("customSceneUpload"))
  $("customSceneUpload").addEventListener("click", () => {
    $("customSceneInput")?.click();
  });
if ($("customSceneInput"))
  $("customSceneInput").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("请选择图片文件");
      return;
    }
    resizeTableImage(file, selectCustomTableImage);
  });
if ($("customSceneClear"))
  $("customSceneClear").addEventListener("click", clearCustomTableImage);
if (customTableImage) selectScene("custom");

// ===== WIN PARTICLES =====
function spawnWinParticles(targetEl) {
  if (!targetEl) return;
  const rect = targetEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const colors = ["#40e080", "#f0d860", "#60b0f0", "#ff8060", "#c080ff"];
  for (let i = 0; i < 16; i++) {
    const p = document.createElement("div");
    p.className = "win-particle";
    const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 40 + Math.random() * 80;
    p.style.cssText = `left:${cx}px;top:${cy}px;background:${colors[i % colors.length]};--px:${Math.cos(angle) * dist}px;--py:${Math.sin(angle) * dist}px;animation-delay:${Math.random() * 0.2}s`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1500);
  }
}

// ===== POT BUMP =====
function bumpPot() {
  const el = document.querySelector(".pot-display");
  if (!el) return;
  el.classList.remove("pot-bump");
  void el.offsetWidth;
  el.classList.add("pot-bump");
}

// ===== CARD RENDERING =====
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];
const RANK_VALUES = {
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};
const HAND_NAMES = [
  "高牌",
  "一对",
  "两对",
  "三条",
  "顺子",
  "同花",
  "葫芦",
  "四条",
  "同花顺",
  "皇家同花顺",
];

function createCardEl(card) {
  if (!card) return createCardBackEl();
  const el = document.createElement("div");
  const isRed = card.suit === 1 || card.suit === 2;
  el.className = `card card-front ${isRed ? "card-red" : "card-black"}`;
  el.innerHTML = `<div class="rank">${card.rankStr}</div><div class="suit">${card.suitStr}</div><div class="rank-br">${card.rankStr}</div>`;
  return el;
}

function createCardBackEl(cardBackId = DEFAULT_CARD_BACK) {
  const el = document.createElement("div");
  el.className = "card card-back " + getCardBackClass(cardBackId);
  el.dataset.cardBack = getCardBackDef(cardBackId).id;
  decorateCardBack(el, cardBackId);
  return el;
}

// ===== CLIENT-SIDE HAND EVAL (for display) =====
function evaluateHand(cards) {
  const combos = getCombinations(cards, 5);
  let best = null;
  for (const combo of combos) {
    const r = evaluate5(combo);
    if (!best || compareEval(r, best) > 0) best = r;
  }
  return best;
}
function getCombinations(arr, k) {
  const result = [];
  function bt(start, current) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      bt(i + 1, current);
      current.pop();
    }
  }
  bt(0, []);
  return result;
}
function evaluate5(cards) {
  const ranks = cards
    .map((c) => RANK_VALUES[c.rankStr])
    .sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  let isStraight = false,
    straightHigh = 0;
  if (unique.length >= 5) {
    for (let i = 0; i <= unique.length - 5; i++) {
      if (unique[i] - unique[i + 4] === 4) {
        isStraight = true;
        straightHigh = unique[i];
        break;
      }
    }
    if (
      !isStraight &&
      unique.includes(14) &&
      unique.includes(5) &&
      unique.includes(4) &&
      unique.includes(3) &&
      unique.includes(2)
    ) {
      isStraight = true;
      straightHigh = 5;
    }
  }
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([r, c]) => ({ rank: +r, count: c }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);
  if (isFlush && isStraight) {
    if (straightHigh === 14)
      return { rank: 9, values: [14], name: "皇家同花顺" };
    return { rank: 8, values: [straightHigh], name: "同花顺" };
  }
  if (groups[0].count === 4)
    return {
      rank: 7,
      values: [groups[0].rank, groups[1].rank],
      name: "四条",
    };
  if (groups[0].count === 3 && groups[1] && groups[1].count === 2)
    return {
      rank: 6,
      values: [groups[0].rank, groups[1].rank],
      name: "葫芦",
    };
  if (isFlush) return { rank: 5, values: ranks, name: "同花" };
  if (isStraight)
    return { rank: 4, values: [straightHigh], name: "顺子" };
  if (groups[0].count === 3)
    return {
      rank: 3,
      values: [groups[0].rank, ...groups.slice(1).map((g) => g.rank)],
      name: "三条",
    };
  if (groups[0].count === 2 && groups[1] && groups[1].count === 2)
    return {
      rank: 2,
      values: [groups[0].rank, groups[1].rank, groups[2].rank],
      name: "两对",
    };
  if (groups[0].count === 2)
    return {
      rank: 1,
      values: [groups[0].rank, ...groups.slice(1).map((g) => g.rank)],
      name: "一对",
    };
  return { rank: 0, values: ranks, name: "高牌" };
}
function compareEval(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.min(a.values.length, b.values.length); i++) {
    if (a.values[i] !== b.values[i]) return a.values[i] - b.values[i];
  }
  return 0;
}
