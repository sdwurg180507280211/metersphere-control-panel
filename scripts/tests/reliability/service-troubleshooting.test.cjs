// Exercise the real stores; isolate only Zustand and the HTTP boundary.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const plain = (value) => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const response = (data) => ({ ok: true, json: async () => ({ success: true, data }) });
function stores(fetch = async () => response({})) {
  function create(initialize) {
    let state;
    const get = () => state;
    const set = (patch) => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; };
    state = initialize(set, get);
    return { getState: get, setState: set };
  }
  const file = path.join(root, 'frontend/src/store/useAppStore.js');
  const source = fs.readFileSync(file, 'utf8').replace("import { create } from 'zustand'", '').replaceAll('export const ', 'const ');
  const module = { exports: {} };
  vm.runInNewContext(source + '\nmodule.exports = { useServiceStore, useWebSocketStore, useLogStore };', {
    module, create, fetch, console, URLSearchParams, Map, Set
  }, { filename: file });
  return module.exports;
}
const advisory = (available = true) => ({ serviceId: 'gateway', source: 'preset', scope: 'direct', advisory: true,
  ready: available, dependencies: [{ id: 'eureka', name: 'Eureka', available, healthy: available }],
  blockedBy: [], unknownDependencies: [] });
const healthy = () => ({ running: true, phase: 'running', pid: 123, processAlive: true,
  health: { healthy: true, checkedAt: '2026-09-18T09:00:00Z' }, dependencyStatus: advisory() });
function seed(store, state = { gateway: healthy(), eureka: healthy() }) {
  store.getState().setCatalog(Object.keys(state).map((id) => ({ id, name: id })));
  store.getState().setServices(state);
}

