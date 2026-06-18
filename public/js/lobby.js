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

// ===== PLAYER INTERACTION =====
let interactTarget = null;
const interactPanel = $("interactPanel");
window.lastSeatCenters = window.lastSeatCenters || Object.create(null);

// Close interact panel on outside click
document.addEventListener("click", (e) => {
  if (
    interactPanel &&
    interactPanel.classList.contains("active") &&
    !interactPanel.contains(e.target) &&
    !e.target.closest(".interact-trigger") &&
    !e.target.closest(".seat-info")
  ) {
    hideInteractPanel();
  }
});

function getSeatElByPlayerId(playerId) {
  return [...document.querySelectorAll(".seat")].find(
    (seat) => seat.dataset.playerId === String(playerId),
  );
}

function getSeatCenterByPlayerId(playerId) {
  const key = String(playerId);
  const seatEl = getSeatElByPlayerId(playerId);
  if (seatEl) {
    const rect = seatEl.getBoundingClientRect();
    if (rect.width || rect.height) {
      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      window.lastSeatCenters[key] = center;
      return center;
    }
  }
  return window.lastSeatCenters[key] || null;
}

const GIFT_ANIMATION_BASE = "assets/gifts";
const GIFT_ANIMATION_FRAME_COUNT = 16;
const GIFT_ANIMATION_FPS = 12;
const GIFT_ANIMATION_COLS = 4;
const GIFT_ANIMATION_ROWS = 4;

function getEmotionAnimationSlug(emotion) {
  if (!emotion || typeof emotion === "string") return null;
  return (
    emotion.animationSlug ||
    EMOTION_BY_ID[emotion.id]?.animationSlug ||
    null
  );
}

function getGiftSpriteUrl(slug) {
  return `${GIFT_ANIMATION_BASE}/${slug}/${slug}-sheet.png`;
}

function setGiftSpriteFrame(el, frameIndex) {
  const frame = Math.max(
    0,
    Math.min(GIFT_ANIMATION_FRAME_COUNT - 1, Number(frameIndex) || 0),
  );
  const col = frame % GIFT_ANIMATION_COLS;
  const row = Math.floor(frame / GIFT_ANIMATION_COLS);
  const x = (col / (GIFT_ANIMATION_COLS - 1)) * 100;
  const y = (row / (GIFT_ANIMATION_ROWS - 1)) * 100;
  el.style.backgroundPosition = `${x}% ${y}%`;
}

function createGiftSpriteEl(emotion, className) {
  const sprite = document.createElement("div");
  sprite.className = className || "gift-sprite";
  const slug = getEmotionAnimationSlug(emotion);
  if (slug) {
    sprite.classList.add("gift-sprite");
    sprite.style.backgroundImage = `url("${getGiftSpriteUrl(slug)}")`;
    setGiftSpriteFrame(sprite, 0);
    return sprite;
  }

  sprite.classList.add("gift-sprite-fallback");
  sprite.textContent =
    typeof emotion === "string" ? emotion : emotion?.emoji || "\ud83c\udf39";
  return sprite;
}

function playGiftSprite(sprite) {
  if (!sprite || !sprite.classList.contains("gift-sprite")) return () => {};
  const frameMs = 1000 / GIFT_ANIMATION_FPS;
  const start = performance.now();
  let rafId = 0;

  function tick(now) {
    const frame = Math.min(
      GIFT_ANIMATION_FRAME_COUNT - 1,
      Math.floor((now - start) / frameMs),
    );
    setGiftSpriteFrame(sprite, frame);
    if (frame < GIFT_ANIMATION_FRAME_COUNT - 1) {
      rafId = requestAnimationFrame(tick);
    }
  }

  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId);
}

function spawnEmotionFlyByIds(fromId, toId, emotion) {
  const from = getSeatCenterByPlayerId(fromId);
  const to = getSeatCenterByPlayerId(toId);
  if (!from || !to) return;
  const startX = from.x;
  const startY = from.y;
  const endX = to.x;
  const endY = to.y;
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.hypot(dx, dy);
  const duration = Math.max(680, Math.min(1180, Math.round(distance * 1.55)));
  const animationDuration =
    (GIFT_ANIMATION_FRAME_COUNT / GIFT_ANIMATION_FPS) * 1000;

  const gift = document.createElement("div");
  gift.className = "flying-gift";
  gift.style.left = startX + "px";
  gift.style.top = startY + "px";
  gift.style.setProperty("--fly-duration", duration + "ms");
  gift.style.transform = "translate(-50%, -50%) translate(0, 0) scale(1)";
  const sprite = createGiftSpriteEl(emotion, "flying-gift-sprite");
  gift.appendChild(sprite);
  document.body.appendChild(gift);
  const stopSprite = playGiftSprite(sprite);

  requestAnimationFrame(() => {
    gift.style.transform =
      `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(1)`;
  });
  setTimeout(() => {
    gift.classList.add("arrived");
    gift.style.transform =
      `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(1)`;
  }, Math.max(duration, animationDuration));
  setTimeout(() => {
    stopSprite();
    gift.remove();
  }, Math.max(duration, animationDuration) + 300);
}

