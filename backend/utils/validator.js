/**
 * 参数校验模块
 */
const fs = require('fs');
const path = require('path');
const { createAppError } = require('./errors');

function getResolvedConfig() {
  return require('../services/configManager').getResolvedConfig();
}

function parseExtraDirs(value) {
  return String(value || '')
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
}

function safeRealpath(targetPath) {
  try {
    return fs.realpathSync(targetPath);
  } catch (error) {
    return null;
  }
}

function isInsideDir(targetPath, dirPath) {
  const relative = path.relative(dirPath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveExistingFileInDirs(filePath, allowedDirs, errorCode = 'PATH_NOT_ALLOWED') {
  const resolvedFile = safeRealpath(filePath);
  if (!resolvedFile) {
    throw createAppError(404, 'FILE_NOT_FOUND', '文件不存在');
  }

  for (const dir of allowedDirs) {
    const resolvedDir = safeRealpath(dir);
    if (resolvedDir && isInsideDir(resolvedFile, resolvedDir)) {
      return resolvedFile;
    }
  }

  throw createAppError(400, errorCode, '路径不在允许范围内');
}

function getAllowedConfigDirs() {
  const projectRoot = getResolvedConfig().projectRoot;
  return [
    '/opt/metersphere/conf',
    projectRoot ? path.join(projectRoot, 'conf') : null,
    projectRoot ? path.resolve(projectRoot, '../conf') : null,
    ...parseExtraDirs(process.env.MS_ALLOWED_CONF_DIRS)
  ].filter(Boolean);
}

function getAllowedScriptDirs() {
  const projectRoot = getResolvedConfig().projectRoot;
  return [
    projectRoot,
    path.resolve(__dirname, '../../scripts'),
    path.resolve(__dirname, '../..'),
    ...parseExtraDirs(process.env.MS_ALLOWED_SCRIPT_DIRS)
  ].filter(Boolean);
}

function getAllowedNativeLogDirs() {
  return [
    '/opt/metersphere/logs',
    ...parseExtraDirs(process.env.MS_ALLOWED_NATIVE_LOG_DIRS)
  ].filter(Boolean);
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

  isSafeServiceId(serviceId) {
    return typeof serviceId === 'string' && /^[a-zA-Z0-9._-]{1,80}$/.test(serviceId);
  },

  isValidDate(date) {
    return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
  },

  clampLines(lines, fallback = 100, max = 5000) {
    const parsed = Number.parseInt(lines, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.min(parsed, max);
  },

  resolveConfigFilePath(filePath, filename = null) {
    const basename = path.basename(filePath || '');
    if (!['metersphere.properties', 'redisson.yml'].includes(filename || basename) || basename !== (filename || basename)) {
      throw createAppError(400, 'INVALID_FILENAME', '不支持的配置文件');
    }
    return resolveExistingFileInDirs(filePath, getAllowedConfigDirs(), 'CONFIG_PATH_NOT_ALLOWED');
  },

  resolveLogFilePath(filePath, allowedDir) {
    return resolveExistingFileInDirs(filePath, [allowedDir], 'LOG_PATH_NOT_ALLOWED');
  },

  resolvePackageScriptPath(filePath) {
    return resolveExistingFileInDirs(filePath, getAllowedScriptDirs(), 'PACKAGE_SCRIPT_PATH_NOT_ALLOWED');
  },

  resolveNativeLogFilePath(filePath) {
    return resolveExistingFileInDirs(filePath, getAllowedNativeLogDirs(), 'NATIVE_LOG_PATH_NOT_ALLOWED');
  },

  /**
   * 安全地转义 shell 参数
   */
  escapeShellArg(arg) {
    return arg.replace(/[;&|`$(){}[\]\\'"\s]/g, '\\$&');
  }
};

module.exports = validator;
