const { WebSocketServer } = require('ws');
const crypto = require('node:crypto');
const localAuthService = require('./localAuthService');

const MAX_PAYLOAD = 64 * 1024;
const MAX_BUFFERED = 1024 * 1024;
const MAX_CLIENTS = 32;
const HEARTBEAT_MS = 30000;

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map();
    this.heartbeatInterval = null;
    this.server = null;
    this.upgradeListener = null;
  }
  init(server) {
    if (this.wss) {
      if (this.server === server) return;
      throw new Error('WebSocket 已绑定其他 HTTP 服务');
    }
    this.server = server;
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, perMessageDeflate: false });
    this.upgradeListener = (req, socket, head) => {
      let requestUrl;
      try { requestUrl = new URL(req.url, 'http://127.0.0.1'); }
      catch { socket.destroy(); return; }
      if (requestUrl.pathname !== '/ws') { socket.destroy(); return; }
      if (!localAuthService.verifyWebSocketRequest(req)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy(); return;
      }
      if (this.clients.size >= MAX_CLIENTS) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
        socket.destroy(); return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.wss?.emit('connection', ws, req));
    };
    server.on('upgrade', this.upgradeListener);
    this.wss.on('connection', (ws) => {
      const clientId = `client_${crypto.randomUUID()}`;
      const client = { ws, type: null, subscriptions: new Set(), lastPing: Date.now(), droppedLogs: 0 };
      this.clients.set(clientId, client);
      this.sendToClient(clientId, { type: 'connected', clientId, timestamp: Date.now() });
      ws.on('pong', () => { client.lastPing = Date.now(); });
      ws.on('message', (data, binary) => {
        if (binary) { ws.close(1003, 'TEXT_ONLY'); return; }
        try {
          const message = JSON.parse(data.toString());
          if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('INVALID_FRAME');
          this._handleMessage(clientId, message);
        } catch { ws.close(1008, 'INVALID_FRAME'); }
      });
      ws.once('close', () => this._removeClient(clientId));
      ws.on('error', () => { this._removeClient(clientId); ws.terminate(); });
    });
    this.heartbeatInterval = setInterval(() => this._checkHeartbeats(), HEARTBEAT_MS);
    this.heartbeatInterval.unref?.();
    this.wss.once('close', () => {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    });
  }
  _handleMessage(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;
    switch (message.type) {
      case 'subscribe':
      case 'unsubscribe': {
        if (!Array.isArray(message.channels) || message.channels.length > 64
          || message.channels.some((channel) => typeof channel !== 'string' || !/^(\*|[a-zA-Z0-9:_-]{1,80})$/.test(channel))) {
          client.ws.close(1008, 'INVALID_CHANNELS'); return;
        }
        if (message.type === 'subscribe') {
          for (const channel of message.channels) client.subscriptions.add(channel);
          if (client.subscriptions.size > 64) { client.ws.close(1008, 'TOO_MANY_CHANNELS'); return; }
          this.sendToClient(clientId, { type: 'subscribed', channels: [...client.subscriptions] });
        } else for (const channel of message.channels) client.subscriptions.delete(channel);
        break;
      }
      case 'ping':
      case 'pong':
        client.lastPing = Date.now();
        if (message.type === 'ping') this.sendToClient(clientId, { type: 'pong' });
        break;
      case 'cancelBuild': {
        if (typeof message.buildId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(message.buildId)) {
          client.ws.close(1008, 'INVALID_BUILD_ID'); return;
        }
        Promise.resolve().then(() => require('./processManager').cancelBuild(message.buildId))
          .then((cancelled) => this.sendToClient(clientId, { type: 'build:cancelled', buildId: message.buildId, success: Boolean(cancelled) }))
          .catch((error) => this.sendToClient(clientId, { type: 'build:cancelled', buildId: message.buildId, success: false, error: error.message }));
        break;
      }
      default: this.sendToClient(clientId, { type: 'error', code: 'UNKNOWN_MESSAGE_TYPE' });
    }
  }
  _removeClient(clientId) { this.clients.delete(clientId); }
  _checkHeartbeats() {
    const now = Date.now();
    for (const [id, client] of this.clients) {
      if (now - client.lastPing > 2 * HEARTBEAT_MS) {
        this._removeClient(id); client.ws.terminate(); continue;
      }
      this._flushGap(client);
      if (client.ws.readyState === 1) {
        try { client.ws.ping(); } catch { client.ws.terminate(); this._removeClient(id); }
      }
    }
  }
  _send(client, text, { log = false } = {}) {
    if (client.ws.readyState !== 1) return false;
    if (Buffer.byteLength(text) > MAX_BUFFERED || client.ws.bufferedAmount + Buffer.byteLength(text) > MAX_BUFFERED) {
      if (log) client.droppedLogs += 1;
      else client.ws.terminate(); // Force resync rather than silently losing a control event.
      return false;
    }
    try {
      client.ws.send(text, (error) => { if (error) client.ws.terminate(); });
      return true;
    } catch { client.ws.terminate(); return false; }
  }
  _flushGap(client) {
    if (!client.droppedLogs || client.ws.bufferedAmount > MAX_BUFFERED / 2) return;
    const count = client.droppedLogs;
    if (this._send(client, JSON.stringify({ type: 'stream:gap', droppedLogs: count, resyncRequired: true }))) client.droppedLogs = 0;
  }
  sendToClient(clientId, data) {
    const client = this.clients.get(clientId);
    if (client) { this._flushGap(client); this._send(client, JSON.stringify(data)); }
  }
  broadcast(channel, data) {
    const message = JSON.stringify({ type: 'message', channel, data, timestamp: Date.now() });
    for (const client of this.clients.values()) {
      if (!client.subscriptions.has(channel) && !client.subscriptions.has('*')) continue;
      this._flushGap(client);
      this._send(client, message, { log: channel.startsWith('logs:') });
    }
  }
  broadcastLog(type, logData) { this.broadcast(`logs:${type}`, typeof logData === 'string' ? { message: logData, type } : logData); }
  broadcastBuildProgress(buildId, progress) { this.broadcast('build:progress', { buildId, ...progress }); }
  broadcastJobProgress(job) { this.broadcast('job:progress', job); }
  broadcastJobCompleted(job) { this.broadcast('job:completed', job); }
  broadcastJobFailed(job) { this.broadcast('job:failed', job); }
  broadcastServiceStatus(status) { this.broadcast('service:status', status); }
  broadcastInfraStatus(status) { this.broadcast('infra:status', status); }
  broadcastPackageEvent(event, data) { this.broadcast(`package:${event}`, data); }
  getConnectedClients() { return this.clients.size; }
  async destroy() {
    clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
    if (this.server && this.upgradeListener) this.server.removeListener('upgrade', this.upgradeListener);
    this.server = null; this.upgradeListener = null;
    for (const client of this.clients.values()) { try { client.ws.terminate(); } catch {} }
    this.clients.clear();
    const wss = this.wss; this.wss = null;
    if (wss) await new Promise((resolve) => { try { wss.close(resolve); } catch { resolve(); } });
  }
}
module.exports = new WebSocketService();
