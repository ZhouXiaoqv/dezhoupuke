const MobileTable = (() => {
  const root = document.documentElement;
  const mobile = navigator.userAgentData?.mobile ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const button = $("tableFullscreen");
  const table = $("table-container");
  const guide = $("mobileLandscapeGuide");
  const stage = $("gameStage");
  const cruise = $("autoCallControl");
  const portrait = matchMedia("(orientation: portrait)");
  const orientation = screen.orientation;
  const requestFullscreen = root.requestFullscreen || root.webkitRequestFullscreen;
  const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
  const inFullscreen = () => (document.fullscreenElement || document.webkitFullscreenElement) === root;
  const canFullscreen = () => !!requestFullscreen &&
    (document.fullscreenEnabled ?? document.webkitFullscreenEnabled ?? true);
  let active = false;
  let pendingRoomCode = null;
  let triedEntry = false;
  let wantsFullscreen = false;
  let requesting = false;
  let requestedLock = false;

  function updateGuide() {
    const visible = active && portrait.matches;
    root.classList.toggle("mobile-table-portrait", visible);
    guide.hidden = !visible;
    stage.inert = cruise.inert = visible;
  }

  async function leaveFullscreen() {
    try {
      if (inFullscreen()) await exitFullscreen?.call(document);
    } catch {
      // The browser may already be exiting fullscreen.
    }
  }

  async function syncFullscreen() {
    const fullscreen = inFullscreen();
    const label = fullscreen ? "退出全屏" : "全屏";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(fullscreen));
    button.disabled = !fullscreen && !canFullscreen();
    updateGuide();
    if (!fullscreen) {
      try {
        if (requestedLock) orientation?.unlock?.();
      } catch {
        // Some browsers release the lock automatically as fullscreen exits.
      }
      requestedLock = false;
      return;
    }
    if (!wantsFullscreen) {
      if (requesting) await leaveFullscreen();
      return;
    }
    if (requestedLock) return;
    requestedLock = true;
    try {
      await orientation?.lock?.("landscape");
    } catch {
      // Portrait guidance still works when this browser rejects the lock.
    }
  }

  async function enterFullscreen() {
    if (!canFullscreen() || requesting) return;
    wantsFullscreen = true;
    requesting = true;
    try {
      // Call before awaiting anything so this still has transient user activation.
      if (!inFullscreen()) await requestFullscreen.call(root);
      await syncFullscreen();
    } catch {
      wantsFullscreen = false;
    } finally {
      requesting = false;
    }
  }

  function beginEntry(mechanical = table.classList.contains("mechanical-table")) {
    if (!mobile || !mechanical || triedEntry) return;
    triedEntry = true;
    void enterFullscreen();
  }

  function prepareRoomEntry(code, style) {
    if (!mobile) return;
    pendingRoomCode = style === undefined ? code : null;
    beginEntry(style === "mechanical");
  }

  function confirmRoomEntry({ code, tableStyle }) {
    const pending = pendingRoomCode === code;
    pendingRoomCode = null;
    if (tableStyle !== "mechanical") cancelEntry();
    else if (pending && navigator.userActivation?.isActive !== false) beginEntry(true);
  }

  function cancelEntry() {
    if (!mobile || active) return;
    pendingRoomCode = null;
    if (!triedEntry) return;
    triedEntry = wantsFullscreen = false;
    void leaveFullscreen();
  }

  function setScreen(id) {
    if (!mobile) return;
    const wasActive = active;
    active = id === "table" && table.classList.contains("mechanical-table");
    button.hidden = !active;
    root.classList.toggle("mobile-table-active", active);
    updateGuide();
    if (!active && (wasActive || id !== "roomScreen")) cancelEntry();
  }

  if (mobile) {
    root.classList.add("mobile-table-device");
    button.disabled = !canFullscreen();
    button.addEventListener("click", () => {
      if (!active) return;
      triedEntry = true;
      if (inFullscreen()) {
        wantsFullscreen = false;
        void leaveFullscreen();
      } else {
        void enterFullscreen();
      }
    });
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("webkitfullscreenchange", syncFullscreen);
    orientation?.addEventListener?.("change", updateGuide);
    portrait.addEventListener("change", updateGuide);
    window.addEventListener("resize", updateGuide);
    table.addEventListener("contextmenu", event => {
      if (active && !event.target.closest("input:not([type=range]), textarea, [contenteditable]")) event.preventDefault();
    });
  }

  return { beginEntry, prepareRoomEntry, confirmRoomEntry, cancelEntry, setScreen };
})();
