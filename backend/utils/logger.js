/**
 * 日志工具模块
 * 支持 WebSocket / SSE 实时日志推送和流式文件日志
 * 增强功能：Java 日志级别识别、彩色渲染支持
 */
const fs = require('fs');
const path = require('path');
const websocketService = require('../services/websocketService');

// Java 日志级别正则匹配模式
const LOG_PATTERNS = {
  // Spring Boot 标准格式: 2026-03-08 01:13:45 ERROR ...
  SPRING_BOOT: /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[.,]?\d*)\s+(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\s+/i,
  // 带线程名的格式: 2026-03-08 01:13:45 [main] ERROR ...
  WITH_THREAD: /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[.,]?\d*)\s+\[.*?\]\s+(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\s+/i,
  // Log4j2 格式: [2026-03-08 01:13:45] [ERROR] ...
  LOG4J2: /^\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[.,]?\d*)\]\s*\[(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\]/i,
  // 简单级别标记: ERROR: ... 或 [ERROR] ...
  SIMPLE: /^(\[)?(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)(\])?:/i,
  // 异常堆栈特征行: at ... (File.java:123) 或 Caused by: ...
  STACK_TRACE: /^\s*(at\s+\w+\.|Caused by:|\.{3}\s+\d+\s+more|\w+Exception:|\w+Error:)/i,
};

// 日志级别优先级
const LOG_LEVEL_PRIORITY = {
  'error': 0,
  'warn': 1,
  'warning': 1,
  'info': 2,
  'debug': 3,
  'trace': 4
};

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

  /**
   * 解析日志行的级别
   * @param {string} line - 日志行
   * @returns {object} - { level: string, isStackTrace: boolean }
   */
  parseLogLevel(line) {
    if (!line || line.trim() === '') {
      return { level: null, isStackTrace: false };
    }

    // 检查是否是堆栈跟踪行
    if (LOG_PATTERNS.STACK_TRACE.test(line)) {
      return { level: 'stacktrace', isStackTrace: true };
    }

    // 尝试匹配各种日志格式
    for (const [patternName, pattern] of Object.entries(LOG_PATTERNS)) {
      if (patternName === 'STACK_TRACE') continue;
      
      const match = line.match(pattern);
      if (match) {
        let level = match[2] || match[1];
        level = level.toLowerCase().replace(/[\[\]:]/g, '');
        
        // 统一 warning -> warn
        if (level === 'warning') {
          level = 'warn';
        }
        
        return { level, isStackTrace: false };
      }
    }

    return { level: null, isStackTrace: false };
  }

  /**
   * 解析多行日志，为每行添加级别标记
   * @param {string} message - 原始日志消息
   * @returns {Array<{line: string, level: string, isStackTrace: boolean}>}
   */
  parseLogLines(message) {
    const lines = message.split('\n');
    let currentLevel = 'info'; // 默认级别
    
    return lines.map((line) => {
      if (line.trim() === '') {
        return { line, level: currentLevel, isStackTrace: false, isEmpty: true };
      }

      // 分隔线保持原样
      if (line.startsWith('=====')) {
        return { line, level: 'separator', isStackTrace: false };
      }

      const parsed = this.parseLogLevel(line);
      
      // 如果检测到明确的级别，更新当前级别
      if (parsed.level && !parsed.isStackTrace && parsed.level !== 'stacktrace') {
        currentLevel = parsed.level;
        return { line, level: currentLevel, isStackTrace: false };
      }

      // 堆栈跟踪行继承上一行的级别（通常是 error）
      if (parsed.isStackTrace || parsed.level === 'stacktrace') {
        return { line, level: currentLevel, isStackTrace: true };
      }

      // 无法识别的行，继承当前级别
      return { line, level: currentLevel, isStackTrace: false };
    });
  }

  broadcast(message, type = 'service') {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const lines = message.split('\n');
    
    // 为每行添加时间戳
    const timestampedMessage = lines.map((line) => {
      if (line.trim() === '') return line;
      if (line.startsWith('=====')) return line;
      return `[${timestamp}] ${line}`;
    }).join('\n');

    // 解析日志级别
    const parsedLines = this.parseLogLines(message);

    // 构建增强的日志数据
    const logData = {
      message: timestampedMessage,
      type,
      timestamp: new Date().toISOString(),
      lines: parsedLines.map(item => ({
        text: item.line,
        level: item.level,
        isStackTrace: item.isStackTrace,
        isEmpty: item.isEmpty || false
      }))
    };

    this.logClients.forEach((client) => {
      try {
        client.write(`data: ${JSON.stringify(logData)}\n\n`);
      } catch (error) {
        // ignore disconnected SSE clients
      }
    });

    if (websocketService && websocketService.broadcastLog) {
      try {
        websocketService.broadcastLog(type, logData);
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
