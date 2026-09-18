const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./fixtures.cjs');
const dependencyService = require('../../../backend/services/dependencyService');
const { createAppError } = require('../../../backend/utils/errors');

const services = Object.freeze({
  eureka: Object.freeze({ name: 'Eureka', enabled: true, startOrder: 1 }),
  gateway: Object.freeze({ name: '网关', enabled: true, startOrder: 2 }),
  unrelated: Object.freeze({ name: '其他服务', enabled: true, startOrder: 3 })
});
const healthy = Object.freeze({ running: true, phase: 'running', processAlive: true,
  health: Object.freeze({ healthy: true, checkedAt: '2026-09-18T08:00:00Z' }) });
const plain = (value) => JSON.parse(JSON.stringify(value));
const analyze = (status) => dependencyService.analyze('gateway', services, { eureka: status });

for (const [name, status, ready, reason] of [
  ['running and healthy', healthy, true, null],
  ['health missing', { running: true }, null, 'HEALTH_UNKNOWN'],
  ['health null', { running: true, health: null }, null, 'HEALTH_UNKNOWN'],
  ['health malformed', { running: true, health: { healthy: 'true' } }, null, 'HEALTH_UNKNOWN'],
  ['state missing', undefined, null, 'STATUS_UNKNOWN'],
  ['state null', null, null, 'STATUS_UNKNOWN'],
  ['state malformed', [], null, 'STATUS_UNKNOWN'],
  ['legacy running', true, null, 'HEALTH_UNKNOWN'],
  ['legacy stopped', false, false, 'NOT_RUNNING'],
  ['running string', { running: 'true', health: { healthy: true } }, null, 'STATUS_UNKNOWN'],
  ['health without process', { health: { healthy: true } }, null, 'STATUS_UNKNOWN'],
  ['unhealthy process', { running: true, health: { healthy: false } }, false, 'UNHEALTHY'],
  ['stopped with stale health', { ...healthy, running: false, phase: 'stopped' }, false, 'NOT_RUNNING'],
  ['stopped with stale running flag', { ...healthy, phase: 'stopped' }, false, 'NOT_RUNNING'],
  ['failed with stale health', { ...healthy, phase: 'failed' }, false, 'SERVICE_FAILED'],
  ['reported error', { ...healthy, error: 'startup failed' }, false, 'SERVICE_FAILED'],
  ['dead process', { ...healthy, processAlive: false }, false, 'NOT_RUNNING'],
  ['occupied port', { ...healthy, portOccupied: true }, false, 'PORT_OCCUPIED'],
  ['unknown phase', { ...healthy, phase: 'future-phase' }, null, 'PHASE_UNKNOWN'],
  ...['starting', 'checking_health', 'stopping', 'restarting', 'compiling', 'reloading']
    .map((phase) => [`transition ${phase}`, { ...healthy, phase }, false, 'TRANSITIONING'])
]) {
  test(`dependency readiness: ${name}`, () => {
    const result = analyze(status);
    assert.equal(result.ready, ready);
    assert.equal(result.dependencies[0].available, ready);
    assert.equal(result.dependencies[0].reason, reason);
    assert.equal(result.blockedBy.length, ready === false ? 1 : 0);
    assert.equal(result.unknownDependencies.length, ready === null ? 1 : 0);
    assert.equal(result.source, 'preset');
    assert.equal(result.scope, 'direct');
    assert.equal(result.advisory, true);
  });
}

test('unconfigured or disabled local dependency is unknown, not an inferred remote failure', () => {
  for (const [eureka, reason] of [[undefined, 'NOT_CONFIGURED'], [null, 'NOT_CONFIGURED'],
    [{ enabled: false }, 'DISABLED']]) {
    const result = dependencyService.analyze('gateway', { gateway: {}, eureka }, { eureka: healthy });
    assert.equal(result.ready, null);
    assert.equal(result.dependencies[0].reason, reason);
    assert.equal(result.blockedBy.length, 0);
  }
});

test('unmodelled and nonexistent services do not report that they have no dependencies', () => {
  for (const id of ['unrelated', 'missing', 'constructor', '__proto__']) {
    const result = dependencyService.analyze(id, services, {});
    assert.equal(result.ready, null);
    assert.equal(result.source, 'none');
    assert.deepEqual(result.dependencies, []);
  }
  assert.equal(dependencyService.analyze('eureka', services).ready, true);
  assert.equal(dependencyService.analyze('gateway', { ...services, gateway: { enabled: false } }, { eureka: healthy }).ready, null);
});

test('inherited config or status is never treated as an observation', () => {
  const inheritedConfig = Object.assign(Object.create({ eureka: {} }), { gateway: {} });
  assert.equal(dependencyService.analyze('gateway', inheritedConfig, { eureka: healthy }).dependencies[0].reason, 'NOT_CONFIGURED');
  assert.equal(dependencyService.analyze('gateway', services, Object.create({ eureka: healthy })).dependencies[0].reason, 'STATUS_UNKNOWN');
});

