const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CONFIG_PATH, loadConfigFromFile } = require('../config');
const { createAppError } = require('../utils/errors');

const APP_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function readConfig() {
  return loadConfigFromFile(CONFIG_PATH) || {};
}

function writeConfig(rawConfig) {
  const directory = path.dirname(CONFIG_PATH);
  fs.mkdirSync(directory, { recursive: true });
  const tempPath = `${CONFIG_PATH}.desktop.tmp`;
  const backupPath = `${CONFIG_PATH}.bak`;

  if (fs.existsSync(CONFIG_PATH)) {
    fs.copyFileSync(CONFIG_PATH, backupPath);
  }

  fs.writeFileSync(tempPath, `${JSON.stringify(rawConfig, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, CONFIG_PATH);
}

function getDefinitions(raw = readConfig()) {
  const configured = raw.desktopApplications;
  return configured && typeof configured === 'object' && !Array.isArray(configured)
    ? configured
    : {};
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

function normalizeDefinition(input = {}, definitions = {}) {
  const name = String(input.name || '').trim();
  const startCommand = String(input.startCommand || '').trim();
  const stopCommand = String(input.stopCommand || '').trim();
  const statusPort = normalizePort(input.statusPort);

  if (!name) {
    throw createAppError(400, 'DESKTOP_APP_NAME_MISSING', '请填写服务名称');
  }
  if (!startCommand) {
    throw createAppError(400, 'DESKTOP_APP_START_COMMAND_MISSING', '请填写启动命令');
  }
  if (!stopCommand) {
    throw createAppError(400, 'DESKTOP_APP_STOP_COMMAND_MISSING', '请填写关闭命令');
  }

  let id = String(input.id || '').trim().toLowerCase();
  if (id) {
    if (!APP_ID_PATTERN.test(id)) {
      throw createAppError(400, 'DESKTOP_APP_ID_INVALID', '本地应用 ID 格式无效');
    }
    if (!definitions[id]) {
      throw createAppError(404, 'DESKTOP_APP_NOT_FOUND', `未找到桌面应用: ${id}`, { appId: id });
    }
  } else {
    id = createUniqueId(name, definitions);
  }

  return {
    id,
    definition: {
      name,
      startCommand,
      stopCommand,
      ...(statusPort ? { statusPort } : {})
    }
  };
}

function getApps() {
  const definitions = getDefinitions();
  return Object.entries(definitions).map(([id, raw = {}]) => ({
    id,
    name: String(raw.name || id),
    startCommand: String(raw.startCommand || ''),
    stopCommand: String(raw.stopCommand || ''),
    statusPort: Number.isInteger(Number(raw.statusPort)) ? Number(raw.statusPort) : null
  }));
}

function saveApp(input) {
  const raw = readConfig();
  const definitions = getDefinitions(raw);
  const { id, definition } = normalizeDefinition(input, definitions);

  raw.desktopApplications = definitions;
  raw.desktopApplications[id] = definition;
  writeConfig(raw);
  return { id, ...definition };
}

function removeApp(id) {
  const appId = String(id || '').trim().toLowerCase();
  const raw = readConfig();
  const definitions = getDefinitions(raw);

  if (!definitions[appId]) {
    throw createAppError(404, 'DESKTOP_APP_NOT_FOUND', `未找到桌面应用: ${appId}`, { appId });
  }

  delete definitions[appId];
  if (Object.keys(definitions).length > 0) raw.desktopApplications = definitions;
  else delete raw.desktopApplications;
  writeConfig(raw);
  return { id: appId };
}

function hasApp(id) {
  return Boolean(getDefinitions()[String(id || '').trim().toLowerCase()]);
}

module.exports = {
  getApps,
  saveApp,
  removeApp,
  hasApp
};
