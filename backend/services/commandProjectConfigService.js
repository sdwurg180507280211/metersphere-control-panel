const fs = require('fs');
const configFileStore = require('../utils/configFileStore');
const path = require('path');
const crypto = require('crypto');
const { CONFIG_PATH, loadConfigFromFile } = require('../config');
const { createAppError } = require('../utils/errors');
const { ensureParentDirectory, secureFile, copyPrivateFile, writePrivateText } = require('../utils/privateFile');

const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const COMMAND_PROJECT_TYPE = 'command';

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function readConfig() {
  secureFile(CONFIG_PATH);
  return configFileStore.read(CONFIG_PATH);
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

function getCommandDefinitions(raw = readConfig()) {
  if (hasOwn(raw, 'projects')) {
    return Object.fromEntries(
      Object.entries(getPersistedProjects(raw)).filter(([, definition]) => (
        isObjectRecord(definition) && definition.type === COMMAND_PROJECT_TYPE
      ))
    );
  }

  return Object.fromEntries(
    Object.entries(getLegacyDefinitions(raw)).map(([id, definition]) => [id, toCommandDefinition(definition)])
  );
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

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function createUniqueId(name, definitions) {
  const base = slugify(name) || `local-app-${crypto.randomUUID().slice(0, 8)}`;
  if (!definitions[base]) return base;

  for (let index = 2; index < 1000; index += 1) {
    const suffix = `-${index}`;
    const candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`;
    if (!definitions[candidate]) return candidate;
  }

  return `local-app-${crypto.randomUUID().slice(0, 8)}`;
}

function normalizePort(value) {
  if (value === '' || value === null || value === undefined) return null;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw createAppError(400, 'DESKTOP_APP_PORT_INVALID', '状态端口必须是 1-65535 的整数');
  }
  return port;
}

function normalizeDefinition(input = {}, definitions = {}, reservedDefinitions = definitions) {
  const requestedType = input.type === undefined || input.type === null || input.type === ''
    ? COMMAND_PROJECT_TYPE
    : String(input.type).trim();
  if (requestedType !== COMMAND_PROJECT_TYPE) {
    throw createAppError(400, 'DESKTOP_APP_TYPE_UNSUPPORTED', '当前仅支持 command 类型项目', { type: requestedType });
  }

  const name = String(input.name || '').trim();
  const startCommand = String(input.startCommand || '').trim();
  const stopCommand = String(input.stopCommand || '').trim();
  const statusPort = normalizePort(input.statusPort);
  const accessUrl = String(input.accessUrl || '').trim();
  if (accessUrl) {
    let parsed;
    try { parsed = new URL(accessUrl); } catch {}
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw createAppError(400, 'DESKTOP_APP_URL_INVALID', '访问地址必须是有效的 HTTP 或 HTTPS 地址，且不能包含账号密码');
    }
  }

  if (!name) throw createAppError(400, 'DESKTOP_APP_NAME_MISSING', '请填写服务名称');
  if (!startCommand) throw createAppError(400, 'DESKTOP_APP_START_COMMAND_MISSING', '请填写启动命令');
  if (!stopCommand) throw createAppError(400, 'DESKTOP_APP_STOP_COMMAND_MISSING', '请填写关闭命令');

  let id = String(input.id || '').trim().toLowerCase();
  if (id) {
    if (!PROJECT_ID_PATTERN.test(id)) throw createAppError(400, 'DESKTOP_APP_ID_INVALID', '本地应用 ID 格式无效');
    if (!definitions[id]) throw createAppError(404, 'DESKTOP_APP_NOT_FOUND', `未找到桌面应用: ${id}`, { appId: id });
  } else {
    id = createUniqueId(name, reservedDefinitions);
  }

  return {
    id,
    definition: {
      name,
      type: COMMAND_PROJECT_TYPE,
      startCommand,
      stopCommand,
      ...(accessUrl ? { accessUrl } : {}),
      ...(statusPort ? { statusPort } : {})
    }
  };
}

function getProjects() {
  const definitions = getCommandDefinitions();
  return Object.entries(definitions).map(([id, raw = {}]) => ({
    id,
    type: COMMAND_PROJECT_TYPE,
    name: String(raw.name || id),
    startCommand: String(raw.startCommand || ''),
    stopCommand: String(raw.stopCommand || ''),
    ...(raw.accessUrl ? { accessUrl: String(raw.accessUrl) } : {}),
    statusPort: Number.isInteger(Number(raw.statusPort)) ? Number(raw.statusPort) : null
  }));
}

function saveProject(input) {
  if (input?.id) require('./commandProjectService').assertIdle(input.id);
  let result;
  configFileStore.transaction(CONFIG_PATH, (raw) => {
    const definitions = getCommandDefinitions(raw);
    const projects = materializeProjects(raw);
    const { id, definition } = normalizeDefinition(input, definitions, projects);
    projects[id] = definition;
    result = { id, ...definition };
    return raw;
  });
  return result;
}

function removeProject(id) {
  const projectId = String(id || '').trim().toLowerCase();
  require('./commandProjectService').assertIdle(projectId);
  configFileStore.transaction(CONFIG_PATH, (raw) => {
    if (!getCommandDefinitions(raw)[projectId]) {
      throw createAppError(404, 'DESKTOP_APP_NOT_FOUND', `未找到桌面应用: ${projectId}`, { appId: projectId });
    }
    const projects = materializeProjects(raw);
    delete projects[projectId];
    return raw;
  });
  return { id: projectId };
}

function hasProject(id) {
  return Boolean(getCommandDefinitions()[String(id || '').trim().toLowerCase()]);
}

module.exports = {
  getProjects,
  saveProject,
  removeProject,
  hasProject
};
