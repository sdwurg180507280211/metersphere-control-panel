const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const { temp, load } = require('./fixtures.cjs');
function fixture(t, { port = null, outcomes = [], beforeCreate, launch } = {}) {
  const directory = temp(t), calls = [], children = [], sockets = [];
  let time = 0, counter = 0, reads = 0;
  class Clock extends Date { static now() { return time; } }
  const project = { id: 'sample', name: 'Sample', startCommand: 'saved-start', stopCommand: 'saved-stop', statusPort: port };
  const jobService = {
    assertWritableRequestAllowed: async (key) => calls.push(['allowed', key]),
    createJob: async (payload) => { if (beforeCreate) await beforeCreate(); const job = { ...payload, jobId: `job-${++counter}` }; calls.push(['create', job]); return job; },
    acquireLock: async (...args) => { calls.push(['lock', ...args]); return { acquired: true }; },
    startJob: async (...args) => calls.push(['start', ...args]),
    completeJob: async (...args) => calls.push(['complete', ...args]),
    failJob: async (...args) => calls.push(['fail', ...args]),
    releaseLock: async (...args) => calls.push(['release', ...args])
  };
  const service = load('backend/services/commandProjectService.js', {
    'node:net': { createConnection() { const socket = new EventEmitter(); socket.setTimeout = () => {}; socket.destroy = () => { socket.destroyed = true; }; sockets.push(socket); const value = outcomes.length ? outcomes.shift() : false; queueMicrotask(() => socket.emit(value ? 'connect' : 'error', value ? undefined : new Error('closed'))); return socket; } },
    'node:os': { homedir: () => directory },
    'node:child_process': { spawn(executable, args, options) { const child = new EventEmitter(); child.pid = 44001; child.unref = () => {}; children.push(child); calls.push(['spawn', executable, args, options]); queueMicrotask(() => launch?.(child, args)); return child; } },
    './commandProjectConfigService': { getProjects: () => { reads++; return [project]; } },
    './jobService': jobService,
    '../utils/errors': { createAppError: (statusCode, code, message, details) => Object.assign(new Error(message), { statusCode, code, details }) },
    'node:timers/promises': { setTimeout: async (milliseconds, _value, { signal } = {}) => { signal?.throwIfAborted(); time += milliseconds; await Promise.resolve(); } }
  }, { Date: Clock });
  t.after(() => service.destroy());
  return { service, calls, directory, children, sockets, project, reads: () => reads, jobService };
}
test('command action reserves the project before async job creation', async (t) => {
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  const f = fixture(t, { beforeCreate: () => wait });
  const first = f.service.start('sample');
  await assert.rejects(f.service.stop('sample'), { code: 'DESKTOP_APP_BUSY' });
  assert.throws(() => f.service.assertIdle('sample'), { code: 'DESKTOP_APP_BUSY' });
  release();
  await first;
  assert.doesNotThrow(() => f.service.assertIdle('sample'));
  assert.equal(f.calls.filter(([type]) => type === 'spawn').length, 1);
});
test('only the saved command is launched and no-port results remain unverified', async (t) => {
  const f = fixture(t);
  const result = await f.service.start('sample');
  assert.equal(result.running, null); assert.equal(result.statusKnown, false);
  assert.equal(result.verification, 'command_issued_only');
  assert.equal(f.calls.find(([type]) => type === 'spawn')[2].at(-1), 'saved-start');
  assert.equal(f.calls.filter(([type]) => type === 'complete').length, 1);
  assert.equal(fs.statSync(`${f.directory}/.metersphere-control-panel/command-logs/sample.log`).mode & 0o777, 0o600);
});
test('launch error is recorded as a failed Job and mutex is released', async (t) => {
  const f = fixture(t, { launch: (child) => child.emit('error', Object.assign(new Error('missing shell'), { code: 'ENOENT' })) });
  await assert.rejects(f.service.start('sample'), { code: 'ENOENT' });
  assert.equal(f.calls.filter(([type]) => type === 'fail').length, 1);
  assert.equal(f.calls.filter(([type]) => type === 'release').length, 1);
  assert.doesNotThrow(() => f.service.assertIdle('sample'));
});
test('nonzero command exit is never a successful no-port launch', async (t) => {
  const f = fixture(t, { launch: (child) => child.emit('exit', 7, null) });
  await assert.rejects(f.service.start('sample'), { code: 'COMMAND_EXIT_FAILED' });
  assert.equal(f.calls.filter(([type]) => type === 'complete').length, 0);
});
test('an already-open port is observed without launching duplicate commands', async (t) => {
  const f = fixture(t, { port: 12345, outcomes: [true, true] });
  const result = await f.service.start('sample');
  assert.equal(result.alreadyInState, true);
  assert.equal(result.processOwnershipVerified, false);
  assert.equal(f.calls.filter(([type]) => type === 'spawn').length, 0);
});
test('stop requires both closed port and successful command exit', async (t) => {
  const f = fixture(t, { port: 12345, outcomes: [true, false], launch: (child) => child.emit('exit', 0, null) });
  const result = await f.service.stop('sample');
  assert.equal(result.running, false); assert.equal(result.exitCode, 0);
});
test('a closed port never skips the explicit stop command', async (t) => {
  const f = fixture(t, { port: 12345, outcomes: [false, false], launch: (child) => child.emit('exit', 0, null) });
  const result = await f.service.stop('sample');
  assert.equal(result.exitCode, 0);
  assert.equal(f.calls.filter(([type]) => type === 'spawn').length, 1);
  assert.equal(result.alreadyInState, undefined);
});
test('closed port without stop command exit times out without auto-retrying or killing', async (t) => {
  const f = fixture(t, { port: 12345, outcomes: [true] });
  await assert.rejects(f.service.stop('sample'), { code: 'COMMAND_CONFIRMATION_TIMEOUT' });
  assert.equal(f.calls.filter(([type]) => type === 'spawn').length, 1);
  assert.equal(f.calls.filter(([type]) => type === 'complete').length, 0);
});
test('getAllStatus reads the catalog once and destroys all probes', async (t) => {
  const f = fixture(t, { port: 12345, outcomes: [true] });
  const result = await f.service.getAllStatus();
  assert.equal(result.sample.running, true);
  assert.equal(f.reads(), 1);
  assert.equal(f.sockets.every((socket) => socket.destroyed), true);
});
test('invalid project IDs fail before catalog lookup or filesystem access', async (t) => {
  const f = fixture(t);
  await assert.rejects(f.service.start('../outside'), { code: 'DESKTOP_APP_ID_INVALID' });
  assert.equal(f.reads(), 0); assert.deepEqual(f.calls, []);
});
