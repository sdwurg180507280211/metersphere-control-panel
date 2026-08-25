const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { spawn, execFile } = require('child_process');
const { CONFIG_PATH, loadConfigFromFile } = require('../config');
const { createAppError } = require('../utils/errors');

const APP_DATA_DIR = path.join(os.homedir(), '.metersphere-control-panel');
const RUNTIME_PATH = path.join(APP_DATA_DIR, 'desktop-apps-runtime.json');
const LOG_DIR = path.join(APP_DATA_DIR, 'logs', 'desktop-apps');
const STOP_TIMEOUT_MS = 5000;

fs.mkdirSync(LOG_DIR, { recursive: true });

const liveChildren = new Map();

function readRuntimeState() {
  try {
    if (!fs.existsSync(RUNTIME_PATH)) return {};
    return JSON.parse(fs.readFileSync(RUNTIME_PATH, 'utf8')) || {};
  } catch {
    return {};
  }
}

function writeRuntimeState(state) {
  fs.mkdirSync(path.dirname(RUNTIME_PATH), { recursive: true });
  const temp = `${RUNTIME_PATH}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, RUNTIME_PATH);
}

function updateRuntime(id, value) {
  const state = readRuntimeState();
  if (value) state[id] = value;
  else delete state[id];
  writeRuntimeState(state);
}

function normalizeApp(id, raw = {}) {
  const start = raw.start && typeof raw.start === 'object' ? raw.start : {};
  const health = raw.healthCheck && typeof raw.healthCheck === 'object' ? raw.healthCheck : {};
  const args = Array.isArray(start.args) ? start.args.map((item) => String(item)) : [];
  const env = start.env && typeof start.env === 'object' && !Array.isArray(start.env)
    ? Object.fromEntries(Object.entries(start.env).map(([key, value]) => [String(key), String(value)]))
    : {};

  return {
    id,
    name: String(raw.name || id),
    group: String(raw.group || '本地应用'),
    runtime: String(raw.runtime || 'process'),
    enabled: raw.enabled !== false,
    cwd: String(raw.cwd || ''),
    port: Number.isInteger(Number(raw.port)) ? Number(raw.port) : null,
    start: {
      command: String(start.command || ''),
      args,
      env
    },
    healthCheck: {
      type: String(health.type || (raw.port ? 'port' : 'process')),
      host: String(health.host || '127.0.0.1'),
      port: Number.isInteger(Number(health.port)) ? Number(health.port) : (Number(raw.port) || null)
    }
  };
}

function getAllApps() {
  const raw = loadConfigFromFile(CONFIG_PATH);
  const configured = raw.desktopApplications;
  if (!configured || typeof configured !== 'object' || Array.isArray(configured)) return [];
  return Object.entries(configured)
    .map(([id, value]) => normalizeApp(id, value))
    .filter((app) => app.enabled);
}

function getApp(id) {
  const app = getAllApps().find((item) => item.id === id);
  if (!app) {
    throw createAppError(404, 'DESKTOP_APP_NOT_FOUND', `未找到桌面应用: ${id}`, { appId: id });
  }
  return app;
}

function assertStartable(app) {
  if (!app.start.command) {
    throw createAppError(400, 'DESKTOP_APP_COMMAND_MISSING', `${app.name} 未配置启动命令`);
  }
  if (app.cwd && !fs.existsSync(app.cwd)) {
    throw createAppError(400, 'DESKTOP_APP_CWD_NOT_FOUND', `${app.name} 工作目录不存在`, { cwd: app.cwd });
  }
}

function isPidAlive(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) return false;
  try {
    process.kill(numericPid, 0);
    return true;
  } catch {
    return false;
  }
}

function checkPort(host, port, timeoutMs = 500) {
  if (!port) return Promise.resolve(null);
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function getStatus(id) {
  const app = getApp(id);
  const runtime = readRuntimeState()[id] || null;
  const pid = runtime?.pid || null;
  const running = isPidAlive(pid);

  if (!running && runtime) {
    updateRuntime(id, null);
    liveChildren.delete(id);
  }

  const portReachable = running && app.healthCheck.type === 'port'
    ? await checkPort(app.healthCheck.host, app.healthCheck.port)
    : null;

  return {
    id,
    running,
    phase: running ? 'running' : 'stopped',
    pid: running ? pid : null,
    startedAt: running ? runtime?.startedAt || null : null,
    port: app.port,
    portReachable,
    runtime: app.runtime,
    logFile: path.join(LOG_DIR, `${id}.log`)
  };
}

async function getAllStatus() {
  const apps = getAllApps();
  const entries = await Promise.all(apps.map(async (app) => [app.id, await getStatus(app.id)]));
  return Object.fromEntries(entries);
}

function waitForExit(pid, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (!isPidAlive(pid) || Date.now() - started >= timeoutMs) {
        clearInterval(timer);
        resolve(!isPidAlive(pid));
      }
    }, 150);
    timer.unref?.();
  });
}

function killWindowsTree(pid, force = false) {
  return new Promise((resolve) => {
    const args = ['/PID', String(pid), '/T'];
    if (force) args.push('/F');
    execFile('taskkill', args, () => resolve());
  });
}

async function killProcessTree(pid, signal = 'SIGTERM') {
  if (!isPidAlive(pid)) return;
  if (process.platform === 'win32') {
    await killWindowsTree(pid, signal === 'SIGKILL');
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Process already exited.
    }
  }
}

async function start(id) {
  const app = getApp(id);
  assertStartable(app);

  const current = await getStatus(id);
  if (current.running) return current;

  const logFile = path.join(LOG_DIR, `${id}.log`);
  const fd = fs.openSync(logFile, 'a');
  const cwd = app.cwd || os.homedir();
  const child = spawn(app.start.command, app.start.args, {
    cwd,
    env: { ...process.env, ...app.start.env },
    detached: true,
    windowsHide: true,
    shell: false,
    stdio: ['ignore', fd, fd]
  });

  const spawned = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('spawn', () => resolve(true));
  }).finally(() => {
    try { fs.closeSync(fd); } catch { /* ignore */ }
  });

  if (!spawned) {
    throw createAppError(500, 'DESKTOP_APP_START_FAILED', `${app.name} 启动失败`);
  }

  child.unref();
  liveChildren.set(id, child);
  updateRuntime(id, {
    pid: child.pid,
    startedAt: new Date().toISOString(),
    command: app.start.command,
    cwd
  });

  child.once('exit', () => {
    const runtime = readRuntimeState()[id];
    if (runtime?.pid === child.pid) updateRuntime(id, null);
    liveChildren.delete(id);
  });

  return {
    ...(await getStatus(id)),
    phase: 'starting'
  };
}

async function stop(id) {
  getApp(id);
  const runtime = readRuntimeState()[id] || null;
  const pid = runtime?.pid;
  if (!isPidAlive(pid)) {
    updateRuntime(id, null);
    liveChildren.delete(id);
    return getStatus(id);
  }

  await killProcessTree(pid, 'SIGTERM');
  const exited = await waitForExit(pid, STOP_TIMEOUT_MS);
  if (!exited) {
    await killProcessTree(pid, 'SIGKILL');
    await waitForExit(pid, 1500);
  }

  updateRuntime(id, null);
  liveChildren.delete(id);
  return getStatus(id);
}

async function restart(id) {
  await stop(id);
  return start(id);
}

function readLogs(id, tail = 120) {
  getApp(id);
  const logFile = path.join(LOG_DIR, `${id}.log`);
  if (!fs.existsSync(logFile)) return '';
  const lines = fs.readFileSync(logFile, 'utf8').split(/\r?\n/);
  const count = Math.max(20, Math.min(500, Number(tail) || 120));
  return lines.slice(-count).join('\n');
}

module.exports = {
  getCatalog: getAllApps,
  getStatus,
  getAllStatus,
  start,
  stop,
  restart,
  readLogs
};
