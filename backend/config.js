/**
 * 配置纯函数模块
 * 负责读取、规范化与解析配置快照，不持有运行时状态。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// 关键：将配置存储在用户主目录，解决 DMG 只读环境下的写入失败问题
const APP_DATA_DIR = path.join(os.homedir(), '.metersphere-control-panel');
const CONFIG_PATH = process.env.MS_CONFIG_PATH || path.join(APP_DATA_DIR, 'config.json');

// 确保配置目录存在
if (!fs.existsSync(APP_DATA_DIR)) {
  try {
    fs.mkdirSync(APP_DATA_DIR, { recursive: true });
  } catch (e) {
    console.error(`无法创建配置目录: ${APP_DATA_DIR}`, e);
  }
}

const CONTROL_PANEL_ROOT = path.resolve(__dirname, '..');

const DEFAULT_PORT = parseInt(process.env.MS_PORT || '3000', 10);
// 关键：在 Electron 打包环境 (asar / .app 下)，__dirname 会指向应用内部
// 这时不能向上两级去找 metersphere 项目根目录，而是直接给出留空（让用户自行选择）或默认定位到 ~/Workspace
const isElectronPackaged = process.env.NODE_ENV !== 'development' && __dirname.includes('app.asar') || __dirname.includes('Resources/app');
const DEFAULT_PROJECT_ROOT = process.env.MS_PROJECT_ROOT || (isElectronPackaged ? '' : path.resolve(CONTROL_PANEL_ROOT, '..'));
const DEFAULT_MAX_LOG_LINES = parseInt(process.env.MS_MAX_LOG_LINES || '1000', 10);
const DEFAULT_SERVICE_START_ORDER = 99;
const DEFAULT_HEALTH_CHECK = '/actuator/health';

function detectNpmPath() {
  try {
    const whichCmd = os.platform() === 'win32' ? 'where npm' : 'which npm';
    const output = execSync(whichCmd, { encoding: 'utf8' }).trim();
    return output.split('\n')[0];
  } catch (e) {
    return '';
  }
}

function detectMaxJobs() {
  const cpus = os.cpus().length;
  return Math.max(1, cpus - 1);
}

function detectPropertiesPath(projectRoot, filename) {
  if (!projectRoot || !fs.existsSync(projectRoot)) return '';
  
  // 约定优于配置：通常在项目根目录同级的 conf 目录下
  const standardPath = path.resolve(projectRoot, '../conf', filename);
  if (fs.existsSync(standardPath)) {
    return standardPath;
  }
  
  // 备选路径：项目根目录下的 conf
  const altPath = path.resolve(projectRoot, 'conf', filename);
  if (fs.existsSync(altPath)) {
    return altPath;
  }
  
  return '';
}

const DEFAULT_PROPERTIES_METERSPHERE = process.env.MS_PROPERTIES_PATH || '';
const DEFAULT_PROPERTIES_REDISSON = process.env.MS_REDISSON_PATH || '';

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
  const config = rawPackage && typeof rawPackage === 'object' && !Array.isArray(rawPackage)
    ? rawPackage
    : {};

  const normalized = {
    ...config
  };

  normalized.scriptPath = normalizeString(config.scriptPath, '');
  normalized.packagePath = normalizeString(config.packagePath, '');
  normalized.defaultServices = Array.isArray(config.defaultServices)
    ? [...new Set(config.defaultServices.map((item) => normalizeString(item)).filter(Boolean))]
    : [];
  normalized.parallelBuild = normalizeBoolean(config.parallelBuild, true);
  normalized.buildOnly = normalizeBoolean(config.buildOnly, false);
  normalized.maxJobs = normalizeNumericField(config.maxJobs, detectMaxJobs());

  return normalized;
}

function normalizeTunnelConfig(rawConfig = {}) {
  const config = rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
    ? rawConfig
    : {};

  return {
    remoteHost: normalizeString(config.remoteHost, '8.152.216.176'),
    remoteUser: normalizeString(config.remoteUser, 'root')
  };
}

function normalizeWaifuConfig(rawConfig = {}) {
  const config = rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
    ? rawConfig
    : {};

  return {
    enabled: normalizeBoolean(config.enabled, true),
    apiKey: normalizeString(config.apiKey, ''),
    baseUrl: normalizeString(config.baseUrl, ''),
    model: normalizeString(config.model, 'qwen3.5-plus'),
    systemPrompt: normalizeString(config.systemPrompt, '')
  };
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
    enabled: normalizeBoolean(service.enabled, true),
    jvmOptions: normalizeString(service.jvmOptions, ''),
    imageVersion: normalizeString(service.imageVersion, '')
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

function normalizeSshTunnelConfig(rawTunnel = {}) {
  const tunnel = rawTunnel && typeof rawTunnel === 'object' && !Array.isArray(rawTunnel)
    ? rawTunnel
    : {};

  let ports = [];
  if (Array.isArray(tunnel.ports)) {
    ports = tunnel.ports
      .map(p => ({
        remotePort: normalizeNumericField(p.remotePort, null),
        localPort: normalizeNumericField(p.localPort, null),
        description: normalizeString(p.description, '')
      }))
      .filter(p => p.remotePort && p.localPort);
  }

  return {
    ports: ports.length > 0 ? ports : null
  };
}

function normalizeEditableConfig(rawConfig = {}) {
  const config = rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
    ? rawConfig
    : {};

  const projectRoot = normalizeString(config.projectRoot, DEFAULT_PROJECT_ROOT);
  const npmPath = normalizeString(config.npmPath, detectNpmPath());

  return {
    port: normalizeNumericField(config.port, DEFAULT_PORT),
    projectRoot,
    npmPath,
    maxLogLines: normalizeNumericField(config.maxLogLines, DEFAULT_MAX_LOG_LINES),
    jvmOptions: normalizeString(config.jvmOptions, '-Xms256m -Xmx512m'),
    redis: config.redis || {},
    properties: {
      metersphere: normalizeString(config.properties?.metersphere, DEFAULT_PROPERTIES_METERSPHERE || '/opt/metersphere/conf/metersphere.properties'),
      redisson: normalizeString(config.properties?.redisson, DEFAULT_PROPERTIES_REDISSON || '/opt/metersphere/conf/redisson.yml')
    },
    tunnel: normalizeTunnelConfig(config.tunnel || {}),
    waifu: normalizeWaifuConfig(config.waifu || {}),
    claudeCode: normalizeClaudeCodeConfig(config.claudeCode || {}),
    sshTunnel: normalizeSshTunnelConfig(config.sshTunnel || {}),
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
    .sort((a, b) => {
      // 先按 startOrder 排序
      const orderDiff = a.startOrder - b.startOrder;
      if (orderDiff !== 0) {
        return orderDiff;
      }
      // startOrder 相同时，将 gateway 排在最后，因为它依赖所有其他服务
      const aIsGateway = a.id.includes('gateway') || a.name.toLowerCase().includes('gateway');
      const bIsGateway = b.id.includes('gateway') || b.name.toLowerCase().includes('gateway');
      if (aIsGateway && !bIsGateway) return 1;
      if (!aIsGateway && bIsGateway) return -1;
      // 其他情况按名称排序
      return a.name.localeCompare(b.name);
    });
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
  
  // 如果 services 为空（刚填入路径还未扫描），只校验 mvnw 是否存在即可
  if (Object.keys(services).length === 0) {
    return hasMavenWrapper;
  }

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
    jvmOptions: editable.jvmOptions,
    tunnel: editable.tunnel,
    properties: editable.properties,
    waifu: editable.waifu,
    claudeCode: editable.claudeCode,
    sshTunnel: editable.sshTunnel,
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
  if (!fs.existsSync(configPath)) {
    const defaultConfig = {};
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
    return defaultConfig;
  }
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`解析配置文件失败 (${configPath}):`, err);
    return {};
  }
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
  normalizeTunnelConfig,
  normalizeWaifuConfig,
  normalizeClaudeCodeConfig,
  normalizePackageConfig,
  normalizeServiceDefinition,
  normalizeServices,
  normalizeSshTunnelConfig,
  buildServiceCatalog,
  buildFrontendModules,
  buildResolvedConfig,
  buildConfigSnapshot,
  isValidProjectRoot,
  resolveProjectRoot
};
