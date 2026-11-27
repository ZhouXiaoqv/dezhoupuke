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

const pendingLocalGiftRoutes = [];

// Emotions aim at the nameplate; the seat box also spans the hole cards.
function getEmotionAnchor(playerId) {
  const rect = getSeatElByPlayerId(playerId)
    ?.querySelector(".seat-info")
    ?.getBoundingClientRect();
  if (rect && (rect.width || rect.height)) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  return getSeatCenterByPlayerId(playerId);
}

function rememberPendingGiftRoute(toId, emotionId) {
  if (!Net.playerId || !toId) return;
  const from = getEmotionAnchor(Net.playerId);
  const to = getEmotionAnchor(toId);
  if (!from || !to) return;

  pendingLocalGiftRoutes.push({
    fromId: String(Net.playerId),
    toId: String(toId),
    emotionId: String(emotionId || ""),
    from,
    to,
    createdAt: performance.now(),
  });
  while (pendingLocalGiftRoutes.length > 8) pendingLocalGiftRoutes.shift();
}

function takePendingGiftRoute(fromId, toId, emotion) {
  const now = performance.now();
  const emotionId = String(
    emotion && typeof emotion === "object" ? emotion.id || "" : "",
  );
  for (let i = pendingLocalGiftRoutes.length - 1; i >= 0; i--) {
    const route = pendingLocalGiftRoutes[i];
    if (now - route.createdAt > 5000) {
      pendingLocalGiftRoutes.splice(i, 1);
      continue;
    }
    if (
      route.fromId === String(fromId) &&
      route.toId === String(toId) &&
      route.emotionId === emotionId
    ) {
      pendingLocalGiftRoutes.splice(i, 1);
      return route;
    }
  }
  return null;
}

function getTableCenter() {
  const rect = $("table")?.getBoundingClientRect();
  if (rect && (rect.width || rect.height)) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

function spawnEmotionFlyByIds(fromId, toId, emotion) {
  if (!$("table-container")?.classList.contains("active")) return;
  const pendingRoute = takePendingGiftRoute(fromId, toId, emotion);
  const to = pendingRoute?.to || getEmotionAnchor(toId) || getTableCenter();
  const from =
    pendingRoute?.from || getEmotionAnchor(fromId) || getTableCenter();
  EmotionFx.play({
    from,
    to,
    emotion: { ...EMOTION_BY_ID[emotion.id], ...emotion },
    targetEl: getSeatElByPlayerId(toId)?.querySelector(".seat-info"),
  });
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
  renderAvatar(avatar, profile.avatar || "\ud83d\udc64");
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
    if (emotion.enabled === false) continue;
    const count = emotion.unlimited ? null : Number(inventory[emotion.id] || 0);
    const option = document.createElement("div");
    option.className = "emotion-option";

    const iconWrap = document.createElement("div");
    iconWrap.className = "emotion-icon-wrap";
    const iconUrl = EmotionFx.itemUrl(emotion);
    const icon = document.createElement(iconUrl ? "img" : "div");
    icon.className = "emotion-icon";
    if (iconUrl) {
      icon.src = iconUrl;
      icon.alt = emotion.label || "";
      icon.draggable = false;
    } else {
      icon.textContent = emotion.emoji;
    }
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
      rememberPendingGiftRoute(interactTarget, emotion.id);
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
  const target = gameState?.players?.find((p) => p.id === d.toId);
  if (target?.publicProfile && Number.isFinite(d.targetCharm)) {
    target.publicProfile.charm = d.targetCharm;
  }
  spawnEmotionFlyByIds(d.fromId, d.toId, d.emotion);
  refreshInteractPanel();
});

// ===== AVATAR SELECTOR SYSTEM =====
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
let selectedAvatar = PLAYER_AVATARS[0];
let selectedColor = "#4fc3f7";
let selectedCardBack = DEFAULT_CARD_BACK;
let selectedPet = "";

