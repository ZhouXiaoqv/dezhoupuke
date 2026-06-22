/**
 * Room Manager - handles room lifecycle, player assignment, and game orchestration
 */

const { Game, START_STACK } = require('./game');
const crypto = require('crypto');
const logger = require('./logger');

const ROOM_RESUME_TTL = 30 * 60 * 1000;
const MAX_PLAYERS = 8;

class Room {
  constructor(code, hostId, hostName, hostWs, options = {}) {
    this.code = code;
    this.hostId = hostId;
    this.createdAt = Date.now();
    const requestedMaxPlayers = Number(options.maxPlayers) || MAX_PLAYERS;
    this.maxPlayers = Math.min(Math.max(2, requestedMaxPlayers), MAX_PLAYERS);
    this.startStack = options.startStack || START_STACK;
    this.sb = options.sb || 10;
    this.bb = options.bb || 20;
    this.gameMode = options.gameMode || 'classic';
    this.shortDeck = options.shortDeck || false;
    this.allInOrFold = options.allInOrFold || false;
    this.userStore = options.userStore || null;

    this.players = new Map();
    this.spectators = new Map();
    this.game = null;
    this.gameRunning = false;
    this.handNum = 0;
    this.scoreboard = new Map();
    this.handStartStacks = new Map();
    this.handSnapshots = [];
    this.scoreboardImbalanceReports = [];
    this.autoStartTimer = null;
    this.nextHandTimer = null;
    this.lastVacantAt = null;

    this.addPlayer(hostId, hostName, hostWs);
  }

  addPlayer(id, name, ws) {
    if (this.players.size >= this.maxPlayers) return false;
    if (this.players.has(id)) return false;

    this.lastVacantAt = null;
    this.spectators.delete(id);

    this.players.set(id, {
      id,
      name,
      ws,
      stack: this.startStack,
      ready: false,
      connected: true,
      _username: ws._username || null,
      avatar: ws._playerAvatar || 'A',
      avatarColor: ws._playerColor || null,
      cardBack: ws._playerCardBack || 'default-blue',
      pet: ws._playerPet || '',
      publicProfile: this.getPublicProfileForUsername(ws._username),
    });
    if (!this.scoreboard.has(id)) {
      this.scoreboard.set(id, { id, name, score: 0 });
    } else {
      this.scoreboard.get(id).name = name;
    }

    this.broadcast('room:playerJoined', {
      playerId: id,
      name,
      playerCount: this.players.size,
      maxPlayers: this.maxPlayers,
    });

    ws.send(JSON.stringify({
      type: 'room:state',
      data: { code: this.code, hostId: this.hostId, gameRunning: this.gameRunning },
    }));

    logger.info('ROOM', 'player_join', {
      roomCode: this.code,
      playerId: id,
      playerName: name,
      playerCount: this.players.size,
      msg: `${name} 加入房间 ${this.code}`,
    });

    this.broadcastPlayerList();
    this.broadcastScoreboard();
    return true;
  }

  addSpectator(id, name, ws) {
    this.lastVacantAt = null;

    if (this.spectators.has(id)) {
      const spec = this.spectators.get(id);
      if (spec.ws && spec.ws !== ws && spec.ws.readyState === 1) {
        try { spec.ws.close(); } catch {}
      }
      spec.ws = ws;
      spec.name = name;
      spec.connected = true;
      spec._username = ws._username || spec._username || null;
      this.sendSpectatorState(id, ws);
      this.broadcastPlayerList();
      this.broadcastScoreboard();
      return true;
    }

    this.spectators.set(id, {
      id,
      name,
      ws,
      connected: true,
      _username: ws._username || null,
    });

    this.broadcast('room:spectatorJoined', {
      playerId: id,
      name,
      spectatorCount: this.spectators.size,
    });
    this.broadcastPlayerList();
    this.sendSpectatorState(id, ws);
    this.broadcastScoreboard();
    return true;
  }

  removeSpectator(id) {
    const spec = this.spectators.get(id);
    if (!spec) return;
    this.spectators.delete(id);
    this.broadcast('room:spectatorLeft', {
      playerId: id,
      name: spec.name,
      spectatorCount: this.spectators.size,
    });
    this.broadcastPlayerList();
    this._markVacantIfNeeded();
  }

