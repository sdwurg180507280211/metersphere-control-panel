// Execute the changed repository classes, not reimplementations of their logic.
// External processes, database services and diagnostics are isolated at their boundaries.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { root, temp, load } = require('./fixtures.cjs');
const actualIdentity = require(path.join(root, 'backend/services/processIdentityService'));
const makeError = (statusCode, code, message, details) => Object.assign(new Error(message), { statusCode, code, details });
const logger = { broadcast() {}, broadcastCommand() {}, updateOptions() {} };
function configFixture(t) {
  const directory = temp(t);
  const file = path.join(directory, 'config.json');
  fs.writeFileSync(file, JSON.stringify({ projectRoot: directory, services: {}, maxLogLines: 1000, projects: {} }));
  const fakeProcess = { ...process, env: { MS_CONFIG_PATH: file, MS_PROJECT_ROOT: directory, PATH: process.env.PATH } };
  const config = load('backend/config.js', {
    os: { ...os, homedir: () => directory },
    child_process: { execSync: () => '/usr/bin/npm' }
  }, { process: fakeProcess });
  const diagnostics = { runDiagnostics: () => ({ valid: true, diagnostics: {}, errors: [], warnings: [], applyImpact: { changedPaths: [], requiresRestart: [] } }) };
  const manager = () => load('backend/services/configManager.js', {
    '../config': config, '../utils/logger': logger, './jobService': { getActiveJobs: async () => [] },
    './configDiagnosticsService': diagnostics, '../utils/errors': { createAppError: makeError },
    '../utils/validator': {}, './projectScannerService': {}
  }, { process: fakeProcess });
  const projects = load('backend/services/meterSphereProjectConfigService.js', {
    '../config': config, '../utils/errors': { createAppError: makeError },
    '../utils/privateFile': { secureFile() {} }
  }, { process: fakeProcess });
  return { file, manager, projects, read: () => JSON.parse(fs.readFileSync(file, 'utf8')) };
}
test('real ConfigManager save preserves metadata saved through the other project writer', (t) => {
  const fixture = configFixture(t), manager = fixture.manager();
  const draft = manager.getEditableConfig();
  fixture.projects.saveProject({ name: 'Updated MeterSphere' });
  draft.maxLogLines = 2000;
  manager.saveDraft(draft);
  assert.equal(fixture.read().projects.metersphere.name, 'Updated MeterSphere');
  assert.equal(fixture.read().maxLogLines, 2000);
  assert.equal(fs.statSync(fixture.file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(fixture.file + '.bak').mode & 0o777, 0o600);
});
test('two actual configuration editors merge non-overlapping changes', (t) => {
  const fixture = configFixture(t), first = fixture.manager(), second = fixture.manager();
  first.saveDraft({ ...first.getEditableConfig(), maxLogLines: 2000 });
  second.saveDraft({ ...second.getEditableConfig(), port: 4444 });
  assert.equal(fixture.read().maxLogLines, 2000);
  assert.equal(fixture.read().port, 4444);
});
test('two actual configuration editors reject conflicting edits without modifying disk', (t) => {
  const fixture = configFixture(t), first = fixture.manager(), second = fixture.manager();
  first.saveDraft({ ...first.getEditableConfig(), maxLogLines: 2000 });
  const before = fs.readFileSync(fixture.file);
  assert.throws(() => second.saveDraft({ ...second.getEditableConfig(), maxLogLines: 3000 }), { code: 'CONFIG_CONFLICT' });
  assert.deepEqual(fs.readFileSync(fixture.file), before);
});
test('a page reload by another consumer cannot advance an old draft revision', (t) => {
  const fixture = configFixture(t), manager = fixture.manager();
  const oldPage = manager.getConfigPageData();
  fixture.projects.saveProject({ name: 'Latest name' });
  manager.getConfigPageData();
  assert.throws(() => manager.saveDraft({ ...oldPage.editable, maxLogLines: 4000 }, { expectedRevision: oldPage.meta.revision }), { code: 'CONFIG_CONFLICT' });
  assert.equal(fixture.read().projects.metersphere.name, 'Latest name');
});
test('actual config loader rejects corrupted JSON instead of treating it as a blank project', (t) => {
  const fixture = configFixture(t);
  fs.writeFileSync(fixture.file, '{broken');
  assert.throws(() => fixture.manager(), { code: 'CONFIG_READ_FAILED' });
  assert.equal(fs.readFileSync(fixture.file, 'utf8'), '{broken');
});
function processFixture(t, globals = {}) {
  const directory = temp(t), pidDir = path.join(directory, '.pids'), logDir = path.join(directory, 'logs');
  fs.mkdirSync(pidDir); fs.mkdirSync(logDir); fs.mkdirSync(path.join(directory, 'demo'));
  fs.writeFileSync(path.join(directory, 'demo/pom.xml'), '<project/>');
  const service = { name: 'Demo', pom: 'demo/pom.xml', port: 9000, healthCheck: '/actuator/health', dependencies: [] };
  const processes = new Map();
  const shared = { PID_DIR: pidDir, LOG_DIR: logDir, BATCH_START_HEALTH_TIMEOUT: 1000,
    BATCH_START_HEALTH_INTERVAL: 10, MAX_HS_ERR_LOGS: 3, ORPHAN_CLEANUP_INTERVAL: 60000,
    serviceProcesses: new Map(), serviceStatuses: new Map(), devServerProcesses: new Map(),
    TRANSITIONAL_SERVICE_PHASES: new Set(['starting', 'stopping', 'restarting', 'checking_health']) };
  const identity = { ...actualIdentity, inspect: async (pid) => processes.get(Number(pid)) || null,
    identify: (pid, context, saved) => actualIdentity.identify(pid, context, saved, async (target) => processes.get(target) || null) };
  const health = { check: async () => ({ healthy: true, checkedAt: 'test' }), waitForHealthy: async () => ({ healthy: true }) };
  const external = { spawn() { throw new Error('Unexpected real service launch in test'); }, execFile(_cmd, _args, callback) { callback(null, ''); } };
  const lifecycle = load('backend/services/processManager/serviceLifecycle.js', { '../../utils/logger': logger, '../healthChecker': health, './shared': shared, child_process: external }, globals);
  const manager = load('backend/services/processManager/index.js', {
    '../configManager': { getResolvedConfig: () => ({ projectRoot: directory, services: { demo: service } }) },
    '../../utils/logger': logger, '../healthChecker': health, './shared': shared,
    './serviceLifecycle': lifecycle, './buildProcess': () => {}, './devServer': () => {},
    '../processIdentityService': identity, '../websocketService': {}, child_process: external
  }, globals);
  manager.stopPeriodicCleanup();
  manager._findPidsByPom = async () => [];
  manager._findPidsByPort = async () => [];
  manager._findChildPids = async () => [];
  manager._isProcessRunning = (pid) => processes.has(pid);
  manager._attachServiceLogTail = () => ({ kill() {} });
  const terminated = [];
  const terminate = manager._terminateProcess.bind(manager);
  manager._terminateProcess = async (pid) => { terminated.push(pid); processes.delete(pid); };
  function own(pid = 42001, started = 'birth-1') {
    processes.set(pid, { pid, started, cwd: directory, argv: ['/bin/sh', path.join(directory, 'mvnw'), '-f', 'demo/pom.xml'] });
    return pid;
  }
  t.after(() => { for (const id of manager.serviceHealthMonitors.keys()) manager._clearHealthMonitor(id); });
  return { directory, pidDir, service, manager, shared, processes, terminated, own, health, terminate };
}
test('actual getStatus then stop cannot turn an unrelated listening PID into an owned process', async (t) => {
  const fixture = processFixture(t);
  fixture.processes.set(42001, { pid: 42001, started: 'foreign', cwd: fixture.directory, argv: ['node', 'another.js'] });
  fixture.manager._findPidsByPort = async () => [42001];
  const status = await fixture.manager.getStatus('demo');
  assert.equal(status.owned, false); assert.equal(status.portOccupied, true);
  assert.equal(fixture.shared.serviceProcesses.size, 0);
  assert.equal(fs.existsSync(path.join(fixture.pidDir, 'demo.pid')), false);
  const stopped = await fixture.manager.stop('demo', fixture.service);
  assert.equal(stopped.success, false);
  assert.deepEqual(fixture.terminated, []);
});
test('actual process discovery verifies project and birth before recording a PID', async (t) => {
  const fixture = processFixture(t), pid = fixture.own();
  fixture.manager._findPidsByPom = async () => [pid];
  const status = await fixture.manager.getStatus('demo');
  assert.equal(status.running, true);
  const identity = JSON.parse(fs.readFileSync(path.join(fixture.pidDir, 'demo.identity.json')));
  assert.equal(identity.started, 'birth-1');
  assert.equal(identity.projectRoot, fixture.directory);
  const stopped = await fixture.manager.stop('demo', fixture.service);
  assert.equal(stopped.success, true);
  assert.deepEqual(fixture.terminated, [pid]);
});
test('actual getStatus/stop rejects a recycled tracked PID', async (t) => {
  const fixture = processFixture(t), pid = fixture.own();
  fixture.manager._findPidsByPom = async () => [pid];
  await fixture.manager.getStatus('demo');
  fixture.processes.set(pid, { pid, started: 'birth-2', cwd: fixture.directory, argv: ['node', 'unrelated.js'] });
  fixture.manager._findPidsByPort = async () => [pid];
  await fixture.manager.getStatus('demo');
  await fixture.manager.stop('demo', fixture.service);
  assert.deepEqual(fixture.terminated, []);
});
test('actual discovery rejects the same relative POM in another checkout', async (t) => {
  const fixture = processFixture(t), pid = fixture.own();
  fixture.processes.get(pid).cwd = path.join(fixture.directory, 'another-checkout');
  fixture.manager._findPidsByPom = async () => [pid];
  fixture.manager._findPidsByPort = async () => [pid];
  const status = await fixture.manager.getStatus('demo');
  assert.equal(status.owned, false);
  await fixture.manager.stop('demo', fixture.service);
  assert.deepEqual(fixture.terminated, []);
});
test('a released foreign port clears its conflict flag and does not prevent a future start', async (t) => {
  const fixture = processFixture(t);
  fixture.manager._findPidsByPort = async () => [42001];
  await fixture.manager.getStatus('demo');
  fixture.manager._findPidsByPort = async () => [];
  const state = await fixture.manager.getStatus('demo');
  assert.equal(state.portOccupied, false);
});
test('cancelled old health monitor cannot overwrite a newer status', async (t) => {
  const fixture = processFixture(t);
  let rejectHealth;
  fixture.health.waitForHealthy = () => new Promise((_, reject) => { rejectHealth = reject; });
  fixture.manager._monitorServiceHealth('demo', fixture.service, { initialDelay: 0 });
  fixture.manager._clearHealthMonitor('demo');
  fixture.manager._setServiceStatus('demo', { phase: 'stopped', running: false });
  rejectHealth(new Error('late result'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.manager._getCurrentServiceStatus('demo').phase, 'stopped');
});
function serverFixture({ connect = async () => {}, recover = async () => ({}) } = {}) {
  const { EventEmitter } = require('node:events');
  const routes = new Map(), states = [], originConfigurations = [];
  const app = { use() {}, get: (route, handler) => routes.set(route, handler) };
  const express = () => app; express.json = () => {}; express.static = () => {};
  const server = new EventEmitter();
  server.listen = () => { server.listening = true; queueMicrotask(() => server.emit('listening')); };
  server.close = (callback) => { server.listening = false; queueMicrotask(callback); };
  const mocks = {
    express, http: { createServer: () => server }, 'fix-path': () => {},
    './services/configManager': { getResolvedConfig: () => ({ port: 5001, projectRoot: '/tmp/example', maxLogLines: 1000 }) },
    './utils/logger': logger, './services/cacheService': { connect }, './services/websocketService': { init() {} },
    './services/localAuthService': { configureOrigins: (config) => originConfigurations.push(config), getToken: () => 'test-token' },
    './middleware/localAuth': () => {}, './utils/errors': { sendError() {} },
    './services/jobService': { recoverActiveJobs: recover }, './services/processManager': {},
    './services/packageHistoryService': { ensureTable: () => { throw new Error('History DB must not be touched by default'); } },
    './services/backendShutdownService': { shutdownBackend: async () => { states.push('cleanup'); } }
  };
  for (const name of ['services', 'commandProjects', 'meterSphereProject', 'build', 'logs', 'progress', 'jobs', 'package', 'config', 'sql']) mocks[`./routes/${name}`] = {};
  const fakeProcess = { ...process, env: { NODE_ENV: 'development' }, on() {}, once() {}, exit() { throw new Error('Unexpected exit'); } };
  const output = load('backend/server.js', mocks, { process: fakeProcess, console: { log() {}, warn() {}, error() {} } });
  const ready = () => { const result = {}; routes.get('/api/ready')({}, { status(code) { result.statusCode = code; return this; }, json(body) { result.body = body; } }); return result; };
  return { output, states, originConfigurations, ready, server };
}
test('actual server propagates initialization rejection and closes the listening server', async () => {
  const fixture = serverFixture({ connect: async () => { throw new Error('cache failed'); } });
  await assert.rejects(fixture.output.startServer(5001), /cache failed/);
  assert.equal(fixture.server.listening, false);
  assert.equal(fixture.ready().statusCode, 503);
  assert.deepEqual(fixture.states, ['cleanup']);
});
test('actual server readiness becomes true only after initialization resolves', async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const fixture = serverFixture({ connect: () => pending });
  const startup = fixture.output.startServer(5001);
  assert.equal(fixture.ready().statusCode, 503);
  resolve(); await startup;
  assert.equal(fixture.ready().statusCode, 200);
  assert.equal(fixture.ready().body.ready, true);
  assert.deepEqual(Array.from(fixture.originConfigurations[0].origins), ['http://localhost:3001', 'http://127.0.0.1:3001']);
});
test('real termination refuses signals if ownership changed after discovery', async (t) => {
  const signals = [];
  const fixture = processFixture(t, { process: { ...process, kill: (pid, signal) => signals.push([pid, signal]) } });
  const pid = fixture.own();
  await fixture.terminate(pid, { verifyOwnership: async () => false });
  assert.deepEqual(signals, []);
});
test('real termination refuses a root PID recycled during the final ownership check', async (t) => {
  const signals = [];
  const fixture = processFixture(t, { process: { ...process, kill: (pid, signal) => signals.push([pid, signal]) } });
  const pid = fixture.own();
  await fixture.terminate(pid, { verifyOwnership: async () => {
    fixture.processes.set(pid, { pid, started: 'recycled', cwd: fixture.directory, argv: ['node', 'unrelated.js'] });
    return true;
  } });
  assert.deepEqual(signals, []);
});
