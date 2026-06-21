let adminCatalog = null;
let adminUsers = [];
let adminScoreboardDiagnostics = [];
let adminGiftDraftRewards = [];
let selectedGiftRewardType = "coins";
let selectedGiftEmotionId = "rose";
let selectedGiftCardBackId = "";

function loadAdminDashboard() {
  Net.send("admin:getDashboard");
}

function renderAdminDashboard(data = {}) {
  if (data.catalog) adminCatalog = data.catalog;
  if (data.users) adminUsers = data.users;
  if (data.scoreboardDiagnostics) {
    adminScoreboardDiagnostics = data.scoreboardDiagnostics;
  }
  window.adminCatalog = adminCatalog;
  renderAdminCategories();
  renderAdminShop();
  renderGiftRewardBuilder();
  renderAdminGifts();
  renderAdminUsers();
  renderAdminDiagnostics();
  window.AdminPetStage?.sync(adminCatalog?.pets || []);
}

function getAdminCardBackName(id) {
  const cardBack = adminCatalog?.cardBacks?.find((item) => item.id === id);
  return cardBack?.name || id;
}

function getAdminEmotionName(id) {
  return EMOTION_BY_ID[id]?.label || id;
}

function getRewardText(reward) {
  if (reward.type === "coins") return "\u91d1\u5e01 x" + reward.amount;
  if (reward.type === "emotion") {
    return getAdminEmotionName(reward.id) + " x" + reward.amount;
  }
  if (reward.type === "cardBack") return "\u724c\u80cc " + getAdminCardBackName(reward.id);
  return reward.type;
}

function setGiftRewardType(type) {
  selectedGiftRewardType = type;
  document.querySelectorAll("#giftRewardTabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.type === type);
  });
  [
    ["coins", "rewardPaneCoins"],
    ["emotion", "rewardPaneEmotion"],
    ["cardBack", "rewardPaneCardBack"],
  ].forEach(([key, id]) => {
    $(id)?.classList.toggle("active", key === type);
  });
}

function renderGiftRewardBuilder() {
  renderGiftEmotionPicker();
  renderGiftCardBackPicker();
  renderGiftRewardList();
  setGiftRewardType(selectedGiftRewardType);
}

function renderGiftEmotionPicker() {
  const grid = $("giftEmotionPicker");
  if (!grid) return;
  const emotions = EMOTION_CATALOG.filter((item) => !item.unlimited);
  if (!emotions.some((item) => item.id === selectedGiftEmotionId)) {
    selectedGiftEmotionId = emotions[0]?.id || "";
  }
  grid.innerHTML = "";
  emotions.forEach((emotion) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "admin-pick-option emotion-pick" +
      (emotion.id === selectedGiftEmotionId ? " selected" : "");
    btn.innerHTML = `<span>${emotion.emoji}</span><strong>${emotion.label}</strong>`;
    btn.addEventListener("click", () => {
      selectedGiftEmotionId = emotion.id;
      renderGiftEmotionPicker();
    });
    grid.appendChild(btn);
  });
}

function renderGiftCardBackPicker() {
  const grid = $("giftCardBackPicker");
  if (!grid || !adminCatalog) return;
  const cardBacks = (adminCatalog.cardBacks || []).filter(
    (item) => item.id !== DEFAULT_CARD_BACK,
  );
  if (!cardBacks.some((item) => item.id === selectedGiftCardBackId)) {
    selectedGiftCardBackId = cardBacks[0]?.id || "";
  }
  grid.innerHTML = "";
  cardBacks.forEach((cardBack) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "admin-pick-option cardback-pick" +
      (cardBack.id === selectedGiftCardBackId ? " selected" : "");
    btn.appendChild(createCardBackPreview(cardBack.id));
    const label = document.createElement("strong");
    label.textContent = cardBack.name || cardBack.id;
    btn.appendChild(label);
    btn.addEventListener("click", () => {
      selectedGiftCardBackId = cardBack.id;
      renderGiftCardBackPicker();
    });
    grid.appendChild(btn);
  });
}

function renderGiftRewardList() {
  const list = $("giftRewardList");
  if (!list) return;
  list.innerHTML = "";
  if (!adminGiftDraftRewards.length) {
    list.innerHTML = '<div class="admin-empty-hint">\u8fd8\u6ca1\u6709\u6dfb\u52a0\u5956\u52b1</div>';
    return;
  }
  adminGiftDraftRewards.forEach((reward, index) => {
    const row = document.createElement("div");
    row.className = "admin-reward-chip";
    row.innerHTML = `<span>${getRewardText(reward)}</span><button type="button">&times;</button>`;
    row.querySelector("button").addEventListener("click", () => {
      adminGiftDraftRewards.splice(index, 1);
      renderGiftRewardList();
    });
    list.appendChild(row);
  });
}

