/**
 * WebSocket 服务
 * 替代 SSE，支持双向通信和自动重连
 */
const { WebSocketServer } = require('ws');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // clientId -> {ws, type, subscriptions}
  }

  init(server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      const clientId = this._generateClientId();
      this.clients.set(clientId, {
        ws,
        type: null,
        subscriptions: new Set(),
        lastPing: Date.now()
      });

      console.log(`WebSocket 客户端连接: ${clientId}`);

      // 发送欢迎消息
      this.sendToClient(clientId, {
        type: 'connected',
        clientId,
        timestamp: Date.now()
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this._handleMessage(clientId, message);
        } catch (e) {
          console.error('WebSocket 消息解析失败:', e);
        }
      });

      ws.on('close', () => {
        console.log(`WebSocket 客户端断开: ${clientId}`);
        this.clients.delete(clientId);
      });

      ws.on('error', (err) => {
        console.error(`WebSocket 错误 (${clientId}):`, err);
        this.clients.delete(clientId);
      });

      // 心跳检测
      this._startHeartbeat(clientId);
    });

    // 全局心跳检查
    setInterval(() => this._checkHeartbeats(), 30000);
  }

  _generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  _handleMessage(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'subscribe':
        // 订阅频道：'logs:service', 'logs:build', 'build:progress'
        message.channels?.forEach(ch => client.subscriptions.add(ch));
        this.sendToClient(clientId, {
          type: 'subscribed',
          channels: Array.from(client.subscriptions)
        });
        break;

      case 'unsubscribe':
        message.channels?.forEach(ch => client.subscriptions.delete(ch));
        break;

      case 'ping':
        client.lastPing = Date.now();
        this.sendToClient(clientId, { type: 'pong' });
        break;

      case 'cancelBuild': {
        const processManager = require('./processManager');
        processManager.cancelBuild(message.buildId)
          .then((cancelled) => {
            this.sendToClient(clientId, {
              type: 'build:cancelled',
              buildId: message.buildId,
              success: Boolean(cancelled)
            });
          })
          .catch((error) => {
            this.sendToClient(clientId, {
              type: 'build:cancelled',
              buildId: message.buildId,
              success: false,
              error: error.message
            });
          });
        break;
      }

      default:
        console.log('未知消息类型:', message.type);
    }
  }

  _startHeartbeat(clientId) {
    const interval = setInterval(() => {
      const client = this.clients.get(clientId);
      if (!client) {
        clearInterval(interval);
        return;
      }
      this.sendToClient(clientId, { type: 'ping' });
    }, 30000);
  }

  _checkHeartbeats() {
    const now = Date.now();
    for (const [clientId, client] of this.clients) {
      if (now - client.lastPing > 120000) { // 2分钟无响应
        console.log(`关闭无响应客户端: ${clientId}`);
        client.ws.close();
        this.clients.delete(clientId);
      }
    }
  }

  sendToClient(clientId, data) {
    const client = this.clients.get(clientId);
    if (client?.ws.readyState === 1) { // OPEN
      client.ws.send(JSON.stringify(data));
    }
  }

  broadcast(channel, data) {
    const message = JSON.stringify({
      type: 'message',
      channel,
      data,
      timestamp: Date.now()
    });

    for (const [clientId, client] of this.clients) {
      if (client.subscriptions.has(channel) || client.subscriptions.has('*')) {
        if (client.ws.readyState === 1) {
          client.ws.send(message);
        }
      }
    }
  }

  broadcastLog(type, message) {
    this.broadcast(`logs:${type}`, { message, type });
  }

  broadcastBuildProgress(buildId, progress) {
    this.broadcast('build:progress', { buildId, ...progress });
  }

  getConnectedClients() {
    return this.clients.size;
  }
}

module.exports = new WebSocketService();
