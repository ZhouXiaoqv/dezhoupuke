/**
 * WebSocket Manager — connection lifecycle, heartbeat, disconnect scheduling
 */

const { WebSocketServer } = require('ws');

const HEARTBEAT_INTERVAL_MS = 30000;
const HEARTBEAT_TIMEOUT_MS = 10 * 60 * 1000;
const DISCONNECT_GRACE_MS = 15 * 60 * 1000;

class WebSocketManager {
  constructor(httpServer) {
    this.wss = new WebSocketServer({ server: httpServer });
    this.playerSockets = new Map();
    this.pendingDisconnects = new Map();
    this._heartbeatInterval = null;
  }

  start() {
    this._heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
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

    this.wss.on('close', () => clearInterval(this._heartbeatInterval));
  }

  clearPendingDisconnect(playerId) {
    const pending = this.pendingDisconnects.get(playerId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingDisconnects.delete(playerId);
  }

  schedulePendingDisconnect(playerId, room, isSpectator, closingWs) {
    if (!playerId || !room || this.pendingDisconnects.has(playerId)) return;
    const timer = setTimeout(() => {
      this.pendingDisconnects.delete(playerId);
      if (this.playerSockets.get(playerId) && this.playerSockets.get(playerId) !== closingWs) {
        return;
      }
      if (isSpectator) {
        room.removeSpectator(playerId);
        return;
      }
      room.disconnectPlayer(playerId);
    }, DISCONNECT_GRACE_MS);

    this.pendingDisconnects.set(playerId, {
      timer,
      roomCode: room.code,
      isSpectator: !!isSpectator,
      createdAt: Date.now(),
    });
  }
}

module.exports = { WebSocketManager, DISCONNECT_GRACE_MS };