function addGiftReward(reward) {
  if (!reward) return;
  if (reward.type === "cardBack") {
    const exists = adminGiftDraftRewards.some(
      (item) => item.type === "cardBack" && item.id === reward.id,
    );
    if (exists) {
      toast("\u8fd9\u5f20\u724c\u80cc\u5df2\u7ecf\u5728\u5956\u52b1\u91cc");
      return;
    }
  }
  adminGiftDraftRewards.push(reward);
  renderGiftRewardList();
}

function renderAdminCategories() {
  const list = $("adminCategoryList");
  if (!list || !adminCatalog) return;
  list.innerHTML = "";
  (adminCatalog.shopCategories || []).forEach((category) => {
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `
      <input class="admin-input" value="${category.name}" data-field="name" />
      <input class="admin-num" type="number" value="${category.order || 0}" data-field="order" />
      <label class="admin-check"><input type="checkbox" ${category.enabled ? "checked" : ""} data-field="enabled" /> 上架</label>
      <button class="admin-mini-btn">保存</button>
    `;
    row.querySelector("button").addEventListener("click", () => {
      Net.send("admin:updateCategory", {
        id: category.id,
        name: row.querySelector('[data-field="name"]').value,
        order: Number(row.querySelector('[data-field="order"]').value),
        enabled: row.querySelector('[data-field="enabled"]').checked,
      });
    });
    list.appendChild(row);
  });
}

function getCategoryOptions(selected) {
  return (adminCatalog?.shopCategories || [])
    .map(
      (category) =>
        `<option value="${category.id}" ${category.id === selected ? "selected" : ""}>${category.name}</option>`,
    )
    .join("");
}

function renderAdminShop() {
  const list = $("adminShopList");
  if (!list || !adminCatalog) return;
  list.innerHTML = "";
  const itemByCardBack = new Map(
    (adminCatalog.shopItems || []).map((item) => [item.cardBackId, item]),
  );
  (adminCatalog.cardBacks || []).forEach((cardBack) => {
    if (cardBack.id === DEFAULT_CARD_BACK) return;
    const item = itemByCardBack.get(cardBack.id) || {
      id: "cardback-" + cardBack.id,
      cardBackId: cardBack.id,
      categoryId: "card-backs",
      price: 200,
      enabled: false,
    };
    const row = document.createElement("div");
    row.className = "admin-row admin-shop-row";
    const preview = createCardBackPreview(cardBack.id);
    row.appendChild(preview);
    const name = document.createElement("div");
    name.className = "admin-shop-name";
    name.textContent = cardBack.name || cardBack.id;
    row.appendChild(name);
    const controls = document.createElement("div");
    controls.className = "admin-shop-controls";
    controls.innerHTML = `
      <select class="admin-input" data-field="categoryId">${getCategoryOptions(item.categoryId)}</select>
      <input class="admin-num" type="number" min="0" value="${item.price || 0}" data-field="price" />
      <label class="admin-check"><input type="checkbox" ${item.enabled ? "checked" : ""} data-field="enabled" /> 上架</label>
      <button class="admin-mini-btn">保存</button>
    `;
    controls.querySelector("button").addEventListener("click", () => {
      Net.send("admin:updateShopItem", {
        id: item.id,
        cardBackId: cardBack.id,
        categoryId: controls.querySelector('[data-field="categoryId"]').value,
        price: Number(controls.querySelector('[data-field="price"]').value),
        enabled: controls.querySelector('[data-field="enabled"]').checked,
      });
    });
    row.appendChild(controls);
    list.appendChild(row);
  });

  (adminCatalog.blindBoxes || []).forEach((box) => {
    const row = document.createElement("div");
    row.className = "admin-row admin-shop-row";
    row.innerHTML = `
      <div class="blindbox-shop-icon"></div>
      <div class="admin-shop-name">${box.name}</div>
      <div class="admin-shop-controls">
        <select class="admin-input" data-field="categoryId">${getCategoryOptions(box.categoryId)}</select>
        <input class="admin-num" type="number" min="0" value="${box.price || 0}" data-field="price" />
        <label class="admin-check"><input type="checkbox" ${box.enabled ? "checked" : ""} data-field="enabled" /> 上架</label>
        <button class="admin-mini-btn">保存</button>
      </div>
    `;
    row.querySelector("button").addEventListener("click", () => {
      Net.send("admin:updateBlindBox", {
        id: box.id,
        categoryId: row.querySelector('[data-field="categoryId"]').value,
        price: Number(row.querySelector('[data-field="price"]').value),
        enabled: row.querySelector('[data-field="enabled"]').checked,
      });
    });
    list.appendChild(row);
  });
}

