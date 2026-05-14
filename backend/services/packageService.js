const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const packageConfig = require('../config/package');
const configManager = require('./configManager');
const { createAppError } = require('../utils/errors');
const validator = require('../utils/validator');

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

  const safeScriptPath = validator.resolvePackageScriptPath(existingPath);
  const stats = fs.statSync(safeScriptPath);
  if (!stats.isFile()) {
    throw createAppError(500, 'PACKAGE_SCRIPT_INVALID', '打包脚本路径不是文件', {
      scriptPath: safeScriptPath
    });
  }

  try {
    fs.accessSync(safeScriptPath, fs.constants.X_OK);
  } catch (error) {
    throw createAppError(500, 'PACKAGE_SCRIPT_NOT_EXECUTABLE', '打包脚本不可执行', {
      scriptPath: safeScriptPath
    });
  }

  return safeScriptPath;
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
  const parallelBuild = normalizeBoolean(payload.parallelBuild, defaults.parallelBuild);
  const maxJobs = validateMaxJobs(payload.maxJobs ?? defaults.maxJobs);
  const buildOnly = normalizeBoolean(payload.buildOnly, defaults.buildOnly);
  const packagePath = validatePackagePath(payload.packagePath ?? defaults.packagePath);
  const scriptPath = resolvePackageScriptPath(payload.scriptPath || null, resolvedConfig);

  // 构建每服务版本映射：优先取前端覆盖 > 服务配置 > 种子版本
  const seedVersion = packageConfig.DEFAULT_SEED_VERSION;
  const serviceImageVersions = {};
  const resolvedServices = resolvedConfig.services || {};
  for (const serviceId of services) {
    const override = payload.serviceImageVersions?.[serviceId];
    const configured = resolvedServices[serviceId]?.imageVersion;
    serviceImageVersions[serviceId] = override || configured || seedVersion;
  }

  return {
    services,
    serviceImageVersions,
    parallelBuild,
    maxJobs,
    buildOnly,
    packagePath,
    scriptPath
  };
}

function serviceIdToEnvKey(serviceId) {
  return 'SERVICE_VERSION_' + serviceId.replace(/-/g, '_').toUpperCase();
}

function buildPackageEnvironment(options) {
  // IMAGE_VERSION 仍传递（取第一个服务版本），用于脚本全局 fallback 兼容
  const firstVersion = Object.values(options.serviceImageVersions || {})[0] || packageConfig.DEFAULT_SEED_VERSION;
  const resolvedConfig = getResolvedConfig();
  const env = {
    ...process.env,
    PROJECT_PATH: resolvedConfig.projectRoot || '',
    IMAGE_VERSION: firstVersion,
    PARALLEL_BUILD: String(options.parallelBuild),
    MAX_JOBS: String(options.maxJobs),
    BUILD_ONLY: String(options.buildOnly)
  };

  if (options.packagePath) {
    env.PACKAGE_PATH = options.packagePath;
  }

  // 传递每服务专属版本号环境变量
  if (options.serviceImageVersions) {
    for (const [serviceId, version] of Object.entries(options.serviceImageVersions)) {
      env[serviceIdToEnvKey(serviceId)] = version;
    }
  }

  // 传递模块列表，供脚本动态解析（格式: "module1:path1,module2:path2"）
  const services = resolvedConfig.services || {};
  const moduleList = Object.entries(services)
    .map(([id, svc]) => {
      // 从 pom 路径推导模块路径，如 "api-test/backend/pom.xml" -> "api-test"
      const pom = svc.pom || '';
      const modulePath = pom.replace(/\/backend\/pom\.xml$/, '').replace(/\/pom\.xml$/, '') || id;
      return `${id}:${modulePath}`;
    })
    .join(',');
  if (moduleList) {
    env.MODULE_LIST = moduleList;
    // 简单模块（无 backend 子目录）：从 pom 路径判断
    const simpleModules = Object.entries(services)
      .filter(([, svc]) => svc.pom && !svc.pom.includes('/backend/'))
      .map(([id]) => id)
      .join(',');
    if (simpleModules) {
      env.SIMPLE_MODULE_LIST = simpleModules;
    }
  }

  return env;
}

function spawnPackageProcess(options, hooks = {}) {
  const args = ['-x', options.scriptPath, ...options.services];
  const child = spawn('bash', args, {
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
