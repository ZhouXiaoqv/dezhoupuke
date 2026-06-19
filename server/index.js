/**
 * Texas Hold'em Online — Server Entry Point
 * Wires together HTTP serving, WebSocket management, and message handlers
 */

const path = require('path');
const { httpServer } = require('./http');
const { WebSocketManager } = require('./ws');
const { RoomRegistry } = require('./room');
const { UserStore } = require('./userStore');
const { StatsTracker } = require('./stats');
const { evaluateHand: evaluateForStats } = require('./game');

const authHandler = require('./handlers/auth');
const roomHandler = require('./handlers/room');
const gameHandler = require('./handlers/game');
const miscHandler = require('./handlers/misc');

const PORT = process.env.PORT || 3000;

// === Shared state ===
const userStore = new UserStore();
const stats = new StatsTracker(userStore);
const registry = new RoomRegistry(userStore);
const wsManager = new WebSocketManager(httpServer);

setInterval(() => registry.cleanup(), 60000);

// === Stats reporting wiring ===
function wireStatsReporting(room) {
  room.onStatsReport = (game) => {
    for (const gp of game.players) {
      const won = game.winners.some((winner) => winner.id === gp.id);
      const winData = game.winners.find((winner) => winner.id === gp.id);
      const stackBefore = room.handStartStacks.get(gp.id) ?? gp.stack;
      const net = gp.stack - stackBefore;
      let handRank = -1;
      let handName = '';

      if (gp.hand.length === 2 && game.community.length >= 3 && !gp.folded) {
        try {
          const evaluated = evaluateForStats([...gp.hand, ...game.community]);
          handRank = evaluated.rank;
          handName = evaluated.name;
        } catch {}
      }

      const recordData = {
        won,
        amount: won ? (winData?.amount || 0) : 0,
        net,
        handRank,
        handName,
        allIn: gp.lastAction === 'allin' || gp.allIn,
        stackBefore,
      };

      stats.record(gp.name, recordData);

      if (gp._username) {
        const result = userStore.recordGame(gp._username, recordData);
        if (result.profile) {
          const playerWs = wsManager.playerSockets.get(gp.id);
          if (playerWs && playerWs.readyState === 1) {
            playerWs.send(JSON.stringify({
              type: 'user:profileUpdated',
              data: { profile: result.profile },
            }));
          }
          const publicProfile = userStore.getPublicProfile(gp._username);
          if (publicProfile && typeof room.updatePlayerPublicProfile === 'function') {
            room.updatePlayerPublicProfile(gp.id, publicProfile, { silent: true });
          }
        }
        if (result.newAchievements && result.newAchievements.length > 0) {
          const playerWs = wsManager.playerSockets.get(gp.id);
          if (playerWs && playerWs.readyState === 1) {
            for (const ach of result.newAchievements) {
              playerWs.send(JSON.stringify({
                type: 'user:achievement',
                data: { achievement: ach },
              }));
            }
          }
        }
      }
    }
  };
}

// === WebSocket connection handler ===
wsManager.wss.on('connection', (ws) => {
  ws._playerId = null;
  ws._currentRoom = null;
  ws._currentUser = null;
  ws.lastPongAt = Date.now();
  ws.lastPingAt = 0;

  // Message handler registry
  const messageHandlers = {};
  ws._on = (type, handler) => { messageHandlers[type] = handler; };

  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
    ws.lastPongAt = Date.now();
  });

  // Register all message handlers
  const handlerCtx = {
    userStore,
    registry,
    wsManager,
    stats,
    playerSockets: wsManager.playerSockets,
    wireStatsReporting,
  };

  authHandler.register(ws, handlerCtx);
  roomHandler.register(ws, handlerCtx);
  gameHandler.register(ws, handlerCtx);
  miscHandler.register(ws, handlerCtx);

  // Message dispatch
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', data: { message: '无效的消息格式' } }));
      return;
    }

    const { type, data = {} } = msg;
    const handler = messageHandlers[type];
    if (handler) {
      handler(data);
    } else {
      ws.send(JSON.stringify({ type: 'error', data: { message: `未知消息类型: ${type}` } }));
    }
  });

  // Connection close
  ws.on('close', () => {
    if (!ws._playerId) return;
    wsManager.playerSockets.delete(ws._playerId);
    if (!ws._currentRoom) return;

    if (ws.isSpectator) {
      wsManager.schedulePendingDisconnect(ws._playerId, ws._currentRoom, true, ws);
    } else if (ws._currentUser) {
      wsManager.schedulePendingDisconnect(ws._playerId, ws._currentRoom, false, ws);
    } else {
      ws._currentRoom.removePlayer(ws._playerId);
    }
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for ${ws._playerId}:`, err.message);
  });
});

// === Start server ===
wsManager.start();

httpServer.listen(PORT, () => {
  console.log(`
Server listening on http://localhost:${PORT}
Static files: ${path.join(__dirname, '..', 'public')}
User data: ${path.join(__dirname, '..', 'data')}
  `);
});

module.exports = { httpServer, wss: wsManager.wss };
