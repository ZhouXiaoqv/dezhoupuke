// Produces a representative stream from the public transfer denominations.
// Visual sampling never decides the amount credited to a player.
function createMechanicalPayout(targets, source, start, denominations) {
  const { easing, interpolate } = MechanicalArmMotion;
  const accelerate = easing([0.4, 0, 0.85, 0.2]);
  const physical = targets.reduce((total, target) => total + target.counts.reduce((a, b) => a + b, 0), 0);
  const budget = Math.min(24, Math.max(12, physical));
  const quotas = targets.map(() => 1);
  const weight = ({ counts, amount }) => counts.reduce((a, b) => a + b, 0) || amount;
  for (let allocated = targets.length; allocated < budget; allocated++) {
    let best = 0;
    for (let index = 1; index < targets.length; index++) {
      if (weight(targets[index]) / (quotas[index] + 1) > weight(targets[best]) / (quotas[best] + 1)) best = index;
    }
    quotas[best]++;
  }

  function sample(target, quota) {
    const available = denominations.map((value, index) => ({ value, count: target.counts[index], used: 0 }))
      .filter(entry => entry.count > 0);
    if (!available.length) return Array(quota).fill(1);
    const values = [];
    for (let index = 0; index < quota; index++) {
      let best = available[index];
      if (!best) {
        best = available.reduce((first, item) =>
          item.count / (item.used + 1) > first.count / (first.used + 1) ? item : first);
      }
      best.used++;
      values.push(best.value);
    }
    return values;
  }

  const streams = targets.map((target, index) => {
    const values = sample(target, quotas[index]);
    const total = values.reduce((a, b) => a + b, 0);
    let cumulativeValue = 0, sent = 0;
    return values.map((value, index) => {
      cumulativeValue += value;
      const credited = index === values.length - 1 ? target.amount : Math.floor(target.amount * cumulativeValue / total);
      const credit = credited - sent;
      sent = credited;
      return { value, target, credit };
    });
  });

  const particles = [];
  const spritesByValue = new Map(denominations.map(value => [value, source.filter(chip => chip.value === value)]));
  let delay = 0;
  for (let index = 0; index < Math.max(...quotas); index++) {
    for (const stream of streams) {
      const chip = stream[index];
      if (!chip) continue;
      const matching = spritesByValue.get(chip.value);
      const from = matching[index % matching.length] || source[particles.length % source.length] || { x: 0, y: 0 };
      const theta = Math.random() * Math.PI * 2;
      particles.push({ ...chip, from, launch: start + delay, theta,
        reach: 14 + Math.random() * 27, curve: (Math.random() < .5 ? -1 : 1) * (24 + Math.random() * 68) });
      delay += 25 + Math.random() * 15;
    }
  }

  function draw(now, { origin, targetAt, drawChip, arrive }) {
    const anchors = new Map(targets.map(target => [target, targetAt(target)]));
    let animations = false;
    for (const chip of particles) {
      if (chip.landed) continue;
      const elapsed = now - chip.launch;
      const from = { x: origin.x + chip.from.x, y: origin.y + chip.from.y };
      const target = anchors.get(chip.target) || origin;
      if (elapsed >= 565) {
        chip.landed = true;
        arrive(chip.target, chip.credit);
        continue;
      }
      animations = true;
      const burst = Math.max(0, Math.min(1, elapsed / 105));
      const scatter = { x: Math.cos(chip.theta) * chip.reach, y: Math.sin(chip.theta) * chip.reach * .57 };
      const lifted = { x: from.x + scatter.x, y: from.y + scatter.y - 11 };
      const angle = chip.from.angle || 0;
      if (burst < 1) {
        const t = 1 - (1 - burst) ** 2;
        drawChip({ x: from.x + scatter.x * t, y: from.y + scatter.y * t - 11 * t - 7 * Math.sin(Math.PI * burst) },
          chip.value, angle + burst * .15, 1);
        continue;
      }
      const progress = (elapsed - 105) / 460;
      const dx = target.x - lifted.x, dy = target.y - lifted.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const curveX = -dy / length * chip.curve, curveY = dx / length * chip.curve;
      const controls = [
        { x: lifted.x + dx * .16 + curveX, y: lifted.y + dy * .16 + curveY },
        { x: target.x - dx * .24 + curveX * .32, y: target.y - dy * .24 + curveY * .32 },
      ];
      drawChip(interpolate(lifted, target, accelerate(progress), controls), chip.value,
        angle + .15 + progress * Math.sign(chip.curve) * .57, 1 - Math.max(0, progress - .89) * 3);
    }
    return animations;
  }

  return { draw, count: particles.length };
}
