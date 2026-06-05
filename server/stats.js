/**
 * StatsTracker — tracks player statistics across sessions
 */

const { UserStore } = require('./userStore');

class StatsTracker {
  constructor(userStore) {
    this.stats = new Map();
    this.userStore = userStore;
  }

  record(playerName, data) {
    if (!this.stats.has(playerName)) {
      this.stats.set(playerName, {
        name: playerName,
        handsPlayed: 0,
        handsWon: 0,
        totalWon: 0,
        totalLost: 0,
        biggestPot: 0,
        bestHand: '',
        bestHandRank: -1,
        allIns: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
      });
    }

    const stats = this.stats.get(playerName);
    stats.handsPlayed++;
    stats.lastSeen = Date.now();

    if (data.won) {
      stats.handsWon++;
      stats.totalWon += data.amount;
      if (data.amount > stats.biggestPot) stats.biggestPot = data.amount;
    }

    if (data.handRank > stats.bestHandRank) {
      stats.bestHandRank = data.handRank;
      stats.bestHand = data.handName;
    }

    if (data.allIn) stats.allIns++;
  }

  getLeaderboard(sortBy = 'totalWon', limit = 20) {
    const userBoard = this.userStore.getLeaderboard(sortBy, limit);
    if (userBoard.length > 0) return userBoard;

    const list = [...this.stats.values()];
    list.sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
    return list.slice(0, limit).map((stats, index) => ({
      rank: index + 1,
      name: stats.name,
      handsPlayed: stats.handsPlayed,
      handsWon: stats.handsWon,
      winRate: stats.handsPlayed > 0 ? Math.round(stats.handsWon / stats.handsPlayed * 100) : 0,
      totalWon: stats.totalWon,
      biggestPot: stats.biggestPot,
      bestHand: stats.bestHand || '-',
      allIns: stats.allIns,
      achievementCount: 0,
    }));
  }
}

module.exports = { StatsTracker };
