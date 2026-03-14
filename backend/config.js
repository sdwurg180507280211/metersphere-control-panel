/**
 * 配置纯函数模块
 * 负责读取、规范化与解析配置快照，不持有运行时状态。
 */
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = process.env.MS_CONFIG_PATH || path.join(__dirname, '../config.json');
const CONTROL_PANEL_ROOT = path.resolve(__dirname, '..');

const DEFAULT_PORT = 3000;
const DEFAULT_PROJECT_ROOT = '/Users/edy/ideaProjects/metersphere';
const DEFAULT_MAX_LOG_LINES = 1000;
const DEFAULT_SERVICE_START_ORDER = 99;
const DEFAULT_HEALTH_CHECK = '/actuator/health';
const DEFAULT_PROPERTIES_METERSPHERE = '/opt/metersphere/conf/metersphere.properties';
const DEFAULT_PROPERTIES_REDISSON = '/opt/metersphere/conf/redisson.yml';

const FRONTEND_SERVICE_IDS = [
  'system-setting',
  'project-management',
  'test-track',
  'api-test',
  'performance-test',
  'report-stat',
  'workstation',
  'analytics-stat'
];

const EXTRA_FRONTEND_MODULES = [
  {
    id: 'sdk-parent',
    name: 'SDK Parent (Gateway)',
    serviceId: 'gateway',
    frontendPath: 'framework/sdk-parent/frontend',
    targetPath: 'framework/gateway/src/main/resources/static'
  }
];

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function normalizeString(value, fallback = '') {
  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = String(value).trim();
  return normalized || fallback;
}


function normalizeNumericField(value, fallback = null) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : value;
}

function normalizeBoolean(value, fallback = true) {
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

function normalizePackageConfig(rawPackage = {}) {
  if (!rawPackage || typeof rawPackage !== 'object' || Array.isArray(rawPackage)) {
    return {};
  }

  const normalized = {
    ...rawPackage
  };

  if (Object.prototype.hasOwnProperty.call(rawPackage, 'scriptPath')) {
    normalized.scriptPath = normalizeString(rawPackage.scriptPath, '');
  }

  if (Object.prototype.hasOwnProperty.call(rawPackage, 'imageVersion')) {
    normalized.imageVersion = normalizeString(rawPackage.imageVersion, '');
  }

  if (Object.prototype.hasOwnProperty.call(rawPackage, 'packagePath')) {
    normalized.packagePath = normalizeString(rawPackage.packagePath, '');
  }

  if (Object.prototype.hasOwnProperty.call(rawPackage, 'defaultServices')) {
    normalized.defaultServices = Array.isArray(rawPackage.defaultServices)
      ? [...new Set(rawPackage.defaultServices.map((item) => normalizeString(item)).filter(Boolean))]
      : [];
  }

  if (Object.prototype.hasOwnProperty.call(rawPackage, 'parallelBuild')) {
    normalized.parallelBuild = normalizeBoolean(rawPackage.parallelBuild, true);
  }

  if (Object.prototype.hasOwnProperty.call(rawPackage, 'buildOnly')) {
    normalized.buildOnly = normalizeBoolean(rawPackage.buildOnly, false);
  }

  if (Object.prototype.hasOwnProperty.call(rawPackage, 'maxJobs')) {
    normalized.maxJobs = normalizeNumericField(rawPackage.maxJobs, null);
  }

  return normalized;
}

function normalizeClaudeCodeConfig(rawConfig = {}) {
  const config = rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
    ? rawConfig
    : {};

  return {
    baseUrl: normalizeString(config.baseUrl, ''),
    authToken: normalizeString(config.authToken, ''),
    model: normalizeString(config.model, ''),
    smallFastModel: normalizeString(config.smallFastModel, '')
  };
}

function normalizeServiceDefinition(serviceId, rawService = {}) {
  const service = rawService && typeof rawService === 'object' && !Array.isArray(rawService)
    ? rawService
    : {};

  const port = normalizeNumericField(service.port, null);
  const healthCheckPort = normalizeNumericField(service.healthCheckPort, port);
  const healthCheck = normalizeString(service.healthCheck, DEFAULT_HEALTH_CHECK);

  return {
    name: normalizeString(service.name, serviceId),
    pom: normalizeString(service.pom, ''),
    port,
    healthCheckPort,
    healthCheck,
    startOrder: normalizeNumericField(service.startOrder, DEFAULT_SERVICE_START_ORDER),
    enabled: normalizeBoolean(service.enabled, true)
  };
}

function normalizeServices(rawServices = {}) {
  if (!rawServices || typeof rawServices !== 'object' || Array.isArray(rawServices)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawServices).map(([serviceId, service]) => [serviceId, normalizeServiceDefinition(serviceId, service)])
  );
}

