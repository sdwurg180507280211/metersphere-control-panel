/**
 * 配置模块
 */
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../config.json');
const CONTROL_PANEL_ROOT = path.resolve(__dirname, '..');

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

function buildServiceCatalog(services) {
  return Object.entries(services)
    .map(([id, service]) => ({
      id,
      name: service.name || id,
      pom: service.pom,
      port: service.port,
      healthCheck: service.healthCheck || '/',
      startOrder: service.startOrder || 99
    }))
    .sort((a, b) => a.startOrder - b.startOrder || a.name.localeCompare(b.name));
}

function buildFrontendModules(services) {
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

function isValidProjectRoot(projectRoot, services) {
  if (!projectRoot || !fs.existsSync(projectRoot)) {
    return false;
  }

  const hasMavenWrapper = fs.existsSync(path.join(projectRoot, 'mvnw'));
  const hasAtLeastOneServicePom = Object.values(services).some((service) => (
    service?.pom && fs.existsSync(path.join(projectRoot, service.pom))
  ));

  return hasMavenWrapper && hasAtLeastOneServicePom;
}

function resolveProjectRoot(projectRootConfig, services) {
  const candidates = [
    path.resolve(CONTROL_PANEL_ROOT, projectRootConfig || '..'),
    path.resolve(CONTROL_PANEL_ROOT, '../metersphere'),
    path.resolve(CONTROL_PANEL_ROOT, '..')
  ];

  const uniqueCandidates = [...new Set(candidates)];
  const detected = uniqueCandidates.find((candidate) => isValidProjectRoot(candidate, services));

  if (detected) {
    return detected;
  }

  return uniqueCandidates[0];
}

function loadConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const services = config.services || {};
    const serviceCatalog = buildServiceCatalog(services);
    const frontendModules = buildFrontendModules(services);
    const projectRoot = resolveProjectRoot(config.projectRoot, services);

    return {
      port: config.port || 3000,
      projectRoot,
      maxLogLines: config.maxLogLines || 1000,
      services,
      serviceCatalog,
      frontendModules,
      frontendModulesById: Object.fromEntries(frontendModules.map((item) => [item.id, item]))
    };
  } catch (error) {
    console.error('加载配置文件失败:', error.message);
    process.exit(1);
  }
}

module.exports = loadConfig();
