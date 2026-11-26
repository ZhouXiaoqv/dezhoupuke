/**
 * Texas Hold'em Game Engine — Server-side authoritative
 * Handles all game logic: deck, hand evaluation, betting rounds, pot management
 */

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_VALUES = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
const HAND_NAMES = ['高牌','一对','两对','三条','顺子','同花','葫芦','四条','同花顺','皇家同花顺'];
const { randomUUID } = require('node:crypto');
const gameLogger = require('./gameLogger');
const { emptyChips, chipTotal, startingChips, addChips, transferChips } = require('./chips');

const SB = 10;
const BB = 20;
const START_STACK = 2000;
const MECHANICAL_TURN_MS = 20_000;

// ===== Deck =====
function createDeck(shortDeck = false) {
  const d = [];
  const startRank = shortDeck ? 6 : 0; // Short deck: 6+ only
  for (let s = 0; s < 4; s++)
    for (let r = startRank; r < 13; r++)
      d.push({ suit: s, rank: r, rankStr: RANKS[r], suitStr: SUITS[s] });
  return d;
}

function shuffle(d) {
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// ===== Hand Evaluation =====
function evaluateHand(cards) {
  const combos = getCombinations(cards, 5);
  let best = null;
  for (const combo of combos) {
    const r = evaluate5(combo);
    if (!best || compareEval(r, best) > 0) best = r;
  }
  return best;
}

function getCombinations(arr, k) {
  const result = [];
  function bt(start, current) {
    if (current.length === k) { result.push([...current]); return; }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      bt(i + 1, current);
      current.pop();
    }
  }
  bt(0, []);
  return result;
}

function evaluate5(cards) {
  const ranks = cards.map(c => RANK_VALUES[c.rankStr]).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
  const unique = [...new Set(ranks)].sort((a, b) => b - a);

  let isStraight = false, straightHigh = 0;
  if (unique.length >= 5) {
    for (let i = 0; i <= unique.length - 5; i++) {
      if (unique[i] - unique[i + 4] === 4) { isStraight = true; straightHigh = unique[i]; break; }
    }
    if (!isStraight && unique.includes(14) && unique.includes(5) && unique.includes(4) && unique.includes(3) && unique.includes(2)) {
      isStraight = true; straightHigh = 5;
    }
  }

  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.entries(counts).map(([r, c]) => ({ rank: +r, count: c }));
  groups.sort((a, b) => b.count - a.count || b.rank - a.rank);

  if (isFlush && isStraight) {
    if (straightHigh === 14) return { rank: 9, values: [14], name: '皇家同花顺' };
    return { rank: 8, values: [straightHigh], name: '同花顺' };
  }
  if (groups[0].count === 4) return { rank: 7, values: [groups[0].rank, groups[1].rank], name: '四条' };
  if (groups[0].count === 3 && groups[1] && groups[1].count === 2) return { rank: 6, values: [groups[0].rank, groups[1].rank], name: '葫芦' };
  if (isFlush) return { rank: 5, values: ranks, name: '同花' };
  if (isStraight) return { rank: 4, values: [straightHigh], name: '顺子' };
  if (groups[0].count === 3) return { rank: 3, values: [groups[0].rank, ...groups.slice(1).map(g => g.rank)], name: '三条' };
  if (groups[0].count === 2 && groups[1] && groups[1].count === 2) return { rank: 2, values: [groups[0].rank, groups[1].rank, groups[2].rank], name: '两对' };
  if (groups[0].count === 2) return { rank: 1, values: [groups[0].rank, ...groups.slice(1).map(g => g.rank)], name: '一对' };
  return { rank: 0, values: ranks, name: '高牌' };
}

function compareEval(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.min(a.values.length, b.values.length); i++) {
    if (a.values[i] !== b.values[i]) return a.values[i] - b.values[i];
  }
  return 0;
}

