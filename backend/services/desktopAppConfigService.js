const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CONFIG_PATH, loadConfigFromFile } = require('../config');
const { createAppError } = require('../utils/errors');
const { ensureParentDirectory, secureFile, copyPrivateFile, writePrivateText } = require('../utils/privateFile');

const APP_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
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

function getProjects(raw) {
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
      Object.entries(getProjects(raw)).filter(([, definition]) => (
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
    ? { ...getProjects(raw) }
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

  if (!name) throw createAppError(400, 'DESKTOP_APP_NAME_MISSING', '请填写服务名称');
  if (!startCommand) throw createAppError(400, 'DESKTOP_APP_START_COMMAND_MISSING', '请填写启动命令');
  if (!stopCommand) throw createAppError(400, 'DESKTOP_APP_STOP_COMMAND_MISSING', '请填写关闭命令');

  let id = String(input.id || '').trim().toLowerCase();
  if (id) {
    if (!APP_ID_PATTERN.test(id)) throw createAppError(400, 'DESKTOP_APP_ID_INVALID', '本地应用 ID 格式无效');
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
      ...(statusPort ? { statusPort } : {})
    }
  };
}

function getApps() {
  const definitions = getCommandDefinitions();
  return Object.entries(definitions).map(([id, raw = {}]) => ({
    id,
    type: COMMAND_PROJECT_TYPE,
    name: String(raw.name || id),
    startCommand: String(raw.startCommand || ''),
    stopCommand: String(raw.stopCommand || ''),
    statusPort: Number.isInteger(Number(raw.statusPort)) ? Number(raw.statusPort) : null
  }));
}

function saveApp(input) {
  const raw = readConfig();
  const definitions = getCommandDefinitions(raw);
  const projects = materializeProjects(raw);
  const { id, definition } = normalizeDefinition(input, definitions, projects);
  raw.projects[id] = definition;
  writeConfig(raw);
  return { id, ...definition };
}

function removeApp(id) {
  const appId = String(id || '').trim().toLowerCase();
  const raw = readConfig();
  const definitions = getCommandDefinitions(raw);
  if (!definitions[appId]) throw createAppError(404, 'DESKTOP_APP_NOT_FOUND', `未找到桌面应用: ${appId}`, { appId });

  const projects = materializeProjects(raw);
  delete projects[appId];
  raw.projects = projects;
  writeConfig(raw);
  return { id: appId };
}

function hasApp(id) {
  return Boolean(getCommandDefinitions()[String(id || '').trim().toLowerCase()]);
}

module.exports = { getApps, saveApp, removeApp, hasApp };
