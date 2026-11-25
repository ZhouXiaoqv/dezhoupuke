const VALUES = [100, 50, 20, 10, 5, 1];
const INITIAL = [10, 10, 10, 10, 20, 100];
const INITIAL_TOTAL = 2000;
const SMALLEST = VALUES.length - 1;

function emptyChips() {
  return VALUES.map(() => 0);
}

function chipTotal(chips) {
  return chips.reduce((total, count, index) => total + count * VALUES[index], 0);
}

function addChips(target, source) {
  for (let index = 0; index < VALUES.length; index++) target[index] += source[index];
}

function subtractChips(target, source) {
  for (let index = 0; index < VALUES.length; index++) target[index] -= source[index];
}

function fill(chips, amount, chosen = emptyChips(), start = 0) {
  for (let index = start; index < VALUES.length; index++) {
    const count = Math.min(chips[index], Math.floor(amount / VALUES[index]));
    chosen[index] = count;
    amount -= count * VALUES[index];
  }
  return { chosen, remaining: amount };
}

function startingChips(balance) {
  const amount = Math.floor(balance);
  const chips = INITIAL.map(count => Math.floor(count * amount / INITIAL_TOTAL));
  const remainder = amount - chipTotal(chips);
  const extra = fill(VALUES.map(() => Infinity), remainder).chosen;
  addChips(chips, extra);
  return chips;
}

function chooseExisting(chips, amount) {
  const greedy = fill(chips, amount);
  if (!greedy.remaining) return greedy;

  // Every value below 50 divides 100, so reducing the chosen 100s alone
  // cannot make an impossible remainder possible. Try the next 50-unit
  // total to cover the other remainder modulo 20.
  const alternate = emptyChips();
  const [hundreds, fifties] = greedy.chosen;
  if (fifties) {
    alternate[0] = hundreds;
    alternate[1] = fifties - 1;
  } else if (hundreds && chips[1]) {
    alternate[0] = hundreds - 1;
    alternate[1] = 1;
  } else {
    return greedy;
  }
  const match = fill(chips, amount - chipTotal(alternate), alternate, 2);
  return match.remaining ? greedy : match;
}

const SPLITS = [[0, 2, 0, 0, 0, 0], [0, 0, 2, 1, 0, 0], [0, 0, 0, 2, 0, 0],
  [0, 0, 0, 0, 2, 0], [0, 0, 0, 0, 0, 5]];

function takeChips(chips, amount) {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > chipTotal(chips)) {
    throw new RangeError('Chip payment must fit the available balance');
  }
  const payment = chooseExisting(chips, amount);
  subtractChips(chips, payment.chosen);
  let remaining = payment.remaining;
  while (remaining > 0) {
    const smallest = chips.findLastIndex(count => count > 0);
    chips[smallest]--;
    addChips(chips, SPLITS[smallest]);
    const change = fill(chips, remaining);
    subtractChips(chips, change.chosen);
    addChips(payment.chosen, change.chosen);
    remaining = change.remaining;
  }
  return payment.chosen;
}

// The game normally uses whole units. Fractional amounts from older/custom
// settings stay in the numeric balance and cross into a 1-chip at a whole unit.
function transferChips(from, to, amount, fromBalance, toBalance) {
  const whole = Math.floor(amount);
  const paid = takeChips(from, whole);
  if (Math.floor(fromBalance) - whole > Math.floor(Math.max(0, fromBalance - amount))) takeChips(from, 1);
  addChips(to, paid);
  if (Math.floor(toBalance + amount) - Math.floor(toBalance) > whole) to[SMALLEST]++;
  return paid;
}

module.exports = { emptyChips, chipTotal, addChips, startingChips, takeChips, transferChips };
