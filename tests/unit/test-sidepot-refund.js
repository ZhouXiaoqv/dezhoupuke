#!/usr/bin/env node

const assert = require('assert');
const { Game } = require('../../server/game');
const { Room, RoomRegistry } = require('../../server/room');

function card(rankStr, suit = 0) {
  return { rankStr, suit, rank: 0, suitStr: String(suit) };
}

function run() {
  testSidePotRefund();
  testShowdownCannotAwardTwice();
  testFoldWinnerShowHandChoice();
  testFivePlayerFoldedSidePotLayerIsRefunded();
  testSixPlayerFoldedSidePotLayerIsRefunded();
  testZeroStackIsNotResetToStartStack();
  testStatsReportUsesFinalStackBeforeZeroStackRefill();
  testZeroStackRefillDoesNotAffectScoreboard();
  testSixPlayerZeroStackDuplicateEndDoesNotUnbalanceScoreboard();
  testScoreboardImbalanceIsReportedBeforeNextHand();
  testSettledHandScoreboardIsVisibleBeforeGameEnd();
  testScoreboardBalancesAcrossManyPlayers();
  testRoomDoesNotStartWithOnlyOneFundedPlayer();
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

function testShowdownCannotAwardTwice() {
  const game = new Game([
    { id: 'winner', name: 'Winner', stack: 2000, connected: true },
    { id: 'loser', name: 'Loser', stack: 2000, connected: true },
  ]);

  game.broadcastState = () => {};
  game.phase = 'river';
  game.community = [
    card('2', 0),
    card('7', 1),
    card('9', 2),
    card('J', 3),
    card('K', 0),
  ];
  game.pot = 4000;

  setPlayerShowdownState(game.players[0], 2000, 2000, [card('A', 1), card('A', 2)]);
  setPlayerShowdownState(game.players[1], 2000, 2000, [card('3', 1), card('4', 2)]);

  runShowdownWithoutTimers(game);
  const stacksAfterFirstShowdown = game.players.map((player) => player.stack);

  game.showdown();

  assert.deepStrictEqual(
    game.players.map((player) => player.stack),
    stacksAfterFirstShowdown,
    'duplicate showdown does not award the pot twice',
  );

  console.log('PASS showdown cannot award the same pot twice');
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

function testFivePlayerFoldedSidePotLayerIsRefunded() {
  const startingStacks = [2600, 1711, 996, 1134, 2434];
  const bets = [250, 125, 250, 300, 600];
  const game = new Game(startingStacks.map((stack, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    stack,
    connected: true,
  })));
  game.broadcastState = () => {};
  game.phase = 'river';
  game.community = [card('2', 0), card('7', 1), card('9', 2), card('J', 3), card('K', 0)];
  game.pot = bets.reduce((sum, bet) => sum + bet, 0);

  setPlayerShowdownState(game.players[0], startingStacks[0], bets[0], [card('Q', 1), card('Q', 2)]);
  setPlayerShowdownState(game.players[1], startingStacks[1], bets[1], [card('A', 1), card('A', 2)]);
  setPlayerShowdownState(game.players[2], startingStacks[2], bets[2], [card('3', 1), card('4', 2)]);
  setPlayerShowdownState(game.players[3], startingStacks[3], bets[3], [card('5', 1), card('6', 2)], true);
  setPlayerShowdownState(game.players[4], startingStacks[4], bets[4], [card('8', 1), card('10', 2)], true);

  runShowdownWithoutTimers(game);

  assert.deepStrictEqual(winnerAmounts(game), new Map([
    ['p1', 625],
    ['p0', 500],
  ]));
  assert.deepStrictEqual(refundAmounts(game), new Map([
    ['p3', 50],
    ['p4', 350],
  ]));
  assertStacksPreserveTotal(game, startingStacks);
  assertScoreboardBalances(scoreDeltasFromStacks(game, startingStacks));

  console.log('PASS 5-player folded side-pot layer keeps scoreboard balanced');
}

function testSixPlayerFoldedSidePotLayerIsRefunded() {
  const startingStacks = [2000, 2000, 2000, 2000, 2000, 2000];
  const bets = [200, 400, 400, 500, 800, 800];
  const game = new Game(startingStacks.map((stack, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    stack,
    connected: true,
  })));
  game.broadcastState = () => {};
  game.phase = 'river';
  game.community = [card('2', 0), card('7', 1), card('9', 2), card('J', 3), card('K', 0)];
  game.pot = bets.reduce((sum, bet) => sum + bet, 0);

  setPlayerShowdownState(game.players[0], startingStacks[0], bets[0], [card('3', 1), card('4', 2)]);
  setPlayerShowdownState(game.players[1], startingStacks[1], bets[1], [card('Q', 1), card('Q', 2)]);
  setPlayerShowdownState(game.players[2], startingStacks[2], bets[2], [card('A', 1), card('A', 2)]);
  setPlayerShowdownState(game.players[3], startingStacks[3], bets[3], [card('5', 1), card('6', 2)], true);
  setPlayerShowdownState(game.players[4], startingStacks[4], bets[4], [card('8', 1), card('10', 2)], true);
  setPlayerShowdownState(game.players[5], startingStacks[5], bets[5], [card('5', 3), card('6', 3)], true);

  runShowdownWithoutTimers(game);

  assert.deepStrictEqual(winnerAmounts(game), new Map([
    ['p2', 2200],
  ]));
  assert.deepStrictEqual(refundAmounts(game), new Map([
    ['p3', 100],
    ['p4', 400],
    ['p5', 400],
  ]));
  assertStacksPreserveTotal(game, startingStacks);
  assertScoreboardBalances(scoreDeltasFromStacks(game, startingStacks));

  console.log('PASS 6-player folded side-pot layer keeps scoreboard balanced');
}

