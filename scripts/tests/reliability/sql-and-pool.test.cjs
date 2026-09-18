const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { runQuery, acquire } = require('../../../backend/utils/boundedSql');
const { singleFlightPool } = require('../../../backend/utils/singleFlightPool');
function connection(emit) {
  const conn = new EventEmitter(); conn.releases = 0; conn.destroys = 0;
  conn.release = () => { conn.releases += 1; };
  conn.destroy = () => { conn.destroys += 1; };
  conn.query = (options) => {
    conn.options = options;
    const query = new EventEmitter();
    process.nextTick(() => emit?.(query, conn));
    return query;
  };
  return conn;
}
test('SQL is not rewritten and result rows are buffered only to the display limit', async () => {
  const sql = 'SELECT * FROM huge_table';
  const conn = connection((q) => { q.emit('fields', [{ name: 'id' }]); for (let id = 0; id < 100000; id++) q.emit('result', { id }); q.emit('end'); });
  const result = await runQuery(conn, sql, { limit: 10 });
  assert.equal(conn.options.sql, sql); assert.equal(result.rows.length, 10);
  assert.equal(result.observedRows, 11); assert.equal(result.truncated, true); assert.equal(result.rowCountExact, false);
  assert.equal(conn.destroys, 1); assert.equal(conn.releases, 0);
});
test('SQL exact-limit result can complete without false truncation', async () => {
  const conn = connection((q) => { q.emit('fields', [{ name: 'id' }]); q.emit('result', { id: 1 }); q.emit('result', { id: 2 }); q.emit('end'); });
  const result = await runQuery(conn, 'SELECT id', { limit: 2 });
  assert.equal(result.rowCount, 2); assert.equal(result.rowCountExact, true); assert.equal(conn.releases, 1);
});
test('SQL result byte cap also handles very wide rows', async () => {
  const conn = connection((q) => { q.emit('fields', [{ name: 'data' }]); q.emit('result', { data: 'x'.repeat(1000) }); });
  const result = await runQuery(conn, 'SELECT data', { maxBytes: 50 });
  assert.equal(result.rows.length, 0); assert.equal(result.truncated, true); assert.equal(conn.destroys, 1);
});
test('SQL driver error destroys rather than reusing a possibly corrupt connection', async () => {
  const conn = connection((q) => q.emit('error', Object.assign(new Error('driver failure'), { code: 'DRIVER' })));
  await assert.rejects(runQuery(conn, 'SELECT 1'), { code: 'DRIVER' });
  assert.equal(conn.destroys, 1); assert.equal(conn.releases, 0);
});
test('SQL query timeout terminates its dedicated connection', async () => {
  const conn = connection();
  await assert.rejects(runQuery(conn, 'SELECT SLEEP(100)', { timeout: 15 }), { code: 'SQL_TIMEOUT' });
  assert.equal(conn.destroys, 1);
});
test('SQL abort before query never issues SQL', async () => {
  const abort = new AbortController(); abort.abort(); const conn = connection();
  await assert.rejects(runQuery(conn, 'SELECT 1', { signal: abort.signal }), { code: 'SQL_CANCELLED' });
  assert.equal(conn.options, undefined); assert.equal(conn.destroys, 1);
});
test('SQL abort during query settles promptly and only once', async () => {
  const abort = new AbortController();
  const conn = connection((q) => { abort.abort(); q.emit('end'); q.emit('error', new Error('late error')); });
  await assert.rejects(runQuery(conn, 'SELECT 1', { signal: abort.signal }), { code: 'SQL_CANCELLED' });
  assert.equal(conn.destroys, 1);
});
test('SQL transport closure is not treated as successful completion', async () => {
  const conn = connection((q, c) => c.emit('end'));
  await assert.rejects(runQuery(conn, 'SELECT 1'), { code: 'SQL_CONNECTION_CLOSED' });
});
test('SQL non-row metadata stays separate from rows', async () => {
  const conn = connection((q) => { q.emit('result', { affectedRows: 0, warningStatus: 0 }); q.emit('end'); });
  const result = await runQuery(conn, 'SET @example = 1');
  assert.equal(result.metadata.affectedRows, 0); assert.equal(result.rows.length, 0); assert.equal(result.truncated, false);
});
test('queued connection arriving after timeout is released', async () => {
  let callback; const pool = { getConnection(cb) { callback = cb; } }; const conn = connection();
  await assert.rejects(acquire(pool, { timeout: 10 }), { code: 'SQL_QUEUE_TIMEOUT' });
  callback(null, conn); assert.equal(conn.releases, 1);
});
test('aborted queued request does not leak a late connection', async () => {
  let callback; const pool = { getConnection(cb) { callback = cb; } }; const conn = connection();
  const abort = new AbortController(); const waiting = acquire(pool, { signal: abort.signal }); abort.abort();
  await assert.rejects(waiting, { code: 'SQL_CANCELLED' }); callback(null, conn); assert.equal(conn.releases, 1);
});
test('single-flight pool initializes once for simultaneous requests', async () => {
  let count = 0; const pool = { end: async () => {} };
  const manager = singleFlightPool(async () => { count++; await new Promise((r) => setTimeout(r, 5)); return pool; });
  const result = await Promise.all([manager.get(), manager.get(), manager.get()]);
  assert.equal(count, 1); assert.ok(result.every((p) => p === pool)); await manager.close();
});
test('failed pool initialization can retry without poisoning the single flight', async () => {
  let count = 0; const manager = singleFlightPool(async () => { if (++count === 1) throw new Error('verify failed'); return { end: async () => {} }; });
  await assert.rejects(manager.get()); await manager.get(); assert.equal(count, 2); await manager.close();
});
test('pool shutdown waits for initialization and rejects new requests', async () => {
  let ready, ended = 0; const manager = singleFlightPool(() => new Promise((r) => { ready = r; }));
  const first = manager.get(); await Promise.resolve(); const closing = manager.close();
  await assert.rejects(manager.get(), { code: 'POOL_CLOSING' });
  ready({ end: async () => { ended++; } }); await first; await closing; assert.equal(ended, 1);
});
test('concurrent close calls close the pool only once', async () => {
  let ends = 0; const manager = singleFlightPool(async () => ({ end: async () => { ends++; await new Promise((r) => setTimeout(r, 5)); } }));
  await manager.get(); await Promise.all([manager.close(), manager.close()]); assert.equal(ends, 1);
});