// ===== Game Class =====
class Game {
  constructor(players, options = {}) {
    this.sb = options.sb || SB;
    this.bb = options.bb || BB;
    this.startStack = options.startStack || START_STACK;
    this.shortDeck = options.shortDeck || false;
    this.allInOrFold = options.allInOrFold || false;
    this.gameMode = options.gameMode || 'classic';
    this.tableStyle = options.tableStyle === 'mechanical' ? 'mechanical' : 'classic';
    this.turnDurationMs = this.tableStyle === 'mechanical' ? options.turnDurationMs ?? MECHANICAL_TURN_MS : 0;

    this.players = players.map((p, i) => ({
      id: p.id,
      name: p.name,
      seatIdx: i,
      isBot: !!p.isBot,
      stack: Number.isFinite(p.stack) ? p.stack : this.startStack,
      hand: [],
      bet: 0,
      totalBet: 0,
      folded: false,
      allIn: false,
      lastAction: '',
      connected: p.connected !== false,
      _username: p._username || null,
      avatar: p.avatar || '🦊',
      avatarColor: p.avatarColor || null,
      cardBack: p.cardBack || 'default-blue',
      pet: p.pet || p.publicProfile?.pet || '',
      publicProfile: p.publicProfile || null,
    }));
    this.deck = [];
    this.community = [];
    this.pot = 0;
    if (this.tableStyle === 'mechanical') {
      this.potChips = emptyChips();
      this.players.forEach((player, index) => {
        const saved = players[index].chips;
        player.chips = saved && chipTotal(saved) === Math.floor(player.stack) ? saved.slice() : startingChips(player.stack);
        player.betChips = emptyChips();
      });
    }
    this.dealerIdx = Math.floor(Math.random() * this.players.length);
    this.currentIdx = 0;
    this.phase = 'idle';
    this.minRaise = this.bb;
    this.lastRaise = this.bb;
    this.roundBet = 0;
    this.actedCount = 0;
    this.handNum = 0;
    this.winners = [];
    this.refunds = [];
    this.revealedHands = new Set();
    this.showHandPending = null;
    this.showHandTimeout = null;
    this.actionTimeout = null;
    this.turnTimeout = null;
    this.turn = null;
    this.cardGate = null;
    this.phaseTimeout = null;
    this.handEndTimeout = null;
    this.handSettled = false;
    this.onBroadcast = null; // callback(type, data)
    this.onGameEnd = null;
  }

  // ===== Helpers =====
  activePlayers() { return this.players.filter(p => !p.folded && (p.stack > 0 || p.bet > 0) && p.connected); }
  inHandPlayers() { return this.players.filter(p => !p.folded && p.connected); }
  canActPlayers() { return this.players.filter(p => !p.folded && !p.allIn && p.connected); }

  commitBet(player, amount) {
    if (this.potChips && amount > 0) {
      const paid = transferChips(player.chips, this.potChips, amount, player.stack, this.pot);
      addChips(player.betChips, paid);
      const units = Math.floor(player.bet + amount) - chipTotal(player.betChips);
      player.betChips[player.betChips.length - 1] += units;
    }
    player.stack -= amount;
    player.bet += amount;
    player.totalBet += amount;
    this.pot += amount;
  }

  payoutFromPot() {
    // The settlement animation still needs the full pot snapshot.
    const chips = this.potChips?.slice();
    let available = this.pot;
    return (player, amount) => {
      const paid = chips ? transferChips(chips, player.chips, amount, available, player.stack) : undefined;
      available -= amount;
      player.stack += amount;
      return paid;
    };
  }

  nextIdx(from) {
    let idx = (from + 1) % this.players.length;
    let safety = 0;
    while ((this.players[idx].folded || this.players[idx].allIn || !this.players[idx].connected) && safety < 10) {
      idx = (idx + 1) % this.players.length;
      safety++;
    }
    return idx;
  }

  broadcast(type, data = {}) {
    if (this.onBroadcast) this.onBroadcast(type, data);
  }

  clearActionTimeout() {
    if (this.actionTimeout) {
      clearTimeout(this.actionTimeout);
      this.actionTimeout = null;
    }
  }

  clearTurn() {
    clearTimeout(this.turnTimeout);
    this.turnTimeout = null;
    this.turn = null;
  }

