// ===== NETWORK LAYER =====
const Net = {
  ws: null,
  playerId: null,
  playerName: "",
  handlers: {},
  connected: false,
  _reconnectTimer: null,
  _reconnectDelay: 1000,
  _reconnectMax: 30000,
  _url: null,

  connect(url) {
    this._url = url;
    this._reconnectDelay = 1000;
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        this.connected = true;
        this._reconnectDelay = 1000;
        resolve();
      };
      this.ws.onclose = () => {
        this.connected = false;
        this.emit("disconnect");
        // 自动重连
        this._scheduleReconnect();
      };
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          this.emit(msg.type, msg.data);
        } catch {}
      };
    });
  },

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    if (!this._url) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (this.connected) return;
      console.log("[Net] Reconnecting...", this._reconnectDelay);
      this.connect(this._url)
        .then(() => {
          // 重连成功后恢复房间状态
          this.emit("reconnected");
        })
        .catch(() => {
          this._reconnectDelay = Math.min(
            this._reconnectDelay * 2,
            this._reconnectMax,
          );
          this._scheduleReconnect();
        });
    }, this._reconnectDelay);
  },

  send(type, data = {}) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  },

  on(type, handler) {
    if (!this.handlers[type]) this.handlers[type] = [];
    this.handlers[type].push(handler);
  },

  off(type, handler) {
    if (!this.handlers[type]) return;
    this.handlers[type] = this.handlers[type].filter(
      (h) => h !== handler,
    );
  },

  once(type, handler) {
    const wrapped = (data) => {
      this.off(type, wrapped);
      handler(data);
    };
    this.on(type, wrapped);
  },

  emit(type, data) {
    (this.handlers[type] || []).forEach((h) => h(data));
  },

  auth(name) {
    return Promise.resolve({
      playerId: this.playerId,
      name: this.playerName || name,
    });
  },
};
