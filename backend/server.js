/**
 * MeterSphere 控制面板 - 主入口
 */
const express = require('express');
const http = require('http');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const cacheService = require('./services/cacheService');
const websocketService = require('./services/websocketService');

// 导入路由
const serviceRoutes = require('./routes/services');
const buildRoutes = require('./routes/build');
const logRoutes = require('./routes/logs');
const progressRoutes = require('./routes/progress');

const app = express();
const server = http.createServer(app);

// 中间件
app.use(express.json());

// API 路由
app.use('/api/services', serviceRoutes);
app.use('/api/build', buildRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/progress', progressRoutes);

// 静态文件 - 生产环境提供 React 构建产物
const publicPath = process.env.NODE_ENV === 'production' 
  ? path.join(__dirname, '../frontend/dist')
  : path.join(__dirname, '../frontend/dist');

app.use(express.static(publicPath));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 所有其他请求返回前端应用
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('Error:', err);
  logger.broadcast(`[错误] ${err.message}`, 'system');
  res.status(500).json({ 
    success: false, 
    error: process.env.NODE_ENV === 'production' 
      ? '服务器内部错误' 
      : err.message 
  });
});

// 初始化服务
async function initServices() {
  // 连接 Redis
  await cacheService.connect();
  
  // 初始化 WebSocket
  websocketService.init(server);
  
  console.log('服务初始化完成');
}

// 优雅关闭处理
async function gracefulShutdown(signal) {
  console.log(`收到 ${signal} 信号，正在优雅关闭...`);
  
  try {
    // 停止所有服务
    const processManager = require('./services/processManager');
    await processManager.stopAll();
    
    // 关闭 Redis 连接
    await cacheService.disconnect();
    
    // 关闭 HTTP 服务器
    server.close(() => {
      console.log('服务器已关闭');
      process.exit(0);
    });
    
    // 强制退出（防止某些连接卡住）
    setTimeout(() => {
      console.error('强制退出');
      process.exit(1);
    }, 30000);
  } catch (error) {
    console.error('关闭过程出错:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 未捕获的异常处理
process.on('uncaughtException', (err) => {
  console.error('未捕获的异常:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason);
});

// 启动服务器
server.listen(config.port, async () => {
  console.log(`控制面板运行在 http://localhost:${config.port}`);
  console.log(`项目根目录: ${config.projectRoot}`);
  
  // 初始化服务
  await initServices();
});

module.exports = app;
