#!/usr/bin/env node
/**
 * Texas Hold'em — Full Game Flow Simulation
 * 
 * Simulates a complete poker hand with 4 players,
 * printing every state change as a text log.
 * 
 * Flow: createRoom → addBots → startGame → startHand → 
 *        postBlinds → deal → preflop → flop → turn → river → showdown
 */

const { Game, SB, BB, START_STACK, HAND_NAMES } = require('../../server/game');

// ===== Mock WebSocket =====
class MockWS {
  constructor(name) {
    this.name = name;
    this.readyState = 1;
    this.messages = [];
  }
  send(msg) {
    const data = JSON.parse(msg);
    this.messages.push(data);
  }
  lastMsg() { return this.messages[this.messages.length - 1]; }
}

// ===== Logger =====
let logBuffer = [];
function log(tag, msg) {
  const line = `[${tag}] ${msg}`;
  logBuffer.push(line);
  console.log(line);
}

function cardStr(c) {
  if (!c) return '??';
  return c.rankStr + c.suitStr;
}

function handStr(hand) {
  return hand.map(cardStr).join(' ');
}

function printPlayerState(p) {
  const status = [
    p.folded ? '弃牌' : '',
    p.allIn ? 'ALL-IN' : '',
    !p.connected ? '断线' : '',
  ].filter(Boolean).join('/') || '在局';
  
  return `  ${p.name.padEnd(6)} | 筹码:${String(p.stack).padStart(5)} | 下注:${String(p.bet).padStart(4)} | 总投:${String(p.totalBet).padStart(5)} | ${status} | ${handStr(p.hand)}`;
}

function printTable(game) {
  log('牌桌', `底池: ${game.pot} | 公共牌: ${game.community.map(cardStr).join(' ') || '无'} | 阶段: ${game.phase}`);
  log('牌桌', `庄家位: seat${game.dealerIdx} | SB位: seat${game.sbIdx} | BB位: seat${game.bbIdx} | 当前行动: seat${game.currentIdx}(${game.players[game.currentIdx]?.name})`);
  console.log('  ─────────────────────────────────────────────────────────────────────');
  for (const p of game.players) {
    console.log(printPlayerState(p));
  }
  console.log('  ─────────────────────────────────────────────────────────────────────');
}

