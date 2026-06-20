const HOLIDAY_GIFT_SHEET =
  "assets/animations/holiday-gift-box/holiday-gift-box-sheet.png";
const HOLIDAY_GIFT_FRAME_COUNT = 16;
const HOLIDAY_GIFT_COLS = 4;
const HOLIDAY_GIFT_FPS = 12;

function setHolidayGiftFrame(el, frameIndex) {
  if (!el) return;
  const frame = Math.max(0, Math.min(HOLIDAY_GIFT_FRAME_COUNT - 1, frameIndex || 0));
  const col = frame % HOLIDAY_GIFT_COLS;
  const row = Math.floor(frame / HOLIDAY_GIFT_COLS);
  el.style.backgroundPosition =
    (col / (HOLIDAY_GIFT_COLS - 1)) * 100 + "% " +
    (row / (HOLIDAY_GIFT_COLS - 1)) * 100 + "%";
}

function createHolidayGiftSprite(className = "holiday-gift-sprite") {
  const el = document.createElement("div");
  el.className = className;
  el.style.backgroundImage = `url("${HOLIDAY_GIFT_SHEET}")`;
  setHolidayGiftFrame(el, 0);
  return el;
}

function playHolidayGiftOpen(stage, done) {
  stage.innerHTML = "";
  const sprite = createHolidayGiftSprite("holiday-open-sprite");
  stage.appendChild(sprite);
  let frame = 0;
  const timer = setInterval(() => {
    setHolidayGiftFrame(sprite, frame);
    frame += 1;
    if (frame >= HOLIDAY_GIFT_FRAME_COUNT) {
      clearInterval(timer);
      if (done) done();
    }
  }, 1000 / HOLIDAY_GIFT_FPS);
}

function updateHolidayBookmark(gifts) {
  holidayGifts = Array.isArray(gifts) ? gifts : [];
  const bookmark = $("holidayGiftBookmark");
  if (!bookmark) return;
  bookmark.classList.toggle("visible", holidayGifts.length > 0);
  if (!holidayGifts.length) $("holidayGiftDropdown")?.classList.remove("active");
  renderHolidayGiftGrid();
}

function renderHolidayGiftGrid() {
  const grid = $("holidayGiftGrid");
  if (!grid) return;
  grid.innerHTML = "";
  holidayGifts.forEach((gift) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "holiday-gift-cell";
    item.appendChild(createHolidayGiftSprite("holiday-gift-cell-icon"));
    const name = document.createElement("div");
    name.className = "holiday-gift-name";
    name.textContent = gift.name;
    item.appendChild(name);
    item.addEventListener("click", () => {
      $("holidayGiftDropdown")?.classList.remove("active");
      Net.send("holiday:claim", { id: gift.id });
    });
    grid.appendChild(item);
  });
}

function rewardLabel(reward) {
  if (reward.type === "coins") return "\u91d1\u5e01";
  if (reward.type === "emotion") return EMOTION_BY_ID[reward.id]?.label || reward.id;
  if (reward.type === "cardBack") return getCardBackDef(reward.id).name || reward.id;
  return reward.type;
}

function createRewardIcon(reward) {
  if (reward.type === "cardBack") return createCardBackPreview(reward.id);
  const icon = document.createElement("div");
  icon.className = "holiday-reward-icon";
  if (reward.type === "coins") icon.textContent = "\u91d1";
  else if (reward.type === "emotion") icon.textContent = EMOTION_BY_ID[reward.id]?.emoji || "\u2726";
  else icon.textContent = "\u2726";
  return icon;
}

function showHolidayRewards(data) {
  const overlay = $("holidayGiftResult");
  const stage = $("holidayOpenStage");
  const row = $("holidayRewardRow");
  if (!overlay || !stage || !row) return;
  overlay.classList.add("active");
  row.innerHTML = "";
  $("holidayResultTitle").textContent = data.gift?.name || "\u9886\u53d6\u6210\u529f";
  playHolidayGiftOpen(stage, () => {
    const rewards = data.rewards || [];
    if (!rewards.length) {
      row.innerHTML = '<div class="holiday-empty-reward">\u5df2\u62e5\u6709\u7684\u91cd\u590d\u724c\u80cc\u5df2\u8df3\u8fc7</div>';
      return;
    }
    rewards.forEach((reward) => {
      const cell = document.createElement("div");
      cell.className = "holiday-reward-cell";
      cell.appendChild(createRewardIcon(reward));
      const label = document.createElement("div");
      label.className = "holiday-reward-label";
      label.textContent = rewardLabel(reward);
      const amount = document.createElement("div");
      amount.className = "holiday-reward-amount";
      amount.textContent = reward.duplicate
        ? "\u5df2\u62e5\u6709"
        : "x" + (reward.amount || 1);
      if (reward.duplicate) cell.classList.add("duplicate");
      cell.appendChild(label);
      cell.appendChild(amount);
      row.appendChild(cell);
    });
  });
}

Net.on("holiday:list", (d) => {
  updateHolidayBookmark(d.gifts || []);
});

Net.on("holiday:claimed", (d) => {
  if (d.profile) {
    userProfile = d.profile;
    updateUserArea();
    renderOwnedCardBacks();
  }
  updateHolidayBookmark(d.gifts || []);
  showHolidayRewards(d);
});

Net.on("holiday:error", (d) => {
  toast(d.message || "\u9886\u53d6\u5931\u8d25");
  Net.send("holiday:list");
});

if ($("holidayGiftBookmark")) {
  $("holidayGiftBookmark").appendChild(createHolidayGiftSprite("holiday-bookmark-icon"));
  $("holidayGiftBookmark").addEventListener("click", () => {
    if (!holidayGifts.length) return;
    $("holidayGiftDropdown")?.classList.toggle("active");
  });
}

if ($("holidayResultClose")) {
  $("holidayResultClose").addEventListener("click", () => {
    $("holidayGiftResult")?.classList.remove("active");
  });
}

if ($("holidayGiftResult")) {
  $("holidayGiftResult").addEventListener("click", (e) => {
    if (e.target === $("holidayGiftResult")) {
      $("holidayGiftResult").classList.remove("active");
    }
  });
}

document.addEventListener("click", (e) => {
  if (
    $("holidayGiftDropdown")?.classList.contains("active") &&
    !e.target.closest("#holidayGiftDropdown") &&
    !e.target.closest("#holidayGiftBookmark")
  ) {
    $("holidayGiftDropdown").classList.remove("active");
  }
});
