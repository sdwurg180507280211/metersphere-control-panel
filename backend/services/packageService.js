const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const packageConfig = require('../config/package');
const configManager = require('./configManager');
const { createAppError } = require('../utils/errors');

function normalizeBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  if (value === undefined || value === null) {
    return fallback;
  }

  return Boolean(value);
}

function getResolvedConfig() {
  return configManager.getResolvedConfig();
}

function resolvePackageScriptPath(explicitPath = null, resolvedConfig = getResolvedConfig()) {
  const candidates = [...new Set(packageConfig.getPackageScriptCandidates({ resolvedConfig, explicitPath }).map((item) => path.resolve(item)))];
  const existingPath = candidates.find((candidate) => fs.existsSync(candidate));

  if (!existingPath) {
    throw createAppError(500, 'PACKAGE_SCRIPT_NOT_FOUND', '打包脚本不存在', {
      candidates
    });
  }

  const stats = fs.statSync(existingPath);
  if (!stats.isFile()) {
    throw createAppError(500, 'PACKAGE_SCRIPT_INVALID', '打包脚本路径不是文件', {
      scriptPath: existingPath
    });
  }

  try {
    fs.accessSync(existingPath, fs.constants.X_OK);
  } catch (error) {
    throw createAppError(500, 'PACKAGE_SCRIPT_NOT_EXECUTABLE', '打包脚本不可执行', {
      scriptPath: existingPath
    });
  }

  return existingPath;
}

function validateServices(rawServices, resolvedConfig = getResolvedConfig()) {
  if (!Array.isArray(rawServices)) {
    throw createAppError(400, 'INVALID_PACKAGE_SERVICES', '服务列表必须为数组');
  }

  const services = [...new Set(rawServices.map((item) => String(item || '').trim()).filter(Boolean))];

  if (services.length === 0) {
    throw createAppError(400, 'PACKAGE_SERVICES_REQUIRED', '请至少选择一个打包服务');
  }

  const allowedServices = packageConfig.getPackageServiceOptions(resolvedConfig).map((item) => item.id);
  const invalidServices = services.filter((service) => !allowedServices.includes(service));
  if (invalidServices.length > 0) {
    throw createAppError(400, 'INVALID_PACKAGE_SERVICES', '包含未支持的打包服务', {
      invalidServices,
      allowedServices
    });
  }

  return services;
}

function validateMaxJobs(rawMaxJobs) {
  const value = Number.parseInt(rawMaxJobs, 10);

  if (!Number.isInteger(value) || value <= 0 || value > 64) {
    throw createAppError(400, 'INVALID_MAX_JOBS', '线程数必须是 1 到 64 之间的整数', {
      maxJobs: rawMaxJobs
    });
  }

  return value;
}

function validateImageVersion(rawImageVersion) {
  const imageVersion = String(rawImageVersion || '').trim();
  if (!imageVersion) {
    throw createAppError(400, 'INVALID_IMAGE_VERSION', '镜像版本不能为空');
  }

  return imageVersion;
}

function validatePackagePath(rawPackagePath) {
  if (rawPackagePath === undefined || rawPackagePath === null || rawPackagePath === '') {
    return '';
  }

  const packagePath = String(rawPackagePath).trim();
  if (!packagePath) {
    throw createAppError(400, 'INVALID_PACKAGE_PATH', '输出路径不能为空');
  }

  return packagePath;
}

function preparePackageRunOptions(payload = {}, resolvedConfig = getResolvedConfig()) {
  const defaults = packageConfig.getPackageDefaults(resolvedConfig.package || {});
  const services = validateServices(payload.services ?? defaults.services, resolvedConfig);
  const imageVersion = validateImageVersion(payload.imageVersion ?? defaults.imageVersion);
  const parallelBuild = normalizeBoolean(payload.parallelBuild, defaults.parallelBuild);
  const maxJobs = validateMaxJobs(payload.maxJobs ?? defaults.maxJobs);
  const buildOnly = normalizeBoolean(payload.buildOnly, defaults.buildOnly);
  const packagePath = validatePackagePath(payload.packagePath ?? defaults.packagePath);
  const scriptPath = resolvePackageScriptPath(payload.scriptPath || null, resolvedConfig);

  return {
    services,
    imageVersion,
    parallelBuild,
    maxJobs,
    buildOnly,
    packagePath,
    scriptPath
  };
}

function buildPackageEnvironment(options) {
  const env = {
    ...process.env,
    IMAGE_VERSION: options.imageVersion,
    PARALLEL_BUILD: String(options.parallelBuild),
    MAX_JOBS: String(options.maxJobs),
    BUILD_ONLY: String(options.buildOnly)
  };

  if (options.packagePath) {
    env.PACKAGE_PATH = options.packagePath;
  }

  return env;
}

function spawnPackageProcess(options, hooks = {}) {
  const child = spawn(options.scriptPath, options.services, {
    cwd: path.dirname(options.scriptPath),
    env: buildPackageEnvironment(options),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (typeof hooks.onStdout === 'function') {
    child.stdout?.on('data', (chunk) => hooks.onStdout(chunk.toString()));
  }

  if (typeof hooks.onStderr === 'function') {
    child.stderr?.on('data', (chunk) => hooks.onStderr(chunk.toString()));
  }

  if (typeof hooks.onError === 'function') {
    child.on('error', hooks.onError);
  }

  if (typeof hooks.onClose === 'function') {
    child.on('close', hooks.onClose);
  }

  return child;
}

module.exports = {
  preparePackageRunOptions,
  resolvePackageScriptPath,
  spawnPackageProcess
};
