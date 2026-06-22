/**
 * Game Logger — records every hand's events via the unified logger.
 *
 * All per-action / per-phase entries are written as DEBUG level.
 * hand_start and hand_end are written as INFO level so they are
 * always visible even when DEBUG output is filtered.
 *
 * The old game-hands.jsonl file is no longer written; existing data
 * in that file is preserved but no new lines will be appended.
 */

const logger = require('./logger');

class GameLogger {
  constructor() {
    this.currentHand = null;
    this.roomCode = null;
  }

  // Called at startHand — begin a new hand record
  startHand(game) {
    this.roomCode = game.roomCode || null;

    const players = game.players.map((p) => ({
      id: p.id,
      name: p.name,
      seatIdx: p.seatIdx,
      stack: p.stack + p.bet,
    }));

    const hands = {};
    for (const p of game.players) {
      if (p.hand && p.hand.length === 2) {
        hands[p.id] = p.hand.map((c) => (c ? `${c.rankStr}${c.suitStr}` : null));
      }
    }

    this.currentHand = {
      handNum: game.handNum,
      roomCode: this.roomCode,
    };

    logger.info('GAME', 'hand_start', {
      roomCode: this.roomCode,
      handNum: game.handNum,
      config: { sb: game.sb, bb: game.bb, startStack: game.startStack, mode: game.gameMode },
      dealer: { idx: game.dealerIdx, name: game.players[game.dealerIdx]?.name },
      sb: { idx: game.sbIdx, name: game.players[game.sbIdx]?.name, amount: game.sb },
      bb: { idx: game.bbIdx, name: game.players[game.bbIdx]?.name, amount: game.bb },
      players,
      hands,
      msg: `[${this.roomCode}] 第${game.handNum}手开始，${players.length}人参与`,
    });
  }

  // Called on every action (fold, check, call, raise, allin, blind)
  logAction(game, player, action, amount, extra = {}) {
    if (!this.currentHand) return;

    logger.debug('GAME', 'hand_action', {
      roomCode: this.roomCode,
      handNum: this.currentHand.handNum,
      phase: game.phase,
      player: player.name,
      playerId: player.id,
      seat: player.seatIdx,
      action,
      amount: amount || 0,
      state: {
        playerStack: player.stack,
        playerBet: player.bet,
        playerTotalBet: player.totalBet,
        pot: game.pot,
        roundBet: game.roundBet,
        currentIdx: game.currentIdx,
        inHand: game.inHandPlayers().map((p) => p.name),
      },
      ...extra,
    });
  }

  // Called when phase changes (flop, turn, river, showdown)
  logPhaseChange(game, phase) {
    if (!this.currentHand) return;

    logger.debug('GAME', 'hand_phase', {
      roomCode: this.roomCode,
      handNum: this.currentHand.handNum,
      phase,
      community: game.community.map((c) => `${c.rankStr}${c.suitStr}`),
      pot: game.pot,
      players: game.players.map((p) => ({
        name: p.name,
        stack: p.stack,
        bet: p.bet,
        totalBet: p.totalBet,
        folded: p.folded,
        allIn: p.allIn,
      })),
    });
  }

  // Called at showdown/endHand — finalize
  logResult(game, winners) {
    if (!this.currentHand) return;

    const winnersInfo = winners.map((w) => ({
      name: w.name,
      id: w.id,
      amount: w.amount,
      hand: w.hand,
    }));

    const winnersStr = winnersInfo.map((w) => `${w.name}(+${w.amount})`).join(', ');

    logger.info('GAME', 'hand_end', {
      roomCode: this.roomCode,
      handNum: this.currentHand.handNum,
      winners: winnersInfo,
      pot: game.pot,
      finalStacks: game.players.map((p) => ({
        name: p.name,
        stack: p.stack,
        totalBet: p.totalBet,
        folded: p.folded,
      })),
      showdownHands: game.inHandPlayers().map((p) => ({
        name: p.name,
        hand: p.hand.map((c) => (c ? `${c.rankStr}${c.suitStr}` : null)),
        eval: this._evalHand(p, game),
      })),
      community: game.community.map((c) => `${c.rankStr}${c.suitStr}`),
      msg: `[${this.roomCode}] 第${this.currentHand.handNum}手结束，赢家: ${winnersStr}`,
    });

    this.currentHand = null;
  }

  _evalHand(player, game) {
    try {
      const { evaluateHand } = require('./game');
      const cards = [...player.hand, ...game.community].filter((c) => c);
      if (cards.length >= 5) {
        return evaluateHand(cards).name;
      }
      return null;
    } catch {
      return null;
    }
  }
}

module.exports = new GameLogger();