  beginCardGate(boardFrom, count, resume) {
    if (this.tableStyle !== 'mechanical') return false;
    const waiting = new Set(this.players.filter(p => p.connected && !p.isBot && p._ws?.readyState === 1).map(p => p.id));
    if (!waiting.size) return false;
    const gate = { batch: { id: randomUUID(), boardFrom }, waiting, resume };
    this.cardGate = gate;
    // Allow time for the serial deals and earlier FIFO jobs, even with a full table.
    gate.timeout = setTimeout(() => this.releaseCardGate(gate), 12_000 + count * 1_400);
    return true;
  }

  clearCardGate() {
    clearTimeout(this.cardGate?.timeout);
    this.cardGate = null;
  }

  releaseCardGate(gate) {
    if (this.cardGate !== gate) return;
    this.clearCardGate();
    gate.resume();
  }

  acknowledgeCards(playerId, id) {
    const gate = this.cardGate;
    if (!gate || gate.batch.id !== id || !gate.waiting.delete(playerId)) return;
    if (!gate.waiting.size) this.releaseCardGate(gate);
  }

  expireTurn(turn) {
    if (this.turn !== turn || this.handSettled) return;
    const player = this.players[this.currentIdx];
    if (player?.id !== turn.playerId) return;
    const action = this.roundBet > player.bet ? 'fold' : 'check';
    this.handleAction(player.id, { action }, true);
  }

  sendTurnPrompt(player) {
    if (this.cardGate || player._ws?.readyState !== 1) return;
    player._ws.send(JSON.stringify({ type: 'game:yourTurn', data: {
      playerId: player.id,
      toCall: this.roundBet - player.bet,
      minRaise: this.roundBet + this.minRaise,
      maxRaise: player.stack + player.bet,
      pot: this.pot,
      gameMode: this.gameMode,
      allInOrFold: this.allInOrFold,
      ...(this.turn && { turnDeadline: this.turn.deadline }),
    }}));
  }

  clearPhaseTimeout() {
    if (this.phaseTimeout) {
      clearTimeout(this.phaseTimeout);
      this.phaseTimeout = null;
    }
  }

  clearHandEndTimeout() {
    if (this.handEndTimeout) {
      clearTimeout(this.handEndTimeout);
      this.handEndTimeout = null;
    }
  }

  buildActionLogEntry(player, action, amount, extra = {}) {
    return {
      phase: this.phase,
      playerId: player.id,
      playerName: player.name,
      action,
      amount: amount || 0,
      pot: this.pot,
      bet: player.bet,
      totalBet: player.totalBet,
      stack: player.stack,
      roundBet: this.roundBet,
      time: Date.now(),
      ...extra,
    };
  }

  getState() {
    return {
      players: this.players.map(p => ({
        id: p.id, name: p.name, seatIdx: p.seatIdx,
        stack: p.stack, bet: p.bet, totalBet: p.totalBet,
        ...(p.betChips && { betChips: p.betChips.slice() }),
        folded: p.folded, allIn: p.allIn, lastAction: p.lastAction,
        handRank: this.phase === 'showdown' ? this.showdownRanks?.get(p.id) : undefined,
        connected: p.connected,
        avatar: p.avatar || '🦊',
        avatarColor: p.avatarColor || null,
        cardBack: p.cardBack || 'default-blue',
        pet: p.pet || p.publicProfile?.pet || '',
        publicProfile: p.publicProfile || null,
        // Only send hand cards to the owning player (handled per-client)
        hand: p.hand,
      })),
      community: this.community,
      pot: this.pot,
      ...(this.potChips && { potChips: this.potChips.slice() }),
      ...(this.cardGate && { cardGate: this.cardGate.batch }),
      ...(this.turnDurationMs && { turn: this.turn && { ...this.turn, remainingMs: Math.max(0, this.turn.deadline - Date.now()) } }),
      dealerIdx: this.dealerIdx,
      sbIdx: this.sbIdx,
      bbIdx: this.bbIdx,
      currentIdx: this.currentIdx,
      phase: this.phase,
      roundBet: this.roundBet,
      minRaise: this.minRaise,
      gameMode: this.gameMode,
      tableStyle: this.tableStyle,
      sb: this.sb,
      bb: this.bb,
      allInOrFold: this.allInOrFold,
      handNum: this.handNum,
      winners: this.winners,
      refunds: this.refunds,
    };
  }