test('HTTP normalization retains tri-state dependency observations', () => {
  const { useServiceStore: store } = stores();
  for (const value of [true, false, null]) {
    seed(store, { gateway: { ...healthy(), dependencyStatus: advisory(value) } });
    assert.equal(store.getState().services.gateway.dependencyStatus.ready, value);
    assert.equal(store.getState().services.gateway.dependencyStatusStale, false);
  }
});
test('missing dependency field on an authoritative legacy snapshot means no evidence', () => {
  const { useServiceStore: store } = stores();
  seed(store);
  store.getState().setServices({ gateway: { running: true } });
  assert.equal(store.getState().services.gateway.dependencyStatus, null);
});
test('partial events preserve fields, but invalidate health and dependency evidence', () => {
  const { useServiceStore: store } = stores();
  seed(store);
  store.getState().updateServiceStatus('gateway', { phase: 'running' });
  const result = store.getState().services.gateway;
  assert.equal(result.running, true);
  assert.equal(result.pid, 123);
  assert.equal(result.dependencyStatus.source, 'preset');
  assert.equal(result.dependencyStatusStale, true);
  assert.equal(result.healthStale, true);
});
test('a dependency event invalidates dependent hints without changing target lifecycle', () => {
  const { useServiceStore: store } = stores();
  seed(store);
  store.getState().updateServiceStatus('eureka', { phase: 'stopping', running: false });
  const target = store.getState().services.gateway;
  assert.equal(target.running, true);
  assert.equal(target.phase, 'running');
  assert.equal(target.dependencyStatusStale, true);
});
test('explicit null clears old PID, health and dependency evidence', () => {
  const { useServiceStore: store } = stores();
  seed(store);
  store.getState().updateServiceStatus('gateway', { phase: 'stopped', running: false, pid: null,
    health: null, dependencyStatus: null, processAlive: false });
  const next = store.getState().services.gateway;
  assert.equal(next.pid, null);
  assert.equal(next.health, null);
  assert.equal(next.dependencyStatus, null);
});
test('restart progress does not reuse a previous healthy probe', () => {
  const { useServiceStore: store } = stores();
  seed(store);
  store.getState().updateServiceStatus('gateway', { phase: 'restarting' });
  assert.equal(store.getState().services.gateway.health, null);
  assert.equal(store.getState().services.gateway.healthStale, true);
});
test('disconnect invalidates observations, even with no service page mounted', () => {
  const { useServiceStore: store, useWebSocketStore: socket } = stores();
  seed(store);
  socket.getState().setConnected(true);
  socket.getState().setConnected(false);
  assert.equal(store.getState().statusStale, true);
  assert.equal(store.getState().services.gateway.dependencyStatusStale, true);
});
test('status requests are coalesced', async () => {
  const gate = deferred(); let calls = 0;
  const { useServiceStore: store } = stores(async () => { calls++; return gate.promise; });
  const a = store.getState().fetchServices(); const b = store.getState().fetchServices();
  await Promise.resolve();
  assert.equal(calls, 1);
  gate.resolve(response({ gateway: healthy() }));
  await Promise.all([a, b]);
  assert.equal(store.getState().statusRefreshing, false);
  assert.equal(store.getState().statusStale, false);
});
test('an older HTTP response cannot overwrite a newer event; one follow-up is coalesced', async () => {
  const old = deferred(); const fresh = deferred(); let calls = 0;
  const { useServiceStore: store } = stores(() => (++calls === 1 ? old.promise : fresh.promise));
  seed(store);
  const reading = store.getState().fetchServices();
  await Promise.resolve();
  store.getState().updateServiceStatus('gateway', { phase: 'failed', running: false, error: 'new failure' });
  old.resolve(response({ gateway: healthy() }));
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(store.getState().services.gateway.phase, 'failed');
  assert.equal(calls, 2);
  fresh.resolve(response({ gateway: { phase: 'failed', running: false, error: 'confirmed failure' } }));
  await reading;
  assert.equal(store.getState().services.gateway.error, 'confirmed failure');
});
test('repeated concurrent updates do not create an unbounded retry loop', async () => {
  let calls = 0, store;
  ({ useServiceStore: store } = stores(async () => {
    calls++;
    store.getState().updateServiceStatus('gateway', { phase: 'checking_health' });
    return response({ gateway: healthy() });
  }));
  seed(store);
  await store.getState().fetchServices();
  assert.equal(calls, 2);
  assert.equal(store.getState().statusStale, true);
  assert.equal(store.getState().services.gateway.phase, 'checking_health');
});
test('query failure preserves data and marks it stale', async () => {
  const { useServiceStore: store } = stores(async () => { throw new Error('offline'); });
  seed(store);
  await store.getState().fetchServices();
  assert.equal(store.getState().services.gateway.pid, 123);
  assert.equal(store.getState().statusError, 'offline');
  assert.equal(store.getState().statusStale, true);
  assert.equal(store.getState().services.gateway.dependencyStatusStale, true);
});
test('HTTP failure must not be treated as a successful snapshot', async () => {
  const { useServiceStore: store } = stores(async () => ({ ok: false,
    json: async () => ({ success: true, data: { gateway: healthy() } }) }));
  await store.getState().fetchServices();
  assert.equal(store.getState().statusStale, true);
  assert.ok(store.getState().statusError);
});
for (const action of ['start', 'restart', 'stop']) {
  test(`${action} always uses its explicit endpoint, including failed-but-running services`, async () => {
    const sent = [];
    const { useServiceStore: store } = stores(async (url, init) => {
      if (init?.method === 'POST') { sent.push(url); return response({ jobId: 'job_1' }); }
      return response({ gateway: { phase: 'stopped', running: false } });
    });
    seed(store, { gateway: { ...healthy(), phase: 'failed', error: 'health failed' } });
    await store.getState().requestServiceAction('gateway', action);
    assert.deepEqual(sent, [`/api/services/gateway/${action}`]);
    assert.equal(store.getState().loading.gateway, false);
  });
}
test('double clicks cannot send duplicate or competing actions', async () => {
  const gate = deferred(); let posts = 0;
  const { useServiceStore: store } = stores(async (_url, init) => {
    if (init?.method === 'POST') { posts++; return gate.promise; }
    return response({ gateway: { running: false, phase: 'restarting' } });
  });
  seed(store, { gateway: { ...healthy(), phase: 'failed' } });
  const first = store.getState().requestServiceAction('gateway', 'restart');
  const second = await store.getState().requestServiceAction('gateway', 'stop');
  assert.equal(second, null);
  assert.equal(posts, 1);
  gate.resolve(response({ jobId: 'job_1' }));
  await first;
});
test('busy phases reject another action without a POST', async () => {
  let calls = 0;
  const { useServiceStore: store } = stores(async () => { calls++; return response({}); });
  for (const phase of ['starting', 'restarting', 'checking_health', 'stopping', 'processing', 'compiling', 'reloading']) {
    seed(store, { gateway: { phase, running: false } });
    assert.equal(await store.getState().requestServiceAction('gateway', 'restart'), null);
  }
  assert.equal(calls, 0);
});
test('rejected action releases the local lock and reports the original message', async () => {
  const { useServiceStore: store } = stores(async (_url, init) => init?.method === 'POST'
    ? { ok: false, json: async () => ({ success: false, error: { message: '任务锁已占用' } }) }
    : response({ gateway: { phase: 'stopped', running: false } }));
  seed(store, { gateway: { phase: 'stopped', running: false } });
  await assert.rejects(store.getState().requestServiceAction('gateway', 'start'), /任务锁已占用/);
  assert.equal(store.getState().loading.gateway, false);
  assert.equal(store.getState().services.gateway.phase, 'stopped');
});
test('a late POST acknowledgement does not overwrite a newer terminal event', async () => {
  const gate = deferred(); const status = deferred();
  const { useServiceStore: store } = stores((_url, init) => init?.method === 'POST' ? gate.promise : status.promise);
  seed(store, { gateway: { phase: 'stopped', running: false } });
  const action = store.getState().requestServiceAction('gateway', 'start');
  store.getState().updateServiceStatus('gateway', { phase: 'failed', running: false, error: 'terminal' });
  gate.resolve(response({ jobId: 'job_1' }));
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(store.getState().services.gateway.error, 'terminal');
  status.resolve(response({ gateway: { phase: 'failed', running: false, error: 'terminal' } }));
  await action;
});
test('invalid action names cannot create arbitrary endpoints', async () => {
  let calls = 0;
  const { useServiceStore: store } = stores(async () => { calls++; return response({}); });
  await assert.rejects(store.getState().requestServiceAction('gateway', 'delete'), /操作/);
  assert.equal(calls, 0);
});
test('switching native log targets clears old content and ignores late responses', async () => {
  const a = deferred(); const b = deferred();
  const { useLogStore: store } = stores((url) => url.includes('serviceId=gateway') ? a.promise : b.promise);
  const first = store.getState().loadNativeServiceLogs({ serviceId: 'gateway' });
  const second = store.getState().loadNativeServiceLogs({ serviceId: 'eureka' });
  b.resolve(response(['Eureka log'])); await second;
  a.resolve(response(['Gateway log'])); await first;
  assert.equal(store.getState().nativeServiceLogs.serviceId, 'eureka');
  assert.deepEqual(plain(store.getState().nativeServiceLogs.lines.map((item) => item.text)), ['Eureka log']);
});
test('old native log failures cannot hide a newer successful selection', async () => {
  const gate = deferred();
  const { useLogStore: store } = stores((url) => url.includes('serviceId=gateway') ? gate.promise : response(['ok']));
  const first = store.getState().loadNativeServiceLogs({ serviceId: 'gateway' });
  await store.getState().loadNativeServiceLogs({ serviceId: 'eureka' });
  gate.reject(new Error('old missing file')); await first;
  assert.equal(store.getState().nativeServiceLogs.error, '');
  assert.equal(store.getState().nativeServiceLogs.serviceId, 'eureka');
});
test('clearing native logs invalidates pending reads instead of repopulating them', async () => {
  const gate = deferred();
  const { useLogStore: store } = stores(() => gate.promise);
  const reading = store.getState().loadNativeServiceLogs({ serviceId: 'gateway' });
  store.getState().clearNativeServiceLogs();
  gate.resolve(response(['late log'])); await reading;
  assert.equal(store.getState().nativeServiceLogs.lines.length, 0);
  assert.equal(store.getState().nativeServiceLogs.loading, false);
});
