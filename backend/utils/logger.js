/**
 * 日志工具模块
 * 支持 WebSocket / SSE 实时日志推送和流式文件日志
 */
const fs = require('fs');
const path = require('path');
const websocketService = require('../services/websocketService');

class Logger {
  constructor(options = {}) {
    this.logClients = [];
    this.maxLogLines = options.maxLogLines || 1000;
    this.logDir = options.logDir || path.join(__dirname, '../../logs');
    this.logStreams = new Map();

    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  addClient(res) {
    this.logClients.push(res);
    return () => {
      this.logClients = this.logClients.filter((client) => client !== res);
    };
  }

  broadcast(message, type = 'service') {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const lines = message.split('\n');
    const timestampedMessage = lines.map((line) => {
      if (line.trim() === '') return line;
      if (line.startsWith('=====')) return line;
      return `[${timestamp}] ${line}`;
    }).join('\n');

    this.logClients.forEach((client) => {
      try {
        client.write(`data: ${JSON.stringify({ message: timestampedMessage, type })}\n\n`);
      } catch (error) {
        // ignore disconnected SSE clients
      }
    });

    if (websocketService && websocketService.broadcastLog) {
      try {
        websocketService.broadcastLog(type, timestampedMessage);
      } catch (error) {
        // ignore websocket availability issues
      }
    }

    this.writeToFile(timestampedMessage, type);

    return timestampedMessage;
  }

  getLogStream(type, date = new Date().toISOString().split('T')[0]) {
    const streamKey = `${type}:${date}`;
    const existing = this.logStreams.get(streamKey);

    if (existing && !existing.destroyed) {
      return existing;
    }

    const logFile = path.join(this.logDir, `${type}-${date}.log`);
    const stream = fs.createWriteStream(logFile, { flags: 'a' });

    stream.on('error', (error) => {
      console.error(`日志流写入失败 (${streamKey}):`, error.message);
      this.logStreams.delete(streamKey);
    });

    stream.on('close', () => {
      this.logStreams.delete(streamKey);
    });

    this.logStreams.set(streamKey, stream);
    return stream;
  }

  writeToFile(message, type) {
    const date = new Date().toISOString().split('T')[0];
    const stream = this.getLogStream(type, date);
    stream.write(message);
  }

  getLogFiles() {
    if (!fs.existsSync(this.logDir)) return [];
    return fs.readdirSync(this.logDir)
      .filter((file) => file.endsWith('.log'))
      .map((file) => ({
        name: file,
        path: path.join(this.logDir, file),
        size: fs.statSync(path.join(this.logDir, file)).size
      }));
  }

  cleanOldLogs(days = 7) {
    const now = Date.now();
    const maxAge = days * 24 * 60 * 60 * 1000;

    this.getLogFiles().forEach((file) => {
      const stats = fs.statSync(file.path);
      if (now - stats.mtime.getTime() > maxAge) {
        fs.unlinkSync(file.path);
      }
    });
  }

  async closeStreams() {
    const closeTasks = Array.from(this.logStreams.values()).map((stream) => new Promise((resolve) => {
      if (stream.destroyed) {
        resolve();
        return;
      }

      stream.end(resolve);
    }));

    await Promise.allSettled(closeTasks);
    this.logStreams.clear();
  }
}

module.exports = new Logger();