  // Get state filtered for a specific player (hide other players' cards)
  getStateForPlayer(playerId) {
    const state = this.getState();
    state.players = state.players.map(p => ({
      ...p,
      hand: p.id === playerId ? p.hand : (p.hand.length > 0 && !p.folded && (this.phase === 'showdown' || this.revealedHands.has(p.id)) ? p.hand : p.hand.map(() => null)),
    }));
    return state;
  }

  // Get state for spectators (no hole cards, only showdown reveals)
  getStateForSpectator() {
    const state = this.getState();
    state.isSpectatorView = true;
    state.players = state.players.map(p => ({
      ...p,
      hand: (p.hand.length > 0 && !p.folded && (this.phase === 'showdown' || this.revealedHands.has(p.id))) ? p.hand : p.hand.map(() => null),
    }));
    return state;
  }

  // ===== Game Flow =====
  startHand() {
    this.clearActionTimeout();
    this.clearTurn();
    this.clearCardGate();
    this.clearPhaseTimeout();
    this.clearHandEndTimeout();

    this.handNum++;
    this.deck = shuffle(createDeck(this.shortDeck));
    this.community = [];
    this.pot = 0;
    if (this.potChips) this.potChips.fill(0);
    this.winners = [];
    this.refunds = [];
    this.revealedHands = new Set();
    this.showHandPending = null;
    this.handSettled = false;
    if (this.showHandTimeout) {
      clearTimeout(this.showHandTimeout);
      this.showHandTimeout = null;
    }
    this.phase = 'preflop';
    this.lastRaise = this.bb;
    this.minRaise = this.bb;
    this.roundBet = 0;

    for (const p of this.players) {
      p.hand = [];
      p.bet = 0;
      p.totalBet = 0;
      p.folded = p.stack <= 0 || !p.connected;
      p.allIn = false;
      p.lastAction = '';
      p.betChips?.fill(0);
    }

    const playableCount = this.players.filter(p => p.stack > 0 && p.connected).length;
    if (playableCount < 2) {
      this.broadcast('game:error', { message: '需要至少2名玩家' });
      return;
    }

    // Move dealer clockwise
    this.dealerIdx = (this.dealerIdx + 1) % this.players.length;
    const sbIdx = this.nextIdx(this.dealerIdx);
    const bbIdx = this.nextIdx(sbIdx);
    this.sbIdx = sbIdx; // Save for later phases
    this.bbIdx = bbIdx; // Save for later phases

    // Start logging this hand (before blinds so they get recorded)
    gameLogger.startHand(this);

    const blindLogs = [
      this.postBlind(this.players[sbIdx], this.sb),
      this.postBlind(this.players[bbIdx], this.bb),
    ];

    // Deal
    for (let i = 0; i < 2; i++) {
      for (const p of this.players) {
        if (!p.folded) p.hand.push(this.deck.pop());
      }
    }

    this.currentIdx = this.nextIdx(bbIdx);
    this.actedCount = 0;
    const gated = this.beginCardGate(null, playableCount * 2, () => this.processNextAction());

    this.broadcast('game:handStart', { handNum: this.handNum });
    for (const entry of blindLogs) this.broadcast('game:actionLog', entry);
    this.broadcastState();

    if (!gated) this.scheduleNextAction();
  }

  postBlind(player, amount) {
    const actual = Math.min(amount, player.stack);
    this.commitBet(player, actual);
    this.roundBet = Math.max(this.roundBet, actual);
    if (player.stack === 0) player.allIn = true;
    const blindType = amount === this.sb ? '小盲' : '大盲';
    gameLogger.logAction(this, player, blindType, actual);
    return this.buildActionLogEntry(
      player,
      amount === this.sb ? 'smallBlind' : 'bigBlind',
      actual,
    );
  }

