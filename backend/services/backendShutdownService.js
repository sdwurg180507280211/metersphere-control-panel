const jobService = require('./jobService');
const processManager = require('./processManager');
const cacheService = require('./cacheService');
const websocketService = require('./websocketService');
const logger = require('../utils/logger');

let shutdownPromise = null;

function closeHttpServer(server, timeoutMs = 5000) {
  if (!server || !server.listening) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const timeout = setTimeout(finish, timeoutMs);
    timeout.unref?.();

    try {
      server.close(() => {
        clearTimeout(timeout);
        finish();
      });
    } catch {
      clearTimeout(timeout);
      finish();
    }
  });
}

async function closeWebSockets() {
  const wss = websocketService.wss;
  if (!wss) return;

  for (const client of wss.clients || []) {
    try {
      client.close(1001, 'Local Service Hub shutting down');
    } catch {
      // Best effort only.
    }
  }

  await new Promise((resolve) => {
    try {
      wss.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

async function shutdownBackend(server, options = {}) {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = (async () => {
    const keepServices = options.keepServices !== false;
    processManager.markControlPanelShuttingDown?.();

    if (!keepServices) {
      try {
        await processManager.stopAll();
      } catch (error) {
        console.warn(`停止 MeterSphere 服务失败: ${error.message}`);
      }
    }

    try {
      jobService.destroy();
    } catch (error) {
      console.warn(`清理任务定时器失败: ${error.message}`);
    }

    try {
      await closeWebSockets();
    } catch (error) {
      console.warn(`关闭 WebSocket 失败: ${error.message}`);
    }

    try {
      await cacheService.disconnect();
    } catch (error) {
      console.warn(`关闭 Redis 失败: ${error.message}`);
    }

    try {
      const packageHistoryService = require('./packageHistoryService');
      await packageHistoryService.closePool();
    } catch (error) {
      console.warn(`关闭打包历史连接池失败: ${error.message}`);
    }

    try {
      await logger.closeStreams();
    } catch (error) {
      console.warn(`关闭日志流失败: ${error.message}`);
    }

    await closeHttpServer(server, options.httpCloseTimeoutMs || 5000);
  })();

  return shutdownPromise;
}

module.exports = {
  shutdownBackend
};
