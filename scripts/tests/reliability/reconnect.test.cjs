const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('./fixtures.cjs');
class Timers {
  constructor() { this.tasks = new Map(); this.sequence = 0; }
  setTimeout(fn, ms) { const id = ++this.sequence; this.tasks.set(id, { fn, ms, repeat: false }); return id; }
  clearTimeout(id) { this.tasks.delete(id); }
  setInterval(fn, ms) { const id = ++this.sequence; this.tasks.set(id, { fn, ms, repeat: true }); return id; }
  clearInterval(id) { this.tasks.delete(id); }
  run(ms) {
    const entry = [...this.tasks.entries()].find(([, task]) => task.ms === ms);
    if (!entry) throw new Error('timer not found: ' + ms);
    const [id, task] = entry; if (!task.repeat) this.tasks.delete(id); task.fn();
  }
}
async function factory() {
  const source = fs.readFileSync(path.join(root, 'frontend/src/utils/reconnectingSocket.js'), 'utf8');
  return (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).createReconnectingSocket;
}
async function fixture() {
  const create = await factory(), sockets = [], states = [], timers = new Timers();
  class WS {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
    send(text) { this.sent.push(text); }
    close() { this.readyState = 3; this.onclose?.({ code: 1006 }); }
    open() { this.readyState = 1; this.onopen?.(); }
  }
  const client = create({ url: () => 'ws://localhost:5001/ws', WebSocketClass: WS, timers, random: () => 0.5,
    onState: (state) => states.push(state), onOpen: (socket) => socket.send('subscribed') });
  return { client, sockets, states, timers };
}
test('socket starts, subscribes once and stops with no remaining timers', async () => {
  const f = await fixture(); f.client.start(); f.sockets[0].open();
  assert.deepEqual(f.sockets[0].sent, ['subscribed']); assert.equal(f.states.at(-1).connected, true);
  f.client.stop(); assert.equal(f.timers.tasks.size, 0); assert.equal(f.states.at(-1).connected, false);
});
test('socket retries after five failures with bounded backoff instead of requiring a page reload', async () => {
  const f = await fixture(); f.client.start();
  for (const wait of [1000, 2000, 4000, 8000, 16000, 32000, 60000]) {
    f.sockets.at(-1).close(); f.timers.run(wait);
  }
  assert.equal(f.sockets.length, 8); f.client.stop();
});
test('manual reconnect invalidates every callback belonging to the previous socket', async () => {
  const f = await fixture(); f.client.start(); const old = f.sockets[0]; old.open(); const oldClose = old.onclose;
  f.client.reconnect(); f.sockets[1].open(); oldClose({ code: 1006 });
  assert.equal(f.states.at(-1).connected, true); assert.equal(f.sockets.length, 2); f.client.stop();
});
test('a connecting socket deadline cannot schedule duplicate retries', async () => {
  const f = await fixture(); f.client.start(); f.timers.run(10000);
  assert.equal(f.timers.tasks.size, 1); f.timers.run(1000); assert.equal(f.sockets.length, 2); f.client.stop();
});
test('successful connection resets retry attempts', async () => {
  const f = await fixture(); f.client.start(); f.sockets[0].close(); f.timers.run(1000); f.sockets[1].open();
  assert.equal(f.states.at(-1).attempts, 0); f.client.stop();
});
test('explicit unauthorized close pauses retries until a manual retry', async () => {
  const f = await fixture(); f.client.start(); f.sockets[0].onclose({ code: 1008, reason: 'UNAUTHORIZED' });
  assert.equal(f.states.at(-1).authFailed, true); assert.equal(f.timers.tasks.size, 0);
  f.client.reconnect(); assert.equal(f.sockets.length, 2); f.client.stop();
});
test('constructor failure is retried instead of throwing out of the hook', async () => {
  const create = await factory(), timers = new Timers(); let attempts = 0;
  const client = create({ url: () => 'invalid', timers, random: () => 0.5, WebSocketClass: class { constructor() { attempts++; throw new Error('bad URL'); } } });
  client.start(); assert.equal(attempts, 1); timers.run(1000); assert.equal(attempts, 2); client.stop();
});
