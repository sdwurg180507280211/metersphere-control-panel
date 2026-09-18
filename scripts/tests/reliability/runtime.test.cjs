const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { temp } = require('./fixtures.cjs');
const identity = require('../../../backend/services/processIdentityService');
const lifecycle = require('../../../backend/utils/startupLifecycle');
const { probe } = require('../../../backend/utils/healthProbe');
const { fingerprint, toolchain } = require('../../../backend/utils/dependencyFingerprint');
const { acknowledge } = require('../../../backend/utils/desktopReadiness');
const { watch } = require('../../../backend/utils/fileTail');
function context(t) {
  const root = temp(t); fs.mkdirSync(path.join(root, 'module')); fs.writeFileSync(path.join(root, 'module/pom.xml'), '<project/>');
  return { projectRoot: root, pom: 'module/pom.xml' };
}
function observed(ctx, extra = {}) { return { pid: 400001, started: 'boot:100', cwd: ctx.projectRoot, argv: ['/bin/sh', path.join(ctx.projectRoot, 'mvnw'), '-f', ctx.pom, 'spring-boot:run'], ...extra }; }
test('process identity binds PID, start stamp, project root and POM', async (t) => {
  const ctx = context(t); const record = await identity.identify(400001, ctx, null, async () => observed(ctx));
  assert.equal(record.pid, 400001); assert.equal(record.projectRoot, ctx.projectRoot); assert.equal(record.pom, path.join(ctx.projectRoot, ctx.pom));
  assert.ok(await identity.identify(400001, ctx, record, async () => observed(ctx)));
});
test('a recycled PID is never accepted using an old identity record', async (t) => {
  const ctx = context(t); const record = await identity.identify(400001, ctx, null, async () => observed(ctx));
  assert.equal(await identity.identify(400001, ctx, record, async () => observed(ctx, { started: 'boot:200' })), null);
});
test('same relative POM in another checkout is not this project', async (t) => {
  const ctx = context(t), other = context(t);
  assert.equal(await identity.identify(400001, ctx, null, async () => observed(ctx, { cwd: other.projectRoot })), null);
});
test('an unrelated process mentioning a POM cannot be cold-adopted', async (t) => {
  const ctx = context(t);
  assert.equal(await identity.identify(400001, ctx, null, async () => observed(ctx, { argv: ['cat', ctx.pom] })), null);
  assert.equal(await identity.identify(400001, ctx, null, async () => observed(ctx, { argv: ['node', 'other.js', '-f', ctx.pom] })), null);
});
test('POM suffix matches and a POM outside the root are rejected', async (t) => {
  const ctx = context(t);
  assert.equal(await identity.identify(400001, ctx, null, async () => observed(ctx, { argv: ['mvn', '-f', ctx.pom + '.other'] })), null);
  assert.equal(await identity.identify(400001, { ...ctx, pom: '../missing.xml' }, null, async () => observed(ctx)), null);
});
test('PID zero, one, own process and malformed values fail closed', async (t) => {
  const ctx = context(t);
  for (const pid of [0, 1, -1, process.pid, NaN, 'x', 1.5]) assert.equal(await identity.identify(pid, ctx), null);
});
test('identity records are private and corrupt records are distinguishable from missing ones', (t) => {
  const file = identity.identityPath(temp(t), 'gateway');
  assert.equal(identity.readIdentity(file), null);
  identity.saveIdentity(file, { schema: 1, pid: 400001 });
  assert.equal(identity.readIdentity(file).pid, 400001);
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  fs.writeFileSync(file, 'bad'); assert.equal(identity.readIdentity(file).invalid, true);
  assert.throws(() => identity.identityPath(path.dirname(file), '../../escape'));
});
test('native inspector observes a real owned fixture process without signalling any foreign process', { skip: !['linux', 'darwin'].includes(process.platform) }, async (t) => {
  const ctx = context(t);
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 2000)'], { cwd: ctx.projectRoot, stdio: 'ignore' });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  await once(child, 'spawn');
  const value = await identity.inspect(child.pid);
  assert.equal(value.cwd, ctx.projectRoot); assert.ok(value.started); assert.ok(value.argv?.[0] || value.command);
  await once(child, 'exit'); assert.equal(await identity.inspect(child.pid), null);
});
test('startup initialization rejection propagates and closes the HTTP listener', async () => {
  const server = http.createServer(); let cleaned = 0; const states = [];
  await assert.rejects(lifecycle.start({ server, port: 0, host: '127.0.0.1', initialize: async () => { throw new Error('fixture failure'); }, cleanup: () => { cleaned++; }, onState: (s) => states.push(s) }), /fixture failure/);
  assert.equal(server.listening, false); assert.equal(cleaned, 1); assert.equal(states.at(-1).phase, 'failed');
});
test('startup deadline aborts initialization instead of leaving the promise pending', async () => {
  const server = http.createServer(); let signal;
  await assert.rejects(lifecycle.start({ server, port: 0, host: '127.0.0.1', timeoutMs: 15, initialize: (value) => { signal = value; return new Promise(() => {}); } }), { code: 'STARTUP_TIMEOUT' });
  assert.equal(signal.aborted, true); assert.equal(server.listening, false);
});
test('successful startup becomes ready before resolution', async () => {
  const server = http.createServer(); let state;
  await lifecycle.start({ server, port: 0, host: '127.0.0.1', initialize: async () => {}, onState: (value) => { state = value; } });
  assert.equal(state.ready, true); assert.equal(server.listening, true); await lifecycle.close(server);
});
test('port collision is rejected without destroying shared runtime services', async (t) => {
  const first = http.createServer(); await lifecycle.listen(first, 0, '127.0.0.1'); t.after(() => lifecycle.close(first));
  let cleanups = 0; const second = http.createServer();
  await assert.rejects(lifecycle.start({ server: second, port: first.address().port, host: '127.0.0.1', initialize: async () => {}, cleanup: () => { cleanups++; } }), { code: 'EADDRINUSE' });
  assert.equal(cleanups, 0);
});
async function healthServer(t, handler) {
  const server = http.createServer(handler); await lifecycle.listen(server, 0, '127.0.0.1');
  t.after(() => lifecycle.close(server, 100)); return { host: '127.0.0.1', port: server.address().port, path: '/' };
}
test('health probe bounds response bytes', async (t) => {
  const target = await healthServer(t, (req, res) => res.end('x'.repeat(1024)));
  assert.match((await probe({ ...target, maxBytes: 32 })).error, /大小限制/);
});
test('health probe tolerates malformed JSON without calling it UP', async (t) => {
  const target = await healthServer(t, (req, res) => res.end('<html>not actuator</html>'));
  const result = await probe(target); assert.equal(result.statusCode, 200); assert.equal(result.payload, null);
});
test('health probe uses a wall deadline even when a peer keeps sending bytes', async (t) => {
  const target = await healthServer(t, (req, res) => {
    const timer = setInterval(() => res.write('x'), 3); res.once('close', () => clearInterval(timer));
  });
  assert.equal((await probe({ ...target, timeout: 20 })).error, '超时');
});
test('health probe supports cancellation', async () => {
  const abort = new AbortController(); abort.abort();
  assert.equal((await probe({ port: 1, path: '/', signal: abort.signal })).error, '检查已取消');
});
test('dependency fingerprint changes on manifest edits even with an unchanged lockfile', async (t) => {
  const root = temp(t); fs.writeFileSync(path.join(root, 'package.json'), '{"name":"one"}'); fs.writeFileSync(path.join(root, 'package-lock.json'), '{}');
  const tools = { command: '/fake/npm' }; const read = async () => ({ node: '20.8.1', npm: '8.4.0' });
  const a = await fingerprint(root, {}, tools, read);
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"two"}');
  const b = await fingerprint(root, {}, tools, read); assert.notEqual(a.hash, b.hash);
});
test('dependency fingerprint binds actual Node/npm versions and install flags', async (t) => {
  const root = temp(t); fs.writeFileSync(path.join(root, 'package.json'), '{}');
  const a = await fingerprint(root, {}, { command: '/same/npm' }, async () => ({ node: '20.8.1', npm: '8.4.0' }));
  const b = await fingerprint(root, {}, { command: '/same/npm' }, async () => ({ node: '22.16.0', npm: '10.9.2' }));
  const c = await fingerprint(root, { installArgs: ['--legacy-peer-deps'] }, { command: '/same/npm' }, async () => ({ node: '20.8.1', npm: '8.4.0' }));
  assert.notEqual(a.hash, b.hash); assert.notEqual(a.hash, c.hash);
});
test('dependency fingerprint rejects file paths escaping the module', async (t) => {
  const root = temp(t); fs.writeFileSync(path.join(root, 'package.json'), '{}');
  await assert.rejects(fingerprint(root, { lockfiles: ['../other'] }, { command: '/fake/npm' }, async () => ({})));
});
test('update readiness acknowledgement is version/nonce/PID bound and private', async (t) => {
  const root = temp(t), update = path.join(root, '2.0.9-arm64'); fs.mkdirSync(update);
  const nonce = 'a'.repeat(64), file = path.join(update, 'ready-' + nonce);
  const env = { MS_UPDATE_NONCE: nonce, MS_UPDATE_READY_FILE: file, MS_UPDATE_EXPECTED_VERSION: '2.0.9' };
  assert.equal(await acknowledge('2.0.9', { updatesRoot: root, env }), true);
  assert.equal(fs.readFileSync(file, 'utf8'), `2.0.9\n${nonce}\n${process.pid}\n`);
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});
test('update acknowledgement rejects wrong version and out-of-root paths', async (t) => {
  const root = temp(t), outside = temp(t), nonce = 'b'.repeat(64);
  const env = { MS_UPDATE_NONCE: nonce, MS_UPDATE_READY_FILE: path.join(outside, 'ready-' + nonce), MS_UPDATE_EXPECTED_VERSION: '2.0.9' };
  await assert.rejects(acknowledge('2.0.8', { updatesRoot: root, env }));
  await assert.rejects(acknowledge('2.0.9', { updatesRoot: root, env }));
  assert.equal(fs.existsSync(env.MS_UPDATE_READY_FILE), false);
});
test('file tail preserves UTF-8 across append boundaries and handles truncation', async (t) => {
  const file = path.join(temp(t), 'service.log'); fs.writeFileSync(file, 'old'); let text = '';
  const watcher = watch(file, (chunk) => { text += chunk; }, (error) => { throw error; }); t.after(() => watcher.kill());
  const encoded = Buffer.from('中文'); fs.appendFileSync(file, encoded.subarray(0, 2));
  await new Promise((r) => setTimeout(r, 650)); assert.equal(text, '');
  fs.appendFileSync(file, encoded.subarray(2)); await new Promise((r) => setTimeout(r, 650)); assert.equal(text, '中文');
  fs.writeFileSync(file, 'new'); await new Promise((r) => setTimeout(r, 650)); assert.equal(text, '中文new');
});
