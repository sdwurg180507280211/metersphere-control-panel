const fs = require('fs');
const { CONFIG_PATH, loadConfigFromFile } = require('../config');
const { createAppError } = require('../utils/errors');
const { ensureParentDirectory, secureFile, copyPrivateFile, writePrivateText } = require('../utils/privateFile');

const METERSPHERE_PROJECT_ID = 'metersphere';
const METERSPHERE_PROJECT_TYPE = 'metersphere';
const DEFAULT_METERSPHERE_PROJECT_NAME = 'MeterSphere';
const COMMAND_PROJECT_TYPE = 'command';

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function readConfig() {
  secureFile(CONFIG_PATH);
  return loadConfigFromFile(CONFIG_PATH) || {};
}

function writeConfig(rawConfig) {
  ensureParentDirectory(CONFIG_PATH);
  const tempPath = `${CONFIG_PATH}.desktop.tmp`;
  const backupPath = `${CONFIG_PATH}.bak`;

  if (fs.existsSync(CONFIG_PATH)) {
    copyPrivateFile(CONFIG_PATH, backupPath);
  }

  writePrivateText(tempPath, `${JSON.stringify(rawConfig, null, 2)}\n`);
  fs.renameSync(tempPath, CONFIG_PATH);
  secureFile(CONFIG_PATH);
}

function getPersistedProjects(raw) {
  return isObjectRecord(raw.projects) ? raw.projects : {};
}

function getLegacyDefinitions(raw) {
  return isObjectRecord(raw.desktopApplications) ? raw.desktopApplications : {};
}

function toCommandDefinition(rawDefinition = {}) {
  const definition = isObjectRecord(rawDefinition) ? rawDefinition : {};
  return {
    ...definition,
    type: COMMAND_PROJECT_TYPE
  };
}

function normalizeMeterSphereDefinition(rawDefinition = {}) {
  const definition = isObjectRecord(rawDefinition) ? rawDefinition : {};
  const name = String(definition.name || '').trim() || DEFAULT_METERSPHERE_PROJECT_NAME;
  return {
    type: METERSPHERE_PROJECT_TYPE,
    name
  };
}

function toProjectResponse(definition, persisted) {
  return {
    project: {
      id: METERSPHERE_PROJECT_ID,
      ...normalizeMeterSphereDefinition(definition)
    },
    persisted: Boolean(persisted)
  };
}

function getProject() {
  const raw = readConfig();
  const projects = getPersistedProjects(raw);
  const definition = projects[METERSPHERE_PROJECT_ID];

  if (isObjectRecord(definition) && definition.type === METERSPHERE_PROJECT_TYPE) {
    return toProjectResponse(definition, true);
  }

  return toProjectResponse({}, false);
}

function materializeProjects(raw) {
  const projects = hasOwn(raw, 'projects')
    ? { ...getPersistedProjects(raw) }
    : Object.fromEntries(
      Object.entries(getLegacyDefinitions(raw)).map(([id, definition]) => [id, toCommandDefinition(definition)])
    );

  raw.projects = projects;
  delete raw.desktopApplications;
  return projects;
}

function saveProject(input = {}) {
  const raw = readConfig();
  const existingProjects = getPersistedProjects(raw);
  const existing = existingProjects[METERSPHERE_PROJECT_ID];

  if (isObjectRecord(existing) && existing.type && existing.type !== METERSPHERE_PROJECT_TYPE) {
    throw createAppError(
      409,
      'METERSPHERE_PROJECT_ID_CONFLICT',
      'projects.metersphere 已被其他项目类型占用',
      { projectId: METERSPHERE_PROJECT_ID, type: existing.type }
    );
  }

  const projects = materializeProjects(raw);
  const definition = normalizeMeterSphereDefinition(input);
  projects[METERSPHERE_PROJECT_ID] = definition;
  raw.projects = projects;
  writeConfig(raw);

  return toProjectResponse(definition, true);
}

module.exports = {
  getProject,
  saveProject
};
