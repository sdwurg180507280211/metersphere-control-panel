// Execute the actual SQL component callback, isolating React state setters and fetch.
// This does not render the component or prove browser/Electron behavior.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root } = require('./fixtures.cjs');
function fixture(fetch, { storageFails = false } = {}) {
  const source = fs.readFileSync(path.join(root, 'frontend/src/components/SqlTab.jsx'), 'utf8');
  const callback = source.slice(source.indexOf('  const executeQuery = useCallback'), source.indexOf('  const formatSql ='));
  const state = {}, ref = { current: null }, messages = [];
  const toast = (message) => messages.push(message); toast.error = toast;
  const module = { exports: {} };
  vm.runInNewContext(callback + '\nmodule.exports = executeQuery;', {
    module, useCallback: (fn) => fn, sql: 'SELECT 1', history: [], fetch, queryRef: ref, AbortController, toast,
    localStorage: { setItem() { if (storageFails) throw new Error('quota'); } },
    setResult: (value) => { state.result = value; }, setLoading: (value) => { state.loading = value; },
    setError: (value) => { state.error = value; }, setCurrentPage: (value) => { state.page = value; },
    setHistory: (value) => { state.history = value; }
  });
  return { run: module.exports, ref, state, messages };
}
const response = (data, ok = true) => ({ ok, json: async () => data });
test('SQL callback passes the AbortSignal and accepts successful bounded results', async () => {
  let signal;
  const f = fixture(async (_url, init) => { signal = init.signal; return response({ success: true, rows: [], columns: [], rowCountExact: false }); });
  await f.run();
  assert.ok(signal instanceof AbortSignal); assert.equal(f.state.result.rowCountExact, false);
  assert.equal(f.ref.current, null); assert.equal(f.state.loading, false);
});
test('SQL callback prevents duplicate execution before React can re-render', async () => {
  let complete, count = 0;
  const waiting = new Promise((resolve) => { complete = resolve; });
  const f = fixture(() => { count++; return waiting; });
  const first = f.run(); await f.run(); assert.equal(count, 1);
  complete(response({ success: true, rows: [], columns: [] })); await first;
});
test('cancelling the request aborts fetch and settles loading without a misleading network error', async () => {
  const f = fixture((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))));
  const running = f.run(); f.ref.current.abort(); await running;
  assert.equal(f.state.loading, false); assert.equal(f.state.error, null);
  assert.equal(f.state.result, null);
  assert.ok(f.messages.includes('查询已取消'));
});
test('a response after unmount cannot publish stale results', async () => {
  let complete;
  const f = fixture(() => new Promise((resolve) => { complete = resolve; }));
  const running = f.run(); f.ref.current.abort(); f.ref.current = null;
  complete(response({ success: true, rows: [{ id: 'late' }], columns: ['id'] }));
  await running; assert.equal(f.state.result, null);
});
test('history quota failure does not turn a successful query into a network error', async () => {
  const f = fixture(async () => response({ success: true, rows: [], columns: [] }), { storageFails: true });
  await f.run(); assert.equal(f.state.result.success, true); assert.equal(f.state.error, null);
  assert.ok(f.messages.includes('查询已完成，但浏览器历史记录保存失败'));
});
test('structured HTTP failures are rendered as a message rather than a React object', async () => {
  const f = fixture(async () => response({ error: { message: 'not authorized' } }, false));
  await f.run(); assert.equal(f.state.error, 'not authorized'); assert.equal(f.state.result, null);
});