  broadcastState() {
    for (const p of this.players) {
      if (p._ws && p.connected) {
        const state = this.getStateForPlayer(p.id);
        p._ws.send(JSON.stringify({ type: 'game:state', data: state }));
      }
    }
  }


  scheduleNextAction() {
    if (this.handSettled) return;
    this.clearActionTimeout();
    this.actionTimeout = setTimeout(() => {
      this.actionTimeout = null;
      this.processNextAction();
    }, 500);
  }

  processNextAction() {
    if (this.cardGate || this.handSettled || this.phase === 'showdown' || this.phase === 'show_choice' || this.phase === 'idle') return;
    const inHand = this.inHandPlayers();
    if (inHand.length <= 1) { this.endHand(); return; }

    const canAct = this.canActPlayers();
    if (canAct.length === 0 || (this.tableStyle === 'mechanical' && canAct.length === 1 && canAct[0].bet === this.roundBet)) {
      this.advancePhase();
      return;
    }

    const player = this.players[this.currentIdx];

    if (player.folded || player.allIn || !player.connected) {
      this.currentIdx = this.nextIdx(this.currentIdx);
      this.processNextAction();
      return;
    }


    const toCall = this.roundBet - player.bet;
    if (player.isBot) {
      this.handleAction(player.id, { action: toCall > 0 ? 'call' : 'check' });
      return;
    }
    if (this.turnDurationMs && this.turn?.playerId !== player.id) {
      this.clearTurn();
      const turn = this.turn = { playerId: player.id, deadline: Date.now() + this.turnDurationMs, durationMs: this.turnDurationMs };
      this.turnTimeout = setTimeout(() => this.expireTurn(turn), this.turnDurationMs);
      this.broadcastState();
    }
    this.sendTurnPrompt(player);
  }