function initAvatarSelector() {
  const avatarGrid = $("avatarGrid");
  const colorGrid = $("colorGrid");
  if (!avatarGrid || !colorGrid) return;

  // Render illustrated avatars, then the classic emoji avatars.
  const emojiGrid = $("avatarEmojiGrid");
  const addAvatarOption = (grid, av, name) => {
    const opt = document.createElement("div");
    opt.className =
      "avatar-option" + (av === selectedAvatar ? " selected" : "");
    const art = document.createElement("span");
    art.className = "avatar-option-art";
    renderAvatar(art, av);
    opt.appendChild(art);
    if (name) {
      opt.title = name;
      const label = document.createElement("span");
      label.className = "avatar-option-name";
      label.textContent = name;
      opt.appendChild(label);
    }
    opt.addEventListener("click", () => {
      $("avatarModal")
        .querySelectorAll(".avatar-option")
        .forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");
      selectedAvatar = av;
      updateAvatarPreview();
    });
    grid.appendChild(opt);
  };
  avatarGrid.innerHTML = "";
  AVATAR_CATALOG.forEach(({ id, name }) => addAvatarOption(avatarGrid, id, name));
  if (emojiGrid) {
    emojiGrid.innerHTML = "";
    EMOJI_AVATARS.forEach((emoji) => addAvatarOption(emojiGrid, emoji, ""));
  }

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
  renderOwnedPets();
}

function updateAvatarPreview() {
  const circle = $("avatarPreviewCircle");
  if (circle) {
    renderAvatar(circle, selectedAvatar);
    circle.style.borderColor = selectedColor;
    circle.style.boxShadow = `0 0 20px ${selectedColor}44`;
  }
}

function openAvatarModal(tableOnly = false) {
  const modal = $("avatarModal");
  if (!modal || (tableOnly && $("tableOutfitBtn").hidden)) return;
  modal.classList.toggle("table-outfit", tableOnly);
  // Sync current selection
  if (userProfile) {
    selectedAvatar = userProfile.avatar || PLAYER_AVATARS[0];
    selectedColor = userProfile.avatarColor || "#4fc3f7";
    selectedCardBack = getEquippedCardBack(userProfile);
    selectedPet = getEquippedPet(userProfile);
  }
  initAvatarSelector();
  modal.classList.add("active");
  if (tableOnly) modal.querySelector(".avatar-card").scrollTop = 0;
}

function closeAvatarModal() {
  const modal = $("avatarModal");
  if (modal) modal.classList.remove("active", "table-outfit");
}

$("tableOutfitBtn").addEventListener("click", () => openAvatarModal(true));

