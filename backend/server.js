/**
 * MeterSphere 控制面板 - 主入口
 */
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
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
const publicPath = path.join(__dirname, '../frontend/dist');

/**
 * 检查前端是否已构建
 * 如果 dist 目录不存在或为空，返回友好提示页面
 */
function checkFrontendBuilt() {
  try {
    if (!fs.existsSync(publicPath)) {
      return { built: false, reason: 'dist 目录不存在' };
    }
    const files = fs.readdirSync(publicPath);
    if (files.length === 0) {
      return { built: false, reason: 'dist 目录为空' };
    }
    if (!fs.existsSync(path.join(publicPath, 'index.html'))) {
      return { built: false, reason: '缺少 index.html' };
    }
    return { built: true };
  } catch (error) {
    return { built: false, reason: error.message };
  }
}

const initialFrontendStatus = checkFrontendBuilt();

app.use(express.static(publicPath));

if (!initialFrontendStatus.built) {
  console.log(`⚠️  前端未构建: ${initialFrontendStatus.reason}`);
  console.log('   运行 "npm run build" 构建前端');
}

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 所有其他请求返回前端应用
app.get('*', (req, res) => {
  const frontendStatus = checkFrontendBuilt();

  // 检查前端是否已构建
  if (!frontendStatus.built) {
    // 返回友好的提示页面
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MeterSphere 控制面板 - 前端未构建</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 48px;
      max-width: 600px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .icon {
      font-size: 64px;
      margin-bottom: 24px;
    }
    h1 {
      color: #1a1a2e;
      font-size: 28px;
      margin-bottom: 16px;
    }
    p {
      color: #666;
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .code-block {
      background: #f8f9fa;
      border: 1px solid #e9ecef;
      border-radius: 8px;
      padding: 16px;
      text-align: left;
      margin: 20px 0;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 14px;
      overflow-x: auto;
    }
    .code-block code {
      color: #333;
    }
    .btn {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 12px 32px;
      border-radius: 8px;
      text-decoration: none;
      font-size: 16px;
      font-weight: 500;
      transition: background 0.2s;
      border: none;
      cursor: pointer;
    }
    .btn:hover {
      background: #5a6fd6;
    }
    .divider {
      height: 1px;
      background: #e9ecef;
      margin: 32px 0;
    }
    .api-link {
      color: #667eea;
      text-decoration: none;
    }
    .api-link:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🏗️</div>
    <h1>前端资源未构建</h1>
    <p>检测到前端构建产物不存在或已过期。请先构建前端，然后刷新此页面。</p>
    
    <div class="code-block">
      <code>
# 构建前端<br>
cd frontend && npm run build<br><br>
# 或使用根目录命令<br>
npm run build
      </code>
    </div>
    
    <div class="divider"></div>
    
    <p style="font-size: 14px;">
      API 服务正常运行中。<br>
      <a href="/api/health" class="api-link">查看健康检查 →</a>
    </p>
  </div>
</body>
</html>`;
    return res.status(503).send(html);
  }
  
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

    // 刷新并关闭日志写入流
    await logger.closeStreams();
    
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
