/**
 * Room Message Handlers — room creation, joining, spectating, leaving
 */

function register(ws, ctx) {
  const { registry, wsManager, wireStatsReporting, userStore } = ctx;

  function requirePlayer() {
    if (!ws._requireLogin()) return false;
    if (!userStore.isPlayer(ws._currentUser.username)) {
      ws.send(JSON.stringify({ type: 'room:error', data: { message: '管理员不能进入房间或查看牌局' } }));
      return false;
    }
    return true;
  }

  ws._on('room:list', () => {
    if (!ws._currentUser) {
      ws.send(JSON.stringify({ type: 'room:list', data: { rooms: [] } }));
      return;
    }
    if (!userStore.isPlayer(ws._currentUser.username)) {
      ws.send(JSON.stringify({ type: 'room:list', data: { rooms: [] } }));
      return;
    }
    ws.send(JSON.stringify({ type: 'room:list', data: { rooms: registry.getRoomList() } }));
  });

  ws._on('room:create', (data) => {
    if (!requirePlayer()) return;

    if (ws._currentRoom) registry.leaveRoom(ws._playerId);

    const options = data.options || {};
    if (data.gameMode === 'turbo') {
      options.sb = 20; options.bb = 40; options.startStack = 1500;
    } else if (data.gameMode === 'shortdeck') {
      options.sb = 10; options.bb = 20; options.startStack = 2000; options.shortDeck = true;
    } else if (data.gameMode === 'highroller') {
      options.sb = 50; options.bb = 100; options.startStack = 10000;
    } else if (data.gameMode === 'allinfold') {
      options.sb = 10; options.bb = 20; options.startStack = 2000; options.allInOrFold = true;
    }

    const room = registry.createRoom(ws._playerId, ws._currentUser.username, ws, options);
    ws._currentRoom = room;
    ws.isSpectator = false;

    const roomPlayer = room.players.get(ws._playerId);
    if (roomPlayer) roomPlayer._username = ws._currentUser.username;

    wireStatsReporting(room);
    ws.send(JSON.stringify({
      type: 'room:created',
      data: { code: room.code, gameMode: data.gameMode || 'classic' },
    }));
    room.broadcastPlayerList();
  });

  ws._on('room:join', (data) => {
    if (!requirePlayer()) return;

    const code = (data.code || '').toUpperCase().trim();
    if (!code) {
      ws.send(JSON.stringify({ type: 'room:error', data: { message: '请输入房间号' } }));
      return;
    }

    if (ws._currentRoom) registry.leaveRoom(ws._playerId);

    const result = registry.joinRoom(code, ws._playerId, ws._currentUser.username, ws);
    if (result.error) {
      ws.send(JSON.stringify({ type: 'room:error', data: { message: result.error } }));
      return;
    }

    ws._currentRoom = result.room;
    ws.isSpectator = false;
    const roomPlayer = ws._currentRoom.players.get(ws._playerId);
    if (roomPlayer) roomPlayer._username = ws._currentUser.username;
    ws.send(JSON.stringify({ type: 'room:joined', data: { code } }));
  });

  ws._on('room:spectate', (data) => {
    if (!requirePlayer()) return;

    const code = (data.code || '').toUpperCase().trim();
    if (!code) {
      ws.send(JSON.stringify({ type: 'room:error', data: { message: '请输入房间号' } }));
      return;
    }

    if (ws._currentRoom) registry.leaveRoom(ws._playerId);

    const result = registry.spectateRoom(code, ws._playerId, ws._currentUser.username, ws);
    if (result.error) {
      ws.send(JSON.stringify({ type: 'room:error', data: { message: result.error } }));
      return;
    }

    ws._currentRoom = result.room;
    ws.isSpectator = true;
    const spectator = ws._currentRoom.spectators.get(ws._playerId);
    if (spectator) spectator._username = ws._currentUser.username;
    ws.send(JSON.stringify({ type: 'room:joined', data: { code, isSpectator: true } }));
  });

  ws._on('room:leave', () => {
    if (ws._currentUser && !userStore.isPlayer(ws._currentUser.username)) return;
    if (ws._playerId && ws._currentRoom) {
      wsManager.clearPendingDisconnect(ws._playerId);
      registry.leaveRoom(ws._playerId);
      ws._currentRoom = null;
      ws.isSpectator = false;
      ws.send(JSON.stringify({ type: 'room:left', data: {} }));
    }
  });

  ws._on('room:start', () => {
    if (!ws._currentUser || !userStore.isPlayer(ws._currentUser.username)) return;
    if (!ws._currentRoom) return;
    ws._currentRoom.startGame(ws._playerId);
  });

  ws._on('room:ready', (data) => {
    if (!ws._currentUser || !userStore.isPlayer(ws._currentUser.username)) return;
    if (!ws._currentRoom) return;
    ws._currentRoom.setReady(ws._playerId, !!data.ready);
  });

  ws._on('room:interact', (data) => {
    if (!requirePlayer()) return;
    if (!ws._currentRoom) return;
    const room = ws._currentRoom;
    const targetId = data && data.targetId;
    const emotionId = data && data.emotionId;
    if (!targetId || targetId === ws._playerId) {
      ws.send(JSON.stringify({ type: 'room:error', data: { message: '不能给自己发表情' } }));
      return;
    }

    const sender = room.players.get(ws._playerId);
    const target = room.players.get(targetId);
    if (!sender || !target || !sender._username || !target._username) {
      ws.send(JSON.stringify({ type: 'room:error', data: { message: '只能给本局玩家发表情' } }));
      return;
    }

    const result = userStore.sendEmotion(sender._username, target._username, emotionId);
    if (result.error) {
      ws.send(JSON.stringify({ type: 'room:error', data: { message: result.error } }));
      return;
    }

    if (typeof room.updatePlayerPublicProfile === 'function') {
      room.updatePlayerPublicProfile(ws._playerId, result.senderPublic, { silent: true });
      room.updatePlayerPublicProfile(targetId, result.targetPublic, { silent: true });
    }

    room.broadcast('room:interact', {
      fromId: ws._playerId,
      toId: targetId,
      emotion: result.emotion,
      usedInventory: result.usedInventory,
      purchased: result.purchased,
      senderPublic: result.senderPublic,
      targetPublic: result.targetPublic,
    });

    ws.send(JSON.stringify({
      type: 'user:profileUpdated',
      data: { profile: result.senderProfile },
    }));
    if (target.ws && target.ws.readyState === 1) {
      target.ws.send(JSON.stringify({
        type: 'user:profileUpdated',
        data: { profile: result.targetProfile },
      }));
    }

    if (typeof room.broadcastPlayerList === 'function') room.broadcastPlayerList();
    if (room.gameRunning && room.game && room.game.broadcastState) room.game.broadcastState();
  });
}

module.exports = { register };
