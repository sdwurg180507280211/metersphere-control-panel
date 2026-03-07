/**
 * 参数校验模块
 */
const config = require('../config');

const VALID_SERVICES = new Set(config.serviceCatalog.map((service) => service.id));
const VALID_MODULES = new Set(config.frontendModules.map((module) => module.id));

const validator = {
  /**
   * 校验服务 ID
   */
  isValidService(serviceId) {
    return VALID_SERVICES.has(serviceId);
  },

  /**
   * 校验前端模块
   */
  isValidModule(moduleId) {
    return VALID_MODULES.has(moduleId);
  },

  /**
   * 获取有效的服务配置
   */
  getValidService(serviceId) {
    if (!this.isValidService(serviceId)) {
      throw new Error(`无效的服务 ID: ${serviceId}`);
    }

    return config.services[serviceId];
  },

  /**
   * 获取有效的前端模块配置
   */
  getValidModule(moduleId) {
    if (!this.isValidModule(moduleId)) {
      throw new Error(`无效的模块: ${moduleId}`);
    }

    return config.frontendModulesById[moduleId];
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
    const num = parseInt(port, 10);
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
