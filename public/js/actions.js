const MechanicalActionDesk = (() => {
  const desk = $("mechanicalActionDesk");
  const sizing = $("deskSizing");
  const keys = $("deskKeys");
  const lamp = $("deskTurnLamp");
  const amount = $("deskRaiseAmount");
  const range = $("deskRaiseRange");
  const pass = $("deskPass");
  const passLabel = $("deskPassLabel");
  const raise = $("deskRaise");
  const callAmount = $("deskCallAmount");
  const detent = 5;
  let sizingData;
  let selected = 0;
  let touchPointer = null;

  MechanicalReels.set(amount, 0, { minDigits: 5, quick: true, label: "下注或加注总额" });
  MechanicalReels.set(callAmount, 0, { minDigits: 4, quick: true });

  function setAmount(value) {
    const { min, max } = sizingData;
    const next = Math.min(max, Math.max(min, value));
    if (range.valueAsNumber !== next) range.value = next;
    if (next === selected) return;
    selected = next;
    range.setAttribute("aria-valuetext", `${selected} 筹码`);
    MechanicalReels.set(amount, selected);
  }

  function snapToDetent(value) {
    const { min, max } = sizingData;
    if (value >= max) return max;
    // Keep the precise server maximum on the end stop, including a short final interval.
    const lastNotch = Math.ceil((max - min) / detent) - 1;
    return min + Math.min(lastNotch, Math.round((value - min) / detent)) * detent;
  }

  function selectDetent(value) {
    const previous = selected;
    setAmount(snapToDetent(value));
    if (selected !== previous) SFX.ratchet();
  }

  function trackTouch(clientX) {
    if (sizing.disabled) return;
    const rect = range.getBoundingClientRect();
    const thumbWidth = parseFloat(getComputedStyle(range).getPropertyValue("--desk-thumb-width"));
    const inset = thumbWidth / 2 * rect.width / range.offsetWidth;
    const progress = Math.max(0, Math.min(1, (clientX - rect.left - inset) / (rect.width - 2 * inset)));
    const { min, max } = sizingData;
    selectDetent(min + progress * (max - min));
  }

  function releaseTouch() {
    const pointer = touchPointer;
    touchPointer = null;
    if (pointer !== null && range.hasPointerCapture(pointer)) range.releasePointerCapture(pointer);
  }

  function moveDetents(direction, count = 1) {
    const offset = (selected - sizingData.min) / detent;
    const notch = direction > 0 ? Math.floor(offset + 1e-10) : Math.ceil(offset - 1e-10);
    setAmount(sizingData.min + (notch + direction * count) * detent);
  }

  function enable(data, resetAmount) {
    const min = Number(data.minRaise);
    const max = Number(data.maxRaise);
    const roundBet = Number(gameState?.roundBet || 0);
    const stack = gameState?.players.find(player => player.id === Net.playerId)?.stack ?? max;
    const call = Math.max(0, Math.min(Number(data.toCall) || 0, stack));
    const canRaise = !data.allInOrFold && Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min;
    const street = `${gameState?.handNum}:${gameState?.phase}`;
    const newStreet = sizingData?.street !== street;
    if (newStreet || !canRaise || max === min) releaseTouch();
    keys.disabled = false;
    sizing.disabled = !canRaise || max === min;
    raise.disabled = !canRaise;
    pass.disabled = data.allInOrFold && call > 0;
    pass.dataset.action = call > 0 ? "call" : "check";
    passLabel.textContent = call > 0 ? "跟注" : "过牌";
    pass.setAttribute("aria-label", call > 0 ? `跟注 ${call}` : "过牌");
    MechanicalReels.set(callAmount, call);
    raise.textContent = roundBet > 0 ? "加注" : "下注";
    lamp.setAttribute("aria-label", "轮到你行动");
    sizingData = { street, min, max, roundBet, call, pot: Number(data.pot) || 0 };
    if (!canRaise) {
      selected = 0;
      MechanicalReels.set(amount, 0);
      return;
    }

    range.min = min;
    range.max = max;
    if (resetAmount || newStreet) setAmount(min);
    else setAmount(selected);
  }

  function lock() {
    releaseTouch();
    sizing.disabled = keys.disabled = true;
    lamp.setAttribute("aria-label", "操作台已锁定");
  }

  const actionButtons = {
    fold: $("deskFold"), pass, raise, allin: $("deskAllin"),
  };
  actionButtons.fold.addEventListener("click", () => $("btnFold").click());
  pass.addEventListener("click", () => $(pass.dataset.action === "call" ? "btnCall" : "btnCheck").click());
  actionButtons.allin.addEventListener("click", () => $("btnAllin").click());
  raise.addEventListener("click", () => sendRaise(selected));
  range.addEventListener("input", () => selectDetent(range.valueAsNumber));
  range.addEventListener("pointerdown", event => {
    if (event.pointerType !== "touch" || !event.isPrimary || sizing.disabled) return;
    event.preventDefault();
    touchPointer = event.pointerId;
    range.setPointerCapture(event.pointerId);
    trackTouch(event.clientX);
  });
  range.addEventListener("pointermove", event => {
    if (event.pointerId === touchPointer) trackTouch(event.clientX);
  });
  range.addEventListener("pointerup", event => {
    if (event.pointerId !== touchPointer) return;
    trackTouch(event.clientX);
    releaseTouch();
  });
  range.addEventListener("pointercancel", event => {
    if (event.pointerId === touchPointer) releaseTouch();
  });
  range.addEventListener("lostpointercapture", event => {
    if (event.pointerId === touchPointer) touchPointer = null;
  });
  range.addEventListener("keydown", event => {
    switch (event.key) {
      case "ArrowRight": case "ArrowUp": moveDetents(1); break;
      case "ArrowLeft": case "ArrowDown": moveDetents(-1); break;
      case "PageUp": moveDetents(1, 10); break;
      case "PageDown": moveDetents(-1, 10); break;
      case "Home": setAmount(sizingData.min); break;
      case "End": setAmount(sizingData.max); break;
      default: return;
    }
    event.preventDefault();
  });
  desk.querySelectorAll("[data-raise-size]").forEach(button => {
    button.addEventListener("click", () => {
      const ratio = button.dataset.raiseSize;
      if (ratio === "min") {
        setAmount(Number(range.min));
        return;
      }
      const { min, max, roundBet, call, pot } = sizingData;
      // A pot-sized raise includes the call before adding the chosen fraction.
      const total = roundBet + (pot + call) * Number(ratio);
      setAmount(Number.isInteger(min) && Number.isInteger(max) ? Math.round(total) : total);
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
  const height = !MechanicalTable.enabled() && panelActive ? Math.ceil(panel.getBoundingClientRect().height) : 0;
  container.style.setProperty("--action-panel-height", `${height}px`);
  if (typeof syncAutoCallControls === "function") {
    syncAutoCallControls(lastTurnActionData || {});
  }
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
