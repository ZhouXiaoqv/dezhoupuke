// ===== CHIP FLYING ANIMATION =====
function spawnChipFly(fromEl, color) {
  if (!fromEl) return;
  const rect = fromEl.getBoundingClientRect();
  const potEl = document.querySelector(".pot-display");
  const potRect = potEl
    ? potEl.getBoundingClientRect()
    : { left: window.innerWidth / 2, top: window.innerHeight / 2 };
  const chip = document.createElement("div");
  chip.className = "flying-chip";
  const colors = ["#d4a840", "#cc3333", "#4fc3f7", "#66bb6a", "#ab47bc"];
  chip.style.background =
    color || colors[Math.floor(Math.random() * colors.length)];
  chip.style.left = rect.left + rect.width / 2 - 10 + "px";
  chip.style.top = rect.top + rect.height / 2 - 10 + "px";
  chip.style.setProperty(
    "--fly-x",
    (potRect.left - rect.left) * 0.3 + "px",
  );
  document.body.appendChild(chip);
  SFX.chip();
  setTimeout(() => chip.remove(), 700);
}

function spawnGiftFly(targetEl, emoji) {
  if (!targetEl) return;
  const rect = targetEl.getBoundingClientRect();
  const gift = document.createElement("div");
  gift.className = "flying-gift";
  gift.textContent = emoji;
  gift.style.left = rect.left + rect.width / 2 - 14 + "px";
  gift.style.top = rect.top + "px";
  document.body.appendChild(gift);
  setTimeout(() => gift.remove(), 2200);
}

// ===== PLAYER INTERACTION =====
let interactTarget = null;
const interactPanel = $("interactPanel");

function showInteractPanel(playerId, seatEl) {
  if (!interactPanel || !seatEl) return;
  interactTarget = playerId;
  const rect = seatEl.getBoundingClientRect();
  interactPanel.style.left =
    Math.min(rect.right + 8, window.innerWidth - 140) + "px";
  interactPanel.style.top = Math.max(rect.top - 20, 8) + "px";
  interactPanel.classList.add("active");
}

function hideInteractPanel() {
  if (interactPanel) interactPanel.classList.remove("active");
  interactTarget = null;
}

if (interactPanel) {
  interactPanel.addEventListener("click", (e) => {
    const btn = e.target.closest(".interact-btn");
    if (!btn || !interactTarget) return;
    const gift = btn.dataset.gift;
    Net.send("room:interact", { targetId: interactTarget, gift });
    hideInteractPanel();
  });
}

// Close interact panel on outside click
document.addEventListener("click", (e) => {
  if (
    interactPanel &&
    interactPanel.classList.contains("active") &&
    !interactPanel.contains(e.target) &&
    !e.target.closest(".interact-trigger")
  ) {
    hideInteractPanel();
  }
});

// Receive interaction from other players
Net.on("room:interact", (d) => {
  if (d.self) {
    // Sender confirmation: animate gift flying toward target
    const targetEl = document.querySelector(
      `[data-player-id="${d.toId}"]`,
    );
    if (targetEl) spawnGiftFly(targetEl, d.gift || "🌹");
  } else {
    // From another player: animate gift flying from sender
    const seatEl = document.querySelector(
      `[data-player-id="${d.fromId}"]`,
    );
    if (seatEl) spawnGiftFly(seatEl, d.gift || "🌹");
  }
});

// ===== AVATAR SELECTOR SYSTEM =====
const AVATAR_OPTIONS = [
  "🦊",
  "🐯",
  "🐻",
  "🦅",
  "🐬",
  "🦁",
  "🐼",
  "🐸",
  "🦄",
  "🐲",
  "👻",
  "🤖",
  "🧙",
  "🥷",
  "🎭",
  "💀",
  "🐺",
  "🦇",
];
const COLOR_OPTIONS = [
  "#4fc3f7",
  "#ff7043",
  "#66bb6a",
  "#ffd54f",
  "#ab47bc",
  "#26c6da",
  "#ef5350",
  "#ec407a",
  "#ff8a65",
  "#aed581",
  "#4dd0e1",
  "#b39ddb",
];
let selectedAvatar = "🦊";
let selectedColor = "#4fc3f7";
let selectedCardBack = DEFAULT_CARD_BACK;

function initAvatarSelector() {
  const avatarGrid = $("avatarGrid");
  const colorGrid = $("colorGrid");
  if (!avatarGrid || !colorGrid) return;

  // Render avatar options
  avatarGrid.innerHTML = "";
  AVATAR_OPTIONS.forEach((av) => {
    const opt = document.createElement("div");
    opt.className =
      "avatar-option" + (av === selectedAvatar ? " selected" : "");
    opt.textContent = av;
    opt.addEventListener("click", () => {
      avatarGrid
        .querySelectorAll(".avatar-option")
        .forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");
      selectedAvatar = av;
      updateAvatarPreview();
    });
    avatarGrid.appendChild(opt);
  });

  // Render color options
  colorGrid.innerHTML = "";
  COLOR_OPTIONS.forEach((color) => {
    const opt = document.createElement("div");
    opt.className =
      "color-option" + (color === selectedColor ? " selected" : "");
    opt.style.background = color;
    opt.style.color = color;
    opt.addEventListener("click", () => {
      colorGrid
        .querySelectorAll(".color-option")
        .forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");
      selectedColor = color;
      updateAvatarPreview();
    });
    colorGrid.appendChild(opt);
  });

  updateAvatarPreview();
  renderOwnedCardBacks();
}

function updateAvatarPreview() {
  const circle = $("avatarPreviewCircle");
  if (circle) {
    circle.textContent = selectedAvatar;
    circle.style.borderColor = selectedColor;
    circle.style.boxShadow = `0 0 20px ${selectedColor}44`;
  }
}