// ===== Simulate =====
function simulate() {
  console.log('\n' + '='.repeat(72));
  console.log('  德州扑克 — 完整牌局流程模拟');
  console.log('='.repeat(72));

  // --- Players ---
  const players = [
    { id: 'p1', name: '小明', stack: 2000, connected: true, isBot: false },
    { id: 'p2', name: '老王', stack: 2000, connected: true, isBot: true, botStyle: 'tag' },
    { id: 'p3', name: '阿花', stack: 2000, connected: true, isBot: true, botStyle: 'lap' },
    { id: 'p4', name: '大刘', stack: 2000, connected: true, isBot: true, botStyle: 'rock' },
  ];

  // Create mock WebSockets
  const wsMap = {};
  for (const p of players) {
    wsMap[p.id] = new MockWS(p.name);
  }

  log('房间', '创建房间 (SB=10, BB=20, 起始筹码=2000)');
  log('房间', `玩家: ${players.map(p => p.name).join(', ')}`);

  // --- Create Game ---
  const game = new Game(players, { sb: SB, bb: BB, startStack: START_STACK });

  // Wire up broadcast to capture events
  const events = [];
  game.onBroadcast = (type, data) => {
    events.push({ type, data });
    if (type !== 'game:state') {
      log('事件', `${type} ${JSON.stringify(data)}`);
    }
  };

  // Override broadcastState to print to our mock WS
  game.broadcastState = () => {
    for (const p of game.players) {
      if (p._ws && p.connected) {
        const state = game.getStateForPlayer(p.id);
        p._ws.send(JSON.stringify({ type: 'game:state', data: state }));
      }
    }
  };

  // Wire up mock WebSockets
  for (const gp of game.players) {
    gp._ws = wsMap[gp.id];
  }

  // ===== HAND 1 =====
  console.log('\n' + '─'.repeat(72));
  log('牌局', '▶ 第1手开始');
  console.log('─'.repeat(72));

  // --- startHand ---
  log('流程', 'startHand() — 洗牌、定位、下盲注、发牌');
  
  // Patch scheduleNextAction to avoid setTimeout
  game.scheduleNextAction = () => { /* noop in simulation */ };
  
  // Also patch setTimeout in advancePhase
  const origSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms) => { /* noop */ return 0; };

  game.startHand();

  log('流程', `庄家(D): seat${game.dealerIdx}(${game.players[game.dealerIdx].name})`);
  log('流程', `小盲(SB): seat${game.sbIdx}(${game.players[game.sbIdx].name}) — 投入 ${game.sb}`);
  log('流程', `大盲(BB): seat${game.bbIdx}(${game.players[game.bbIdx].name}) — 投入 ${game.bb}`);
  
  log('发牌', '每人2张底牌:');
  for (const p of game.players) {
    if (!p.folded) {
      log('发牌', `  ${p.name}: ${handStr(p.hand)}`);
    }
  }

  log('流程', `首个行动: seat${game.currentIdx}(${game.players[game.currentIdx].name})`);
  printTable(game);

  // ===== PREFLOP BETTING =====
  console.log('\n' + '─'.repeat(72));
  log('翻牌前', '▶ 开始下注轮');
  console.log('─'.repeat(72));

  // Simulate actions: p4 (UTG) calls, p1 (SB) calls, p2 (BB) checks, p3 folds
  // Order depends on dealerIdx, sbIdx, bbIdx — let's check
  const preflopOrder = [];
  let idx = game.currentIdx;
  const safety = 20;
  let count = 0;
  while (count < safety) {
    const p = game.players[idx];
    if (!p.folded && !p.allIn && p.connected) {
      preflopOrder.push(p);
    }
    idx = game.nextIdx(idx);
    if (idx === game.currentIdx) break;
    count++;
  }
  log('流程', `翻牌前行动顺序: ${preflopOrder.map(p => p.name).join(' → ')}`);

  // Action 1: First player to act — call (20)
  const actor1 = preflopOrder[0];
  log('行动', `${actor1.name} 跟注 20`);
  game.handleAction(actor1.id, { action: 'call' });
  printTable(game);

  // Action 2: Second player — raise to 60
  const actor2 = preflopOrder[1];
  if (!actor2.folded && !actor2.allIn) {
    log('行动', `${actor2.name} 加注到 60`);
    game.handleAction(actor2.id, { action: 'raise', amount: 60 });
    printTable(game);
  }

  // Remaining players respond — call or fold
  for (let i = 2; i < preflopOrder.length; i++) {
    const p = preflopOrder[i];
    if (p.folded || p.allIn) continue;
    const toCall = game.roundBet - p.bet;
    if (toCall > 0) {
      // Some fold, some call
      if (i === 3) {
        log('行动', `${p.name} 弃牌`);
        game.handleAction(p.id, { action: 'fold' });
      } else {
        log('行动', `${p.name} 跟注 ${toCall}`);
        game.handleAction(p.id, { action: 'call' });
      }
    } else {
      log('行动', `${p.name} 过牌`);
      game.handleAction(p.id, { action: 'check' });
    }
    printTable(game);
  }

  // Check if hand ended (all folded)
  if (game.inHandPlayers().length <= 1) {
    log('结算', '所有人弃牌，牌局结束');
    printResults(game);
    global.setTimeout = origSetTimeout;
    return;
  }

  // ===== FLOP =====
  console.log('\n' + '─'.repeat(72));
  log('翻牌', '▶ advancePhase → 翻牌');
  console.log('─'.repeat(72));
  
  game.advancePhase();
  log('翻牌', `公共牌: ${game.community.map(cardStr).join(' ')}`);
  printTable(game);

  // Flop betting — everyone checks
  const flopOrder = getPostFlopOrder(game);
  log('流程', `翻牌行动顺序: ${flopOrder.map(p => p.name).join(' → ')}`);
  
  for (const p of flopOrder) {
    if (p.folded || p.allIn) continue;
    log('行动', `${p.name} 过牌`);
    game.handleAction(p.id, { action: 'check' });
  }
  printTable(game);

  // ===== TURN =====
  console.log('\n' + '─'.repeat(72));
  log('转牌', '▶ advancePhase → 转牌');
  console.log('─'.repeat(72));
  
  game.advancePhase();
  log('转牌', `公共牌: ${game.community.map(cardStr).join(' ')}`);
  printTable(game);

  // Turn betting — one player bets, others respond
  const turnOrder = getPostFlopOrder(game);
  log('流程', `转牌行动顺序: ${turnOrder.map(p => p.name).join(' → ')}`);

  let turnBet = false;
  for (const p of turnOrder) {
    if (p.folded || p.allIn) continue;
    const toCall = game.roundBet - p.bet;
    if (!turnBet) {
      log('行动', `${p.name} 下注 40`);
      game.handleAction(p.id, { action: 'raise', amount: 40 });
      turnBet = true;
    } else if (toCall > 0) {
      if (Math.random() > 0.5) {
        log('行动', `${p.name} 跟注 ${toCall}`);
        game.handleAction(p.id, { action: 'call' });
      } else {
        log('行动', `${p.name} 弃牌`);
        game.handleAction(p.id, { action: 'fold' });
      }
    } else {
      log('行动', `${p.name} 过牌`);
      game.handleAction(p.id, { action: 'check' });
    }
  }
  printTable(game);

  if (game.inHandPlayers().length <= 1) {
    log('结算', '所有人弃牌，牌局结束');
    printResults(game);
    global.setTimeout = origSetTimeout;
    return;
  }

  // ===== RIVER =====
  console.log('\n' + '─'.repeat(72));
  log('河牌', '▶ advancePhase → 河牌');
  console.log('─'.repeat(72));
  
  game.advancePhase();
  log('河牌', `公共牌: ${game.community.map(cardStr).join(' ')}`);
  printTable(game);

  // River betting — check check
  const riverOrder = getPostFlopOrder(game);
  for (const p of riverOrder) {
    if (p.folded || p.allIn) continue;
    log('行动', `${p.name} 过牌`);
    game.handleAction(p.id, { action: 'check' });
  }
  printTable(game);

  // ===== SHOWDOWN =====
  console.log('\n' + '─'.repeat(72));
  log('摊牌', '▶ advancePhase → 摊牌');
  console.log('─'.repeat(72));
  
  game.advancePhase(); // This triggers showdown()

  log('摊牌', '各玩家手牌:');
  for (const p of game.inHandPlayers()) {
    const eval5 = require('../../server/game').evaluateHand([...p.hand, ...game.community]);
    log('摊牌', `  ${p.name}: ${handStr(p.hand)} → ${eval5.name}`);
  }

  printResults(game);
  global.setTimeout = origSetTimeout;
}

function getPostFlopOrder(game) {
  const order = [];
  let idx = game.nextIdx(game.dealerIdx);
  const safety = 10;
  let count = 0;
  const visited = new Set();
  while (count < safety) {
    const p = game.players[idx];
    if (!p.folded && !p.allIn && p.connected && !visited.has(p.id)) {
      order.push(p);
      visited.add(p.id);
    }
    idx = game.nextIdx(idx);
    if (visited.size >= game.canActPlayers().length) break;
    count++;
  }
  return order;
}

function printResults(game) {
  console.log('\n' + '='.repeat(72));
  log('结算', '▶ 牌局结果');
  console.log('='.repeat(72));
  
  for (const w of game.winners) {
    log('结果', `🏆 ${w.name} 赢得 ${w.amount} 筹码 (${w.hand})`);
  }

  console.log('\n  最终筹码:');
  for (const p of game.players) {
    const diff = p.stack - START_STACK;
    const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
    console.log(`  ${p.name.padEnd(6)}: ${p.stack} (${diffStr})`);
  }
  console.log('');
}

// Run
simulate();
