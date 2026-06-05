/**
 * Room Message Handlers — room creation, joining, spectating, leaving
 */

function register(ws, ctx) {
  const { registry, wsManager, wireStatsReporting, playerSockets } = ctx;

  ws._on('room:list', () => {
    if (!ws._currentUser) {
      ws.send(JSON.stringify({ type: 'room:list', data: { rooms: [] } }));
      return;
    }
    ws.send(JSON.stringify({ type: 'room:list', data: { rooms: registry.getRoomList() } }));
  });

  ws._on('room:create', (data) => {
    if (!ws._requireLogin()) return;

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
    if (!ws._requireLogin()) return;

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
    if (!ws._requireLogin()) return;

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
    if (ws._playerId && ws._currentRoom) {
      wsManager.clearPendingDisconnect(ws._playerId);
      registry.leaveRoom(ws._playerId);
      ws._currentRoom = null;
      ws.isSpectator = false;
      ws.send(JSON.stringify({ type: 'room:left', data: {} }));
    }
  });

  ws._on('room:start', () => {
    if (!ws._currentRoom) return;
    ws._currentRoom.startGame(ws._playerId);
  });

  ws._on('room:ready', (data) => {
    if (!ws._currentRoom) return;
    ws._currentRoom.setReady(ws._playerId, !!data.ready);
  });

  ws._on('room:interact', (data) => {
    if (!ws._currentRoom) return;
    const room = ws._currentRoom;
    const inRoom = room.players.has(data.targetId) || room.spectators.has(data.targetId);
    if (!inRoom) return;
    const targetWs = playerSockets.get(data.targetId);
    if (targetWs && targetWs.readyState === 1) {
      targetWs.send(JSON.stringify({
        type: 'room:interact',
        data: { fromId: ws._playerId, gift: data.gift },
      }));
    }
    ws.send(JSON.stringify({
      type: 'room:interact',
      data: { fromId: ws._playerId, toId: data.targetId, gift: data.gift, self: true },
    }));
  });
}

module.exports = { register };
