const jobService = require('./jobService');
const processManager = require('./processManager');
const cacheService = require('./cacheService');
const websocketService = require('./websocketService');
const logger = require('../utils/logger');

let shutdownPromise = null;

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      timer.unref?.();
    })
  ]);
}

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

async function closeWebSockets(timeoutMs = 1500) {
  const wss = websocketService.wss;
  if (!wss) return;

  for (const client of wss.clients || []) {
    try {
      client.close(1001, 'Local Service Hub shutting down');
    } catch {
      // Best effort only.
    }
  }

  await withTimeout(new Promise((resolve) => {
    try {
      wss.close(() => resolve());
    } catch {
      resolve();
    }
  }), timeoutMs);
}

async function shutdownBackend(server, options = {}) {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = (async () => {
    const keepServices = options.keepServices !== false;
    processManager.markControlPanelShuttingDown?.();

    if (!keepServices) {
      try {
        await withTimeout(processManager.stopAll(), 5000);
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
      await closeWebSockets(options.webSocketCloseTimeoutMs || 1500);
    } catch (error) {
      console.warn(`关闭 WebSocket 失败: ${error.message}`);
    }

    try {
      await withTimeout(cacheService.disconnect(), 2500);
    } catch (error) {
      console.warn(`关闭 Redis 失败: ${error.message}`);
    }

    try {
      const packageHistoryService = require('./packageHistoryService');
      await withTimeout(packageHistoryService.closePool(), 2500);
    } catch (error) {
      console.warn(`关闭打包历史连接池失败: ${error.message}`);
    }

    try {
      await withTimeout(logger.closeStreams(), 2500);
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