function normalizeEditableConfig(rawConfig = {}) {
  const config = rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
    ? rawConfig
    : {};

  return {
    port: normalizeNumericField(config.port, DEFAULT_PORT),
    projectRoot: normalizeString(config.projectRoot, DEFAULT_PROJECT_ROOT),
    npmPath: normalizeString(config.npmPath, ''),
    maxLogLines: normalizeNumericField(config.maxLogLines, DEFAULT_MAX_LOG_LINES),
    redis: config.redis || {},
    properties: {
      metersphere: normalizeString(config.properties?.metersphere, DEFAULT_PROPERTIES_METERSPHERE),
      redisson: normalizeString(config.properties?.redisson, DEFAULT_PROPERTIES_REDISSON)
    },
    claudeCode: normalizeClaudeCodeConfig(config.claudeCode || {}),
    package: normalizePackageConfig(config.package || {}),
    services: normalizeServices(config.services || {})
  };
}

function buildServiceCatalog(services = {}) {
  return Object.entries(services)
    .map(([id, service]) => ({
      id,
      name: service.name || id,
      pom: service.pom,
      port: service.port,
      healthCheckPort: service.healthCheckPort || service.port,
      healthCheck: service.healthCheck || DEFAULT_HEALTH_CHECK,
      startOrder: service.startOrder || DEFAULT_SERVICE_START_ORDER,
      enabled: service.enabled !== false
    }))
    .sort((a, b) => a.startOrder - b.startOrder || a.name.localeCompare(b.name));
}

function buildFrontendModules(services = {}) {
  const modules = FRONTEND_SERVICE_IDS
    .filter((id) => services[id])
    .map((id) => ({
      id,
      name: services[id].name || id,
      serviceId: id,
      frontendPath: `${id}/frontend`,
      targetPath: `${id}/backend/src/main/resources/static`
    }));

  return [...modules, ...EXTRA_FRONTEND_MODULES];
}

function isValidProjectRoot(projectRoot, services = {}) {
  if (!projectRoot || !fs.existsSync(projectRoot)) {
    return false;
  }

  const hasMavenWrapper = fs.existsSync(path.join(projectRoot, 'mvnw'));
  const hasAtLeastOneServicePom = Object.values(services).some((service) => (
    service?.pom && fs.existsSync(path.join(projectRoot, service.pom))
  ));

  return hasMavenWrapper && hasAtLeastOneServicePom;
}

function resolveProjectRoot(projectRootConfig, services = {}, options = {}) {
  const normalizedInput = normalizeString(projectRootConfig, DEFAULT_PROJECT_ROOT);
  const configuredCandidate = path.resolve(CONTROL_PANEL_ROOT, normalizedInput || DEFAULT_PROJECT_ROOT);
  const allowFallback = options.allowFallback !== false
    && (!options.onlyFallbackForDefault || normalizedInput === DEFAULT_PROJECT_ROOT);

  if (!allowFallback) {
    return configuredCandidate;
  }

  const candidates = [configuredCandidate];

  const uniqueCandidates = [...new Set(candidates)];
  const detected = uniqueCandidates.find((candidate) => isValidProjectRoot(candidate, services));

  return detected || uniqueCandidates[0];
}

function buildResolvedConfig(editableConfig = {}, options = {}) {
  const editable = normalizeEditableConfig(editableConfig);
  const serviceCatalog = buildServiceCatalog(editable.services);
  const frontendModules = buildFrontendModules(editable.services);
  const projectRoot = resolveProjectRoot(editable.projectRoot, editable.services, {
    allowFallback: options.allowProjectRootFallback !== false,
    onlyFallbackForDefault: options.onlyFallbackForDefault === true
  });

  return {
    port: editable.port,
    projectRoot,
    projectRootInput: editable.projectRoot,
    npmPath: editable.npmPath,
    maxLogLines: editable.maxLogLines,
    properties: editable.properties,
    claudeCode: editable.claudeCode,
    package: editable.package,
    services: editable.services,
    serviceCatalog,
    frontendModules,
    frontendModulesById: Object.fromEntries(frontendModules.map((item) => [item.id, item]))
  };
}

function buildConfigSnapshot(rawConfig = {}) {
  const editable = normalizeEditableConfig(rawConfig);
  const resolved = buildResolvedConfig(editable);

  return {
    editable,
    resolved
  };
}

function loadConfigFromFile(configPath = CONFIG_PATH) {
  const content = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(content);
}

module.exports = {
  CONFIG_PATH,
  CONTROL_PANEL_ROOT,
  DEFAULT_PORT,
  DEFAULT_PROJECT_ROOT,
  DEFAULT_MAX_LOG_LINES,
  DEFAULT_SERVICE_START_ORDER,
  DEFAULT_HEALTH_CHECK,
  DEFAULT_PROPERTIES_METERSPHERE,
  DEFAULT_PROPERTIES_REDISSON,
  FRONTEND_SERVICE_IDS,
  EXTRA_FRONTEND_MODULES,
  loadConfigFromFile,
  normalizeEditableConfig,
  normalizeClaudeCodeConfig,
  normalizePackageConfig,
  normalizeServiceDefinition,
  normalizeServices,
  buildServiceCatalog,
  buildFrontendModules,
  buildResolvedConfig,
  buildConfigSnapshot,
  isValidProjectRoot,
  resolveProjectRoot
};
