/**
 * 参数校验模块
 */
const configManager = require('../services/configManager');

function getResolvedConfig() {
  return configManager.getResolvedConfig();
}

const validator = {
  /**
   * 校验服务 ID
   */
  isValidService(serviceId) {
    return getResolvedConfig().serviceCatalog.some((service) => service.id === serviceId);
  },

  /**
   * 校验前端模块
   */
  isValidModule(moduleId) {
    return getResolvedConfig().frontendModules.some((module) => module.id === moduleId);
  },

  /**
   * 获取有效的服务配置
   */
  getValidService(serviceId) {
    const service = getResolvedConfig().services[serviceId];
    if (!service) {
      throw new Error(`无效的服务 ID: ${serviceId}`);
    }

    return service;
  },

  /**
   * 获取有效的前端模块配置
   */
  getValidModule(moduleId) {
    const moduleConfig = getResolvedConfig().frontendModulesById[moduleId];
    if (!moduleConfig) {
      throw new Error(`无效的模块: ${moduleId}`);
    }

    return moduleConfig;
  },

  /**
   * 获取有效的前端模块路径
   */
  getValidModulePath(moduleId) {
    return this.getValidModule(moduleId).frontendPath;
  },

  /**
   * 校验端口号
   */
  isValidPort(port) {
    const num = Number.parseInt(port, 10);
    return !Number.isNaN(num) && num > 0 && num <= 65535;
  },

  /**
   * 安全地转义 shell 参数
   */
  escapeShellArg(arg) {
    return arg.replace(/[;&|`$(){}[\]\\'"\s]/g, '\\$&');
  }
};

module.exports = validator;