  sendSpectatorState(id, ws) {
    ws.send(JSON.stringify({
      type: 'room:state',
      data: { code: this.code, hostId: this.hostId, gameRunning: this.gameRunning, isSpectator: true },
    }));

    const players = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      stack: p.stack,
      ready: p.ready,
      connected: p.connected,
      avatar: p.avatar || 'A',
      avatarColor: p.avatarColor || null,
      cardBack: p.cardBack || 'default-blue',
      pet: p.pet || p.publicProfile?.pet || '',
      publicProfile: p.publicProfile || this.getPublicProfileForUsername(p._username),
    }));
    const spectators = [...this.spectators.values()].map((s) => ({ id: s.id, name: s.name }));
    ws.send(JSON.stringify({ type: 'room:players', data: { players, spectators, hostId: this.hostId } }));

    if (this.game && this.gameRunning) {
      const state = this.game.getStateForSpectator();
      ws.send(JSON.stringify({ type: 'game:state', data: state }));
    }
  }

  disconnectPlayer(id) {
    const player = this.players.get(id);
    if (!player) return false;

    player.connected = false;

    if (this.game && this.gameRunning) {
      this.game.handleDisconnect(id);
    }

    logger.warn('ROOM', 'player_disconnect', {
      roomCode: this.code,
      playerId: id,
      playerName: player.name,
      gameRunning: !!this.gameRunning,
      msg: `${player.name} 断线，等待重连（15分钟）[房间 ${this.code}]`,
    });

    this.broadcast('room:playerDisconnected', {
      playerId: id,
      name: player.name,
      playerCount: this.players.size,
    });
    this.broadcastPlayerList();
    this._markVacantIfNeeded();
    return true;
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) return false;

    this.players.delete(id);

    if (this.game && this.gameRunning) {
      this.game.handleDisconnect(id);
    }

    logger.info('ROOM', 'player_leave', {
      roomCode: this.code,
      playerId: id,
      playerName: player.name,
      msg: `${player.name} 离开房间 ${this.code}`,
    });

    this.broadcast('room:playerLeft', {
      playerId: id,
      name: player.name,
      playerCount: this.players.size,
    });

    if (this.hostId === id && this.players.size > 0) {
      const first = this.players.values().next().value;
      this.hostId = first.id;
      this.broadcast('room:hostChanged', { hostId: this.hostId });
      if (first.ws && first.ws.readyState === 1) {
        first.ws.send(JSON.stringify({
          type: 'room:state',
          data: { code: this.code, hostId: this.hostId, gameRunning: this.gameRunning },
        }));
      }
    }

    this.broadcastPlayerList();
    this._markVacantIfNeeded();
    return true;
  }

  handleReconnect(id, ws) {
    const player = this.players.get(id);
    if (!player) return false;

    if (player.ws && player.ws !== ws && player.ws.readyState === 1) {
      try { player.ws.close(); } catch {}
    }

    player.ws = ws;
    player.connected = true;
    player.name = ws.playerName || player.name;
    player._username = ws._username || player._username || null;
    player.avatar = ws._playerAvatar || player.avatar;
    player.avatarColor = ws._playerColor || player.avatarColor || null;
    player.cardBack = ws._playerCardBack || player.cardBack || 'default-blue';
    player.pet = ws._playerPet || player.pet || '';
    player.publicProfile = this.getPublicProfileForUsername(player._username);
    this.lastVacantAt = null;

    logger.info('ROOM', 'player_reconnect', {
      roomCode: this.code,
      playerId: id,
      playerName: player.name,
      gameRunning: !!this.gameRunning,
      msg: `${player.name} 重连成功 [房间 ${this.code}]`,
    });

    ws.send(JSON.stringify({
      type: 'room:state',
      data: { code: this.code, hostId: this.hostId, gameRunning: this.gameRunning },
    }));
    this.broadcastPlayerList();
    this.broadcastScoreboard();

    if (this.game && this.gameRunning) {
      this.game.handleReconnect(id, ws);
    }

    return true;
  }

  restoreUserSession(username, ws) {
    if (!username) return null;

    for (const player of this.players.values()) {
      if (player._username === username) {
        this.handleReconnect(player.id, ws);
        return {
          room: this,
          playerId: player.id,
          name: player.name,
          isSpectator: false,
        };
      }
    }

    for (const spectator of this.spectators.values()) {
      if (spectator._username === username) {
        this.addSpectator(spectator.id, spectator.name, ws);
        return {
          room: this,
          playerId: spectator.id,
          name: spectator.name,
          isSpectator: true,
        };
      }
    }

    return null;
  }

  setReady(id, ready) {
    const player = this.players.get(id);
    if (!player || this.gameRunning) return;
    player.ready = ready;
    this.broadcastPlayerList();
  }

  startGame(starterId) {
    if (this.gameRunning) return;
    if (starterId !== this.hostId) return;

    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.filter((p) => p.stack > 0).length < 2) {
      this.sendTo(starterId, 'room:error', { message: '至少需要 2 名玩家' });
      return;
    }

    this.checkScoreboardBalanceBeforeHand();

    this.gameRunning = true;

    const gamePlayers = connected.map((p) => ({
      id: p.id,
      name: p.name,
      stack: p.stack,
      connected: true,
      _username: p._username || null,
      avatar: p.avatar || 'A',
      avatarColor: p.avatarColor || null,
      cardBack: p.cardBack || 'default-blue',
      pet: p.pet || p.publicProfile?.pet || '',
      publicProfile: p.publicProfile || this.getPublicProfileForUsername(p._username),
    }));

    this.game = new Game(gamePlayers, {
      sb: this.sb,
      bb: this.bb,
      startStack: this.startStack,
      shortDeck: this.shortDeck,
      allInOrFold: this.allInOrFold,
      gameMode: this.gameMode,
    });
    const game = this.game;
    game.roomCode = this.code;        // inject roomCode for gameLogger
    this.game.handNum = this.handNum;

    logger.info('ROOM', 'game_start', {
      roomCode: this.code,
      playerCount: gamePlayers.length,
      players: gamePlayers.map((p) => p.name),
      config: { sb: this.sb, bb: this.bb, startStack: this.startStack, mode: this.gameMode },
      msg: `游戏开始 [房间 ${this.code}]，${gamePlayers.length}人参与`,
    });

    game.onBroadcast = (type, data) => {
      if (type === 'game:state') return;
      this.broadcast(type, data);
    };

    game.broadcastState = () => {
      for (const p of game.players) {
        if (p._ws && p.connected && p._ws.readyState === 1) {
          const state = game.getStateForPlayer(p.id);
          p._ws.send(JSON.stringify({ type: 'game:state', data: state }));
        }
      }

      if (this.spectators.size > 0) {
        const specState = game.getStateForSpectator();
        const msg = JSON.stringify({ type: 'game:state', data: specState });
        for (const spectator of this.spectators.values()) {
          if (spectator.ws && spectator.ws.readyState === 1) spectator.ws.send(msg);
        }
      }

      if (this.game === game && this.isCurrentHandSettled(game)) this.broadcastScoreboard();
    };

    game.onGameEnd = () => {
      if (!this.gameRunning || this.game !== game) return;
      if (game.winners.length > 0 && this.onStatsReport) {
        this.onStatsReport(game);
      }

      this.settleFinishedHand();

      this.broadcast('game:waitingForNext', { nextHandDelay: 15 });
      this.nextHandTimer = setTimeout(() => {
        if (this.canStartHand()) this.startGame(this.hostId);
      }, 15000);
    };

    for (const gp of game.players) {
      const rp = this.players.get(gp.id);
      if (rp) gp._ws = rp.ws;
    }
    this.handStartStacks = new Map(game.players.map((p) => [p.id, p.stack]));

    this.broadcast('room:gameStarted', {});
    this.broadcastScoreboard();
    game.startHand();
  }

  settleFinishedHand() {
    if (!this.game || !this.gameRunning) return;
    let stacksRefilled = false;
    const playerSnapshots = [];
    for (const gp of this.game.players) {
      const rp = this.players.get(gp.id);
      const startStack = this.handStartStacks.get(gp.id) ?? this.startStack;
      const delta = gp.stack - startStack;
      const finalStack = gp.stack;
      if (!this.scoreboard.has(gp.id)) {
        this.scoreboard.set(gp.id, { id: gp.id, name: gp.name, score: 0 });
      }
      const score = this.scoreboard.get(gp.id);
      score.name = gp.name;
      score.score += delta;
      playerSnapshots.push({
        id: gp.id,
        name: gp.name,
        startStack,
        finalStack,
        delta,
        refilled: finalStack <= 0,
        nextStack: finalStack <= 0 ? this.startStack : finalStack,
      });
      if (rp) {
        const refill = gp.stack <= 0;
        const nextStack = refill ? this.startStack : gp.stack;
        rp.stack = nextStack;
        gp.stack = nextStack;
        if (refill) {
          gp.folded = false;
          gp.allIn = false;
          gp.bet = 0;
        }
        stacksRefilled = stacksRefilled || refill;
      }
    }
    this.handNum = this.game.handNum;
    this.gameRunning = false;
    this.recordHandSnapshot(playerSnapshots);
    this.broadcastScoreboard();
    if (this.game.broadcastState) this.game.broadcastState();
    if (stacksRefilled) this.broadcastPlayerList();
  }

  recordHandSnapshot(players) {
    const snapshot = {
      roomCode: this.code,
      handNum: this.game?.handNum ?? this.handNum,
      recordedAt: Date.now(),
      players: players.map((player) => ({ ...player })),
      scoreboard: this.getScoreboard().map((score) => ({ ...score })),
    };
    this.handSnapshots.push(snapshot);
    if (this.handSnapshots.length > 8) {
      this.handSnapshots.splice(0, this.handSnapshots.length - 8);
    }
  }

  getLastHandSnapshotsForReport() {
    const snapshots = this.handSnapshots
      .slice(-2)
      .map((snapshot) => ({
        ...snapshot,
        players: snapshot.players.map((player) => ({ ...player })),
        scoreboard: snapshot.scoreboard.map((score) => ({ ...score })),
      }));
    while (snapshots.length < 2) {
      snapshots.unshift({ missing: true, label: '没有' });
    }
    return snapshots;
  }

  checkScoreboardBalanceBeforeHand() {
    const scores = this.getScoreboard().map((score) => ({ ...score }));
    const total = scores.reduce((sum, score) => sum + Number(score.score || 0), 0);
    if (total === 0) return null;

    const report = {
      id: crypto.randomUUID(),
      roomCode: this.code,
      hostId: this.hostId,
      hostName: this.players.get(this.hostId)?.name || '',
      nextHandNum: this.handNum + 1,
      total,
      createdAt: Date.now(),
      players: [...this.players.values()].map((player) => ({
        id: player.id,
        name: player.name,
        stack: player.stack,
        connected: !!player.connected,
      })),
      scoreboard: scores,
      handSnapshots: this.getLastHandSnapshotsForReport(),
    };

    this.scoreboardImbalanceReports.push(report);
    if (this.scoreboardImbalanceReports.length > 20) {
      this.scoreboardImbalanceReports.splice(0, this.scoreboardImbalanceReports.length - 20);
    }
    if (this._registry && typeof this._registry.recordScoreboardImbalance === 'function') {
      this._registry.recordScoreboardImbalance(report);
    }

    logger.error('ROOM', 'scoreboard_imbalance', {
      reportId: report.id,
      roomCode: report.roomCode,
      nextHandNum: report.nextHandNum,
      total,
      players: report.players,
      scoreboard: scores,
      msg: `计分板失衡：房间 ${report.roomCode} 第 ${report.nextHandNum} 手开始前，所有玩家盈亏总和为 ${total}（应为 0）`,
    });

    this.broadcast('room:scoreboardImbalance', {
      reportId: report.id,
      roomCode: report.roomCode,
      nextHandNum: report.nextHandNum,
      total: report.total,
      message: `计分板异常：正负分总和为 ${report.total}，已记录到后台。`,
    });
    return report;
  }

  handlePlayerAction(playerId, actionData) {
    if (!this.game || !this.gameRunning) return;
    if (this.spectators.has(playerId)) return;
    this.game.handleAction(playerId, actionData);
  }

  handleShowHandChoice(playerId, show) {
    if (!this.game || !this.gameRunning) return;
    if (this.spectators.has(playerId)) return;
    this.game.handleShowHandChoice(playerId, !!show);
  }

  sendTo(playerId, type, data) {
    const player = this.players.get(playerId);
    if (player && player.ws && player.ws.readyState === 1) {
      player.ws.send(JSON.stringify({ type, data }));
    }
  }

  updatePlayerCardBack(playerId, cardBack) {
    const nextCardBack = cardBack || 'default-blue';
    const player = this.players.get(playerId);
    if (player) player.cardBack = nextCardBack;

    if (this.game && this.game.players) {
      const gp = this.game.players.find((p) => p.id === playerId);
      if (gp) gp.cardBack = nextCardBack;
      if (this.gameRunning && this.game.broadcastState) {
        this.game.broadcastState();
      }
    }

    this.broadcastPlayerList();
  }

  updatePlayerPublicProfile(playerId, publicProfile, options = {}) {
    const player = this.players.get(playerId);
    if (player && publicProfile) {
      player.publicProfile = publicProfile;
      player.avatar = publicProfile.avatar || player.avatar;
      player.avatarColor = publicProfile.avatarColor || player.avatarColor || null;
      player.pet = publicProfile.pet || '';
    }

    if (this.game && this.game.players) {
      const gp = this.game.players.find((p) => p.id === playerId);
      if (gp && publicProfile) {
        gp.publicProfile = publicProfile;
        gp.avatar = publicProfile.avatar || gp.avatar;
        gp.avatarColor = publicProfile.avatarColor || gp.avatarColor || null;
        gp.pet = publicProfile.pet || '';
      }
      if (!options.silent && this.gameRunning && this.game.broadcastState) {
        this.game.broadcastState();
      }
    }

    if (!options.silent) this.broadcastPlayerList();
  }

  broadcast(type, data = {}) {
    const msg = JSON.stringify({ type, data });
    for (const player of this.players.values()) {
      if (player.ws && player.ws.readyState === 1) player.ws.send(msg);
    }
    for (const spectator of this.spectators.values()) {
      if (spectator.ws && spectator.ws.readyState === 1) spectator.ws.send(msg);
    }
  }

  broadcastPlayerList() {
    const players = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      stack: p.stack,
      ready: p.ready,
      connected: p.connected,
      avatar: p.avatar || 'A',
      avatarColor: p.avatarColor || null,
      cardBack: p.cardBack || 'default-blue',
      pet: p.pet || p.publicProfile?.pet || '',
      publicProfile: p.publicProfile || this.getPublicProfileForUsername(p._username),
    }));
    const spectators = [...this.spectators.values()].map((s) => ({
      id: s.id,
      name: s.name,
    }));
    this.broadcast('room:players', { players, spectators, hostId: this.hostId });
  }

  canStartHand() {
    return [...this.players.values()].filter((p) => p.connected && p.stack > 0).length >= 2;
  }

  getScoreboard() {
    const scores = new Map([...this.scoreboard.entries()].map(([id, score]) => [id, { ...score }]));

    if (this.game && this.gameRunning && this.isCurrentHandSettled()) {
      for (const gp of this.game.players) {
        const startStack = this.handStartStacks.get(gp.id);
        if (typeof startStack !== 'number') continue;
        if (!scores.has(gp.id)) {
          scores.set(gp.id, { id: gp.id, name: gp.name, score: 0 });
        }
        const score = scores.get(gp.id);
        score.name = gp.name;
        score.score += gp.stack - startStack;
      }
    }

    return [...scores.values()]
      .map((s) => ({ ...s }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  isCurrentHandSettled(game = this.game) {
    if (!game) return false;
    return (game.winners && game.winners.length > 0) ||
      (game.refunds && game.refunds.length > 0);
  }

  broadcastScoreboard() {
    this.broadcast('room:scoreboard', { scores: this.getScoreboard() });
  }

  getPublicProfileForUsername(username) {
    if (!this.userStore || !username) return null;
    return this.userStore.getPublicProfile(username);
  }

  _markVacantIfNeeded() {
    const hasConnectedPlayers = [...this.players.values()].some((p) => p.connected);
    const hasConnectedSpectators = [...this.spectators.values()].some((s) => s.connected);
    if (hasConnectedPlayers || hasConnectedSpectators) {
      this.lastVacantAt = null;
      return;
    }
    if (!this.lastVacantAt) this.lastVacantAt = Date.now();
  }

  destroy() {
    if (this.autoStartTimer) clearTimeout(this.autoStartTimer);
    if (this.nextHandTimer) clearTimeout(this.nextHandTimer);
    if (this.game && this.game.actionTimeout) clearTimeout(this.game.actionTimeout);
    if (this.game && this.game.showHandTimeout) clearTimeout(this.game.showHandTimeout);
    this.broadcast('room:destroyed', {});
    this.players.clear();
    this.spectators.clear();
    this.game = null;
    if (this._registry) {
      this._registry.rooms.delete(this.code);
    }
  }
}

class RoomRegistry {
  constructor(userStore = null) {
    this.rooms = new Map();
    this.playerRoom = new Map();
    this.userStore = userStore;
    this.scoreboardImbalanceReports = [];
  }

  generateCode() {
    let code;
    do {
      code = crypto.randomBytes(3).toString('hex').toUpperCase();
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(hostId, hostName, hostWs, options = {}) {
    const code = this.generateCode();
    const room = new Room(code, hostId, hostName, hostWs, {
      ...options,
      userStore: this.userStore,
    });
    room._registry = this;
    this.rooms.set(code, room);
    this.playerRoom.set(hostId, code);
    return room;
  }

  joinRoom(code, playerId, playerName, ws) {
    const room = this.rooms.get(code);
    if (!room) return { error: '房间不存在' };

    if (room.players.has(playerId)) {
      room.handleReconnect(playerId, ws);
      this.playerRoom.set(playerId, code);
      return { room };
    }

    if (room.players.size >= room.maxPlayers) return { error: '房间已满' };

    const ok = room.addPlayer(playerId, playerName, ws);
    if (!ok) return { error: '无法加入房间' };
    this.playerRoom.set(playerId, code);
    return { room };
  }

  spectateRoom(code, playerId, playerName, ws) {
    const room = this.rooms.get(code);
    if (!room) return { error: '房间不存在' };

    if (room.spectators.has(playerId)) {
      room.addSpectator(playerId, playerName, ws);
      this.playerRoom.set(playerId, code);
      return { room };
    }

    const ok = room.addSpectator(playerId, playerName, ws);
    if (!ok) return { error: '无法观战' };
    this.playerRoom.set(playerId, code);
    return { room };
  }

  restoreUserSession(username, ws) {
    for (const room of this.rooms.values()) {
      const restored = room.restoreUserSession(username, ws);
      if (restored) {
        this.playerRoom.set(restored.playerId, room.code);
        return restored;
      }
    }
    return null;
  }

  leaveRoom(playerId) {
    const code = this.playerRoom.get(playerId);
    if (!code) return;
    const room = this.rooms.get(code);
    if (room) {
      if (room.spectators.has(playerId)) {
        room.removeSpectator(playerId);
      } else {
        room.removePlayer(playerId);
      }
      if (room.players.size === 0 && room.spectators.size === 0) {
        room.destroy();
      }
    }
    this.playerRoom.delete(playerId);
  }

  getRoomForPlayer(playerId) {
    const code = this.playerRoom.get(playerId);
    return code ? this.rooms.get(code) : null;
  }

  getRoomList() {
    return [...this.rooms.values()].map((room) => ({
      code: room.code,
      playerCount: room.players.size,
      spectatorCount: room.spectators.size,
      maxPlayers: room.maxPlayers,
      gameRunning: room.gameRunning,
      hostName: room.players.get(room.hostId)?.name || 'Unknown',
      gameMode: room.gameMode || 'classic',
    }));
  }

  recordScoreboardImbalance(report) {
    this.scoreboardImbalanceReports.push({
      ...report,
      players: report.players.map((player) => ({ ...player })),
      scoreboard: report.scoreboard.map((score) => ({ ...score })),
      handSnapshots: report.handSnapshots.map((snapshot) => ({
        ...snapshot,
        players: snapshot.players ? snapshot.players.map((player) => ({ ...player })) : [],
        scoreboard: snapshot.scoreboard ? snapshot.scoreboard.map((score) => ({ ...score })) : [],
      })),
    });
    if (this.scoreboardImbalanceReports.length > 50) {
      this.scoreboardImbalanceReports.splice(0, this.scoreboardImbalanceReports.length - 50);
    }
  }

  getScoreboardDiagnostics() {
    return this.scoreboardImbalanceReports
      .slice()
      .reverse()
      .map((report) => ({
        ...report,
        players: report.players.map((player) => ({ ...player })),
        scoreboard: report.scoreboard.map((score) => ({ ...score })),
        handSnapshots: report.handSnapshots.map((snapshot) => ({
          ...snapshot,
          players: snapshot.players ? snapshot.players.map((player) => ({ ...player })) : [],
          scoreboard: snapshot.scoreboard ? snapshot.scoreboard.map((score) => ({ ...score })) : [],
        })),
      }));
  }

  cleanup() {
    for (const [code, room] of this.rooms) {
      const hasConnectedPlayers = [...room.players.values()].some((p) => p.connected);
      const hasConnectedSpectators = [...room.spectators.values()].some((s) => s.connected);

      if (hasConnectedPlayers || hasConnectedSpectators) {
        room.lastVacantAt = null;
        continue;
      }

      if (!room.lastVacantAt) {
        room.lastVacantAt = Date.now();
        continue;
      }

      if (Date.now() - room.lastVacantAt >= ROOM_RESUME_TTL) {
        room.destroy();
        this.rooms.delete(code);
      }
    }
  }
}

module.exports = { Room, RoomRegistry, ROOM_RESUME_TTL, MAX_PLAYERS };
