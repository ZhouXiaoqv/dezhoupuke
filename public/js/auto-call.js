// ===== AUTO CHECK / CALL =====
const AUTO_CALL_ENABLED_KEY = "poker_auto_call_enabled";
const AUTO_CALL_LIMIT_KEY = "poker_auto_call_limit";
window.autoCallEnabled = localStorage.getItem(AUTO_CALL_ENABLED_KEY) === "1";
let lastAutoActionKey = "";

function getAutoCallLimit() {
  const input = $("autoCallAmount");
  const raw = input ? input.value : localStorage.getItem(AUTO_CALL_LIMIT_KEY);
  const limit = parseInt(raw || "0", 10);
  return Number.isFinite(limit) && limit > 0 ? limit : 0;
}

function setAutoCallEnabled(enabled) {
  window.autoCallEnabled = !!enabled;
  localStorage.setItem(
    AUTO_CALL_ENABLED_KEY,
    window.autoCallEnabled ? "1" : "0",
  );
  if (typeof syncAutoCallControls === "function") {
    syncAutoCallControls(lastTurnActionData || {});
  }
}

function getAutoActionKey(data, action) {
  const state = typeof gameState !== "undefined" && gameState ? gameState : {};
  return [
    action,
    data?.playerId || Net.playerId || "",
    state.handNum || "",
    state.phase || "",
    state.currentIdx ?? "",
    data?.toCall || 0,
    data?.pot || 0,
  ].join(":");
}

function sendAutoAction(action) {
  hideActions();
  if (typeof SFX !== "undefined") SFX.btnClick();
  if (action === "call") {
    const mySeat = getMySeatEl();
    if (mySeat) {
      spawnChipFly(mySeat, "#d4a840");
      spawnChipFly(mySeat, "#cc3333");
    }
  }
  Net.send("game:action", { action });
}

function maybeAutoCall(data = {}) {
  if (!window.autoCallEnabled || isSpectator) return false;
  if (data.playerId && data.playerId !== Net.playerId) return false;

  const toCall = Number(data.toCall || 0);
  let action = "";
  if (toCall <= 0) {
    action = "check";
  } else {
    if (data.allInOrFold) return false;
    const limit = getAutoCallLimit();
    if (!limit || toCall > limit) return false;
    action = "call";
  }

  const key = getAutoActionKey(data, action);
  if (key === lastAutoActionKey) return true;
  lastAutoActionKey = key;
  setTimeout(() => {
    if (lastAutoActionKey === key) lastAutoActionKey = "";
  }, 1800);
  setTimeout(() => sendAutoAction(action), 80);
  return true;
}

(function initAutoCallControls() {
  const input = $("autoCallAmount");
  const toggle = $("autoCallToggle");
  if (!input || !toggle) return;

  input.value = localStorage.getItem(AUTO_CALL_LIMIT_KEY) || "";
  input.addEventListener("input", () => {
    const value = input.value.replace(/[^\d]/g, "");
    if (value !== input.value) input.value = value;
    if (value) localStorage.setItem(AUTO_CALL_LIMIT_KEY, value);
    else localStorage.removeItem(AUTO_CALL_LIMIT_KEY);
  });
  input.addEventListener("change", () => {
    const limit = getAutoCallLimit();
    input.value = limit ? String(limit) : "";
  });
  toggle.addEventListener("click", () => {
    setAutoCallEnabled(!window.autoCallEnabled);
    toast(
      window.autoCallEnabled
        ? "\u5df2\u5f00\u542f\u81ea\u52a8\u8ddf\u6ce8"
        : "\u5df2\u5173\u95ed\u81ea\u52a8\u8ddf\u6ce8",
    );
  });
  if (typeof syncAutoCallControls === "function") {
    syncAutoCallControls(lastTurnActionData || {});
  }
})();