  handleAction(playerId, actionData, timedOut = false) {
    if (this.cardGate || this.handSettled || !['preflop', 'flop', 'turn', 'river'].includes(this.phase)) return;

    const player = this.players.find(p => p.id === playerId);
    if (!player || player.folded || player.allIn) return;
    if (this.players[this.currentIdx].id !== playerId) return; // Not their turn
    const { action, amount, turnDeadline } = actionData || {};
    if (this.turnDurationMs && turnDeadline !== undefined && turnDeadline !== this.turn?.deadline) return;
    if (!timedOut && this.turn && Date.now() >= this.turn.deadline) return this.expireTurn(this.turn);

    const toCall = this.roundBet - player.bet;
    let actionLogEntry = null;

    // All-in-or-fold mode: only fold, check, or allin allowed
    if (this.allInOrFold) {
      if (action === 'call' || action === 'raise') {
        // Convert call/raise to allin
        return this.handleAction(playerId, { action: 'allin' });
      }
    }

    switch (action) {
      case 'fold':
        player.folded = true;
        player.lastAction = 'fold';
        actionLogEntry = this.buildActionLogEntry(player, 'fold', 0, timedOut ? { timedOut: true } : undefined);
        gameLogger.logAction(this, player, timedOut ? '超时弃牌' : '弃牌', 0);
        break;

      case 'check':
        if (toCall > 0) return this.sendTurnPrompt(player);
        player.lastAction = 'check';
        actionLogEntry = this.buildActionLogEntry(player, 'check', 0, timedOut ? { timedOut: true } : undefined);
        gameLogger.logAction(this, player, timedOut ? '超时过牌' : '过牌', 0);
        break;

      case 'call': {
        const actual = Math.min(toCall, player.stack);
        this.commitBet(player, actual);
        if (player.stack === 0) player.allIn = true;
        player.lastAction = player.allIn ? 'allin' : 'call';
        actionLogEntry = this.buildActionLogEntry(
          player,
          player.allIn ? 'allinCall' : 'call',
          actual,
        );
        gameLogger.logAction(this, player, player.allIn ? 'ALL IN(跟注)' : '跟注', actual);
        break;
      }

      case 'raise': {
        const previousBet = this.roundBet;
        const raiseAmount = Math.max(amount || 0, this.roundBet + this.minRaise);
        const toPay = Math.min(raiseAmount - player.bet, player.stack);
        if (!Number.isFinite(toPay) || toPay <= 0) return this.sendTurnPrompt(player);
        this.commitBet(player, toPay);
        this.lastRaise = toPay;
        this.minRaise = Math.max(this.minRaise, toPay);
        this.roundBet = player.bet;
        if (player.stack === 0) { player.allIn = true; player.lastAction = 'allin'; }
        else player.lastAction = 'raise';
        actionLogEntry = this.buildActionLogEntry(
          player,
          player.allIn ? 'allinRaise' : 'raise',
          toPay,
          { raiseTo: player.bet, raiseBy: Math.max(0, player.bet - previousBet) },
        );
        this.actedCount = 0; // Others need to act again
        gameLogger.logAction(this, player, '加注', toPay, { raiseTo: player.bet });
        break;
      }

      case 'allin': {
        const amt = player.stack;
        this.commitBet(player, amt);
        player.allIn = true;
        player.lastAction = 'allin';
        if (player.bet > this.roundBet) {
          this.roundBet = player.bet;
          this.actedCount = 0;
        }
        actionLogEntry = this.buildActionLogEntry(player, 'allin', amt);
        gameLogger.logAction(this, player, 'ALL IN', amt);
        break;
      }

      default:
        return this.sendTurnPrompt(player);
    }

    this.clearActionTimeout();
    this.clearTurn();
    this.actedCount++;

    // Update current player first, then broadcast
    this.currentIdx = this.nextIdx(this.currentIdx);
    if (actionLogEntry) this.broadcast('game:actionLog', actionLogEntry);
    this.broadcastState();

    const inHand = this.inHandPlayers();
    if (inHand.length <= 1) { this.endHand(); return; }

    const canAct = this.canActPlayers();
    const allMatched = canAct.every(p => p.bet === this.roundBet);
    if (allMatched && this.actedCount >= canAct.length) {
      this.advancePhase();
    } else if (this.tableStyle === 'mechanical' && action === 'fold') {
      this.processNextAction();
    } else {
      this.scheduleNextAction();
    }
  }

  advancePhase() {
    if (this.cardGate || this.handSettled || this.phase === 'showdown' || this.phase === 'show_choice' || this.phase === 'idle') return;
    this.clearPhaseTimeout();
    this.clearTurn();
    for (const p of this.players) {
      p.bet = 0;
      p.betChips?.fill(0);
    }
    this.roundBet = 0;
    this.actedCount = 0;
    this.lastRaise = this.bb;
    this.minRaise = this.bb;

    const inHand = this.inHandPlayers();
    if (inHand.length <= 1) { this.endHand(); return; }

    const boardFrom = this.community.length;
    if (this.phase === 'preflop') {
      this.phase = 'flop';
      this.deck.pop(); // Burn card
      this.community.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
    } else if (this.phase === 'flop') {
      this.phase = 'turn';
      this.deck.pop(); // Burn card
      this.community.push(this.deck.pop());
    } else if (this.phase === 'turn') {
      this.phase = 'river';
      this.deck.pop(); // Burn card
      this.community.push(this.deck.pop());
    } else if (this.phase === 'river') {
      this.showdown();
      return;
    }

    const canAct = this.canActPlayers();
    if (canAct.length > 1) this.currentIdx = this.nextIdx(this.dealerIdx);
    const gated = this.beginCardGate(boardFrom, this.community.length - boardFrom, () => this.processNextAction());
    gameLogger.logPhaseChange(this, this.phase);
    this.broadcastState();
    if (gated) return;
    if (canAct.length <= 1) {
      this.phaseTimeout = setTimeout(() => {
        this.phaseTimeout = null;
        this.advancePhase();
      }, 1000);
      return;
    }

    this.actionTimeout = setTimeout(() => {
      this.actionTimeout = null;
      this.processNextAction();
    }, 1000);
  }

