/**
 * WebSocket 服务
 * 替代 SSE，支持双向通信和自动重连
 */
const { WebSocketServer } = require('ws');
const localAuthService = require('./localAuthService');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // clientId -> {ws, type, subscriptions}
  }

  init(server) {
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      let requestUrl;
      try {
        requestUrl = new URL(req.url, 'http://127.0.0.1');
      } catch (error) {
        socket.destroy();
        return;
      }

      if (requestUrl.pathname !== '/ws') {
        return;
      }

      const token = requestUrl.searchParams.get('token') || '';
      if (!localAuthService.verifyToken(token)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit('connection', ws, req);
      });
    });

    this.wss.on('connection', (ws, req) => {
      const clientId = this._generateClientId();
      this.clients.set(clientId, {
        ws,
        type: null,
        subscriptions: new Set(),
        lastPing: Date.now(),
        heartbeatInterval: null
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
        this._removeClient(clientId);
      });

      ws.on('error', (err) => {
        console.error(`WebSocket 错误 (${clientId}):`, err);
        this._removeClient(clientId);
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

    const client = this.clients.get(clientId);
    if (client) {
      client.heartbeatInterval = interval;
    }
  }

  _removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (client?.heartbeatInterval) {
      clearInterval(client.heartbeatInterval);
    }
    this.clients.delete(clientId);
  }

  _checkHeartbeats() {
    const now = Date.now();
    const staleClientIds = [];
    for (const [clientId, client] of this.clients) {
      if (now - client.lastPing > 120000) {
        staleClientIds.push(clientId);
      }
    }
    for (const clientId of staleClientIds) {
      console.log(`关闭无响应客户端: ${clientId}`);
      const client = this.clients.get(clientId);
      if (client) {
        client.ws.close();
      }
      this._removeClient(clientId);
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

  broadcastLog(type, logData) {
    // 支持新的增强日志格式（包含 lines 数组）和旧的字符串格式
    if (typeof logData === 'string') {
      this.broadcast(`logs:${type}`, { message: logData, type });
    } else {
      // 新的格式：{ message, type, timestamp, lines: [...] }
      this.broadcast(`logs:${type}`, logData);
    }
  }

  broadcastBuildProgress(buildId, progress) {
    this.broadcast('build:progress', { buildId, ...progress });
  }

  broadcastJobProgress(job) {
    this.broadcast('job:progress', job);
  }

  broadcastJobCompleted(job) {
    this.broadcast('job:completed', job);
  }

  broadcastJobFailed(job) {
    this.broadcast('job:failed', job);
  }

  broadcastServiceStatus(status) {
    this.broadcast('service:status', status);
  }

  broadcastInfraStatus(status) {
    this.broadcast('infra:status', status);
  }

  broadcastPackageEvent(event, data) {
    this.broadcast(`package:${event}`, data);
  }

  getConnectedClients() {
    return this.clients.size;
  }
}

module.exports = new WebSocketService();
