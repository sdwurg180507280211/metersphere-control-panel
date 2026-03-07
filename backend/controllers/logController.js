/**
 * 日志控制器
 */
const logger = require('../utils/logger');

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
    res.write(`data: ${JSON.stringify({ message: '[系统] 日志连接已建立\n', type: 'system' })}\n\n`);

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
      const files = logger.getLogFiles();
      res.json({ success: true, data: files });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * 清理旧日志
   */
  clean(req, res) {
    try {
      const { days = 7 } = req.body;
      logger.cleanOldLogs(parseInt(days, 10));
      res.json({ success: true, message: `已清理 ${days} 天前的日志` });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

module.exports = logController;
