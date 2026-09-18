const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { load } = require('./fixtures.cjs');
const auth = require('../../../backend/services/localAuthService');
function req(overrides = {}) {
  return { method: 'GET', url: '/ws', socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:5001', origin: 'http://127.0.0.1:5001', ...(overrides.headers || {}) }, ...overrides,
    ...(overrides.headers ? { headers: { host: '127.0.0.1:5001', origin: 'http://127.0.0.1:5001', ...overrides.headers } } : {}) };
}
test('WebSocket rejects cross-site loopback requests without relying on GET origin exemption', () => {
  auth.configureOrigins({ port: 5001 });
  const request = req({ headers: { origin: 'https://evil.example' } });
  assert.equal(auth.verifyOrigin(request), true); // GET remains a safe HTTP read.
  assert.equal(auth.requiresToken(request), false); // Preserve documented local CLI compatibility.
  assert.equal(auth.verifyWebSocketRequest(request), false); // Dedicated upgrade check must reject.
});
test('WebSocket cannot use a valid token to bypass an untrusted browser Origin', () => {
  assert.equal(auth.verifyWebSocketRequest(req({ url: '/ws?token=' + auth.getToken(), headers: { origin: 'https://evil.example' } })), false);
});
test('HTTP writes and WS accept only configured local browser origins', () => {
  auth.configureOrigins({ port: 5001, origins: ['http://localhost:3001'] });
  for (const origin of ['http://127.0.0.1:5001', 'http://localhost:5001', 'http://localhost:3001']) {
    assert.equal(auth.verifyWebSocketRequest(req({ headers: { origin } })), true);
    assert.equal(auth.verifyOrigin(req({ method: 'POST', headers: { origin } })), true);
  }
  for (const origin of ['http://localhost:9000', 'null', 'https://evil.example', 'http://localhost:5001.evil.example']) {
    assert.equal(auth.verifyWebSocketRequest(req({ headers: { origin } })), false);
    assert.equal(auth.verifyOrigin(req({ method: 'POST', headers: { origin } })), false);
  }
});
test('native WebSocket clients without Origin must carry token', () => {
  assert.equal(auth.verifyWebSocketRequest(req({ headers: { origin: undefined } })), false);
  assert.equal(auth.verifyWebSocketRequest(req({ headers: { origin: undefined, 'x-ms-local-token': auth.getToken() } })), true);
});
test('strict local token mode and malformed Host fail closed', () => {
  const old = process.env.MS_REQUIRE_LOCAL_TOKEN;
  try {
    process.env.MS_REQUIRE_LOCAL_TOKEN = '1';
    assert.equal(auth.verifyWebSocketRequest(req()), false);
    assert.equal(auth.verifyWebSocketRequest(req({ url: '/ws?token=' + auth.getToken() })), true);
  } finally { if (old === undefined) delete process.env.MS_REQUIRE_LOCAL_TOKEN; else process.env.MS_REQUIRE_LOCAL_TOKEN = old; }
  assert.equal(auth.requiresToken(req({ headers: { host: '' } })), true);
  assert.equal(auth.requiresToken(req({ headers: { host: 'evil.example:5001' } })), true);
});
test('IPv6 loopback and explicit default port origins normalize correctly', () => {
  auth.configureOrigins({ port: 80 });
  assert.equal(auth.verifyWebSocketRequest(req({ socket: { remoteAddress: '::1' }, headers: { host: '[::1]', origin: 'http://[::1]' } })), true);
});
test('untrusted origin configuration is rejected', () => {
  assert.throws(() => auth.configureOrigins({ port: 5001, origins: ['https://evil.example'] }));
});
class MockWSS extends EventEmitter {
  constructor(options) { super(); this.options = options; this.clients = new Set(); this.upgrades = 0; }
  handleUpgrade(req, socket, head, done) { this.upgrades += 1; done(socket.websocket); }
  close(done) { this.emit('close'); done?.(); }
}
class Client extends EventEmitter {
  constructor() { super(); this.readyState = 1; this.bufferedAmount = 0; this.sent = []; this.terminated = 0; }
  send(text, done) { this.sent.push(JSON.parse(text)); done?.(); }
  close(code, reason) { this.closed = { code, reason }; }
  terminate() { this.terminated += 1; this.readyState = 3; }
  ping() { this.pings = (this.pings || 0) + 1; }
}
function fixture(t) {
  auth.configureOrigins({ port: 5001 });
  const service = load('backend/services/websocketService.js', { ws: { WebSocketServer: MockWSS }, './localAuthService': auth });
  const server = new EventEmitter(); service.init(server);
  t.after(() => service.destroy());
  const ws = new Client(); service.wss.emit('connection', ws);
  const id = [...service.clients.keys()][0];
  return { service, server, ws, id };
}
test('WS upgrade rejects malicious Origin before the driver handles it', (t) => {
  const { service, server } = fixture(t);
  const socket = { output: '', write(text) { this.output += text; }, destroy() { this.destroyed = true; } };
  server.emit('upgrade', req({ headers: { origin: 'https://evil.example' } }), socket, Buffer.alloc(0));
  assert.equal(socket.destroyed, true); assert.match(socket.output, /401/); assert.equal(service.wss.upgrades, 0);
});
test('WS initialization is idempotent and destroy removes listeners/timers', async (t) => {
  const { service, server } = fixture(t);
  service.init(server); assert.equal(server.listenerCount('upgrade'), 1);
  assert.equal(service.wss.options.maxPayload, 65536);
  await service.destroy(); assert.equal(server.listenerCount('upgrade'), 0);
  assert.equal(service.heartbeatInterval, null); assert.equal(service.clients.size, 0);
});
test('WS channel validation rejects unbounded and malformed subscriptions', (t) => {
  const { service, id, ws } = fixture(t);
  service._handleMessage(id, { type: 'subscribe', channels: Array(65).fill('x') });
  assert.equal(ws.closed.code, 1008);
  service._handleMessage(id, { type: 'subscribe', channels: 'not-array' });
  assert.equal(ws.closed.code, 1008);
});
test('slow log consumer gets explicit gap notification when capacity returns', (t) => {
  const { service, id, ws } = fixture(t);
  service._handleMessage(id, { type: 'subscribe', channels: ['logs:build'] });
  ws.bufferedAmount = 1024 * 1024;
  service.broadcast('logs:build', { message: 'omitted' });
  assert.equal(service.clients.get(id).droppedLogs, 1);
  ws.bufferedAmount = 0; service.broadcast('logs:build', { message: 'next' });
  assert.ok(ws.sent.some((frame) => frame.type === 'stream:gap' && frame.droppedLogs === 1));
  assert.ok(ws.sent.some((frame) => frame.data?.message === 'next'));
});
test('control events under backpressure force reconnect, never silently disappear', (t) => {
  const { service, id, ws } = fixture(t);
  service._handleMessage(id, { type: 'subscribe', channels: ['job:completed'] });
  ws.bufferedAmount = 1024 * 1024; service.broadcastJobCompleted({ jobId: 'j1' });
  assert.equal(ws.terminated, 1);
});
test('native pong updates liveness and stale clients are terminated', (t) => {
  const { service, id, ws } = fixture(t);
  service.clients.get(id).lastPing = 0; ws.emit('pong');
  assert.ok(service.clients.get(id).lastPing > 0);
  service.clients.get(id).lastPing = 0; service._checkHeartbeats();
  assert.equal(ws.terminated, 1); assert.equal(service.clients.size, 0);
});
test('invalid cancel message cannot reach process control', (t) => {
  const { service, id, ws } = fixture(t);
  service._handleMessage(id, { type: 'cancelBuild', buildId: '../../anything' });
  assert.equal(ws.closed.reason, 'INVALID_BUILD_ID');
});