  showdown() {
    if (this.cardGate || this.handSettled) return;
    this.handSettled = true;
    this.clearActionTimeout();
    this.clearTurn();
    this.clearPhaseTimeout();
    this.phase = 'showdown';
    const inHand = this.inHandPlayers();

    // Evaluate hands and sort best → worst
    const evals = inHand.map(p => ({
      player: p,
      eval: evaluateHand([...p.hand, ...this.community])
    }));
    evals.sort((a, b) => compareEval(b.eval, a.eval));

    // ===== Side pot calculation =====
    // 1) Collect all unique totalBet levels (including folded players)
    const allBets = new Set();
    for (const p of this.players) {
      if (p.totalBet > 0) allBets.add(p.totalBet);
    }
    const levels = [...allBets].sort((a, b) => a - b);

    // 2) Walk through layers, calculate each layer's pot
    let prevLevel = 0;
    const awards = {}; // playerId → total won

    const refunds = {};

    for (const level of levels) {
      const layerSize = level - prevLevel;
      if (layerSize <= 0) { prevLevel = level; continue; }

      // Every player with totalBet >= level contributes layerSize
      const contributors = this.players.filter(p => p.totalBet >= level);
      const layerPot = contributors.length * layerSize;
      if (layerPot <= 0) { prevLevel = level; continue; }

      // A layer funded by only one player is an unmatched bet return, not a won pot.
      if (contributors.length === 1) {
        const pid = contributors[0].id;
        refunds[pid] = (refunds[pid] || 0) + layerPot;
        prevLevel = level;
        continue;
      }

      // Eligible winners: in-hand (not folded) with totalBet >= level
      const eligible = evals.filter(e => e.player.totalBet >= level);
      if (eligible.length === 0) {
        for (const contributor of contributors) {
          refunds[contributor.id] = (refunds[contributor.id] || 0) + layerSize;
        }
        prevLevel = level;
        continue;
      }

      // Best hand(s) among eligible
      const best = [eligible[0]];
      for (let i = 1; i < eligible.length; i++) {
        const cmp = compareEval(eligible[i].eval, eligible[0].eval);
        if (cmp === 0) best.push(eligible[i]);
        else break;
      }

      // Split layer pot equally among tied best
      const share = Math.floor(layerPot / best.length);
      let remainder = layerPot - share * best.length;

      for (let i = 0; i < best.length; i++) {
        const pid = best[i].player.id;
        const extra = (i === 0) ? remainder : 0; // remainder → first winner
        awards[pid] = (awards[pid] || 0) + share + extra;
      }

      prevLevel = level;
    }

    // 3) Apply winnings and build result
    const payout = this.payoutFromPot();
    this.winners = [];
    this.refunds = [];
    for (const [pid, amount] of Object.entries(refunds)) {
      if (amount <= 0) continue;
      const player = this.players.find(p => p.id === pid);
      if (!player) continue;
      const chips = payout(player, amount);
      this.refunds.push({ id: pid, name: player.name, amount, ...(chips && { chips }) });
    }

    for (const [pid, amount] of Object.entries(awards)) {
      if (amount <= 0) continue;
      const e = evals.find(e => e.player.id === pid);
      const chips = payout(e.player, amount);
      e.player.lastAction = 'winner';
      this.winners.push({
        id: pid, name: e.player.name,
        hand: e.eval.name, amount, ...(chips && { chips }),
      });
    }

    this.showdownRanks = new Map(evals.map(({ player, eval: result }) => [player.id, result.name]));

    // Sort winners by amount descending for display
    this.winners.sort((a, b) => b.amount - a.amount);

    this.broadcastState();
    this.broadcast('game:showdown', { winners: this.winners, refunds: this.refunds });
    gameLogger.logPhaseChange(this, 'showdown');
    gameLogger.logResult(this, this.winners);

    this.handEndTimeout = setTimeout(() => {
      this.handEndTimeout = null;
      this.broadcast('game:handEnd', { winners: this.winners, refunds: this.refunds });
      if (this.onGameEnd) this.onGameEnd();
    }, 3000);
  }