function formatSignedNumber(value) {
  const n = Number(value || 0);
  return n > 0 ? "+" + n : String(n);
}

let interactAnchor = null;
let interactPlayer = null;

function getPanelPlayer(playerId, fallback = null) {
  if (fallback) return fallback;
  return gameState?.players?.find((p) => p.id === playerId) || null;
}

function getPlayerPanelProfile(playerId, player = null) {
  const p = getPanelPlayer(playerId, player);
  if (playerId === Net.playerId && userProfile) {
    const s = userProfile.stats || {};
    return {
      username: userProfile.username || p?.name || "",
      avatar: userProfile.avatar || p?.avatar || "",
      avatarColor: userProfile.avatarColor || p?.avatarColor || "",
      charm: userProfile.charm || 0,
      stats: {
        handsPlayed: s.handsPlayed || 0,
        handsWon: s.handsWon || 0,
        winRate:
          s.handsPlayed > 0
            ? Math.round(((s.handsWon || 0) / s.handsPlayed) * 100)
            : 0,
        totalProfit: s.totalProfit ?? s.totalWon ?? 0,
      },
    };
  }

  const pub = p?.publicProfile || {};
  const s = pub.stats || {};
  return {
    username: pub.username || p?.name || "",
    avatar: pub.avatar || p?.avatar || "",
    avatarColor: pub.avatarColor || p?.avatarColor || "",
    charm: pub.charm || 0,
    stats: {
      handsPlayed: s.handsPlayed || 0,
      handsWon: s.handsWon || 0,
      winRate:
        s.winRate ??
        (s.handsPlayed > 0
          ? Math.round(((s.handsWon || 0) / s.handsPlayed) * 100)
          : 0),
      totalProfit: s.totalProfit ?? s.totalWon ?? 0,
    },
  };
}

function applyPublicProfileToState(playerId, publicProfile) {
  if (!publicProfile || !gameState?.players) return;
  const player = gameState.players.find((p) => p.id === playerId);
  if (!player) return;
  player.publicProfile = publicProfile;
  player.avatar = publicProfile.avatar || player.avatar;
  player.avatarColor = publicProfile.avatarColor || player.avatarColor;
}

function positionInteractPanel() {
  if (!interactPanel || !interactAnchor) return;
  const rect = interactAnchor.getBoundingClientRect();
  const panelRect = interactPanel.getBoundingClientRect();
  const gap = 10;
  const maxLeft = Math.max(gap, window.innerWidth - panelRect.width - gap);
  const maxTop = Math.max(gap, window.innerHeight - panelRect.height - gap);
  const preferRight = rect.left + rect.width / 2 < window.innerWidth / 2;
  let left = preferRight ? rect.right + gap : rect.left - panelRect.width - gap;
  let top = rect.top + rect.height / 2 - panelRect.height / 2;
  left = Math.max(gap, Math.min(left, maxLeft));
  top = Math.max(gap, Math.min(top, maxTop));
  interactPanel.style.left = left + "px";
  interactPanel.style.top = top + "px";
}

