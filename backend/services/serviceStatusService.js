const configManager = require('./configManager');
const processManager = require('./processManager');
const dependencyService = require('./dependencyService');

/**
 * HTTP 查询视图：保留 ProcessManager 的原始状态，仅附加 dependencyStatus。
 * 不回写内部状态、不广播额外事件、不创建任务或改变启动顺序。
 */
function decorate(serviceId, status, services, statuses) {
  // 保留旧版布尔值/空返回，不把未知状态制造成一条正常的服务记录。
  if (!status || typeof status !== 'object' || Array.isArray(status)) return status;
  return { ...status, dependencyStatus: dependencyService.analyze(serviceId, services, statuses) };
}

module.exports = {
  async getAllStatus() {
    const services = configManager.getResolvedConfig().services || {};
    const statuses = await processManager.getAllStatus();
    // 一次原有状态查询；依赖分析复用同一批结果，不重复发起健康探测。
    return Object.fromEntries(Object.entries(statuses).map(([id, status]) => [
      id, decorate(id, status, services, statuses)
    ]));
  },

  async getStatus(serviceId) {
    const services = configManager.getResolvedConfig().services || {};
    const node = dependencyService.getDependencies(serviceId, services);
    const dependencyIds = node.dependsOn.filter((id) => id !== serviceId
      && Object.hasOwn(services, id) && services[id] && services[id].enabled !== false);
    const ids = [...new Set([serviceId, ...dependencyIds])];
    const results = await Promise.allSettled(ids.map(async (id) => processManager.getStatus(id)));

    // 目标查询失败仍走原有错误契约；依赖查询失败仅表示该依赖状态未知。
    if (results[0].status === 'rejected') throw results[0].reason;
    const statuses = Object.fromEntries(results.flatMap((result, index) =>
      result.status === 'fulfilled' ? [[ids[index], result.value]] : []));
    return decorate(serviceId, results[0].value, services, statuses);
  }
};