function renderAdminGifts() {
  const list = $("adminGiftList");
  if (!list || !adminCatalog) return;
  list.innerHTML = "";
  (adminCatalog.holidayGifts || []).forEach((gift) => {
    const row = document.createElement("div");
    row.className = "admin-row admin-gift-row";
    row.innerHTML = `
      <div>
        <div class="admin-row-title">${gift.name}</div>
        <div class="admin-row-sub">${gift.startsAt} - ${gift.endsAt}</div>
      </div>
      <div class="admin-row-sub">${gift.enabled ? "有效" : "已下架"}</div>
      <button class="admin-mini-btn" ${gift.enabled ? "" : "disabled"}>下架</button>
    `;
    row.querySelector("button").addEventListener("click", () => {
      Net.send("admin:disableHolidayGift", { id: gift.id });
    });
    list.appendChild(row);
  });
}

function renderAdminUsers() {
  const list = $("adminUserList");
  if (!list) return;
  list.innerHTML = "";
  adminUsers.forEach((user) => {
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `
      <div>
        <div class="admin-row-title">${user.username}</div>
        <div class="admin-row-sub">${user.role} · ${user.disabled ? "已删除" : "正常"} · 金币 ${user.coins || 0}</div>
      </div>
      <button class="admin-mini-btn danger" ${user.role === "admin" || user.disabled ? "disabled" : ""}>删除</button>
    `;
    row.querySelector("button").addEventListener("click", () => {
      if (confirm("确认删除账号 " + user.username + " ?")) {
        Net.send("admin:disableUser", { username: user.username });
      }
    });
    list.appendChild(row);
  });
}