function renderInteractPanel() {
  if (!interactPanel || !interactTarget) return;
  const profile = getPlayerPanelProfile(interactTarget, interactPlayer);
  const stats = profile.stats || {};
  const isSelf = interactTarget === Net.playerId;
  const canSend =
    !isSelf &&
    !isSpectator &&
    !(typeof isLayoutTestRoom !== "undefined" && isLayoutTestRoom) &&
    !!userProfile &&
    !!Net.playerId;
  const inventory = userProfile?.emotionInventory || {};
  const coins = userProfile?.coins || 0;

  interactPanel.innerHTML = "";
  const header = document.createElement("div");
  header.className = "interact-profile";

  const avatar = document.createElement("div");
  avatar.className = "interact-avatar";
  avatar.textContent = profile.avatar || "\ud83d\udc64";
  if (profile.avatarColor) {
    avatar.style.borderColor = profile.avatarColor;
    avatar.style.boxShadow = `0 0 18px ${profile.avatarColor}44`;
  }
  header.appendChild(avatar);

  const meta = document.createElement("div");
  meta.className = "interact-meta";
  const name = document.createElement("div");
  name.className = "interact-name";
  name.textContent =
    (profile.username || "\u73a9\u5bb6") + (isSelf ? " (\u4f60)" : "");
  const statLine = document.createElement("div");
  statLine.className = "interact-stats";
  const totalProfit = Number(stats.totalProfit || 0);
  statLine.textContent =
    `\u80dc\u7387 ${stats.winRate || 0}% · ` +
    `\u624b\u6570 ${stats.handsPlayed || 0} · ` +
    `\u603b\u76c8\u5229 ${totalProfit > 0 ? "+" : ""}${totalProfit} · ` +
    `\u9b45\u529b ${profile.charm || 0}`;
  meta.appendChild(name);
  meta.appendChild(statLine);
  header.appendChild(meta);
  interactPanel.appendChild(header);

  const row = document.createElement("div");
  row.className = "emotion-row";
  for (const emotion of EMOTION_CATALOG) {
    const count = emotion.unlimited ? null : Number(inventory[emotion.id] || 0);
    const option = document.createElement("div");
    option.className = "emotion-option";

    const iconWrap = document.createElement("div");
    iconWrap.className = "emotion-icon-wrap";
    const icon = document.createElement("div");
    icon.className = "emotion-icon";
    icon.textContent = emotion.emoji;
    iconWrap.appendChild(icon);
    if (!emotion.unlimited) {
      const badge = document.createElement("span");
      badge.className = "emotion-count";
      badge.textContent = count;
      iconWrap.appendChild(badge);
    }
    option.appendChild(iconWrap);

    const delta = document.createElement("div");
    delta.className =
      "emotion-delta" +
      (emotion.charmDelta < 0
        ? " negative"
        : emotion.charmDelta > 0
          ? " positive"
          : "");
    delta.textContent =
      emotion.charmDelta === 0
        ? "\u9b45\u529b\u4e0d\u53d8"
        : "\u9b45\u529b " + formatSignedNumber(emotion.charmDelta);
    option.appendChild(delta);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emotion-send";
    const hasStock = emotion.unlimited || count > 0;
    btn.textContent = hasStock
      ? "\u53d1\u9001"
      : emotion.cost + "\u91d1\u5e01";
    btn.disabled = !canSend;
    if (!hasStock && coins < emotion.cost) btn.classList.add("unaffordable");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!canSend) return;
      if (!hasStock && coins < emotion.cost) {
        toast("\u91d1\u5e01\u4e0d\u8db3");
        return;
      }
      Net.send("room:interact", {
        targetId: interactTarget,
        emotionId: emotion.id,
      });
      hideInteractPanel();
    });
    option.appendChild(btn);
    row.appendChild(option);
  }

  if (canSend) {
    interactPanel.appendChild(row);
  } else {
    const note = document.createElement("div");
    note.className = "interact-note";
    note.textContent = isSelf
      ? "\u4e0d\u80fd\u7ed9\u81ea\u5df1\u53d1\u8868\u60c5"
      : "\u5f53\u524d\u53ea\u80fd\u67e5\u770b\u73a9\u5bb6\u4fe1\u606f";
    interactPanel.appendChild(note);
  }
}

function showInteractPanel(playerId, seatEl, player = null) {
  if (!interactPanel || !seatEl) return;
  interactTarget = playerId;
  interactAnchor = seatEl;
  interactPlayer = player || getPanelPlayer(playerId);
  renderInteractPanel();
  interactPanel.classList.add("active");
  requestAnimationFrame(positionInteractPanel);
}

function refreshInteractPanel() {
  if (!interactPanel || !interactPanel.classList.contains("active")) return;
  renderInteractPanel();
  requestAnimationFrame(positionInteractPanel);
}

function hideInteractPanel() {
  if (interactPanel) interactPanel.classList.remove("active");
  interactTarget = null;
  interactAnchor = null;
  interactPlayer = null;
}

window.addEventListener("resize", () => {
  if (interactPanel?.classList.contains("active")) {
    requestAnimationFrame(positionInteractPanel);
  }
});

Net.on("room:interact", (d) => {
  if (!d || !d.emotion) return;
  applyPublicProfileToState(d.fromId, d.senderPublic);
  applyPublicProfileToState(d.toId, d.targetPublic);
  spawnEmotionFlyByIds(d.fromId, d.toId, d.emotion);
  refreshInteractPanel();
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
