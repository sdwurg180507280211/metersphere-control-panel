'use strict';

function bounded(promise, timeoutMs, message = '操作超时') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(message), { code: 'STARTUP_TIMEOUT' })), timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}
function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => { server.removeListener('listening', onListening); reject(error); };
    const onListening = () => { server.removeListener('error', onError); resolve(server); };
    server.once('error', onError);
    server.once('listening', onListening);
    try { server.listen(port, host); }
    catch (error) { server.removeListener('listening', onListening); server.removeListener('error', onError); reject(error); }
  });
}
async function close(server, timeoutMs = 2000) {
  if (!server?.listening) return;
  let timer;
  await new Promise((resolve) => {
    let settled = false;
    const done = () => { if (settled) return; settled = true; clearTimeout(timer); resolve(); };
    timer = setTimeout(() => { server.closeAllConnections?.(); done(); }, timeoutMs);
    try { server.close(done); server.closeIdleConnections?.(); }
    catch { done(); }
  });
}
async function start({ server, port, host, initialize, cleanup, timeoutMs = 30000, onState = () => {} }) {
  const abort = new AbortController();
  onState({ phase: 'starting', ready: false });
  // EADDRINUSE is retryable and must not destroy shared singleton services.
  try { await listen(server, port, host); }
  catch (error) { onState({ phase: 'failed', ready: false, error: error.message }); throw error; }
  try {
    await bounded(Promise.resolve().then(() => initialize(abort.signal)), timeoutMs, '后端初始化超时');
    onState({ phase: 'ready', ready: true });
    return server;
  } catch (error) {
    abort.abort(error);
    onState({ phase: 'failed', ready: false, error: error.message });
    try { await bounded(Promise.resolve().then(() => cleanup?.()), 5000, '启动清理超时'); } catch {}
    await close(server);
    throw error;
  }
}
module.exports = { start, listen, close, bounded };