function openAvatarModal() {
  const modal = $("avatarModal");
  if (!modal) return;
  // Sync current selection
  if (userProfile) {
    selectedAvatar = userProfile.avatar || "🦊";
    selectedColor = userProfile.avatarColor || "#4fc3f7";
    selectedCardBack = getEquippedCardBack(userProfile);
  }
  initAvatarSelector();
  modal.classList.add("active");
}

function closeAvatarModal() {
  const modal = $("avatarModal");
  if (modal) modal.classList.remove("active");
}

// Avatar button
if ($("avatarBtn")) {
  $("avatarBtn").addEventListener("click", openAvatarModal);
}
if ($("avatarClose"))
  $("avatarClose").addEventListener("click", closeAvatarModal);
if ($("avatarModal")) {
  $("avatarModal").addEventListener("click", (e) => {
    if (e.target === $("avatarModal")) closeAvatarModal();
  });
}
if ($("avatarSaveBtn")) {
  $("avatarSaveBtn").addEventListener("click", () => {
    const cardBackChanged =
      selectedCardBack !== getEquippedCardBack(userProfile);
    Net.send("user:setAvatar", {
      avatar: selectedAvatar,
      color: selectedColor,
    });
    if (cardBackChanged) Net.send("user:setCardBack", { id: selectedCardBack });
    userProfile.avatar = selectedAvatar;
    userProfile.avatarColor = selectedColor;
    userProfile.equippedCardBack = selectedCardBack;
    const ab = $("avatarBtn");
    if (ab) ab.textContent = selectedAvatar + " 换装";
    closeAvatarModal();
    toast("头像已保存");
  });
}

// Avatar updated from server
Net.on("user:avatarUpdated", (d) => {
  if (userProfile) {
    userProfile.avatar = d.avatar;
    userProfile.avatarColor = d.avatarColor;
  }
  selectedAvatar = d.avatar;
  selectedColor = d.avatarColor;
});

Net.on("user:cardBackUpdated", (d) => {
  if (userProfile && d.profile) {
    userProfile = d.profile;
  } else if (userProfile) {
    userProfile.equippedCardBack =
      d.equippedCardBack || userProfile.equippedCardBack || DEFAULT_CARD_BACK;
    userProfile.ownedCardBacks =
      d.ownedCardBacks || userProfile.ownedCardBacks || [DEFAULT_CARD_BACK];
  }
  selectedCardBack = getEquippedCardBack(userProfile);
  renderOwnedCardBacks();
  toast("牌背已保存");
});

Net.on("shop:purchaseResult", (d) => {
  if (userProfile && d.profile) userProfile = d.profile;
  renderShop();
  renderOwnedCardBacks();
  updateUserArea();
  toast("购买成功");
});

function renderOwnedCardBacks() {
  const grid = $("cardBackGrid");
  if (!grid) return;
  grid.innerHTML = "";
  const owned = getOwnedCardBacks(userProfile);
  selectedCardBack = owned.includes(selectedCardBack)
    ? selectedCardBack
    : getEquippedCardBack(userProfile);

  owned.forEach((id) => {
    const opt = document.createElement("button");
    opt.type = "button";
    opt.className =
      "cardback-option" + (id === selectedCardBack ? " selected" : "");
    opt.appendChild(createCardBackPreview(id));
    opt.addEventListener("click", () => {
      selectedCardBack = id;
      renderOwnedCardBacks();
    });
    grid.appendChild(opt);
  });
}

function renderShop() {
  const grid = $("shopGrid");
  if (!grid) return;
  grid.innerHTML = "";
  const owned = new Set(getOwnedCardBacks(userProfile));
  const coins = userProfile?.coins || 0;
  const items = [...CARD_BACK_SHOP].sort((a, b) => a.price - b.price);
  items.forEach((item) => {
    const isOwned = owned.has(item.id);
    const canBuy = coins >= item.price;
    const opt = document.createElement("div");
    opt.className =
      "shop-option" +
      (isOwned ? " owned" : "") +
      (!isOwned && !canBuy ? " unaffordable" : "");
    opt.appendChild(createCardBackPreview(item.id));
    const price = document.createElement("div");
    price.className = "shop-price";
    price.textContent = item.price + "\u91d1\u5e01";
    opt.appendChild(price);
    const buyBtn = document.createElement("button");
    buyBtn.type = "button";
    buyBtn.className = "shop-buy-btn";
    buyBtn.textContent = isOwned ? "\u5df2\u8d2d\u4e70" : "\u8d2d\u4e70";
    buyBtn.disabled = isOwned || !canBuy;
    opt.appendChild(buyBtn);
    buyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isOwned || !canBuy) return;
      Net.send("shop:buyCardBack", { id: item.id });
    });
    grid.appendChild(opt);
  });
}

function openShopModal() {
  renderShop();
  const modal = $("shopModal");
  if (modal) modal.classList.add("active");
}

function closeShopModal() {
  const modal = $("shopModal");
  if (modal) modal.classList.remove("active");
}

if ($("shopClose")) $("shopClose").addEventListener("click", closeShopModal);
if ($("shopModal")) {
  $("shopModal").addEventListener("click", (e) => {
    if (e.target === $("shopModal")) closeShopModal();
  });
}

// Show avatar button when logged in
function showAvatarBtn(show) {
  const btn = $("avatarBtn");
  if (btn) {
    btn.style.display = show ? "inline-flex" : "none";
    if (show && userProfile) {
      btn.textContent = (userProfile.avatar || "🦊") + " 换装";
    }
  }
}
