const MechanicalActionDesk = (() => {
  const desk = $("mechanicalActionDesk");
  const sizing = $("deskSizing");
  const keys = $("deskKeys");
  const lamp = $("deskTurnLamp");
  const amount = $("deskRaiseAmount");
  const range = $("deskRaiseRange");
  const pass = $("deskPass");
  const raise = $("deskRaise");
  const callAmount = $("deskCallAmount");
  let sizingData;

  function setAmount(value) {
    const selected = Math.min(Number(range.max), Math.max(Number(range.min), value));
    range.value = selected;
    amount.value = range.value;
  }

  function enable(data, resetAmount) {
    const min = Number(data.minRaise);
    const max = Number(data.maxRaise);
    const roundBet = Number(gameState?.roundBet || 0);
    const stack = gameState?.players.find(player => player.id === Net.playerId)?.stack ?? max;
    const call = Math.max(0, Math.min(Number(data.toCall) || 0, stack));
    const canRaise = !data.allInOrFold && min > 0 && max >= min;
    const street = `${gameState?.handNum}:${gameState?.phase}`;
    const newStreet = sizingData?.street !== street;
    keys.disabled = false;
    sizing.disabled = !canRaise || max === min;
    raise.disabled = !canRaise;
    pass.disabled = data.allInOrFold && call > 0;
    pass.dataset.action = call > 0 ? "call" : "check";
    $("deskPassLabel").textContent = call > 0 ? "跟注" : "过牌";
    callAmount.hidden = call === 0;
    callAmount.textContent = call > 0 ? call : "";
    raise.textContent = roundBet > 0 ? "加注" : "下注";
    lamp.setAttribute("aria-label", "轮到你行动");
    sizingData = { street, roundBet, call, pot: Number(data.pot) || 0 };
    if (!canRaise) {
      amount.value = "";
      return;
    }

    const rangeChanged = Number(range.min) !== min || Number(range.max) !== max;
    range.min = amount.min = min;
    range.max = amount.max = max;
    range.step = amount.step = Number.isInteger(min) && Number.isInteger(max) ? "1" : "any";
    if (resetAmount || newStreet) setAmount(min);
    else if (rangeChanged) setAmount(amount.valueAsNumber || min);
  }

  function lock() {
    sizing.disabled = keys.disabled = true;
    lamp.setAttribute("aria-label", "操作台已锁定");
  }

  const actionButtons = {
    fold: $("deskFold"), pass, raise, allin: $("deskAllin"),
  };
  actionButtons.fold.addEventListener("click", () => $("btnFold").click());
  pass.addEventListener("click", () => $(pass.dataset.action === "call" ? "btnCall" : "btnCheck").click());
  actionButtons.allin.addEventListener("click", () => $("btnAllin").click());
  raise.addEventListener("click", () => submitRaise(amount));
  range.addEventListener("input", () => { amount.value = range.value; });
  amount.addEventListener("input", () => { if (amount.value !== "") range.value = amount.value; });
  amount.addEventListener("change", () => { if (amount.value !== "") setAmount(Number(amount.value)); });
  desk.querySelectorAll("[data-raise-size]").forEach(button => {
    button.addEventListener("click", () => {
      const ratio = button.dataset.raiseSize;
      if (ratio === "min") {
        setAmount(Number(range.min));
        return;
      }
      const { roundBet, call, pot } = sizingData;
      // A pot-sized raise includes the call before adding the chosen fraction.
      const total = roundBet + (pot + call) * Number(ratio);
      setAmount(range.step === "1" ? Math.round(total) : total);
    });
  });

  return { enable, lock, press(action) { actionButtons[action].click(); } };
})();

