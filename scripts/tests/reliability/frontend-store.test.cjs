// Real store actions, with only the Zustand factory and fetch boundary isolated.
// This is not a React rendering test or a Vite build.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root } = require('./fixtures.cjs');
function create(initializer) {
  let state;
  const get = () => state;
  const set = (patch) => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; };
  state = initializer(set, get);
  return { getState: get, setState: set };
}
function stores(fetch) {
  const file = path.join(root, 'frontend/src/store/useAppStore.js');
  const source = fs.readFileSync(file, 'utf8').replace("import { create } from 'zustand'", '').replaceAll('export const ', 'const ');
  const module = { exports: {} };
  vm.runInNewContext(source + '\nmodule.exports = { useConfigStore, useServiceStore };', { module, create, fetch, console, URLSearchParams, Map, Set }, { filename: file });
  return module.exports;
}
const page = (revision, editable = { maxLogLines: 1000 }) => ({ editable, resolved: {}, runtime: {}, diagnostics: {}, meta: { revision }, validation: { valid: true, errors: [], warnings: [] } });
const response = (data) => ({ json: async () => ({ success: true, data }) });
test('diagnostics do not advance the revision of an unsaved config draft', async () => {
  let sent;
  const { useConfigStore: store } = stores(async (url, init) => {
    if (url.endsWith('/diagnostics')) return response(page('revision-new'));
    if (init?.method === 'PUT') { sent = JSON.parse(init.body); return response(page('revision-saved', sent.draft)); }
    return response(page('revision-original'));
  });
  await store.getState().fetchConfig();
  store.getState().updateDraft('maxLogLines', 2000);
  await store.getState().refreshDiagnostics();
  assert.equal(store.getState().meta.revision, 'revision-new');
  assert.equal(store.getState().snapshotRevision, 'revision-original');
  await store.getState().saveConfig();
  assert.equal(sent.revision, 'revision-original');
  assert.equal(sent.draft.maxLogLines, 2000);
  assert.equal(store.getState().snapshotRevision, 'revision-saved');
});
test('a conflict response preserves the draft and its original revision', async () => {
  const { useConfigStore: store } = stores(async (_url, init) => init?.method === 'PUT'
    ? { json: async () => ({ success: false, error: { message: '配置已变化', code: 'CONFIG_CONFLICT' } }) }
    : response(page('original')));
  await store.getState().fetchConfig();
  store.getState().updateDraft('maxLogLines', 2000);
  await assert.rejects(store.getState().saveConfig(), /配置已变化/);
  assert.equal(store.getState().draft.maxLogLines, 2000);
  assert.equal(store.getState().snapshotRevision, 'original');
  assert.equal(store.getState().saving, false);
  assert.ok(store.getState().dirtyFields.length > 0);
});
test('edits typed during a pending save remain dirty after the earlier save succeeds', async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const { useConfigStore: store } = stores(async (_url, init) => init?.method === 'PUT' ? pending : response(page('original')));
  await store.getState().fetchConfig();
  store.getState().updateDraft('maxLogLines', 2000);
  const saving = store.getState().saveConfig();
  store.getState().updateDraft('maxLogLines', 3000);
  resolve(response(page('saved', { maxLogLines: 2000 })));
  await saving;
  assert.equal(store.getState().snapshot.maxLogLines, 2000);
  assert.equal(store.getState().draft.maxLogLines, 3000);
  assert.equal(store.getState().snapshotRevision, 'saved');
  assert.ok(store.getState().dirtyFields.includes('maxLogLines'));
});
test('service normalization preserves separate ownership and unhealthy evidence', () => {
  const { useServiceStore: store } = stores();
  store.getState().setServices({ gateway: { running: true, phase: 'running', owned: true, processAlive: true, portOccupied: false, health: { healthy: false, error: 'DOWN' } } });
  const result = store.getState().services.gateway;
  assert.equal(result.running, true);
  assert.equal(result.owned, true);
  assert.equal(result.health.healthy, false);
  assert.equal(result.processAlive, true);
});
test('an explicit null health observation clears previously healthy evidence', () => {
  const { useServiceStore: store } = stores();
  store.getState().setServices({ gateway: { running: true, health: { healthy: true } } });
  store.getState().updateServiceStatus('gateway', { running: false, phase: 'stopped', processAlive: false, health: null });
  assert.equal(store.getState().services.gateway.health, null);
  assert.equal(store.getState().services.gateway.processAlive, false);
});
