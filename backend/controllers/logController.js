/**
 * 日志控制器
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const validator = require('../utils/validator');

const logController = {
  /**
   * SSE 日志流
   */
  stream(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // 禁用 Nginx 缓冲
    res.setHeader('X-Accel-Buffering', 'no');

    // 发送初始连接成功消息
    const message = JSON.stringify({ message: '[系统] 日志连接已建立\n', type: 'system' });
    res.write(`data: ${message}\n\n`);

    // 添加客户端
    const removeClient = logger.addClient(res);

    // 心跳保持连接
    const heartbeat = setInterval(() => {
      try {
        res.write(':heartbeat\n\n');
      } catch (e) {
        clearInterval(heartbeat);
        removeClient();
      }
    }, 30000);

    // 清理
    req.on('close', () => {
      clearInterval(heartbeat);
      removeClient();
    });
  },

  /**
   * 获取日志文件列表
   */
  getFiles(req, res) {
    try {
      const { level } = req.query;
      const files = logger.getLogFiles(level || null);
      res.json({ success: true, data: files });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * 获取按级别分类的日志文件列表
   */
  getFilesByLevel(req, res) {
    try {
      const result = {
        all: logger.getLogFiles('all'),
        error: logger.getLogFiles('error'),
        warn: logger.getLogFiles('warn')
      };
      
      // 按服务分组统计
      const serviceStats = {};
      ['error', 'warn'].forEach(level => {
        result[level].forEach(file => {
          // 从文件名提取服务名 (格式: service-2024-03-08.log)
          const serviceMatch = file.name.match(/^(.+?)-\d{4}-\d{2}-\d{2}\.log$/);
          if (serviceMatch) {
            const serviceId = serviceMatch[1];
            if (!serviceStats[serviceId]) {
              serviceStats[serviceId] = { error: 0, warn: 0 };
            }
            serviceStats[serviceId][level] += file.size;
          }
        });
      });
      
      result.serviceStats = serviceStats;
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * 读取指定服务的错误/警告日志
   */
  readServiceLogs(req, res) {
    try {
      const { serviceId, level = 'error', date, lines = 100 } = req.query;
      
      if (!serviceId || !validator.isSafeServiceId(serviceId)) {
        return res.status(400).json({ success: false, error: '无效的 serviceId 参数' });
      }

      if (!['error', 'warn', 'cmd'].includes(level)) {
        return res.status(400).json({ success: false, error: 'level 必须是 error、warn 或 cmd' });
      }

      // 确定日期，默认今天
      const targetDate = date || new Date().toISOString().split('T')[0];
      if (!validator.isValidDate(targetDate)) {
        return res.status(400).json({ success: false, error: 'date 必须是 YYYY-MM-DD' });
      }
      const safeLines = validator.clampLines(lines, 100, 5000);
      const levelDir = level === 'error' ? logger.errorLogDir : level === 'cmd' ? logger.cmdLogDir : logger.warnLogDir;
      const logFile = path.join(levelDir, `${serviceId}-${targetDate}.log`);

      if (!fs.existsSync(logFile)) {
        return res.json({ 
          success: true, 
          data: [], 
          message: '日志文件不存在',
          file: logFile
        });
      }
      
      // 读取最后 N 行
      const safeLogFile = validator.resolveLogFilePath(logFile, levelDir);
      const content = fs.readFileSync(safeLogFile, 'utf8');
      const allLines = content.split('\n').filter(line => line.trim());
      const lastLines = allLines.slice(-safeLines);
      
      res.json({
        success: true,
        data: lastLines,
        meta: {
          serviceId,
          level,
          date: targetDate,
          totalLines: allLines.length,
          returnedLines: lastLines.length,
          file: logFile
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * 下载指定服务的错误/警告日志
   */
  downloadServiceLogs(req, res) {
    try {
      const { serviceId, level = 'error', date } = req.query;
      
      if (!serviceId || !validator.isSafeServiceId(serviceId)) {
        return res.status(400).json({ success: false, error: '无效的 serviceId 参数' });
      }

      if (!['error', 'warn', 'cmd'].includes(level)) {
        return res.status(400).json({ success: false, error: 'level 必须是 error、warn 或 cmd' });
      }

      const targetDate = date || new Date().toISOString().split('T')[0];
      if (!validator.isValidDate(targetDate)) {
        return res.status(400).json({ success: false, error: 'date 必须是 YYYY-MM-DD' });
      }
      const levelDir = level === 'error' ? logger.errorLogDir : level === 'cmd' ? logger.cmdLogDir : logger.warnLogDir;
      const logFile = path.join(levelDir, `${serviceId}-${targetDate}.log`);

      if (!fs.existsSync(logFile)) {
        return res.status(404).json({ success: false, error: '日志文件不存在' });
      }
      
      const safeLogFile = validator.resolveLogFilePath(logFile, levelDir);
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${serviceId}-${level}-${targetDate}.log"`);
      res.sendFile(safeLogFile);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * 获取命令历史
   */
  getCommandHistory(req, res) {
    try {
      const { date, lines = 200 } = req.query;
      const targetDate = date || new Date().toISOString().split('T')[0];
      if (!validator.isValidDate(targetDate)) {
        return res.status(400).json({ success: false, error: 'date 必须是 YYYY-MM-DD' });
      }
      const safeLines = validator.clampLines(lines, 200, 5000);
      const cmdDir = logger.cmdLogDir;

      if (!fs.existsSync(cmdDir)) {
        return res.json({ success: true, data: [] });
      }

      // 读取所有匹配日期的 cmd 日志文件
      const cmdFiles = fs.readdirSync(cmdDir)
        .filter(f => f.endsWith(`-${targetDate}.log`))
        .sort();

      if (cmdFiles.length === 0) {
        return res.json({ success: true, data: [] });
      }

      // 合并所有文件的命令行
      const allLines = [];
      for (const file of cmdFiles) {
        const content = fs.readFileSync(path.join(cmdDir, file), 'utf8');
        const fileLines = content.split('\n').filter(line => line.trim());
        allLines.push(...fileLines);
      }

      const lastLines = allLines.slice(-safeLines);

      res.json({
        success: true,
        data: lastLines,
        meta: {
          date: targetDate,
          totalLines: allLines.length,
          returnedLines: lastLines.length
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * 清理旧日志
   */
  clean(req, res) {
    try {
      const { days = 7, level } = req.body;
      logger.cleanOldLogs(parseInt(days, 10), level || null);
      
      const levelMsg = level ? `${level}级别` : '所有';
      res.json({ success: true, message: `已清理 ${days} 天前的${levelMsg}日志` });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

module.exports = logController;
