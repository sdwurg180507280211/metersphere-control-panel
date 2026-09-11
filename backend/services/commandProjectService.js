const net = require('net');
const { spawn, execFile } = require('child_process');
const commandProjectConfigService = require('./commandProjectConfigService');
const { createAppError } = require('../utils/errors');

const STOP_COMMAND_TIMEOUT_MS = 15000;
const STATUS_WAIT_MS = 5000;

function getCatalog() {
  return commandProjectConfigService.getProjects();
}

function getProject(id) {
  const project = getCatalog().find((item) => item.id === id);
  if (!project) {
    throw createAppError(404, 'DESKTOP_APP_NOT_FOUND', `未找到桌面应用: ${id}`, { appId: id });
  }
  return project;
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
  const project = getProject(id);
  if (!project.statusPort) {
    return {
      id,
      running: null,
      statusKnown: false,
      phase: 'unknown',
      port: null
    };
  }

  const running = await checkPort('127.0.0.1', project.statusPort);
  return {
    id,
    running,
    statusKnown: true,
    phase: running ? 'running' : 'stopped',
    port: project.statusPort
  };
}

async function getAllStatus() {
  const projects = getCatalog();
  const entries = await Promise.all(projects.map(async (project) => [project.id, await getStatus(project.id)]));
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
  const project = getProject(id);
  if (!project.startCommand) {
    throw createAppError(400, 'DESKTOP_APP_START_COMMAND_MISSING', `${project.name} 未配置启动命令`);
  }

  const current = await getStatus(id);
  if (current.running === true) return current;

  try {
    await runDetached(project.startCommand);
  } catch (error) {
    throw createAppError(500, 'DESKTOP_APP_START_FAILED', `${project.name} 启动命令执行失败: ${error.message}`);
  }

  if (project.statusPort) {
    const running = await waitForPort(project.statusPort, true);
    return {
      id,
      running,
      statusKnown: true,
      phase: running ? 'running' : 'starting',
      port: project.statusPort
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
  const project = getProject(id);
  if (!project.stopCommand) {
    throw createAppError(400, 'DESKTOP_APP_STOP_COMMAND_MISSING', `${project.name} 未配置关闭命令`);
  }

  const current = await getStatus(id);
  if (current.running === false) return current;

  await runAndWait(project.stopCommand);

  if (project.statusPort) {
    const running = await waitForPort(project.statusPort, false);
    return {
      id,
      running,
      statusKnown: true,
      phase: running ? 'stopping' : 'stopped',
      port: project.statusPort
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
