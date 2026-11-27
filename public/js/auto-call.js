// ===== AUTO CHECK / CALL =====
const AUTO_CALL_ENABLED_KEY = "poker_auto_call_enabled";
const AUTO_CALL_LIMIT_KEY = "poker_auto_call_limit";
window.autoCallEnabled = localStorage.getItem(AUTO_CALL_ENABLED_KEY) === "1";
let lastAutoActionKey = "";
let pendingAutoFeedback;

function getAutoCallLimit() {
  const limit = parseInt(localStorage.getItem(AUTO_CALL_LIMIT_KEY) || "0", 10);
  return Number.isFinite(limit) && limit > 0 ? limit : 0;
}

function setAutoCallEnabled(enabled) {
  window.autoCallEnabled = !!enabled;
  localStorage.setItem(
    AUTO_CALL_ENABLED_KEY,
    window.autoCallEnabled ? "1" : "0",
  );
  syncAutoCallControls(lastTurnActionData || {});
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
  pendingAutoFeedback = { action, playerId: Net.playerId, handNum: gameState?.handNum,
    phase: gameState?.phase, expires: performance.now() + 1800 };
  sendGameAction(action);
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
  const deadline = gameState?.turn?.deadline;
  setTimeout(() => {
    if (MechanicalTable.enabled() && (!isMyTurnState() || deadline !== gameState?.turn?.deadline)) return;
    sendAutoAction(action);
  }, 80);
  return true;
}

const syncAutoCallControls = (() => {
  const control = $("autoCallControl");
  const toggle = $("autoCallToggle");
  const settings = $("autoCallSettings");
  const reels = $("autoCallReels");
  const minus = $("autoCallMinus");
  const plus = $("autoCallPlus");
  const lamp = $("autoCallLamp");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let hold, pulse;

  function stepSize() {
    const blind = Math.floor(Number(gameState?.bb));
    return Number.isFinite(blind) && blind > 0 ? blind : 20;
  }

  function stopHold(event) {
    if (!hold || (event?.pointerId !== undefined && event.pointerId !== hold.pointerId)) return;
    clearTimeout(hold.timer);
    hold = null;
  }

  function sync(data = {}) {
    const enabled = window.autoCallEnabled;
    control.toggleAttribute("data-enabled", enabled);
    toggle.setAttribute("aria-checked", String(enabled));
    settings.disabled = !enabled;
    if (!enabled) {
      stopHold();
      pulse?.cancel();
    }

    const limit = getAutoCallLimit();
    const step = stepSize();
    minus.disabled = limit === 0;
    minus.setAttribute("aria-label", `降低自动跟注上限 ${step} 筹码`);
    plus.setAttribute("aria-label", `提高自动跟注上限 ${step} 筹码`);
    MechanicalReels.set(reels, limit, { minDigits: 5, quick: true, label: "自动跟注上限" });
    if (!limit) reels.setAttribute("aria-label", "自动跟注上限 0，仅自动过牌");
    reels.title = limit ? (data.toCall > 0 ? `当前跟注 ${data.toCall}` : "自动跟注上限") : "上限为 0 时仅自动过牌";
  }

  function adjust(direction) {
    if (settings.disabled || !control.offsetWidth) return false;
    const limit = getAutoCallLimit();
    const next = Math.max(0, limit + direction * stepSize());
    if (next === limit || !Number.isFinite(next)) return false;
    if (next) localStorage.setItem(AUTO_CALL_LIMIT_KEY, String(next));
    else localStorage.removeItem(AUTO_CALL_LIMIT_KEY);
    sync(lastTurnActionData || {});
    SFX.ratchet();
    return true;
  }

  for (const [button, direction] of [[minus, -1], [plus, 1]]) {
    let repeated = false;
    button.addEventListener("pointerdown", event => {
      if (event.button !== 0 || button.matches(":disabled")) return;
      stopHold();
      repeated = false;
      button.setPointerCapture(event.pointerId);
      const repeat = () => {
        repeated = true;
        if (adjust(direction) && hold && !button.matches(":disabled")) hold.timer = setTimeout(repeat, 115);
        else stopHold();
      };
      hold = { pointerId: event.pointerId, timer: setTimeout(repeat, 340) };
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(event, stopHold);
    button.addEventListener("click", event => {
      if (repeated && event.detail) {
        repeated = false;
        return;
      }
      adjust(direction);
    });
  }
  window.addEventListener("blur", stopHold);

  toggle.addEventListener("click", () => {
    setAutoCallEnabled(!window.autoCallEnabled);
    SFX.cruiseSwitch();
    toast(
      window.autoCallEnabled
        ? "\u5df2\u5f00\u542f\u81ea\u52a8\u8ddf\u6ce8"
        : "\u5df2\u5173\u95ed\u81ea\u52a8\u8ddf\u6ce8",
    );
  });

  Net.on("game:actionLog", entry => {
    const pending = pendingAutoFeedback;
    const action = entry?.action === "allinCall" ? "call" : entry?.action;
    if (!pending || !entry || entry.timedOut || pending.expires < performance.now() || pending.playerId !== entry.playerId ||
        pending.handNum !== gameState?.handNum || pending.phase !== entry.phase || pending.action !== action) return;
    pendingAutoFeedback = null;
    if (!window.autoCallEnabled || reduced.matches) return;
    pulse?.cancel();
    pulse = lamp.animate([
      { filter: "brightness(1)" },
      { filter: "brightness(1.7) saturate(1.23)", offset: .37, boxShadow: "0 0 0 1px #90b978, 0 0 11px #9bef87" },
      { filter: "brightness(1)" },
    ], { duration: 145, iterations: 2, easing: "ease-in-out" });
  });

  sync(lastTurnActionData || {});
  return sync;
})();
