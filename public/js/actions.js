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
}

function showActions(data) {
  const panel = $("actionPanel");
  const customInput = $("customRaiseInput");
  const customAmount = $("customRaiseAmount");
  lastTurnActionData = { ...lastTurnActionData, ...data };
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