function testZeroStackIsNotResetToStartStack() {
  const game = new Game([
    { id: 'busted', name: 'Busted', stack: 0, connected: true },
    { id: 'live', name: 'Live', stack: 2000, connected: true },
  ], { startStack: 2000 });

  assert.strictEqual(game.players[0].stack, 0);
  assert.strictEqual(game.players[1].stack, 2000);

  console.log('PASS zero stack remains zero when a new Game is created');
}

function testSettledHandScoreboardIsVisibleBeforeGameEnd() {
  const hostWs = mockWs();
  const p2Ws = mockWs();
  const room = new Room('TEST', 'p1', 'Alice', hostWs, { startStack: 1000 });
  assert.strictEqual(room.addPlayer('p2', 'Bob', p2Ws), true);

  room.scoreboard.get('p1').score = 25;
  room.scoreboard.get('p2').score = -25;
  room.gameRunning = true;
  room.handStartStacks = new Map([
    ['p1', 1000],
    ['p2', 1000],
  ]);
  room.game = {
    winners: [{ id: 'p1', name: 'Alice', amount: 300 }],
    refunds: [],
    players: [
      { id: 'p1', name: 'Alice', stack: 1200 },
      { id: 'p2', name: 'Bob', stack: 800 },
    ],
  };

  const pendingScores = scoreMap(room.getScoreboard());
  assertScoreboardBalances(room.getScoreboard());
  assert.strictEqual(pendingScores.get('p1'), 225);
  assert.strictEqual(pendingScores.get('p2'), -225);

  room.gameRunning = false;
  room.scoreboard.get('p1').score += 200;
  room.scoreboard.get('p2').score -= 200;

  const finalScores = scoreMap(room.getScoreboard());
  assertScoreboardBalances(room.getScoreboard());
  assert.strictEqual(finalScores.get('p1'), 225);
  assert.strictEqual(finalScores.get('p2'), -225);

  console.log('PASS settled hand scoreboard includes pending net score exactly once');
}

function testZeroStackRefillDoesNotAffectScoreboard() {
  const hostWs = mockWs();
  const p2Ws = mockWs();
  const room = new Room('TEST', 'p1', 'Alice', hostWs, { startStack: 2000 });
  assert.strictEqual(room.addPlayer('p2', 'Bob', p2Ws), true);

  room.gameRunning = true;
  room.handStartStacks = new Map([
    ['p1', 2000],
    ['p2', 2000],
  ]);
  room.game = {
    handNum: 1,
    winners: [{ id: 'p2', name: 'Bob', amount: 4000 }],
    refunds: [],
    broadcastState() {
      this.stateBroadcasted = true;
    },
    players: [
      { id: 'p1', name: 'Alice', stack: 0, folded: true, allIn: true, bet: 0 },
      { id: 'p2', name: 'Bob', stack: 4000 },
    ],
  };
  room.settleFinishedHand();

  const scores = scoreMap(room.getScoreboard());
  assert.strictEqual(room.players.get('p1').stack, 2000);
  assert.strictEqual(room.game.players[0].stack, 2000);
  assert.strictEqual(room.game.players[0].folded, false);
  assert.strictEqual(room.game.players[0].allIn, false);
  assert.strictEqual(room.game.stateBroadcasted, true);
  assert.strictEqual(room.players.get('p2').stack, 4000);
  assert.strictEqual(scores.get('p1'), -2000);
  assert.strictEqual(scores.get('p2'), 2000);
  assertScoreboardBalances(room.getScoreboard());

  console.log('PASS zero stack refill does not affect scoreboard');
}

