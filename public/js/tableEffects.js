// Action events drive these short-lived lights independently of state rendering.
function playTableLights(playerId, allIn) {
  const table = $("table");
  const seat = [...table.querySelectorAll(".seat")].find(el => el.dataset.playerId === playerId);
  if (!seat || !$("table-container").classList.contains("active")) return;
  table.querySelector(".rail-effect")?.remove();
  table.querySelector(".rail-source")?.classList.remove("rail-source");
  seat.classList.add("rail-source");
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.classList.add("rail-effect", allIn ? "rail-allin" : "rail-raise");
  svg.setAttribute("aria-hidden", "true");
  table.appendChild(svg);
  const box = svg.getBoundingClientRect();
  const rim = document.createElementNS(svgNS, "rect");
  rim.setAttribute("x", 1);
  rim.setAttribute("y", 1);
  rim.setAttribute("width", Math.max(1, box.width - 2));
  rim.setAttribute("height", Math.max(1, box.height - 2));
  rim.setAttribute("rx", parseFloat(getComputedStyle(table).borderTopLeftRadius));
  svg.appendChild(rim);
  const length = rim.getTotalLength();
  const source = seat.getBoundingClientRect();
  const x = source.left + source.width / 2 - box.left;
  const y = source.top + source.height / 2 - box.top;
  let start = 0, nearest = Infinity;
  for (let i = 0; i < 96; i++) {
    const offset = length * i / 96;
    const point = rim.getPointAtLength(offset);
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance < nearest) { start = offset; nearest = distance; }
  }
  const duration = allIn ? 1300 : 700;
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    for (const direction of allIn ? [1, -1] : [1]) {
      const beam = rim.cloneNode();
      svg.appendChild(beam);
      beam.classList.add(direction === 1 ? "gold-beam" : "red-beam");
      const tail = length * 0.09;
      beam.style.strokeDasharray = tail + " " + (length - tail);
      const from = -start + tail / 2;
      const to = from - direction * length / (allIn ? 2 : 1);
      beam.animate([{ strokeDashoffset: from, opacity: 0 },
        { opacity: 1, offset: 0.08 }, { strokeDashoffset: to, opacity: 1 }],
        { duration: duration * 0.81, easing: "ease-in-out", fill: "forwards" });
    }
    if (allIn) {
      const point = rim.getPointAtLength((start + length / 2) % length);
      for (let i = 0; i < 8; i++) {
        const spark = document.createElementNS(svgNS, "circle");
        spark.setAttribute("cx", point.x);
        spark.setAttribute("cy", point.y);
        spark.setAttribute("r", i % 2 + 1.5);
        svg.appendChild(spark);
        const angle = i * Math.PI / 4;
        spark.animate([{ opacity: 1, transform: "translate(0,0)" },
          { opacity: 0, transform: `translate(${Math.cos(angle)*20}px,${Math.sin(angle)*20}px)` }],
          { duration: 300, delay: duration * 0.76 });
      }
    }
  }
  setTimeout(() => {
    if (!svg.isConnected) return;
    seat.classList.remove("rail-source");
    svg.remove();
  }, duration);
}
