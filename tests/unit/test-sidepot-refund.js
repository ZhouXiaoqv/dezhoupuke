#!/usr/bin/env node

const assert = require('assert');
const { Game } = require('../../server/game');

function card(rankStr, suit = 0) {
  return { rankStr, suit, rank: 0, suitStr: String(suit) };
}

function run() {
  testSidePotRefund();
  testFoldWinnerShowHandChoice();
}

function testSidePotRefund() {
  const game = new Game([
    { id: 'short', name: 'Short', stack: 1000, connected: true },
    { id: 'big', name: 'Big', stack: 1000, connected: true },
  ]);

  const events = [];
  game.onBroadcast = (type, data) => events.push({ type, data });
  game.broadcastState = () => {};

  const short = game.players[0];
  const big = game.players[1];

  game.phase = 'river';
  game.community = [
    card('2', 0),
    card('7', 1),
    card('9', 2),
    card('J', 3),
    card('K', 0),
  ];
  game.pot = 1200;

  short.stack = 0;
  short.totalBet = 200;
  short.allIn = true;
  short.hand = [card('A', 1), card('A', 2)];

  big.stack = 0;
  big.totalBet = 1000;
  big.allIn = true;
  big.hand = [card('3', 1), card('4', 2)];

  const originalSetTimeout = global.setTimeout;
  global.setTimeout = () => 0;
  try {
    game.showdown();
  } finally {
    global.setTimeout = originalSetTimeout;
  }

  assert.strictEqual(game.winners.length, 1, 'only the main-pot winner is listed');
  assert.strictEqual(game.winners[0].id, 'short');
  assert.strictEqual(game.winners[0].amount, 400);
  assert.strictEqual(short.stack, 400);
  assert.strictEqual(short.lastAction, 'winner');

  assert.deepStrictEqual(game.refunds, [{ id: 'big', name: 'Big', amount: 800 }]);
  assert.strictEqual(big.stack, 800);
  assert.notStrictEqual(big.lastAction, 'winner');

  const showdownEvent = events.find(e => e.type === 'game:showdown');
  assert.ok(showdownEvent, 'showdown event is emitted');
  assert.deepStrictEqual(showdownEvent.data.refunds, game.refunds);

  console.log('PASS side-pot unmatched bet refund is not shown as winner');
}

function testFoldWinnerShowHandChoice() {
  const game = new Game([
    { id: 'winner', name: 'Winner', stack: 1000, connected: true },
    { id: 'folder', name: 'Folder', stack: 1000, connected: true },
  ]);

  const events = [];
  game.onBroadcast = (type, data) => events.push({ type, data });
  game.broadcastState = () => {};

  const winner = game.players[0];
  const folder = game.players[1];
  winner.hand = [card('A', 1), card('K', 2)];
  folder.hand = [card('2', 1), card('3', 2)];
  folder.folded = true;
  game.phase = 'flop';
  game.pot = 120;

  const originalSetTimeout = global.setTimeout;
  global.setTimeout = () => 0;
  try {
    game.endHand();

    const hiddenForFolder = game.getStateForPlayer('folder').players.find(p => p.id === 'winner').hand;
    const hiddenForSpectator = game.getStateForSpectator().players.find(p => p.id === 'winner').hand;
    assert.deepStrictEqual(hiddenForFolder, [null, null]);
    assert.deepStrictEqual(hiddenForSpectator, [null, null]);

    game.handleShowHandChoice('winner', true);
  } finally {
    global.setTimeout = originalSetTimeout;
  }

  const shownForFolder = game.getStateForPlayer('folder').players.find(p => p.id === 'winner').hand;
  const shownForSpectator = game.getStateForSpectator().players.find(p => p.id === 'winner').hand;
  assert.deepStrictEqual(shownForFolder, winner.hand);
  assert.deepStrictEqual(shownForSpectator, winner.hand);
  assert.ok(events.some(e => e.type === 'game:handShown'), 'hand shown event is emitted');
  assert.strictEqual(game.winners[0].id, 'winner');
  assert.strictEqual(game.winners[0].amount, 120);

  console.log('PASS fold winner can choose to reveal hole cards');
}

run();