test('build and graph preserve order, copy arrays and never infer edges from order', () => {
  const graph = dependencyService.graph(services);
  assert.deepEqual(graph.map((item) => item.id), ['eureka', 'gateway', 'unrelated']);
  assert.deepEqual(graph[1].edges, [{ from: 'eureka', to: 'gateway' }]);
  assert.deepEqual(graph[2].edges, []);
  graph[1].dependsOn.push('unrelated');
  assert.deepEqual(dependencyService.getDependencies('gateway', services).dependsOn, ['eureka']);
  assert.deepEqual(dependencyService.build(null), []);
  assert.deepEqual(dependencyService.build({ broken: null }), []);
  assert.equal(dependencyService.build({ gateway: { startOrder: 'invalid' } })[0].startOrder, 99);
});

test('analysis is pure and exposes only dependency observation fields', () => {
  const input = Object.freeze({ eureka: healthy });
  const before = JSON.stringify(input);
  const result = dependencyService.analyze('gateway', { ...services, eureka: { ...services.eureka, password: 'not-for-api' } }, input);
  assert.equal(result.dependencies[0].checkedAt, healthy.health.checkedAt);
  assert.equal(JSON.stringify(input), before);
  assert.equal(JSON.stringify(result).includes('not-for-api'), false);
  assert.equal(result.ready, true); // This says nothing about gateway's own health.
});

function statusFixture({ configured = services, statuses = { eureka: healthy, gateway: { running: false, phase: 'stopped' } },
  rejected = {}, allError = null } = {}) {
  const calls = { all: 0, ids: [] };
  const configManager = { getResolvedConfig: () => ({ services: configured }) };
  const processManager = {
    async getAllStatus() { calls.all += 1; if (allError) throw allError; return statuses; },
    async getStatus(id) { calls.ids.push(id); if (rejected[id]) throw rejected[id]; return statuses[id]; }
  };
  const service = load('backend/services/serviceStatusService.js', {
    './configManager': configManager, './processManager': processManager, './dependencyService': dependencyService
  });
  return { service, calls, configManager, processManager, statuses };
}

test('batch status adds one field without changing raw states or repeating probes', async () => {
  const original = Object.freeze({
    gateway: Object.freeze({ running: false, phase: 'failed', pid: 42, error: 'original failure', owned: true, custom: 'keep' }),
    eureka: healthy
  });
  const fixture = statusFixture({ statuses: original });
  const result = await fixture.service.getAllStatus();
  const { dependencyStatus, ...rest } = result.gateway;
  assert.deepEqual(plain(rest), plain(original.gateway));
  assert.equal(dependencyStatus.ready, true);
  assert.equal(result.gateway.phase, 'failed');
  assert.equal(result.gateway.error, 'original failure');
  assert.equal(Object.hasOwn(original.gateway, 'dependencyStatus'), false);
  assert.deepEqual(fixture.calls, { all: 1, ids: [] });
});

test('batch and single-service responses use the same dependency analysis', async () => {
  const fixture = statusFixture();
  const batch = await fixture.service.getAllStatus();
  const single = await fixture.service.getStatus('gateway');
  assert.deepEqual(plain(single), plain(batch.gateway));
  assert.deepEqual(fixture.calls.ids, ['gateway', 'eureka']);
  assert.equal(fixture.calls.all, 1);
});

test('single query does not scan unrelated services and reads direct dependencies concurrently', async () => {
  const pending = {};
  const fixture = statusFixture();
  fixture.processManager.getStatus = (id) => new Promise((resolve) => { pending[id] = resolve; });
  const request = fixture.service.getStatus('gateway');
  assert.deepEqual(Object.keys(pending), ['gateway', 'eureka']);
  pending.eureka(healthy);
  pending.gateway({ running: false });
  assert.equal((await request).dependencyStatus.ready, true);
  assert.equal(fixture.calls.all, 0);
});

test('no dependency means no additional process reads', async () => {
  const fixture = statusFixture();
  await fixture.service.getStatus('eureka');
  assert.deepEqual(fixture.calls, { all: 0, ids: ['eureka'] });
});

test('missing and disabled dependencies are not probed', async () => {
  for (const configured of [{ gateway: {} }, { gateway: {}, eureka: { enabled: false } }]) {
    const fixture = statusFixture({ configured });
    const result = await fixture.service.getStatus('gateway');
    assert.deepEqual(fixture.calls.ids, ['gateway']);
    assert.equal(result.dependencyStatus.ready, null);
  }
});

test('failed dependency observation does not fail the requested service query', async () => {
  const fixture = statusFixture({ rejected: { eureka: new Error('inspection failed') } });
  const result = await fixture.service.getStatus('gateway');
  assert.equal(result.phase, 'stopped');
  assert.equal(result.dependencyStatus.ready, null);
  assert.equal(result.dependencyStatus.dependencies[0].reason, 'STATUS_UNKNOWN');
  assert.equal(result.dependencyStatus.blockedBy.length, 0);
});

