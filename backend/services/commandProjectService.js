const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const commandProjectConfigService = require('./commandProjectConfigService');
const { createAppError } = require('../utils/errors');
const jobService = require('./jobService');
const { setTimeout: delay } = require('node:timers/promises');
const active = new Map();
const observations = new Map();
const START_TIMEOUT_MS = 60000;
const STOP_TIMEOUT_MS = 15000;

function getCatalog() { return commandProjectConfigService.getProjects(); }
function getProject(id) {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(String(id || ''))) {
    throw createAppError(400, 'DESKTOP_APP_ID_INVALID', '项目 ID 无效');
  }
  const project = getCatalog().find((item) => item.id === id);
  if (!project) throw createAppError(404, 'DESKTOP_APP_NOT_FOUND', `未找到桌面应用: ${id}`, { appId: id });
  return project;
}
function checkPort(port) {
  if (!port) return Promise.resolve(null);
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (value) => { if (settled) return; settled = true; socket.destroy(); resolve(value); };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}
async function observe(project) {
  const running = await checkPort(project.statusPort);
  const task = active.get(project.id);
  return {
    id: project.id, running, statusKnown: running !== null,
    phase: task ? (task.action === 'start' ? 'starting' : 'stopping')
      : running === null ? 'unknown' : running ? 'running' : 'stopped',
    port: project.statusPort || null, observedAt: new Date().toISOString(),
    statusSource: running === null ? 'unknown' : 'port',
    processOwnershipVerified: false,
    ...(task?.jobId ? { jobId: task.jobId } : {}),
    ...(observations.get(project.id)?.error ? { error: observations.get(project.id).error } : {})
  };
}
async function getStatus(id) { return observe(getProject(id)); }
async function getAllStatus() {
  const projects = getCatalog(); // Read the catalog once, not once for every project.
  return Object.fromEntries(await Promise.all(projects.map(async (project) => [project.id, await observe(project)])));
}
function shellInvocation(command) {
  return process.platform === 'win32'
    ? { executable: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', command] }
    : { executable: process.env.SHELL || '/bin/zsh', args: ['-lc', command] };
}
function launch(command, task) {
  const invocation = shellInvocation(command);
  const directory = path.join(os.homedir(), '.metersphere-control-panel', 'command-logs');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  task.logFile = path.join(directory, `${task.id}.log`);
  const fd = fs.openSync(task.logFile, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | (fs.constants.O_NOFOLLOW || 0), 0o600);
  if (process.platform !== 'win32') fs.fchmodSync(fd, 0o600);
  let child;
  try {
    child = spawn(invocation.executable, invocation.args, {
      detached: true, windowsHide: true, shell: false,
      stdio: ['ignore', fd, fd], env: process.env
    });
  } finally { fs.closeSync(fd); }
  task.child = child;
  // Direct file descriptors survive control-panel exit; closing a pipe would cause EPIPE.

  child.once('exit', (code, signal) => { task.exit = { code, signal }; });
  child.on('error', (error) => { task.error = error; });
  child.unref();
  return child;
}
function assertIdle(id) {
  id = String(id || '').trim().toLowerCase();
  if (active.has(id)) throw createAppError(409, 'DESKTOP_APP_BUSY', '项目已有启停任务，请等待当前任务结束', { appId: id, jobId: active.get(id).jobId });
}
async function run(id, action) {
  assertIdle(id);
  const project = getProject(id);
  const command = action === 'start' ? project.startCommand : project.stopCommand;
  if (!command) throw createAppError(400, `DESKTOP_APP_${action.toUpperCase()}_COMMAND_MISSING`, '未配置操作命令');
  const task = { id, action, controller: new AbortController() };
  active.set(id, task); // Set before the first await, including job persistence.
  const resourceKey = `command:${id}`;
  let locked = false;
  try {
    await jobService.assertWritableRequestAllowed(resourceKey);
    const job = await jobService.createJob({
      type: `command.${action}`, targetType: 'command', targetId: id,
      metadata: { resourceKey, projectId: id, statusPort: project.statusPort || null },
      message: `${action === 'start' ? '启动' : '停止'} ${project.name}`
    });
    task.jobId = job.jobId;
    const lock = await jobService.acquireLock(resourceKey, job, 120);
    if (!lock.acquired) throw createAppError(409, 'DESKTOP_APP_BUSY', '项目已有运行中的任务');
    locked = true;
    await jobService.startJob(job.jobId, { stage: 'command' });
    const before = await checkPort(project.statusPort);
    if (action === 'start' && before === true) {
      const result = { ...(await observe(project)), phase: before ? 'running' : 'stopped', alreadyInState: true };
      await jobService.completeJob(job.jobId, result, { message: '端口状态已满足，未重复执行命令' });
      return result;
    }
    launch(command, task);
    const issuedAt = Date.now();
    const deadline = Date.now() + (action === 'start' ? START_TIMEOUT_MS : STOP_TIMEOUT_MS);
    while (Date.now() < deadline) {
      task.controller.signal.throwIfAborted();
      if (task.error) throw task.error;
      if (task.exit && task.exit.code !== 0) throw Object.assign(new Error(`命令退出: ${task.exit.code ?? task.exit.signal}`), { code: 'COMMAND_EXIT_FAILED' });
      const running = await checkPort(project.statusPort);
      const reached = project.statusPort && running === (action === 'start');
      // A stop command must also have exited successfully; port closure alone is insufficient.
      if ((reached && (action === 'start' || task.exit?.code === 0)) || (!project.statusPort && (task.exit?.code === 0 || (action === 'start' && Date.now() - issuedAt >= 250)))) {
        const result = {
          id, running, statusKnown: running !== null,
          phase: running === null ? 'unknown' : running ? 'running' : 'stopped',
          port: project.statusPort || null, jobId: job.jobId,
          exitCode: task.exit?.code ?? null, commandIssued: true,
          verification: running === null ? (task.exit?.code === 0 ? 'command_exit_only' : 'command_issued_only') : 'port_only'
        };
        observations.delete(id);
        await jobService.completeJob(job.jobId, result, { message: running === null ? '命令已发出；未配置状态探测，运行状态未知' : '操作及端口检查完成' });
        return result;
      }
      await delay(250, undefined, { signal: task.controller.signal });
    }
    throw Object.assign(new Error('操作未在期限内得到确认；不会自动重试命令，请检查项目状态'), { code: 'COMMAND_CONFIRMATION_TIMEOUT' });
  } catch (error) {
    observations.set(id, { error: error.message });
    if (task.jobId) await jobService.failJob(task.jobId, error, { stage: 'command', result: { commandIssued: Boolean(task.child), exitCode: task.exit?.code ?? null } }).catch(() => {});
    throw createAppError(error.statusCode || 500, error.code || 'DESKTOP_APP_COMMAND_FAILED', error.message, { appId: id, jobId: task.jobId });
  } finally {
    // Do not kill unverified service trees. The user-provided command may intentionally daemonize.
    // The child owns its log descriptors; no service output pipe is torn down here.
    if (locked) await jobService.releaseLock(resourceKey, task.jobId).catch(() => {});
    active.delete(id);
  }
}
async function destroy() {
  for (const task of active.values()) task.controller.abort(new Error('控制台退出，任务结果需重新核验'));
}
module.exports = { getCatalog, getStatus, getAllStatus, start: (id) => run(id, 'start'), stop: (id) => run(id, 'stop'), assertIdle, destroy };
