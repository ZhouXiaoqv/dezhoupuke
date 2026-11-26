// The visual inventory belongs to the table. Payouts reuse those chip objects
// and use the server's transfers only to route them and advance the balances.
function createMechanicalPayout(targets, sourcePiles, start, denominations) {
  const { easing, interpolate } = MechanicalArmMotion;
  const accelerate = easing([0.4, 0, 0.85, 0.2]);
  const piles = sourcePiles.map(pile => ({ ...pile, chips: pile.chips.slice() }));
  const radius = pile => pile.x ** 2 + pile.y ** 2;
  const particles = piles.slice().sort((a, b) => radius(b) - radius(a)).flatMap(pile =>
    pile.chips.slice().reverse().map(chip => ({ chip, pile })));

  const accounts = targets.map(target => ({ target, counts: target.counts.slice(), particles: [], value: 0, landed: 0, hits: 0 }));
  function assign(particle, account) {
    particle.account = account;
    account.particles.push(particle);
    account.value += particle.chip.value;
  }

  for (const particle of particles) {
    const denomination = denominations.indexOf(particle.chip.value);
    const matches = accounts.filter(account => account.counts[denomination] > 0);
    if (!matches.length) continue;
    const account = matches.reduce((best, next) => next.counts[denomination] > best.counts[denomination] ? next : best);
    account.counts[denomination]--;
    assign(particle, account);
  }
  // A capped table pile or a split payout that made change can leave some
  // displayed denominations unmatched. Route those chips by relative share.
  for (const particle of particles) {
    if (particle.account) continue;
    const account = accounts.reduce((best, next) => next.value / next.target.amount < best.value / best.target.amount ? next : best);
    assign(particle, account);
  }
  for (const account of accounts) {
    if (account.particles.length) continue;
    const donor = accounts.find(other => other.particles.length > 1);
    if (!donor) continue;
    const particle = donor.particles.pop();
    donor.value -= particle.chip.value;
    assign(particle, account);
  }

  const count = particles.length;
  const minGap = 15 - 8 * Math.min(1, Math.max(0, (count - 15) / 60));
  let launch = start;
  for (const [index, particle] of particles.entries()) {
    const { account, chip } = particle;
    const progress = index / Math.max(1, count - 1);
    const intervalProgress = index / Math.max(1, count - 2);
    // Shorten later flights without letting them land ahead of earlier ones.
    const duration = 500 - Math.min(138, (count - 1) * 5) * progress;
    particle.launch = launch;
    particle.arrival = launch + duration;
    particle.scatterTime = 86 - 38 * progress;
    particle.theta = Math.random() * Math.PI * 2;
    particle.reach = 14 + Math.random() * 27;
    particle.curve = (Math.random() < .5 ? -1 : 1) * (24 + Math.random() * 68);
    launch += minGap + (52 - minGap) * (1 - Math.min(1, intervalProgress)) ** (count < 18 ? 2 : 1.35);

    account.landed += chip.value;
    particle.final = ++account.hits === account.particles.length;
    const amount = account.target.amount;
    const share = amount * account.landed / account.value;
    particle.credit = particle.final ? amount : Math.max(0, Math.min(Math.ceil(amount) - 1, Math.ceil(share - 1e-9)));
  }

  let launched = 0, arrived = 0;
  function draw(now, { origin, targetAt, drawChip, arrive }) {
    while (launched < count && particles[launched].launch <= now) particles[launched++].pile.chips.pop();
    const impacts = new Map();
    while (arrived < launched && particles[arrived].arrival <= now) {
      const { account, credit, final } = particles[arrived++];
      const previous = impacts.get(account.target);
      impacts.set(account.target, { credit, final, hits: (previous?.hits ?? 0) + 1 });
    }
    const anchors = new Map(targets.map(target => [target, targetAt(target)]));
    for (let index = arrived; index < launched; index++) {
      const flight = particles[index];
      const { chip, account, curve, scatterTime } = flight;
      const elapsed = now - flight.launch;
      const from = { x: origin.x + chip.x, y: origin.y + chip.y };
      const target = anchors.get(account.target) || origin;
      const scatter = { x: Math.cos(flight.theta) * flight.reach, y: Math.sin(flight.theta) * flight.reach * .57 };
      const lifted = { x: from.x + scatter.x, y: from.y + scatter.y - 11 };
      if (elapsed < scatterTime) {
        const burst = elapsed / scatterTime;
        const t = 1 - (1 - burst) ** 2;
        drawChip({ x: from.x + scatter.x * t, y: from.y + scatter.y * t - 11 * t - 7 * Math.sin(Math.PI * burst) },
          chip.value, chip.angle + burst * .15);
        continue;
      }
      const progress = (elapsed - scatterTime) / (flight.arrival - flight.launch - scatterTime);
      const dx = target.x - lifted.x, dy = target.y - lifted.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const curveX = -dy / length * curve, curveY = dx / length * curve;
      const controls = [
        { x: lifted.x + dx * .16 + curveX, y: lifted.y + dy * .16 + curveY },
        { x: target.x - dx * .24 + curveX * .32, y: target.y - dy * .24 + curveY * .32 },
      ];
      drawChip(interpolate(lifted, target, accelerate(progress), controls), chip.value, chip.angle + .15 + progress * Math.sign(curve) * .57);
    }
    for (const [target, impact] of impacts) arrive(target, impact);
    return arrived < count;
  }

  return { draw, count, piles, get remaining() { return count - launched; } };
}
