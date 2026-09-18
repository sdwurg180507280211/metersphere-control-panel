'use strict';
function singleFlightPool(initialize) {
  let value = null;
  let pending = null;
  let closing = null;
  async function get() {
    if (closing) throw Object.assign(new Error('连接池正在关闭'), { code: 'POOL_CLOSING' });
    if (value) return value;
    if (!pending) pending = Promise.resolve().then(initialize).then((result) => { value = result; return result; })
      .finally(() => { pending = null; });
    return pending;
  }
  function close() {
    if (closing) return closing;
    closing = (async () => {
      if (pending) await pending.catch(() => {});
      const pool = value; value = null;
      if (pool) await pool.end();
    })().finally(() => { closing = null; });
    return closing;
  }
  return { get, close };
}
module.exports = { singleFlightPool };