// Avatar button
if ($("avatarBtn")) {
  $("avatarBtn").addEventListener("click", () => openAvatarModal());
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
    const modal = $("avatarModal");
    const petChanged = selectedPet !== getEquippedPet(userProfile);
    const tableOnly = modal.classList.contains("table-outfit");
    if (!tableOnly) {
      Net.send("user:setAvatar", {
        avatar: selectedAvatar,
        color: selectedColor,
      });
    }
    if (cardBackChanged) Net.send("user:setCardBack", { id: selectedCardBack });
    if (petChanged) Net.send("user:setPet", { id: selectedPet });
    closeAvatarModal();
    if (tableOnly) return;
    userProfile.avatar = selectedAvatar;
    userProfile.avatarColor = selectedColor;
    userProfile.equippedCardBack = selectedCardBack;
    userProfile.equippedPet = selectedPet;
    updateAvatarBtn();
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
  updateAvatarBtn();
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

Net.on("user:petUpdated", (d) => {
  if (userProfile && d.profile) {
    userProfile = d.profile;
  } else if (userProfile) {
    userProfile.equippedPet = d.equippedPet || "";
    userProfile.ownedPets = d.ownedPets || userProfile.ownedPets || [];
  }
  selectedPet = getEquippedPet(userProfile);
  renderOwnedPets();
  if (gameState && Net.playerId) {
    const me = gameState.players?.find((p) => p.id === Net.playerId);
    if (me) {
      me.pet = selectedPet;
      me.publicProfile = { ...(me.publicProfile || {}), pet: selectedPet };
    }
  }
  toast("小宠物已保存");
});

Net.on("shop:purchaseResult", (d) => {
  if (userProfile && d.profile) userProfile = d.profile;
  renderShop();
  renderOwnedCardBacks();
  renderOwnedPets();
  updateUserArea();
  toast("购买成功");
});

Net.on("shop:catalog", (d) => {
  syncShopCatalog(d.catalog);
  if (d.profile) userProfile = d.profile;
  renderShop();
  renderOwnedCardBacks();
  renderOwnedPets();
});

Net.on("shop:error", (d) => {
  toast(d.message || "\u5546\u5e97\u64cd\u4f5c\u5931\u8d25");
});

Net.on("shop:blindBoxResult", (d) => {
  if (userProfile && d.profile) userProfile = d.profile;
  updateUserArea();
  renderOwnedCardBacks();
  renderOwnedPets();
  renderShop();
  playBlindBoxResult(d);
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

function renderOwnedPets() {
  const grid = $("petGrid");
  if (!grid) return;
  grid.innerHTML = "";
  const owned = getOwnedPets(userProfile);
  if (selectedPet && !owned.includes(selectedPet)) selectedPet = getEquippedPet(userProfile);

  const none = document.createElement("button");
  none.type = "button";
  none.className = "pet-option" + (!selectedPet ? " selected" : "");
  none.appendChild(createPetPreview(""));
  const noneLabel = document.createElement("div");
  noneLabel.className = "pet-option-label";
  noneLabel.textContent = "未装备";
  none.appendChild(noneLabel);
  none.addEventListener("click", () => {
    selectedPet = "";
    renderOwnedPets();
  });
  grid.appendChild(none);

  if (!owned.length) {
    const empty = document.createElement("div");
    empty.className = "pet-empty";
    empty.textContent = "还没有小宠物，可以去商城抽宠物盲盒。";
    grid.appendChild(empty);
    return;
  }

  owned.forEach((id) => {
    const def = getPetDef(id);
    const opt = document.createElement("button");
    opt.type = "button";
    opt.className = "pet-option" + (id === selectedPet ? " selected" : "");
    opt.appendChild(createPetPreview(id));
    const label = document.createElement("div");
    label.className = "pet-option-label";
    label.textContent = def?.name || id;
    opt.appendChild(label);
    opt.addEventListener("click", () => {
      selectedPet = id;
      renderOwnedPets();
    });
    grid.appendChild(opt);
  });
}

function renderShop() {
  const grid = $("shopGrid");
  if (!grid) return;
  grid.innerHTML = "";
  const owned = new Set(getOwnedCardBacks(userProfile));
  const ownedPets = new Set(getOwnedPets(userProfile));
  const coins = userProfile?.coins || 0;
  const catalog = shopCatalog || {
    shopCategories: [{ id: "card-backs", name: "\u724c\u80cc" }],
    shopItems: CARD_BACK_SHOP
      .filter((item) => !PREMIUM_CARD_BACK_IDS.has(item.id))
      .map((item) => ({
        id: item.id,
        cardBackId: item.id,
        price: item.price,
        categoryId: "card-backs",
        enabled: true,
      })),
    blindBoxes: [],
  };
  renderShopCategories(catalog);
  const selectedCategory = renderShop.selectedCategory || "";
  const items = (catalog.shopItems || [])
    .filter((item) => !selectedCategory || item.categoryId === selectedCategory)
    .sort((a, b) => (a.price || 0) - (b.price || 0));
  items.forEach((item) => {
    const cardBackId = item.cardBackId || item.id;
    const isOwned = owned.has(cardBackId);
    const canBuy = coins >= item.price;
    const opt = document.createElement("div");
    opt.className =
      "shop-option" +
      (isOwned ? " owned" : "") +
      (!isOwned && !canBuy ? " unaffordable" : "");
    opt.appendChild(createCardBackPreview(cardBackId));
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
      Net.send("shop:buyItem", { id: item.id, cardBackId });
    });
    grid.appendChild(opt);
  });
  (catalog.blindBoxes || [])
    .filter((box) => !selectedCategory || box.categoryId === selectedCategory)
    .forEach((box) => {
      const canBuy = coins >= box.price;
      const soldOut = isBlindBoxSoldOut(box);
      const opt = document.createElement("div");
      opt.className =
        "shop-option blindbox-option" + (!canBuy || soldOut ? " unaffordable" : "");
      const previewSlot = document.createElement("div");
      previewSlot.className = "shop-preview-slot";
      if (box.dropType === "pet") {
        const petPool = (catalog.pets || []).filter((pet) => !ownedPets.has(pet.id));
        previewSlot.appendChild(createPetPreview(petPool[0]?.id || "fox"));
      } else {
        const coverPreview = createBlindBoxCoverPreview(box);
        if (coverPreview) {
          previewSlot.appendChild(coverPreview);
        } else {
          const icon = document.createElement("div");
          icon.className = "blindbox-shop-icon" + (box.dropType === "cardBackPool" ? " premium" : "");
          previewSlot.appendChild(icon);
        }
      }
      opt.appendChild(previewSlot);
      const name = document.createElement("div");
      name.className = "shop-item-name";
      name.textContent = box.name || "\u724c\u80cc\u76f2\u76d2";
      opt.appendChild(name);
      const price = document.createElement("div");
      price.className = "shop-price";
      price.textContent = soldOut ? "\u5df2\u6536\u96c6\u5b8c" : box.price + "\u91d1\u5e01";
      opt.appendChild(price);
      const buyBtn = document.createElement("button");
      buyBtn.type = "button";
      buyBtn.className = "shop-buy-btn";
      buyBtn.textContent = "\u8bf4\u660e";
      opt.appendChild(buyBtn);
      opt.addEventListener("click", () => openBlindBoxModal(box));
      grid.appendChild(opt);
    });
  if (!grid.children.length) {
    grid.innerHTML = '<div class="shop-empty">\u6682\u65e0\u5546\u54c1</div>';
  }
}

function renderShopCategories(catalog = shopCatalog) {
  const tabs = $("shopCategoryTabs");
  if (!tabs) return;
  const visibleCategoryIds = new Set([
    ...(catalog?.shopItems || []).map((item) => item.categoryId),
    ...(catalog?.blindBoxes || []).map((box) => box.categoryId),
  ]);
  const categories = (catalog?.shopCategories || []).filter((category) =>
    visibleCategoryIds.has(category.id),
  );
  tabs.innerHTML = "";
  if (!categories.length) {
    renderShop.selectedCategory = "";
    return;
  }
  const categoryIds = new Set(categories.map((category) => category.id));
  const activeId = categoryIds.has(renderShop.selectedCategory)
    ? renderShop.selectedCategory
    : categories[0].id;
  renderShop.selectedCategory = activeId;
  categories.forEach((category) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "shop-category-tab" + (category.id === activeId ? " active" : "");
    btn.textContent = category.name;
    btn.addEventListener("click", () => {
      renderShop.selectedCategory = category.id;
      renderShop();
    });
    tabs.appendChild(btn);
  });
}

