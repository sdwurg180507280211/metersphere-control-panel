const net = require('net');
const { spawn, execFile } = require('child_process');
const desktopAppConfigService = require('./desktopAppConfigService');
const { createAppError } = require('../utils/errors');

const STOP_COMMAND_TIMEOUT_MS = 15000;
const STATUS_WAIT_MS = 5000;

function getCatalog() {
  return desktopAppConfigService.getApps();
}

function getApp(id) {
  const app = getCatalog().find((item) => item.id === id);
  if (!app) {
    throw createAppError(404, 'DESKTOP_APP_NOT_FOUND', `未找到桌面应用: ${id}`, { appId: id });
  }
  return app;
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

function getShellInvocation(command) {
  if (process.platform === 'win32') {
    return { executable: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', command] };
  }
  return { executable: process.env.SHELL || '/bin/zsh', args: ['-lc', command] };
}

async function getStatus(id) {
  const app = getApp(id);
  if (!app.statusPort) {
    return {
      id,
      running: null,
      statusKnown: false,
      phase: 'unknown',
      port: null
    };
  }

  const running = await checkPort('127.0.0.1', app.statusPort);
  return {
    id,
    running,
    statusKnown: true,
    phase: running ? 'running' : 'stopped',
    port: app.statusPort
  };
}

async function getAllStatus() {
  const apps = getCatalog();
  const entries = await Promise.all(apps.map(async (app) => [app.id, await getStatus(app.id)]));
  return Object.fromEntries(entries);
}

function runDetached(command) {
  return new Promise((resolve, reject) => {
    const invocation = getShellInvocation(command);
    const child = spawn(invocation.executable, invocation.args, {
      detached: true,
      windowsHide: true,
      shell: false,
      stdio: 'ignore',
      env: process.env
    });

    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

function runAndWait(command) {
  return new Promise((resolve, reject) => {
    const invocation = getShellInvocation(command);
    execFile(invocation.executable, invocation.args, {
      timeout: STOP_COMMAND_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 256 * 1024,
      env: process.env
    }, (error, stdout, stderr) => {
      if (error) {
        reject(createAppError(
          500,
          'DESKTOP_APP_STOP_COMMAND_FAILED',
          `关闭命令执行失败: ${error.message}`,
          { stdout: String(stdout || '').slice(-2000), stderr: String(stderr || '').slice(-2000) }
        ));
        return;
      }
      resolve();
    });
  });
}

async function waitForPort(port, expectedOpen, timeoutMs = STATUS_WAIT_MS) {
  if (!port) return null;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const open = await checkPort('127.0.0.1', port);
    if (open === expectedOpen) return open;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return checkPort('127.0.0.1', port);
}

async function start(id) {
  const app = getApp(id);
  if (!app.startCommand) {
    throw createAppError(400, 'DESKTOP_APP_START_COMMAND_MISSING', `${app.name} 未配置启动命令`);
  }

  const current = await getStatus(id);
  if (current.running === true) return current;

  try {
    await runDetached(app.startCommand);
  } catch (error) {
    throw createAppError(500, 'DESKTOP_APP_START_FAILED', `${app.name} 启动命令执行失败: ${error.message}`);
  }

  if (app.statusPort) {
    const running = await waitForPort(app.statusPort, true);
    return {
      id,
      running,
      statusKnown: true,
      phase: running ? 'running' : 'starting',
      port: app.statusPort
    };
  }

  return {
    id,
    running: null,
    statusKnown: false,
    phase: 'starting',
    port: null
  };
}

async function stop(id) {
  const app = getApp(id);
  if (!app.stopCommand) {
    throw createAppError(400, 'DESKTOP_APP_STOP_COMMAND_MISSING', `${app.name} 未配置关闭命令`);
  }

  const current = await getStatus(id);
  if (current.running === false) return current;

  await runAndWait(app.stopCommand);

  if (app.statusPort) {
    const running = await waitForPort(app.statusPort, false);
    return {
      id,
      running,
      statusKnown: true,
      phase: running ? 'stopping' : 'stopped',
      port: app.statusPort
    };
  }

  return {
    id,
    running: null,
    statusKnown: false,
    phase: 'unknown',
    port: null
  };
}

module.exports = {
  getCatalog,
  getStatus,
  getAllStatus,
  start,
  stop
};
