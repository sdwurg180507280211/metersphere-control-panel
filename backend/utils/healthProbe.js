'use strict';
const http = require('node:http');
function probe({ host = 'localhost', port, path, timeout = 2000, signal, maxBytes = 64 * 1024 }, request = http.get) {
  return new Promise((resolve) => {
    let req;
    let timer;
    let settled = false;
    let body = '';
    let bytes = 0;
    const finish = (result) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(result);
    };
    const fail = (message) => { finish({ statusCode: null, payload: null, error: message }); req?.destroy(); };
    const abort = () => fail('检查已取消');
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    timer = setTimeout(() => fail('超时'), timeout);
    try {
      req = request({ host, port, path }, (res) => {
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          bytes += Buffer.byteLength(chunk);
          if (bytes > maxBytes) { fail('健康响应超过大小限制'); return; }
          if (!settled) body += chunk;
        });
        res.once('aborted', () => fail('健康响应被中断'));
        res.once('error', () => fail('健康响应读取失败'));
        res.once('end', () => {
          let payload = null;
          try { payload = JSON.parse(body); } catch {}
          finish({ statusCode: res.statusCode, payload, error: null });
        });
      });
      req.once('error', () => fail('连接失败'));
    } catch { fail('连接失败'); }
  });
}
module.exports = { probe };
