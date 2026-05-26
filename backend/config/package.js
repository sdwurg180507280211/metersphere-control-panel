const path = require('path');
const { DEFAULT_PROJECT_ROOT } = require('../config');

const CONTROL_PANEL_ROOT = path.resolve(__dirname, '../..');

function getPackageServiceIds(services = {}) {
  return Object.keys(services);
}

const PACKAGE_CAPABILITIES = {
  buildOnly: true,
  packagePath: true,
  recentImageVersions: true,
  explicitAllServicesOnly: true
};

const DEFAULT_SEED_VERSION = 'v2.10.26.01-lts';

const BASE_PACKAGE_DEFAULTS = {
  services: ['api-test'],
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
    parallelBuild: packageConfig.parallelBuild ?? BASE_PACKAGE_DEFAULTS.parallelBuild,
    maxJobs: packageConfig.maxJobs ?? BASE_PACKAGE_DEFAULTS.maxJobs,
    buildOnly: packageConfig.buildOnly ?? BASE_PACKAGE_DEFAULTS.buildOnly,
    packagePath: packageConfig.packagePath || BASE_PACKAGE_DEFAULTS.packagePath
  };
}

function getPackageServiceOptions(resolvedConfig = {}) {
  const services = resolvedConfig.services || {};

  return getPackageServiceIds(services).map((id) => ({
    id,
    name: services[id]?.name || id,
    description: services[id]?.pom || null,
    enabled: services[id]?.enabled !== false,
    imageVersion: services[id]?.imageVersion || ''
  }));
}

function getDetailedPackageScriptCandidates({ resolvedConfig = {}, explicitPath = null } = {}) {
  const configuredPath = resolvedConfig.package?.scriptPath || null;
  const projectRoot = resolvedConfig.projectRoot || path.resolve(CONTROL_PANEL_ROOT, DEFAULT_PROJECT_ROOT);

  return [
    explicitPath ? { source: 'request', path: explicitPath } : null,
    process.env.MS_PACKAGE_SCRIPT_PATH ? { source: 'env:MS_PACKAGE_SCRIPT_PATH', path: process.env.MS_PACKAGE_SCRIPT_PATH } : null,
    process.env.PACKAGE_SCRIPT_PATH ? { source: 'env:PACKAGE_SCRIPT_PATH', path: process.env.PACKAGE_SCRIPT_PATH } : null,
    configuredPath ? { source: 'config:package.scriptPath', path: configuredPath } : null,
    { source: 'controlPanel:default', path: path.resolve(CONTROL_PANEL_ROOT, 'scripts/metersphere-build.sh') },
    { source: 'projectRoot:legacy', path: path.resolve(projectRoot, '打包/metersphere-build.sh') }
  ].filter(Boolean);
}

function getPackageScriptCandidates(options = {}) {
  return getDetailedPackageScriptCandidates(options).map((item) => item.path);
}

module.exports = {
  CONTROL_PANEL_ROOT,
  DEFAULT_SEED_VERSION,
  getPackageServiceIds,
  PACKAGE_CAPABILITIES,
  PACKAGE_RESOURCE_KEY: 'package:run',
  PACKAGE_HEARTBEAT_INTERVAL_MS: 15000,
  getPackageDefaults,
  getPackageServiceOptions,
  getDetailedPackageScriptCandidates,
  getPackageScriptCandidates
};
