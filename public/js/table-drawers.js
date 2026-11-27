const TableDrawers = (() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const log = $("actionLogBody");
  const chipDrawer = { panel: $("chipInventoryPanel"), toggle: $("chipInventoryToggle"), close: $("chipInventoryClose") };
  const drawers = [
    { panel: $("actionLogPanel"), toggle: $("actionLogToggle"), close: $("actionLogClose"), prepare: () => scrollToLatest(false) },
    { panel: $("scoreboardPanel"), toggle: $("scoreboardToggle"), close: $("scoreboardClose"), prepare: () => renderScoreboard() },
    chipDrawer,
  ];
  const chipList = $("chipInventoryList");
  const chipNumber = new Intl.NumberFormat("zh-CN");
  // The server counts and sprites share denomination order. Prepend for the ascending display.
  const chipLabels = MechanicalTable.chipFaces().map(({ value, image }) => {
    const cell = document.createElement("li");
    const picture = new Image();
    picture.src = image;
    picture.alt = `面值 ${value}`;
    const count = document.createElement("span");
    count.className = "score-value chip-inventory-count";
    cell.append(picture, count);
    chipList.prepend(cell);
    return count;
  });
  let shown, requested, animation;
  let retracting = false;
  const deployed = "translateX(0px)";
  const stowed = "translateX(calc(100% + var(--drawer-gap) + 16px))";

  function scrollToLatest(animate = true) {
    log.scrollTo({ top: log.scrollHeight, behavior: animate && MechanicalTable.enabled() && !reduced.matches ? "smooth" : "instant" });
  }

  function move(panel, frames, duration, finish) {
    const from = getComputedStyle(panel).transform;
    animation?.cancel();
    animation = null;
    const end = frames.at(-1).transform;
    if (!MechanicalTable.enabled() || reduced.matches) {
      panel.style.transform = MechanicalTable.enabled() ? end : "";
      finish();
      return;
    }
    const motion = animation = panel.animate([{ transform: from, ...frames[0] }, ...frames.slice(1)], {
      duration, fill: "both",
    });
    motion.onfinish = () => {
      if (animation !== motion) return;
      panel.style.transform = end;
      animation = null;
      motion.cancel();
      finish();
    };
  }

  function hide(drawer) {
    const { panel, toggle } = drawer;
    panel.inert = true;
    panel.classList.remove("open");
    panel.style.transform = "";
    toggle.setAttribute("aria-expanded", "false");
  }

  function updateChips(counts) {
    const available = Array.isArray(counts);
    chipDrawer.toggle.hidden = !available;
    chipLabels.forEach((label, index) => {
      const text = available ? chipNumber.format(counts[index]) : "";
      if (label.textContent !== text) label.textContent = text;
    });
    if (!available && requested === chipDrawer) {
      requested = null;
      reconcile();
    }
  }

  function reconcile() {
    if (retracting || requested === shown) return;
    if (shown) {
      const outgoing = shown;
      const { panel, toggle } = outgoing;
      if (panel.contains(document.activeElement)) toggle.focus();
      panel.inert = true;
      retracting = true;
      move(panel, [{ easing: "cubic-bezier(.4,0,.35,1)" }, { transform: stowed }], requested ? 140 : 180, () => {
        hide(outgoing);
        shown = null;
        retracting = false;
        reconcile();
      });
      return;
    }

    shown = requested;
    const { panel, toggle, prepare } = shown;
    panel.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
    prepare?.();
    move(panel, [
      { easing: "cubic-bezier(.16,1,.3,1)" },
      { transform: "translateX(-2.5px)", offset: .82, easing: "ease-out" },
      { transform: deployed },
    ], 220, () => { panel.inert = false; });
  }

  function reset() {
    animation?.cancel();
    animation = shown = requested = null;
    retracting = false;
    drawers.forEach(hide);
    updateChips(null);
  }

  for (const drawer of drawers) {
    drawer.toggle.addEventListener("click", () => {
      if (drawer.toggle.hidden) return;
      requested = requested === drawer ? null : drawer;
      reconcile();
    });
    drawer.close.addEventListener("click", () => {
      requested = null;
      reconcile();
    });
  }

  return { reset, scrollToLatest, updateChips };
})();