function testStatsReportUsesFinalStackBeforeZeroStackRefill() {
  const hostWs = mockWs();
  const p2Ws = mockWs();
  const room = new Room('TEST', 'p1', 'Alice', hostWs, { startStack: 2000 });
  assert.strictEqual(room.addPlayer('p2', 'Bob', p2Ws), true);

  const records = [];
  room.gameRunning = true;
  room.handStartStacks = new Map([
    ['p1', 2000],
    ['p2', 2000],
  ]);
  room.game = {
    handNum: 1,
    winners: [{ id: 'p2', name: 'Bob', amount: 4000 }],
    refunds: [],
    broadcastState() {},
    players: [
      { id: 'p1', name: 'Alice', stack: 0, folded: true, allIn: true, bet: 0 },
      { id: 'p2', name: 'Bob', stack: 4000 },
    ],
  };
  room.game.onGameEnd = () => {
    if (!room.gameRunning) return;
    room.onStatsReport(room.game);
    room.settleFinishedHand();
  };
  room.onStatsReport = (game) => {
    for (const gp of game.players) {
      const stackBefore = room.handStartStacks.get(gp.id) ?? gp.stack;
      records.push({ id: gp.id, net: gp.stack - stackBefore, stackBefore });
    }
  };

  room.game.onGameEnd();

  const netById = new Map(records.map((record) => [record.id, record.net]));
  assert.strictEqual(netById.get('p1'), -2000);
  assert.strictEqual(netById.get('p2'), 2000);
  assert.strictEqual(room.players.get('p1').stack, 2000);
  assert.strictEqual(room.game.players[0].stack, 2000);

  room.game.onGameEnd();
  assert.strictEqual(records.length, 2, 'game end is ignored after the hand has already settled');

  console.log('PASS stats report uses final stack before zero-stack refill');
}

function testSixPlayerZeroStackDuplicateEndDoesNotUnbalanceScoreboard() {
  const room = new Room('TEST', 'p0', 'P0', mockWs(), { startStack: 2000 });
  for (let i = 1; i < 6; i++) {
    assert.strictEqual(room.addPlayer(`p${i}`, `P${i}`, mockWs()), true);
  }

  let reports = 0;
  room.gameRunning = true;
  room.handStartStacks = new Map(Array.from({ length: 6 }, (_, i) => [`p${i}`, 2000]));
  room.game = {
    handNum: 1,
    winners: [{ id: 'p5', name: 'P5', amount: 12000 }],
    refunds: [],
    broadcastState() {},
    players: [
      { id: 'p0', name: 'P0', stack: 0, folded: false, allIn: true, bet: 0 },
      { id: 'p1', name: 'P1', stack: 0, folded: false, allIn: true, bet: 0 },
      { id: 'p2', name: 'P2', stack: 0, folded: false, allIn: true, bet: 0 },
      { id: 'p3', name: 'P3', stack: 0, folded: false, allIn: true, bet: 0 },
      { id: 'p4', name: 'P4', stack: 0, folded: false, allIn: true, bet: 0 },
      { id: 'p5', name: 'P5', stack: 12000, folded: false, allIn: false, bet: 0 },
    ],
  };
  const game = room.game;
  game.onGameEnd = () => {
    if (!room.gameRunning || room.game !== game) return;
    reports++;
    room.settleFinishedHand();
  };

  game.onGameEnd();
  game.onGameEnd();

  const scores = scoreMap(room.getScoreboard());
  assert.strictEqual(reports, 1, 'duplicate game-end callbacks are ignored after settle');
  assert.strictEqual(scores.get('p0'), -2000);
  assert.strictEqual(scores.get('p1'), -2000);
  assert.strictEqual(scores.get('p2'), -2000);
  assert.strictEqual(scores.get('p3'), -2000);
  assert.strictEqual(scores.get('p4'), -2000);
  assert.strictEqual(scores.get('p5'), 10000);
  assertScoreboardBalances(room.getScoreboard());

  console.log('PASS 6-player zero-stack duplicate end keeps scoreboard balanced');
}

function testScoreboardBalancesAcrossManyPlayers() {
  const room = new Room('TEST', 'p1', 'Alice', mockWs(), { startStack: 1000 });
  assert.strictEqual(room.addPlayer('p2', 'Bob', mockWs()), true);
  assert.strictEqual(room.addPlayer('p3', 'Carol', mockWs()), true);
  assert.strictEqual(room.addPlayer('p4', 'Dan', mockWs()), true);

  room.scoreboard.get('p1').score = 450;
  room.scoreboard.get('p2').score = -100;
  room.scoreboard.get('p3').score = -150;
  room.scoreboard.get('p4').score = -200;

  assertScoreboardBalances(room.getScoreboard());

  console.log('PASS scoreboard positive and negative totals balance across many players');
}