// ===== ACTION PANEL =====
function syncActionPanelOffset() {
  const container = $("table-container");
  const panel = $("actionPanel");
  if (!container || !panel) return;
  const panelActive = panel.classList.contains("active");
  container.classList.toggle("action-active", panelActive);
  const mechanical = MechanicalTable.enabled();
  const box = panel.getBoundingClientRect();
  const height = box.height && (mechanical || panelActive)
    ? Math.ceil(box.height + (mechanical ? Math.max(0, innerHeight - box.bottom) : 0))
    : 0;
  container.style.setProperty("--action-panel-height", `${height}px`);
  if (mechanical && height) {
    document.documentElement.style.setProperty("--mechanical-desk-clearance", `${height + 14}px`);
  }
  if (typeof syncAutoCallControls === "function") {
    syncAutoCallControls(lastTurnActionData || {});
  }
}

function syncAutoCallControls(data = {}) {
  const input = $("autoCallAmount");
  const toggle = $("autoCallToggle");
  if (!input || !toggle) return;
  const toCall = Number(data.toCall || 0);
  const max = Number(data.maxRaise || 0);
  input.placeholder = MechanicalTable.enabled() ? "跟注上限" : "最大自动跟注额度";
  input.max = max > 0 ? String(max) : "";
  input.disabled = false;
  toggle.classList.toggle("active", !!window.autoCallEnabled);
  toggle.setAttribute("aria-pressed", String(!!window.autoCallEnabled));
  toggle.textContent = window.autoCallEnabled
    ? "\u5173\u95ed\u81ea\u52a8\u8ddf\u6ce8"
    : "\u5f00\u542f\u81ea\u52a8\u8ddf\u6ce8";
  toggle.disabled = false;
  input.title = toCall > 0 ? `当前跟注 ${toCall}` : "";
}

function showActions(data) {
  const panel = $("actionPanel");
  const mechanical = MechanicalTable.enabled();
  if (mechanical && !isMyTurnState()) {
    hideActions();
    return;
  }
  const customInput = $("customRaiseInput");
  const customAmount = $("customRaiseAmount");
  lastTurnActionData = { ...lastTurnActionData, ...data };
  syncAutoCallControls(lastTurnActionData);
  if (typeof maybeAutoCall === "function" && maybeAutoCall(lastTurnActionData)) {
    if (mechanical) hideActions();
    return;
  }
  if (mechanical) {
    MechanicalActionDesk.enable(lastTurnActionData, !panel.classList.contains("active"));
    panel.classList.add("active");
    syncActionPanelOffset();
    return;
  }
  if (data.allInOrFold) {
    $("btnCheck").style.display = "none";
    $("btnCall").style.display = "none";
    if (customInput) customInput.style.display = "none";
    // Show check if no bet to call
    if (data.toCall === 0) $("btnCheck").style.display = "";
  } else {
    $("btnCheck").style.display = data.toCall === 0 ? "" : "none";
    $("btnCall").style.display = data.toCall > 0 ? "" : "none";
    if (customInput) customInput.style.display = "flex";
    if (customAmount) {
      customAmount.min = data.minRaise;
      customAmount.max = data.maxRaise;
      customAmount.value = data.minRaise;
      customAmount.placeholder = `最低 ${data.minRaise}`;
    }
  }
  $("callAmount").textContent = data.toCall > 0 ? data.toCall : "";
  panel.classList.add("active");
  $("table-container").classList.add("action-active");
  syncActionPanelOffset();
  requestAnimationFrame(() =>
    requestAnimationFrame(syncActionPanelOffset),
  );
  setTimeout(syncActionPanelOffset, 350);
}

function hideActions() {
  $("actionPanel").classList.remove("active");
  $("table-container").classList.remove("action-active");
  MechanicalActionDesk.lock();
  syncActionPanelOffset();
  const table = $("table");
  if (table) table.classList.remove("table-your-turn");
  const turnLabel = $("turnLabel");
  if (turnLabel) turnLabel.classList.remove("visible");
  const customInput = $("customRaiseInput");
  if (customInput) customInput.style.display = "none";
  // 确保加注滑块隐藏
  const raiseSlider = $("raiseSliderGroup");
  if (raiseSlider) raiseSlider.style.display = "none";
  stopTurnTimer();
}