function openShopModal() {
  Net.send("shop:getCatalog");
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

let currentBlindBox = null;
let blindBoxResultReady = false;

function createBlindBoxRewardPreview(type, id) {
  if (type === "pet") return createPetPreview(id);
  return createCardBackPreview(id || DEFAULT_CARD_BACK);
}

function getBlindBoxPetCatalog() {
  return shopCatalog?.pets?.length ? shopCatalog.pets : PET_CATALOG;
}

function isPetBlindBoxSoldOut(box) {
  if (box?.dropType !== "pet") return false;
  const ownedPets = new Set(getOwnedPets(userProfile));
  return getBlindBoxPetCatalog().every((pet) => ownedPets.has(pet.id));
}

function getBlindBoxCardBackIds(box) {
  return Array.isArray(box?.cardBackIds)
    ? box.cardBackIds.filter((id) => CARD_BACK_CATALOG.some((item) => item.id === id))
    : [];
}

function getBlindBoxCoverCardBackId(box) {
  const ids = getBlindBoxCardBackIds(box);
  if (!ids.length) return "";
  return ids.includes(box?.coverCardBackId) ? box.coverCardBackId : ids[0];
}

function createBlindBoxCoverPreview(box, className = "") {
  const coverId = getBlindBoxCoverCardBackId(box);
  if (!coverId) return null;
  const preview = createCardBackPreview(coverId);
  preview.classList.add("blindbox-cover-preview");
  if (className) preview.classList.add(className);
  return preview;
}

function isCardBackPoolSoldOut(box) {
  if (box?.dropType !== "cardBackPool") return false;
  const ids = getBlindBoxCardBackIds(box);
  const owned = new Set(getOwnedCardBacks(userProfile));
  return ids.length > 0 && ids.every((id) => owned.has(id));
}

function isBlindBoxSoldOut(box) {
  return isPetBlindBoxSoldOut(box) || isCardBackPoolSoldOut(box);
}

function renderBlindBoxDesc(box) {
  const desc = $("blindBoxDesc");
  if (!desc) return;
  desc.innerHTML = "";
  const text = document.createElement("div");
  if (box.dropType === "pet") {
    text.textContent = `花费 ${box.price} 金币，随机获得一只未拥有的小宠物。抽到后加入仓库，需要在换装里手动装备。`;
  } else if (box.dropType === "cardBackPool") {
    text.textContent = `花费 ${box.price} 金币，等概率获得一张尚未拥有的奖池牌背。不会抽到重复牌背，奖池牌背仅可通过该盲盒获得。`;
  } else {
    text.textContent = `花费 ${box.price} 金币，随机获得一张已上架且未拥有的牌背。如果商城牌背已全部拥有，则不能购买。`;
  }
  desc.appendChild(text);

  if (box.dropType === "cardBackPool") {
    const ids = getBlindBoxCardBackIds(box);
    const owned = new Set(getOwnedCardBacks(userProfile));
    const ownedCount = ids.filter((id) => owned.has(id)).length;
    const remaining = ids.length - ownedCount;
    const summary = document.createElement("div");
    summary.className = "blindbox-pool-summary";
    summary.textContent = remaining > 0
      ? `已收集 ${ownedCount}/${ids.length}`
      : `已收集 ${ownedCount}/${ids.length} · 奖池牌背已全部集齐`;
    desc.appendChild(summary);

    const grid = document.createElement("div");
    grid.className = "blindbox-cardback-grid";
    ids.forEach((id) => {
      const def = getCardBackDef(id);
      const isOwned = owned.has(id);
      const item = document.createElement("div");
      item.className = "blindbox-cardback-item " + (isOwned ? "owned" : "missing");
      item.title = `${def.name || def.id} ${isOwned ? "已拥有" : "未拥有"}`;
      item.appendChild(createCardBackPreview(id));
      const name = document.createElement("div");
      name.className = "blindbox-cardback-name";
      name.textContent = def.name || def.id;
      item.appendChild(name);
      const state = document.createElement("div");
      state.className = "blindbox-cardback-status";
      state.textContent = isOwned ? "已拥有" : "未拥有";
      item.appendChild(state);
      grid.appendChild(item);
    });
    desc.appendChild(grid);
    return;
  }

  if (box.dropType !== "pet") return;
  const ownedPets = new Set(getOwnedPets(userProfile));
  const grid = document.createElement("div");
  grid.className = "blindbox-pet-grid";
  getBlindBoxPetCatalog().forEach((pet) => {
    const item = document.createElement("div");
    const isOwned = ownedPets.has(pet.id);
    item.className = "blindbox-pet-item" + (isOwned ? " owned" : " missing");
    item.title = `${pet.name || pet.id}${isOwned ? " \u5df2\u62e5\u6709" : " \u672a\u62e5\u6709"}`;
    item.appendChild(createPetPreview(pet.id));
    grid.appendChild(item);
  });
  desc.appendChild(grid);
}

function openBlindBoxModal(box) {
  currentBlindBox = box;
  blindBoxResultReady = false;
  $("blindBoxTitle").textContent = box.name || "\u724c\u80cc\u76f2\u76d2";
  const buy = $("blindBoxBuyBtn");
  renderBlindBoxDesc(box);
  const soldOut = isBlindBoxSoldOut(box);
  if (buy) {
    buy.textContent = soldOut ? "已收集完" : box.price + "\u91d1\u5e01\u8d2d\u4e70";
    buy.disabled = soldOut || (userProfile?.coins || 0) < box.price;
  }
  const stage = $("blindBoxStage");
  if (stage) {
    stage.innerHTML = "";
    if (box.dropType === "cardBackPool") {
      const coverPreview = createBlindBoxCoverPreview(box, "blindbox-cover-stage");
      if (coverPreview) {
        stage.appendChild(coverPreview);
      } else {
        const icon = document.createElement("div");
        icon.className = "blindbox-shop-icon premium";
        stage.appendChild(icon);
      }
    } else {
      const firstPet = (shopCatalog?.pets || [])[0]?.id || "fox";
      stage.appendChild(
        createBlindBoxRewardPreview(
          box.dropType,
          box.dropType === "pet" ? firstPet : DEFAULT_CARD_BACK,
        ),
      );
    }
  }
  $("blindBoxOverlay")?.classList.add("active");
}

function closeBlindBoxModal() {
  $("blindBoxOverlay")?.classList.remove("active");
  currentBlindBox = null;
  blindBoxResultReady = false;
}

function playBlindBoxResult(result) {
  const stage = $("blindBoxStage");
  if (!stage) return;
  $("blindBoxOverlay")?.classList.add("active");
  stage.innerHTML = "";
  const rewardType = result.rewardType === "pet" ? "pet" : "cardBack";
  const finalId = rewardType === "pet" ? result.petId : result.cardBackId;
  const pool = result.pool && result.pool.length ? result.pool : [finalId];
  let tick = 0;
  const timer = setInterval(() => {
    const id = pool[tick % pool.length];
    stage.innerHTML = "";
    const next = createBlindBoxRewardPreview(rewardType, id);
    next.classList.add("blindbox-rolling-card");
    stage.appendChild(next);
    tick += 1;
  }, 80);
  setTimeout(() => {
    clearInterval(timer);
    stage.innerHTML = "";
    const finalCard = createBlindBoxRewardPreview(rewardType, finalId);
    finalCard.classList.add("blindbox-final-card");
    stage.appendChild(finalCard);
    const buy = $("blindBoxBuyBtn");
    if (buy) {
      buy.textContent = "\u786e\u8ba4";
      buy.disabled = false;
    }
    currentBlindBox = null;
    blindBoxResultReady = true;
    toast(rewardType === "pet" ? "获得新小宠物" : "\u83b7\u5f97\u65b0\u724c\u80cc");
  }, 1500);
}

if ($("blindBoxClose")) $("blindBoxClose").addEventListener("click", closeBlindBoxModal);
if ($("blindBoxOverlay")) {
  $("blindBoxOverlay").addEventListener("click", (e) => {
    if (e.target === $("blindBoxOverlay")) closeBlindBoxModal();
  });
}
if ($("blindBoxBuyBtn")) {
  $("blindBoxBuyBtn").addEventListener("click", () => {
    if (blindBoxResultReady) {
      closeBlindBoxModal();
      return;
    }
    if (!currentBlindBox) return;
    Net.send("shop:buyBlindBox", { id: currentBlindBox.id });
  });
}

// Show avatar button when logged in
function showAvatarBtn(show) {
  const btn = $("avatarBtn");
  if (btn) {
    btn.style.display = show ? "inline-flex" : "none";
    if (show) updateAvatarBtn();
  }
}

function updateAvatarBtn() {
  const btn = $("avatarBtn");
  if (!btn || !userProfile) return;
  const icon = document.createElement("span");
  icon.className = "avatar-btn-icon";
  renderAvatar(icon, userProfile.avatar || PLAYER_AVATARS[0]);
  btn.replaceChildren(icon, document.createTextNode("换装"));
}