  endHand() {
    if (this.cardGate || this.handSettled) return;
    const inHand = this.inHandPlayers();
    if (inHand.length === 0 && this.tableStyle === 'mechanical') return this.showdown();
    if (inHand.length === 1) {
      this.handSettled = true;
      this.clearActionTimeout();
      this.clearTurn();
      this.clearPhaseTimeout();
      const winner = inHand[0];
      const payout = this.payoutFromPot();
      const chips = payout(winner, this.pot);
      winner.lastAction = 'winner';
      this.winners = [{ id: winner.id, name: winner.name, hand: '其他人弃牌', amount: this.pot, ...(chips && { chips }) }];
      this.phase = 'show_choice';
      this.currentIdx = winner.seatIdx;
      this.showHandPending = { playerId: winner.id, settled: false };
      this.broadcastState();
      gameLogger.logResult(this, this.winners);

      if (winner._ws && winner.connected && winner._ws.readyState === 1) {
        winner._ws.send(JSON.stringify({
          type: 'game:showHandOption',
          data: { playerId: winner.id, timeout: 8 },
        }));
      }

      this.showHandTimeout = setTimeout(() => {
        this.handleShowHandChoice(winner.id, false);
      }, 8000);
    }
  }

  handleShowHandChoice(playerId, show) {
    if (!this.showHandPending || this.showHandPending.settled) return;
    if (this.showHandPending.playerId !== playerId) return;

    if (this.showHandTimeout) {
      clearTimeout(this.showHandTimeout);
      this.showHandTimeout = null;
    }

    this.showHandPending.settled = true;
    if (show) {
      const player = this.players.find(p => p.id === playerId);
      const result = this.winners.find(w => w.id === playerId);
      const best = evaluateHand([...player.hand, ...this.community]);
      if (best) result.revealedRank = best.name;
      else if (player.hand.length === 2) {
        const [a, b] = player.hand;
        result.revealedRank = a.rank === b.rank ? HAND_NAMES[1] : HAND_NAMES[0];
      }
      this.revealedHands.add(playerId);
      this.broadcastState();
      this.broadcast('game:handShown', {
        playerId,
        name: player ? player.name : '',
      });
    }

    const finish = () => {
      this.showHandPending = null;
      this.phase = 'idle';
      this.broadcast('game:handEnd', {
        winners: this.winners,
        showedHand: !!show,
        showedPlayerId: show ? playerId : null,
      });
      if (this.onGameEnd) this.onGameEnd();
    };

    if (show) setTimeout(finish, 1500);
    else finish();
  }

  // Player disconnected
  handleDisconnect(playerId) {
    if (this.handSettled) return;
    const player = this.players.find(p => p.id === playerId);
    if (!player) return;
    player.connected = false;
    if (this.cardGate) {
      this.acknowledgeCards(playerId, this.cardGate.batch.id);
      return;
    }

    // If it's their turn, auto-fold
    if (this.players[this.currentIdx]?.id === playerId && this.phase !== 'showdown' && this.phase !== 'idle' && this.phase !== 'show_choice') {
      this.handleAction(playerId, { action: 'fold' });
    }
  }

  handleReconnect(playerId, ws) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return;
    player.connected = true;
    player._ws = ws;

    // Send current state
    const state = this.getStateForPlayer(playerId);
    ws.send(JSON.stringify({ type: 'game:state', data: state }));

    if (this.showHandPending?.playerId === playerId && !this.showHandPending.settled) {
      ws.send(JSON.stringify({
        type: 'game:showHandOption',
        data: { playerId, timeout: 8 },
      }));
    }

    // If it's their turn, prompt
    if (this.players[this.currentIdx]?.id === playerId && ['preflop', 'flop', 'turn', 'river'].includes(this.phase) &&
        (!this.turnDurationMs || this.turn?.playerId === playerId)) {
      this.sendTurnPrompt(player);
    }
  }
}

module.exports = { Game, SB, BB, START_STACK, HAND_NAMES, evaluateHand };
