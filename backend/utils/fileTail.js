'use strict';
const fs = require('node:fs');
const { StringDecoder } = require('node:string_decoder');
function watch(file, onText, onError = () => {}) {
  const initial = fs.statSync(file);
  let position = initial.size;
  let inode = initial.ino;
  let decoder = new StringDecoder('utf8');
  let closed = false;
  let running = false;
  let pending = false;
  async function drain() {
    if (closed) return;
    pending = true;
    if (running) return;
    running = true;
    try {
      while (pending && !closed) {
        pending = false;
        const handle = await fs.promises.open(file, 'r');
        try {
          const stat = await handle.stat();
          if (stat.ino !== inode || stat.size < position) {
            position = 0; inode = stat.ino; decoder = new StringDecoder('utf8');
          }
          const remaining = stat.size - position;
          if (remaining <= 0) continue;
          const buffer = Buffer.alloc(Math.min(remaining, 64 * 1024));
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
          position += bytesRead;
          if (bytesRead && !closed) {
            const text = decoder.write(buffer.subarray(0, bytesRead));
            if (text) onText(text);
          }
          pending = pending || (bytesRead > 0 && position < stat.size);
        } finally { await handle.close(); }
        if (pending) await new Promise(setImmediate);
      }
    } catch (error) { if (!closed) onError(error); }
    finally { running = false; }
  }
  const listener = () => { drain().catch(onError); };
  fs.watchFile(file, { interval: 500, persistent: false }, listener);
  return { kill() { closed = true; fs.unwatchFile(file, listener); }, close() { this.kill(); } };
}
module.exports = { watch };
