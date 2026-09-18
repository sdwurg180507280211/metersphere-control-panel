const jobService = require('./jobService');
const processManager = require('./processManager');
const cacheService = require('./cacheService');
const websocketService = require('./websocketService');
const logger = require('../utils/logger');
const { bounded, close } = require('../utils/startupLifecycle');
let shutdownPromise = null;
async function attempt(label, action, timeout = 2500) {
  try { await bounded(Promise.resolve().then(action), timeout, `${label}超时`); }
  catch (error) { console.warn(`${label}: ${error.message}`); }
}
async function shutdownBackend(server, options = {}) {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    processManager.markControlPanelShuttingDown?.();
    processManager.stopPeriodicCleanup?.();
    if (options.keepServices === false) await attempt('停止 MeterSphere 服务', () => processManager.stopAll(), 10000);
    // Stop observers, not retained business processes.
    for (const id of processManager.serviceHealthMonitors?.keys() || []) processManager._clearHealthMonitor?.(id);
    const { serviceProcesses } = require('./processManager/shared');
    for (const id of serviceProcesses.keys()) processManager._stopServiceLogTail?.(id);
    await attempt('关闭命令任务观察器', () => require('./commandProjectService').destroy?.());
    jobService.destroy();
    await attempt('关闭 WebSocket', () => websocketService.destroy(), options.webSocketCloseTimeoutMs || 1500);
    await attempt('关闭 SQL 查询连接', () => require('./sqlQueryService').closePool());
    await attempt('关闭打包历史连接', () => require('./packageHistoryService').closePool());
    await attempt('关闭缓存', () => cacheService.disconnect());
    await attempt('关闭日志流', () => logger.closeStreams());
    await close(server, options.httpCloseTimeoutMs || 5000);
  })();
  return shutdownPromise;
}
module.exports = { shutdownBackend };