test('target and batch errors propagate without masking them', async () => {
  const error = createAppError(503, 'STATUS_UNAVAILABLE', 'cannot inspect');
  const fixture = statusFixture({ rejected: { gateway: error }, allError: error });
  await assert.rejects(fixture.service.getStatus('gateway'), (actual) => actual === error);
  await assert.rejects(fixture.service.getAllStatus(), (actual) => actual === error);
});

test('legacy boolean and null status payloads are left unchanged', async () => {
  const fixture = statusFixture({ statuses: { eureka: false, gateway: null } });
  assert.deepEqual(plain(await fixture.service.getAllStatus()), { eureka: false, gateway: null });
  assert.equal(await fixture.service.getStatus('gateway'), null);
});

function response() {
  return { statusCode: 200, headers: {}, body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(key, value) { this.headers[key] = value; },
    json(body) { this.body = plain(body); return this; } };
}

function controllerFixture(options = {}) {
  const fixture = statusFixture(options);
  const taskCalls = [];
  const job = { jobId: 'job_test', status: 'pending', type: 'service.start' };
  const taskService = Object.fromEntries(['startService', 'stopService', 'restartService', 'reloadService',
    'startAllServices', 'stopAllServices', 'restartAllServices'].map((method) => [method, async (id) => {
    taskCalls.push([method, id]); return job;
  }]));
  const health = { healthy: true, service: 'gateway' };
  const controller = load('backend/controllers/serviceController.js', {
    '../services/serviceStatusService': fixture.service,
    '../services/processManager': { getStatus() { throw new Error('bypassed query view'); }, getAllStatus() { throw new Error('bypassed query view'); } },
    '../services/configManager': fixture.configManager,
    '../services/healthChecker': { check: async () => health },
    '../services/infraChecker': {},
    '../utils/validator': { isValidService: (id) => Object.hasOwn(services, id) },
    '../utils/logger': { broadcast() {} },
    '../services/serviceTaskService': taskService,
    '../services/systemCommandService': {},
    '../services/jobService': {}
  });
  return { ...fixture, controller, taskCalls, job, health };
}

test('both existing query handlers expose dependencyStatus in the unchanged success envelope', async () => {
  const fixture = controllerFixture();
  const batch = response();
  await fixture.controller.getAllStatus({}, batch);
  assert.equal(batch.statusCode, 200);
  assert.equal(batch.body.success, true);
  assert.equal(batch.body.data.gateway.dependencyStatus.ready, true);
  const single = response();
  await fixture.controller.getStatus({ params: { id: 'gateway' } }, single);
  assert.equal(single.statusCode, 200);
  assert.deepEqual(single.body, { success: true, data: batch.body.data.gateway });
  assert.deepEqual(fixture.taskCalls, []);
});

test('invalid service IDs retain the original 400 response before any process query', async () => {
  const fixture = controllerFixture();
  const res = response();
  await fixture.controller.getStatus({ params: { id: '../invalid' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, 'INVALID_SERVICE_ID');
  assert.deepEqual(fixture.calls, { all: 0, ids: [] });
});

test('HTTP handler preserves error code, details and headers from failed status lookup', async () => {
  const failure = createAppError(503, 'STATUS_UNAVAILABLE', 'inspection failed', { retry: true }, { headers: { 'Retry-After': 3 } });
  const fixture = controllerFixture({ rejected: { gateway: failure }, allError: failure });
  for (const method of ['getStatus', 'getAllStatus']) {
    const res = response();
    await fixture.controller[method]({ params: { id: 'gateway' } }, res);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { success: false, error: { code: 'STATUS_UNAVAILABLE', message: 'inspection failed', details: { retry: true } } });
    assert.equal(res.headers['Retry-After'], '3');
  }
});

test('dependency read errors do not turn successful HTTP queries into failures', async () => {
  const fixture = controllerFixture({ rejected: { eureka: new Error('temporary read error') } });
  const res = response();
  await fixture.controller.getStatus({ params: { id: 'gateway' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.dependencyStatus.ready, null);
});

test('service controls and standalone health endpoint remain unchanged', async () => {
  const fixture = controllerFixture();
  for (const method of ['start', 'stop', 'restart', 'reload', 'startAll', 'stopAll', 'restartAll']) {
    const res = response();
    await fixture.controller[method]({ params: { id: 'gateway' } }, res);
    assert.equal(res.statusCode, 202);
    assert.equal(res.body.jobId, fixture.job.jobId);
    assert.deepEqual(res.body.data, fixture.job);
  }
  const res = response();
  await fixture.controller.healthCheck({ params: { id: 'gateway' } }, res);
  assert.deepEqual(res.body, fixture.health);
  assert.equal(Object.hasOwn(res.body, 'dependencyStatus'), false);
  assert.equal(fixture.taskCalls.length, 7);
  assert.deepEqual(fixture.calls, { all: 0, ids: [] });
});
