/**
 * 日志工具模块
 * 支持 WebSocket / SSE 实时日志推送和流式文件日志
 * 增强功能：Java 日志级别识别、彩色渲染支持、按级别分目录存储
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
    
    // 按级别分目录的路径
    this.errorLogDir = path.join(this.logDir, 'error');
    this.warnLogDir = path.join(this.logDir, 'warn');
    
    // 确保所有日志目录存在
    this._ensureDirectories();
  }

  /**
   * 确保日志目录结构存在
   */
  _ensureDirectories() {
    [this.logDir, this.errorLogDir, this.warnLogDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * 获取当前服务标识（从调用上下文推断）
   */
  _getCurrentServiceId() {
    // 从环境变量或调用栈推断当前服务
    // 实际使用中，可以通过消息内容中的服务名来识别
    return process.env.CURRENT_SERVICE || 'unknown';
  }

  addClient(res) {
    this.logClients.push(res);

    const removeClient = () => {
      this.logClients = this.logClients.filter((client) => client !== res);
    };

    // 自动清理断开的 SSE 客户端
    res.on('close', removeClient);
    res.on('error', removeClient);

    return removeClient;
  }

  updateOptions(options = {}) {
    if (options.maxLogLines !== undefined) {
      const parsed = Number.parseInt(options.maxLogLines, 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        this.maxLogLines = parsed;
      }
    }
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
   * 从日志内容中提取服务名称
   * @param {string} message - 日志消息
   * @returns {string} - 服务标识
   */
  extractServiceId(message) {
    // 尝试从启动日志中提取服务名
    // 格式: ========== 启动 {服务名} ==========
    const startMatch = message.match(/={3,}\s*启动\s+(.+?)\s*={3,}/);
    if (startMatch) {
      return this._normalizeServiceName(startMatch[1]);
    }
    
    // 从进程退出日志提取
    const exitMatch = message.match(/(.+?)\s+进程退出/);
    if (exitMatch) {
      return this._normalizeServiceName(exitMatch[1]);
    }
    
    // 从 ERROR 日志中的类名推断
    const classMatch = message.match(/io\.metersphere\.(\w+)/);
    if (classMatch) {
      return classMatch[1].toLowerCase();
    }
    
    return 'unknown';
  }

  /**
   * 标准化服务名称
   */
  _normalizeServiceName(name) {
    const nameMap = {
      'eureka': 'eureka',
      'gateway': 'gateway',
      'system setting': 'system-setting',
      'project management': 'project-management',
      'performance test': 'performance-test',
      'api test': 'api-test',
      'test track': 'test-track',
      'report stat': 'report-stat',
      'workstation': 'workstation',
      'workflow service': 'workflow-service',
      'analytics stat': 'analytics-stat'
    };
    
    const normalized = name.toLowerCase().trim();
    return nameMap[normalized] || normalized.replace(/\s+/g, '-');
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

  broadcast(message, type = 'service', serviceId = null) {
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
    
    // 提取服务标识（如果未提供）
    const effectiveServiceId = serviceId || this.extractServiceId(message);

    // 构建增强的日志数据
    const logData = {
      message: timestampedMessage,
      type,
      timestamp: new Date().toISOString(),
      serviceId: effectiveServiceId,
      lines: parsedLines.map((item, index) => {
        const timestampedLine = lines[index];
        const lineText = (timestampedLine && timestampedLine.trim() !== '' && !timestampedLine.startsWith('====='))
          ? `[${timestamp}] ${item.line}`
          : item.line;
        return {
          text: lineText,
          level: item.level,
          isStackTrace: item.isStackTrace,
          isEmpty: item.isEmpty || false
        };
      })
    };

    // 按级别分文件存储
    this._writeLevelBasedLogs(effectiveServiceId, timestampedMessage, parsedLines, timestamp);

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

  /**
   * 按级别写入不同的日志文件
   * @param {string} serviceId - 服务标识
   * @param {string} message - 完整消息
   * @param {Array} parsedLines - 解析后的日志行
   * @param {string} timestamp - 时间戳
   */
  _writeLevelBasedLogs(serviceId, message, parsedLines, timestamp) {
    const date = new Date().toISOString().split('T')[0];
    
    // 检查是否包含 error 或 warn 级别的日志
    const hasError = parsedLines.some(line => line.level === 'error');
    const hasWarn = parsedLines.some(line => line.level === 'warn' || line.level === 'warning');
    
    // 写入 error 日志（包含 error 和 stacktrace）
    if (hasError) {
      const errorContent = parsedLines
        .filter(line => line.level === 'error' || line.level === 'stacktrace' || line.isStackTrace)
        .map(line => `[${timestamp}] ${line.line}`)
        .join('\n') + '\n';
      
      this._writeToLevelFile('error', serviceId, date, errorContent);
    }
    
    // 写入 warn 日志
    if (hasWarn) {
      const warnContent = parsedLines
        .filter(line => line.level === 'warn' || line.level === 'warning')
        .map(line => `[${timestamp}] ${line.line}`)
        .join('\n') + '\n';
      
      this._writeToLevelFile('warn', serviceId, date, warnContent);
    }
  }

  /**
   * 写入级别特定的日志文件
   * @param {string} level - 日志级别 (error/warn)
   * @param {string} serviceId - 服务标识
   * @param {string} date - 日期
   * @param {string} content - 日志内容
   */
  _writeToLevelFile(level, serviceId, date, content) {
    const dir = level === 'error' ? this.errorLogDir : this.warnLogDir;
    const logFile = path.join(dir, `${serviceId}-${date}.log`);
    
    fs.appendFile(logFile, content, (err) => {
      if (err) {
        console.error(`写入${level}日志失败 (${serviceId}):`, err.message);
      }
    });
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
    stream.write(message.endsWith('\n') ? message : message + '\n');
  }

  /**
   * 获取指定级别的日志文件列表
   * @param {string} level - 日志级别 (error/warn/null表示全部)
   * @returns {Array} - 日志文件列表
   */
  getLogFiles(level = null) {
    const dirs = [];
    
    if (!level || level === 'all') {
      dirs.push(this.logDir);
    }
    if (!level || level === 'error') {
      dirs.push(this.errorLogDir);
    }
    if (!level || level === 'warn') {
      dirs.push(this.warnLogDir);
    }
    
    const files = [];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) return;
      
      fs.readdirSync(dir).forEach(file => {
        if (file.endsWith('.log')) {
          const filePath = path.join(dir, file);
          const stats = fs.statSync(filePath);
          files.push({
            name: file,
            path: filePath,
            size: stats.size,
            level: dir === this.errorLogDir ? 'error' : (dir === this.warnLogDir ? 'warn' : 'all'),
            mtime: stats.mtime
          });
        }
      });
    });
    
    return files.sort((a, b) => b.mtime - a.mtime);
  }

  /**
   * 清理旧的日志文件
   * @param {number} days - 保留天数
   * @param {string} level - 指定级别清理，null表示全部
   */
  cleanOldLogs(days = 7, level = null) {
    const now = Date.now();
    const maxAge = days * 24 * 60 * 60 * 1000;

    this.getLogFiles(level).forEach((file) => {
      if (now - file.mtime.getTime() > maxAge) {
        try {
          fs.unlinkSync(file.path);
        } catch (error) {
          console.error(`删除旧日志失败 (${file.path}):`, error.message);
        }
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
