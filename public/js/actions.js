// ===== ACTION PANEL =====
function syncActionPanelOffset() {
  const container = $("table-container");
  const panel = $("actionPanel");
  if (!container || !panel) return;
  const panelActive = panel.classList.contains("active");
  container.classList.toggle("action-active", panelActive);
  const height = panelActive
    ? Math.ceil(panel.getBoundingClientRect().height)
    : 0;
  container.style.setProperty("--action-panel-height", `${height}px`);
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
  input.placeholder = "\u6700\u5927\u81ea\u52a8\u8ddf\u6ce8\u989d\u5ea6";
  input.max = max > 0 ? String(max) : "";
  input.disabled = false;
  toggle.classList.toggle("active", !!window.autoCallEnabled);
  toggle.textContent = window.autoCallEnabled
    ? "\u5173\u95ed\u81ea\u52a8\u8ddf\u6ce8"
    : "\u5f00\u542f\u81ea\u52a8\u8ddf\u6ce8";
  toggle.disabled = false;
  if (toCall <= 0) return;
  input.title = `\u5f53\u524d\u8ddf\u6ce8 ${toCall}`;
}

function showActions(data) {
  const panel = $("actionPanel");
  const customInput = $("customRaiseInput");
  const customAmount = $("customRaiseAmount");
  lastTurnActionData = { ...lastTurnActionData, ...data };
  syncAutoCallControls(lastTurnActionData);
  if (typeof maybeAutoCall === "function" && maybeAutoCall(lastTurnActionData)) {
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
