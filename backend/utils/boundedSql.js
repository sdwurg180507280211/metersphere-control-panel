'use strict';
// The driver query is never rewritten. Limits protect result buffering, not permissions.
function runQuery(connection, sql, { limit = 1000, timeout = 30000, maxBytes = 8 * 1024 * 1024, signal } = {}) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let fields = [];
    let bytes = 0;
    let seen = 0;
    let settled = false;
    let query;
    let metadata = null;
    let timer;
    const started = Date.now();
    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      connection.removeListener('error', onError);
      connection.removeListener('end', onConnectionEnd);
    }
    function finish(error, truncated = false) {
      if (settled) return;
      settled = true;
      cleanup();
      // A stream.destroy() alone does not reliably terminate a mysql2 query.
      if (error || truncated) { connection.once('error', () => {}); connection.destroy(); }
      else connection.release();
      if (error) { reject(error); return; }
      resolve({
        success: true, columns: fields.map((field) => field.name), rows,
        rowCount: rows.length, rowCountExact: !truncated, observedRows: seen,
        truncated, resultBytes: bytes, executionTime: Date.now() - started,
        ...(metadata ? { metadata } : {})
      });
    }
    function onError(error) { finish(error); }
    function onAbort() { finish(Object.assign(new Error('SQL 查询已取消'), { code: 'SQL_CANCELLED' })); }
    function onConnectionEnd() { finish(Object.assign(new Error('SQL 连接提前关闭'), { code: 'SQL_CONNECTION_CLOSED' })); }
    connection.once('error', onError);
    connection.once('end', onConnectionEnd);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    timer = setTimeout(() => finish(Object.assign(new Error('SQL 查询超时，连接已销毁'), { code: 'SQL_TIMEOUT' })), timeout);
    try {
      query = connection.query({ sql, timeout });
      query.on('fields', (value) => { fields = Array.isArray(value) ? value : []; });
      query.on('result', (row) => {
        if (settled) return;
        if (!fields.length && row && typeof row.affectedRows === 'number' && !Array.isArray(row)) {
          metadata = row; return;
        }
        seen += 1;
        let rowBytes;
        try { rowBytes = Buffer.byteLength(JSON.stringify(row, (_, value) => typeof value === 'bigint' ? value.toString() : value)); }
        catch (error) { finish(error); return; }
        if (rows.length >= limit || bytes + rowBytes > maxBytes) { finish(null, true); return; }
        bytes += rowBytes;
        rows.push(row);
      });
      query.once('error', onError);
      query.once('end', () => finish());
    } catch (error) { finish(error); }
  });
}
function acquire(pool, { timeout = 10000, signal } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const fail = (error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort); reject(error);
    };
    const onAbort = () => fail(Object.assign(new Error('SQL 查询已取消'), { code: 'SQL_CANCELLED' }));
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    timer = setTimeout(() => fail(Object.assign(new Error('等待 SQL 连接超时'), { code: 'SQL_QUEUE_TIMEOUT' })), timeout);
    try {
      pool.getConnection((error, connection) => {
        if (settled) { connection?.release(); return; }
        if (error) { fail(error); return; }
        settled = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort); resolve(connection);
      });
    } catch (error) { fail(error); }
  });
}
module.exports = { runQuery, acquire };
