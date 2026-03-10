const path = require('path');

const CONTROL_PANEL_ROOT = path.resolve(__dirname, '../..');

const PACKAGE_SERVICE_IDS = [
  'gateway',
  'eureka',
  'test-track',
  'api-test',
  'performance-test',
  'project-management',
  'report-stat',
  'system-setting',
  'workstation'
];

const PACKAGE_CAPABILITIES = {
  buildOnly: true,
  packagePath: true,
  recentImageVersions: true,
  explicitAllServicesOnly: true
};

const BASE_PACKAGE_DEFAULTS = {
  services: ['api-test'],
  imageVersion: 'v2.10.26.09-lts',
  parallelBuild: true,
  maxJobs: 4,
  buildOnly: false,
  packagePath: ''
};

function getPackageDefaults(packageConfig = {}) {
  return {
    services: Array.isArray(packageConfig.defaultServices) && packageConfig.defaultServices.length > 0
      ? packageConfig.defaultServices
      : BASE_PACKAGE_DEFAULTS.services,
    imageVersion: packageConfig.imageVersion || BASE_PACKAGE_DEFAULTS.imageVersion,
    parallelBuild: packageConfig.parallelBuild ?? BASE_PACKAGE_DEFAULTS.parallelBuild,
    maxJobs: packageConfig.maxJobs ?? BASE_PACKAGE_DEFAULTS.maxJobs,
    buildOnly: packageConfig.buildOnly ?? BASE_PACKAGE_DEFAULTS.buildOnly,
    packagePath: packageConfig.packagePath || BASE_PACKAGE_DEFAULTS.packagePath
  };
}

function getPackageServiceOptions(resolvedConfig = {}) {
  const services = resolvedConfig.services || {};

  return PACKAGE_SERVICE_IDS.map((id) => ({
    id,
    name: services[id]?.name || id,
    description: services[id]?.pom || null,
    enabled: services[id]?.enabled !== false
  }));
}

function getDetailedPackageScriptCandidates({ resolvedConfig = {}, explicitPath = null } = {}) {
  const configuredPath = resolvedConfig.package?.scriptPath || null;
  const projectRoot = resolvedConfig.projectRoot || path.resolve(CONTROL_PANEL_ROOT, '../metersphere');

  return [
    explicitPath ? { source: 'request', path: explicitPath } : null,
    process.env.MS_PACKAGE_SCRIPT_PATH ? { source: 'env:MS_PACKAGE_SCRIPT_PATH', path: process.env.MS_PACKAGE_SCRIPT_PATH } : null,
    process.env.PACKAGE_SCRIPT_PATH ? { source: 'env:PACKAGE_SCRIPT_PATH', path: process.env.PACKAGE_SCRIPT_PATH } : null,
    configuredPath ? { source: 'config:package.scriptPath', path: configuredPath } : null,
    { source: 'projectRoot:default', path: path.resolve(projectRoot, '打包/metersphere-build.sh') },
    { source: 'fallback:../metersphere', path: path.resolve(CONTROL_PANEL_ROOT, '../metersphere/打包/metersphere-build.sh') }
  ].filter(Boolean);
}

function getPackageScriptCandidates(options = {}) {
  return getDetailedPackageScriptCandidates(options).map((item) => item.path);
}

module.exports = {
  CONTROL_PANEL_ROOT,
  PACKAGE_SERVICE_IDS,
  PACKAGE_CAPABILITIES,
  PACKAGE_RESOURCE_KEY: 'package:run',
  PACKAGE_HEARTBEAT_INTERVAL_MS: 15000,
  getPackageDefaults,
  getPackageServiceOptions,
  getDetailedPackageScriptCandidates,
  getPackageScriptCandidates
};