function testScoreboardImbalanceIsReportedBeforeNextHand() {
  const registry = new RoomRegistry();
  const hostWs = mockWs();
  const room = registry.createRoom('p1', 'Alice', hostWs, { startStack: 1000 });
  assert.strictEqual(room.addPlayer('p2', 'Bob', mockWs()), true);

  room.recordHandSnapshot([
    { id: 'p1', name: 'Alice', startStack: 1000, finalStack: 1100, delta: 100 },
    { id: 'p2', name: 'Bob', startStack: 1000, finalStack: 900, delta: -100 },
  ]);
  room.recordHandSnapshot([
    { id: 'p1', name: 'Alice', startStack: 1100, finalStack: 950, delta: -150 },
    { id: 'p2', name: 'Bob', startStack: 900, finalStack: 1050, delta: 150 },
  ]);
  room.scoreboard.get('p1').score = 300;
  room.scoreboard.get('p2').score = -100;

  const originalSetTimeout = global.setTimeout;
  global.setTimeout = () => 0;
  try {
    room.startGame('p1');
  } finally {
    global.setTimeout = originalSetTimeout;
    if (room.game?.actionTimeout) clearTimeout(room.game.actionTimeout);
  }

  const warning = hostWs.sent.find((msg) => msg.type === 'room:scoreboardImbalance');
  const diagnostics = registry.getScoreboardDiagnostics();
  assert.ok(warning, 'scoreboard imbalance warning is broadcast before next hand');
  assert.strictEqual(warning.data.total, 200);
  assert.strictEqual(diagnostics.length, 1);
  assert.strictEqual(diagnostics[0].total, 200);
  assert.strictEqual(diagnostics[0].handSnapshots.length, 2);
  assert.strictEqual(diagnostics[0].handSnapshots[0].handNum, 0);
  assert.strictEqual(diagnostics[0].handSnapshots[1].handNum, 0);
  assert.strictEqual(room.gameRunning, true);

  console.log('PASS scoreboard imbalance is reported before next hand');
}

function testRoomDoesNotStartWithOnlyOneFundedPlayer() {
  const hostWs = mockWs();
  const p2Ws = mockWs();
  const room = new Room('TEST', 'p1', 'Alice', hostWs, { startStack: 1000 });
  assert.strictEqual(room.addPlayer('p2', 'Bob', p2Ws), true);
  room.players.get('p1').stack = 0;
  room.players.get('p2').stack = 1000;

  room.startGame('p1');

  assert.strictEqual(room.gameRunning, false);
  assert.strictEqual(room.game, null);
  assert.strictEqual(room.canStartHand(), false);

  console.log('PASS room does not start when fewer than two connected players have chips');
}

function mockWs() {
  return {
    readyState: 1,
    _username: null,
    sent: [],
    send(message) {
      this.sent.push(JSON.parse(message));
    },
  };
}

function runShowdownWithoutTimers(game) {
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = () => 0;
  try {
    game.showdown();
  } finally {
    global.setTimeout = originalSetTimeout;
  }
}

function setPlayerShowdownState(player, startingStack, bet, hand, folded = false) {
  player.stack = startingStack - bet;
  player.totalBet = bet;
  player.bet = bet;
  player.hand = hand;
  player.folded = folded;
}

function winnerAmounts(game) {
  return new Map(game.winners.map((winner) => [winner.id, winner.amount]));
}

function refundAmounts(game) {
  return new Map(game.refunds.map((refund) => [refund.id, refund.amount]));
}

function scoreDeltasFromStacks(game, startingStacks) {
  return game.players.map((player, i) => ({
    id: player.id,
    name: player.name,
    score: player.stack - startingStacks[i],
  }));
}

function assertStacksPreserveTotal(game, startingStacks) {
  const before = startingStacks.reduce((sum, stack) => sum + stack, 0);
  const after = game.players.reduce((sum, player) => sum + player.stack, 0);
  assert.strictEqual(after, before, 'showdown settlement preserves total chips');
}

function scoreMap(scores) {
  return new Map(scores.map((score) => [score.id, score.score]));
}

function assertScoreboardBalances(scores) {
  const total = scores.reduce((sum, score) => sum + score.score, 0);
  assert.strictEqual(total, 0, 'scoreboard positive and negative scores balance');
}

run();
