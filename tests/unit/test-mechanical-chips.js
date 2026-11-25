const assert = require('node:assert/strict');
const { addChips, chipTotal, startingChips, takeChips } = require('../../server/chips');
const { Game } = require('../../server/game');
const { Room } = require('../../server/room');

function withdrawal(inventory, amount, expected, balance) {
  const chips = inventory.slice();
  assert.deepEqual(takeChips(chips, amount), expected);
  assert.deepEqual(chips, balance);
  assert.equal(chipTotal(chips), chipTotal(inventory) - amount);
}

assert.deepEqual(startingChips(2000), [10, 10, 10, 10, 20, 100]);
assert.equal(chipTotal(startingChips(1500)), 1500);
assert.equal(chipTotal(startingChips(10000)), 10000);
withdrawal([0, 0, 1, 1, 0, 10], 36, [0, 0, 1, 1, 0, 6], [0, 0, 0, 0, 0, 4]);
withdrawal([0, 0, 1, 2, 0, 0], 36, [0, 0, 1, 1, 1, 1], [0, 0, 0, 0, 0, 4]);
withdrawal([0, 1, 3, 0, 0, 0], 60, [0, 0, 3, 0, 0, 0], [0, 1, 0, 0, 0, 0]);
withdrawal([1, 1, 3, 0, 0, 0], 110, [0, 1, 3, 0, 0, 0], [1, 0, 0, 0, 0, 0]);
withdrawal([10, 10, 10, 10, 20, 100], 2000, [10, 10, 10, 10, 20, 100], [0, 0, 0, 0, 0, 0]);

const tableStyle = 'mechanical';
const room = new Room('TESTCHIPS', 'big', 'Big', null, { tableStyle });
room.addPlayer('short', 'Short', null);
const players = [
  { id: 'big', name: 'Big', stack: 150, chips: [0, 1, 0, 10, 0, 0] },
  { id: 'short', name: 'Short', stack: 240, chips: [0, 0, 10, 4, 0, 0] },
];
const game = new Game(players, { tableStyle });
const [big, short] = game.players;
game.commitBet(big, 50);
game.commitBet(short, 20);
assert.deepEqual(game.getState().potChips, [0, 1, 1, 0, 0, 0]);
assert.deepEqual(game.getStateForPlayer('big').players[0].betChips, [0, 1, 0, 0, 0, 0]);
assert.ok(game.getStateForSpectator().players.every(player => !Object.hasOwn(player, 'chips')));
assert.ok(room.getPlayerList().players.every(player => !Object.hasOwn(player, 'chips')));

const card = (rankStr, suit) => ({ rankStr, suit });
game.community = [card('2', 0), card('7', 1), card('9', 2), card('J', 3), card('K', 0)];
big.hand = [card('3', 1), card('4', 2)];
short.hand = [card('A', 1), card('A', 2)];
game.showdown();
game.clearHandEndTimeout();
assert.equal(game.refunds[0].amount, 30);
assert.equal(game.winners[0].id, 'short');
assert.equal(game.winners[0].amount, 40);
assert.deepEqual(big.chips, [0, 0, 1, 11, 0, 0]);
assert.deepEqual(short.chips, [0, 0, 11, 4, 0, 0]);
assert.deepEqual(game.getState().potChips, [0, 1, 1, 0, 0, 0]);

room.game = game;
room.gameRunning = true;
room.handStartStacks = new Map(players.map(player => [player.id, player.stack]));
room.settleFinishedHand();
room.startGame('big');
room.game.clearActionTimeout();
for (const player of room.game.players) {
  const reconstructed = player.chips.slice();
  addChips(reconstructed, player.betChips);
  assert.deepEqual(reconstructed, room.players.get(player.id).chips);
  assert.equal(chipTotal(player.chips), player.stack);
}
console.log('PASS physical chip inventories, denomination exchange, pot transfer, and next-hand carryover');
