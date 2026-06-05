/**
 * Auth Message Handlers — user registration, login, token validation, profile
 */

const crypto = require('crypto');
const { ACHIEVEMENTS } = require('../userStore');

function register(ws, ctx) {
  const { userStore, registry, wsManager, playerSockets } = ctx;

  function requireLogin() {
    if (ws._currentUser) return true;
    ws.send(JSON.stringify({ type: 'user:error', data: { message: '请先登录' } }));
    return false;
  }

  function bindIdentity(nextPlayerId, nextPlayerName) {
    ws._playerId = nextPlayerId;
    wsManager.clearPendingDisconnect(nextPlayerId);
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
    ws._currentUser = { username: result.username, token };
    ws._username = result.username;
    ws._playerAvatar = result.profile.avatar || 'A';
    ws._playerColor = result.profile.avatarColor || null;

    const restored = registry.restoreUserSession(result.username, ws);
    let resume = null;

    if (restored) {
      bindIdentity(restored.playerId, restored.name || result.username);
      ws._currentRoom = restored.room;
      ws.isSpectator = !!restored.isSpectator;
      resume = buildResume(restored.room, restored.isSpectator);
    } else {
      bindIdentity(ws._playerId || crypto.randomUUID(), result.username);
      ws.isSpectator = false;
    }

    ws.send(JSON.stringify({
      type: responseType,
      data: {
        token,
        username: result.username,
        profile: result.profile,
        playerId: ws._playerId,
        resume,
      },
    }));
  }

  // Expose helpers for other handlers
  ws._requireLogin = requireLogin;
  ws._bindIdentity = bindIdentity;
  ws._finalizeSession = finalizeAuthenticatedSession;

  // === Auth message handlers ===

  ws._on('auth', () => {
    ws.send(JSON.stringify({ type: 'error', data: { message: '请先登录账号' } }));
  });

  ws._on('user:register', (data) => {
    const result = userStore.register(data.username, data.password);
    if (result.error) {
      ws.send(JSON.stringify({ type: 'user:error', data: { message: result.error } }));
      return;
    }
    finalizeAuthenticatedSession(result, result.token, 'user:registered');
  });

  ws._on('user:login', (data) => {
    const result = userStore.login(data.username, data.password);
    if (result.error) {
      ws.send(JSON.stringify({ type: 'user:error', data: { message: result.error } }));
      return;
    }
    finalizeAuthenticatedSession(result, result.token, 'user:loggedIn');
  });

  ws._on('user:tokenLogin', (data) => {
    const result = userStore.validateToken(data.token);
    if (!result) {
      ws.send(JSON.stringify({
        type: 'user:error',
        data: { code: 'TOKEN_EXPIRED', message: '登录已过期，请重新登录' },
      }));
      return;
    }
    finalizeAuthenticatedSession(result, data.token, 'user:loggedIn');
  });

  ws._on('user:profile', () => {
    if (!requireLogin()) return;
    const profile = userStore.getProfile(ws._currentUser.username);
    if (profile) {
      ws.send(JSON.stringify({ type: 'user:profile', data: { profile } }));
    }
  });

  ws._on('user:achievements', () => {
    ws.send(JSON.stringify({ type: 'user:achievementsList', data: { achievements: ACHIEVEMENTS } }));
  });

  ws._on('user:setAvatar', (data) => {
    if (!requireLogin()) return;
    const result = userStore.updateAvatar(ws._currentUser.username, data.avatar, data.color);
    if (result) {
      ws._playerAvatar = result.avatar;
      ws._playerColor = result.avatarColor;
      ws.send(JSON.stringify({ type: 'user:avatarUpdated', data: result }));
    }
  });
}

module.exports = { register };
