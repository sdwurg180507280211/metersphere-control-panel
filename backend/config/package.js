const path = require('path');
const config = require('../config');

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

const PACKAGE_SERVICE_OPTIONS = PACKAGE_SERVICE_IDS.map((id) => ({
  id,
  name: config.services[id]?.name || id,
  description: config.services[id]?.pom || null
}));

const PACKAGE_DEFAULTS = {
  services: ['api-test'],
  imageVersion: 'v2.10.26.09-lts',
  parallelBuild: true,
  maxJobs: 4,
  buildOnly: false,
  packagePath: ''
};

const PACKAGE_CAPABILITIES = {
  buildOnly: true,
  packagePath: true,
  recentImageVersions: true,
  explicitAllServicesOnly: true
};

function getPackageScriptCandidates(explicitPath = null) {
  const configuredPath = config.package?.scriptPath || null;

  return [
    explicitPath,
    process.env.MS_PACKAGE_SCRIPT_PATH,
    process.env.PACKAGE_SCRIPT_PATH,
    configuredPath,
    path.resolve(config.projectRoot, '打包/metersphere-build.sh'),
    path.resolve(CONTROL_PANEL_ROOT, '../metersphere/打包/metersphere-build.sh')
  ].filter(Boolean);
}

module.exports = {
  CONTROL_PANEL_ROOT,
  PACKAGE_SERVICE_IDS,
  PACKAGE_SERVICE_OPTIONS,
  PACKAGE_DEFAULTS,
  PACKAGE_CAPABILITIES,
  PACKAGE_RESOURCE_KEY: 'package:run',
  PACKAGE_HEARTBEAT_INTERVAL_MS: 15000,
  getPackageScriptCandidates
};