function formatAdminTime(ts) {
  if (!ts) return "-";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function renderScoreList(scores = []) {
  if (!scores.length) return '<div class="admin-diagnostic-line">没有</div>';
  return scores
    .map((score) => {
      const value = Number(score.score || 0);
      return `<div class="admin-diagnostic-line">${score.name || score.id}: ${value > 0 ? "+" : ""}${value}</div>`;
    })
    .join("");
}

function renderPlayerSnapshot(players = []) {
  if (!players.length) return '<div class="admin-diagnostic-line">没有</div>';
  return players
    .map((player) => {
      const parts = [
        player.name || player.id,
        "开始 " + (player.startStack ?? "-"),
        "结束 " + (player.finalStack ?? player.stack ?? "-"),
      ];
      if (typeof player.delta === "number") {
        parts.push("变化 " + (player.delta > 0 ? "+" : "") + player.delta);
      }
      if (player.refilled) parts.push("已补筹码");
      return `<div class="admin-diagnostic-line">${parts.join(" · ")}</div>`;
    })
    .join("");
}

function renderHandSnapshot(snapshot, index) {
  if (!snapshot || snapshot.missing) {
    return `
      <div class="admin-diagnostic-section">
        <div class="admin-diagnostic-section-title">前${2 - index}手快照</div>
        <div class="admin-diagnostic-line">没有</div>
      </div>
    `;
  }
  return `
    <div class="admin-diagnostic-section">
      <div class="admin-diagnostic-section-title">手牌 #${snapshot.handNum} · ${formatAdminTime(snapshot.recordedAt)}</div>
      <div class="admin-diagnostic-grid">
        <div>${renderPlayerSnapshot(snapshot.players || [])}</div>
        <div>${renderScoreList(snapshot.scoreboard || [])}</div>
      </div>
    </div>
  `;
}

function renderAdminDiagnostics() {
  const list = $("adminDiagnosticsList");
  if (!list) return;
  list.innerHTML = "";
  if (!adminScoreboardDiagnostics.length) {
    list.innerHTML = '<div class="admin-diagnostic-empty">暂无计分板异常记录</div>';
    return;
  }
  adminScoreboardDiagnostics.forEach((report) => {
    const card = document.createElement("div");
    card.className = "admin-row admin-diagnostic-card";
    card.innerHTML = `
      <div class="admin-diagnostic-head">
        <div>
          <div class="admin-row-title">房间 ${report.roomCode || "-"} · 下一手 #${report.nextHandNum || "-"}</div>
          <div class="admin-row-sub">${formatAdminTime(report.createdAt)} · 房主 ${report.hostName || "-"}</div>
        </div>
        <div class="admin-diagnostic-total">总和 ${report.total > 0 ? "+" : ""}${report.total || 0}</div>
      </div>
      <div class="admin-diagnostic-section">
        <div class="admin-diagnostic-section-title">当前房间玩家</div>
        <div class="admin-diagnostic-grid">
          ${(report.players || [])
            .map(
              (player) =>
                `<div class="admin-diagnostic-line">${player.name || player.id}: 筹码 ${player.stack ?? "-"} · ${player.connected ? "在线" : "离线"}</div>`,
            )
            .join("") || '<div class="admin-diagnostic-line">没有</div>'}
        </div>
      </div>
      <div class="admin-diagnostic-section">
        <div class="admin-diagnostic-section-title">异常时计分板</div>
        <div class="admin-diagnostic-grid">${renderScoreList(report.scoreboard || [])}</div>
      </div>
      ${(report.handSnapshots || []).map(renderHandSnapshot).join("")}
    `;
    list.appendChild(card);
  });
}

Net.on("admin:dashboard", renderAdminDashboard);
Net.on("admin:catalog", (d) => renderAdminDashboard({ catalog: d.catalog }));
Net.on("admin:users", (d) => renderAdminDashboard({ users: d.users }));
Net.on("admin:userDisabled", (d) => renderAdminDashboard({ users: d.users }));
Net.on("admin:scoreboardDiagnostics", (d) =>
  renderAdminDashboard({ scoreboardDiagnostics: d.reports || [] }),
);
Net.on("admin:error", (d) => toast(d.message || "\u540e\u53f0\u64cd\u4f5c\u5931\u8d25"));

if ($("adminLogoutBtn")) $("adminLogoutBtn").addEventListener("click", () => logoutUser());
if ($("adminRefreshCatalog")) $("adminRefreshCatalog").addEventListener("click", () => Net.send("admin:getCatalog"));
if ($("adminRefreshUsers")) $("adminRefreshUsers").addEventListener("click", () => Net.send("admin:listUsers"));
if ($("adminRefreshDiagnostics")) {
  $("adminRefreshDiagnostics").addEventListener("click", () =>
    Net.send("admin:getScoreboardDiagnostics"),
  );
}
if ($("adminAddCategory")) {
  $("adminAddCategory").addEventListener("click", () => {
    const name = prompt("分类名称");
    if (name) Net.send("admin:updateCategory", { name, enabled: true });
  });
}
if ($("giftRewardTabs")) {
  $("giftRewardTabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-type]");
    if (btn) setGiftRewardType(btn.dataset.type);
  });
}
if ($("addCoinReward")) {
  $("addCoinReward").addEventListener("click", () => {
    const amount = Number($("giftCoinAmount").value);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast("\u8bf7\u8f93\u5165\u91d1\u5e01\u6570\u91cf");
      return;
    }
    addGiftReward({ type: "coins", amount: Math.floor(amount) });
    $("giftCoinAmount").value = "";
  });
}
if ($("addEmotionReward")) {
  $("addEmotionReward").addEventListener("click", () => {
    const amount = Number($("giftEmotionAmount").value);
    if (!selectedGiftEmotionId) {
      toast("\u8bf7\u9009\u62e9\u5c40\u5185\u793c\u7269");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast("\u8bf7\u8f93\u5165\u5c40\u5185\u793c\u7269\u6570\u91cf");
      return;
    }
    addGiftReward({
      type: "emotion",
      id: selectedGiftEmotionId,
      amount: Math.floor(amount),
    });
  });
}
if ($("addCardBackReward")) {
  $("addCardBackReward").addEventListener("click", () => {
    if (!selectedGiftCardBackId) {
      toast("\u8bf7\u9009\u62e9\u724c\u80cc");
      return;
    }
    addGiftReward({ type: "cardBack", id: selectedGiftCardBackId });
  });
}
if ($("adminCreateGift")) {
  $("adminCreateGift").addEventListener("click", () => {
    if (!adminGiftDraftRewards.length) {
      toast("\u8bf7\u5148\u6dfb\u52a0\u81f3\u5c11\u4e00\u4e2a\u5956\u52b1");
      return;
    }
    Net.send("admin:createHolidayGift", {
      name: $("giftNameInput").value,
      startsAt: $("giftStartInput").value,
      endsAt: $("giftEndInput").value,
      rewards: adminGiftDraftRewards.map((reward) => ({ ...reward })),
    });
    adminGiftDraftRewards = [];
    renderGiftRewardList();
  });
}
