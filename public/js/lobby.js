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
    Net.send("user:setAvatar", {
      avatar: selectedAvatar,
      color: selectedColor,
    });
    userProfile.avatar = selectedAvatar;
    userProfile.avatarColor = selectedColor;
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
