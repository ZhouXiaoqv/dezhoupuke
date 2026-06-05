/**
 * Misc Message Handlers — stats/leaderboard
 */

function register(ws, ctx) {
  const { stats } = ctx;

  ws._on('stats:get', (data) => {
    const sortBy = data.sortBy || 'totalWon';
    const limit = data.limit || 20;
    ws.send(JSON.stringify({
      type: 'stats:leaderboard',
      data: { leaderboard: stats.getLeaderboard(sortBy, limit), sortBy },
    }));
  });
}

module.exports = { register };
