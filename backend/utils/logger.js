/**
 * 日志工具模块
 * 支持 SSE 实时日志流和文件日志
 */
const fs = require('fs');
const path = require('path');
const websocketService = require('../services/websocketService');

class Logger {
  constructor(options = {}) {
    this.logClients = [];
    this.maxLogLines = options.maxLogLines || 1000;
    this.logDir = options.logDir || path.join(__dirname, '../../logs');
    
    // 确保日志目录存在
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * 添加 SSE 客户端
   */
  addClient(res) {
    this.logClients.push(res);
    return () => {
      this.logClients = this.logClients.filter(client => client !== res);
    };
  }

  /**
   * 发送日志到所有连接的客户端
   */
  broadcast(message, type = 'service') {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const lines = message.split('\n');
    const timestampedMessage = lines.map(line => {
      if (line.trim() === '') return line;
      if (line.startsWith('=====')) return line;
      return `[${timestamp}] ${line}`;
    }).join('\n');

    // 发送到 SSE 客户端（兼容旧版）
    this.logClients.forEach(client => {
      try {
        client.write(`data: ${JSON.stringify({ message: timestampedMessage, type })}\n\n`);
      } catch (e) {
        // 客户端已断开，忽略错误
      }
    });

    // 发送到 WebSocket 客户端（如果已初始化）
    if (websocketService && websocketService.broadcastLog) {
      try {
        websocketService.broadcastLog(type, timestampedMessage);
      } catch (e) {
        // WebSocket 可能未初始化，忽略错误
      }
    }

    // 同时写入文件
    this.writeToFile(timestampedMessage, type);

    return timestampedMessage;
  }

  /**
   * 写入日志到文件
   */
  writeToFile(message, type) {
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(this.logDir, `${type}-${date}.log`);
    fs.appendFileSync(logFile, message);
  }

  /**
   * 获取日志文件列表
   */
  getLogFiles() {
    if (!fs.existsSync(this.logDir)) return [];
    return fs.readdirSync(this.logDir)
      .filter(f => f.endsWith('.log'))
      .map(f => ({
        name: f,
        path: path.join(this.logDir, f),
        size: fs.statSync(path.join(this.logDir, f)).size
      }));
  }

  /**
   * 清理旧日志
   */
  cleanOldLogs(days = 7) {
    const now = Date.now();
    const maxAge = days * 24 * 60 * 60 * 1000;
    
    this.getLogFiles().forEach(file => {
      const stats = fs.statSync(file.path);
      if (now - stats.mtime.getTime() > maxAge) {
        fs.unlinkSync(file.path);
      }
    });
  }
}

// 导出单例
module.exports = new Logger();
