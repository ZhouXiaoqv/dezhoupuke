/**
 * Texas Hold'em Online - WebSocket Server
 */

const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { RoomRegistry } = require('./room');
const { evaluateHand: evaluateForStats } = require('./game');
const { UserStore, ACHIEVEMENTS } = require('./userStore');

const PORT = process.env.PORT || 3000;
const STATIC_DIR = path.join(__dirname, '..', 'public');

const userStore = new UserStore();

class StatsTracker {
  constructor() {
    this.stats = new Map();
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
    const userBoard = userStore.getLeaderboard(sortBy, limit);
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

const stats = new StatsTracker();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const httpServer = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';

  const filePath = path.join(STATIC_DIR, url);
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server: httpServer });
const registry = new RoomRegistry();
const playerSockets = new Map();
const pendingDisconnects = new Map();
const DISCONNECT_GRACE_MS = 15 * 60 * 1000;

setInterval(() => registry.cleanup(), 60000);

function wireStatsReporting(room) {
  room.onStatsReport = (game) => {
    for (const gp of game.players) {
      const won = game.winners.some((winner) => winner.id === gp.id);
      const winData = game.winners.find((winner) => winner.id === gp.id);
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
        handRank,
        handName,
        allIn: gp.lastAction === 'allin' || gp.allIn,
        stackBefore: gp.stack - (won ? (winData?.amount || 0) : 0),
      };

      stats.record(gp.name, recordData);

      if (gp._username) {
        const result = userStore.recordGame(gp._username, recordData);
        if (result.newAchievements && result.newAchievements.length > 0) {
          const playerWs = playerSockets.get(gp.id);
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

function clearPendingDisconnect(playerId) {
  const pending = pendingDisconnects.get(playerId);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingDisconnects.delete(playerId);
}

function schedulePendingDisconnect(playerId, room, isSpectator, closingWs) {
  if (!playerId || !room || pendingDisconnects.has(playerId)) return;
  const timer = setTimeout(() => {
    pendingDisconnects.delete(playerId);
    if (playerSockets.get(playerId) && playerSockets.get(playerId) !== closingWs) {
      return;
    }
    if (isSpectator) {
      room.removeSpectator(playerId);
      return;
    }
    room.disconnectPlayer(playerId);
  }, DISCONNECT_GRACE_MS);

  pendingDisconnects.set(playerId, {
    timer,
    roomCode: room.code,
    isSpectator: !!isSpectator,
    createdAt: Date.now(),
  });
}

wss.on('connection', (ws) => {
  let playerId = null;
  let currentRoom = null;
  let currentUser = null;
  ws.lastPongAt = Date.now();
  ws.lastPingAt = 0;

  function requireLogin() {
    if (currentUser) return true;
    ws.send(JSON.stringify({ type: 'user:error', data: { message: '请先登录' } }));
    return false;
  }

  function bindIdentity(nextPlayerId, nextPlayerName) {
    playerId = nextPlayerId;
    clearPendingDisconnect(nextPlayerId);
    ws.playerId = nextPlayerId;
    ws.playerName = nextPlayerName;
    playerSockets.set(nextPlayerId, ws);
  }

  function buildResume(room, isSpectator) {
    if (!room) return null;
    return {
      code: room.code,
      isSpectator: !!isSpectator,
      gameRunning: !!room.gameRunning,
    };
  }

  function finalizeAuthenticatedSession(result, token, responseType) {
    currentUser = { username: result.username, token };
    ws._username = result.username;
    ws._playerAvatar = result.profile.avatar || 'A';
    ws._playerColor = result.profile.avatarColor || null;

    const restored = registry.restoreUserSession(result.username, ws);
    let resume = null;

    if (restored) {
      bindIdentity(restored.playerId, restored.name || result.username);
      currentRoom = restored.room;
      ws.isSpectator = !!restored.isSpectator;
      resume = buildResume(restored.room, restored.isSpectator);
    } else {
      bindIdentity(playerId || crypto.randomUUID(), result.username);
      ws.isSpectator = false;
    }

    ws.send(JSON.stringify({
      type: responseType,
      data: {
        token,
        username: result.username,
        profile: result.profile,
        playerId,
        resume,
      },
    }));
  }

  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
    ws.lastPongAt = Date.now();
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', data: { message: '无效的消息格式' } }));
      return;
    }

    const { type, data = {} } = msg;

    switch (type) {
      case 'auth': {
        ws.send(JSON.stringify({ type: 'error', data: { message: '请先登录账号' } }));
        break;
      }

      case 'user:register': {
        const result = userStore.register(data.username, data.password);
        if (result.error) {
          ws.send(JSON.stringify({ type: 'user:error', data: { message: result.error } }));
          break;
        }
        finalizeAuthenticatedSession(result, result.token, 'user:registered');
        break;
      }

      case 'user:login': {
        const result = userStore.login(data.username, data.password);
        if (result.error) {
          ws.send(JSON.stringify({ type: 'user:error', data: { message: result.error } }));
          break;
        }
        finalizeAuthenticatedSession(result, result.token, 'user:loggedIn');
        break;
      }

      case 'user:tokenLogin': {
        const result = userStore.validateToken(data.token);
        if (!result) {
          ws.send(JSON.stringify({
            type: 'user:error',
            data: { code: 'TOKEN_EXPIRED', message: '登录已过期，请重新登录' },
          }));
          break;
        }
        finalizeAuthenticatedSession(result, data.token, 'user:loggedIn');
        break;
      }

      case 'user:profile': {
        if (!requireLogin()) break;
        const profile = userStore.getProfile(currentUser.username);
        if (profile) {
          ws.send(JSON.stringify({ type: 'user:profile', data: { profile } }));
        }
        break;
      }

      case 'user:achievements': {
        ws.send(JSON.stringify({ type: 'user:achievementsList', data: { achievements: ACHIEVEMENTS } }));
        break;
      }

      case 'user:setAvatar': {
        if (!requireLogin()) break;
        const result = userStore.updateAvatar(currentUser.username, data.avatar, data.color);
        if (result) {
          ws._playerAvatar = result.avatar;
          ws._playerColor = result.avatarColor;
          ws.send(JSON.stringify({ type: 'user:avatarUpdated', data: result }));
        }
        break;
      }

      case 'room:list': {
        if (!currentUser) {
          ws.send(JSON.stringify({ type: 'room:list', data: { rooms: [] } }));
          break;
        }
        ws.send(JSON.stringify({ type: 'room:list', data: { rooms: registry.getRoomList() } }));
        break;
      }

      case 'room:create': {
        if (!requireLogin()) break;

        if (currentRoom) registry.leaveRoom(playerId);

        const options = data.options || {};
        if (data.gameMode === 'turbo') {
          options.sb = 20;
          options.bb = 40;
          options.startStack = 1500;
        } else if (data.gameMode === 'shortdeck') {
          options.sb = 10;
          options.bb = 20;
          options.startStack = 2000;
          options.shortDeck = true;
        } else if (data.gameMode === 'highroller') {
          options.sb = 50;
          options.bb = 100;
          options.startStack = 10000;
        } else if (data.gameMode === 'allinfold') {
          options.sb = 10;
          options.bb = 20;
          options.startStack = 2000;
          options.allInOrFold = true;
        }

        const room = registry.createRoom(playerId, currentUser.username, ws, options);
        currentRoom = room;
        ws.isSpectator = false;

        const roomPlayer = room.players.get(playerId);
        if (roomPlayer) roomPlayer._username = currentUser.username;

        wireStatsReporting(room);
        ws.send(JSON.stringify({
          type: 'room:created',
          data: { code: room.code, gameMode: data.gameMode || 'classic' },
        }));
        room.broadcastPlayerList();
        break;
      }

      case 'room:join': {
        if (!requireLogin()) break;

        const code = (data.code || '').toUpperCase().trim();
        if (!code) {
          ws.send(JSON.stringify({ type: 'room:error', data: { message: '请输入房间号' } }));
          break;
        }

        if (currentRoom) registry.leaveRoom(playerId);

        const result = registry.joinRoom(code, playerId, currentUser.username, ws);
        if (result.error) {
          ws.send(JSON.stringify({ type: 'room:error', data: { message: result.error } }));
          break;
        }

        currentRoom = result.room;
        ws.isSpectator = false;
        const roomPlayer = currentRoom.players.get(playerId);
        if (roomPlayer) roomPlayer._username = currentUser.username;
        ws.send(JSON.stringify({ type: 'room:joined', data: { code } }));
        break;
      }

      case 'room:spectate': {
        if (!requireLogin()) break;

        const code = (data.code || '').toUpperCase().trim();
        if (!code) {
          ws.send(JSON.stringify({ type: 'room:error', data: { message: '请输入房间号' } }));
          break;
        }

        if (currentRoom) registry.leaveRoom(playerId);

        const result = registry.spectateRoom(code, playerId, currentUser.username, ws);
        if (result.error) {
          ws.send(JSON.stringify({ type: 'room:error', data: { message: result.error } }));
          break;
        }

        currentRoom = result.room;
        ws.isSpectator = true;
        const spectator = currentRoom.spectators.get(playerId);
        if (spectator) spectator._username = currentUser.username;
        ws.send(JSON.stringify({ type: 'room:joined', data: { code, isSpectator: true } }));
        break;
      }

      case 'stats:get': {
        const sortBy = data.sortBy || 'totalWon';
        const limit = data.limit || 20;
        ws.send(JSON.stringify({
          type: 'stats:leaderboard',
          data: { leaderboard: stats.getLeaderboard(sortBy, limit), sortBy },
        }));
        break;
      }

      case 'room:leave': {
        if (playerId && currentRoom) {
          clearPendingDisconnect(playerId);
          registry.leaveRoom(playerId);
          currentRoom = null;
          ws.isSpectator = false;
          ws.send(JSON.stringify({ type: 'room:left', data: {} }));
        }
        break;
      }

      case 'room:start': {
        if (!currentRoom) break;
        currentRoom.startGame(playerId);
        break;
      }

      case 'game:nextHand': {
        if (!currentRoom || currentRoom.hostId !== playerId) break;
        if (currentRoom.nextHandTimer) {
          clearTimeout(currentRoom.nextHandTimer);
          currentRoom.nextHandTimer = null;
          if (currentRoom.players.size >= 2) currentRoom.startGame(playerId);
        }
        break;
      }

      case 'room:ready': {
        if (!currentRoom) break;
        currentRoom.setReady(playerId, !!data.ready);
        break;
      }

      case 'game:action': {
        if (!currentRoom) break;
        currentRoom.handlePlayerAction(playerId, data);
        break;
      }

      case 'room:interact': {
        if (!currentRoom) break;
        const targetWs = playerSockets.get(data.targetId);
        if (targetWs && targetWs.readyState === 1) {
          targetWs.send(JSON.stringify({
            type: 'room:interact',
            data: { fromId: playerId, gift: data.gift },
          }));
        }
        ws.send(JSON.stringify({
          type: 'room:interact',
          data: { fromId: playerId, toId: data.targetId, gift: data.gift, self: true },
        }));
        break;
      }

      default:
        ws.send(JSON.stringify({ type: 'error', data: { message: `未知消息类型: ${type}` } }));
    }
  });

  ws.on('close', () => {
    if (!playerId) return;
    playerSockets.delete(playerId);
    if (!currentRoom) return;

    if (ws.isSpectator) {
      schedulePendingDisconnect(playerId, currentRoom, true, ws);
    } else if (currentUser) {
      schedulePendingDisconnect(playerId, currentRoom, false, ws);
    } else {
      currentRoom.removePlayer(playerId);
    }
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for ${playerId}:`, err.message);
  });
});

const HEARTBEAT_INTERVAL_MS = 30000;
const HEARTBEAT_TIMEOUT_MS = 10 * 60 * 1000;

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (Date.now() - (ws.lastPongAt || 0) > HEARTBEAT_TIMEOUT_MS) {
      console.log(`Terminating dead connection: ${ws.playerId}`);
      ws.terminate();
      return;
    }

    if (ws.readyState !== 1) return;
    ws.isAlive = false;
    ws.lastPingAt = Date.now();
    ws.ping();
  });
}, HEARTBEAT_INTERVAL_MS);

wss.on('close', () => clearInterval(heartbeatInterval));

httpServer.listen(PORT, () => {
  console.log(`
Server listening on http://localhost:${PORT}
Static files: ${STATIC_DIR}
User data: ${path.join(__dirname, '..', 'data')}
  `);
});

module.exports = { httpServer, wss };
