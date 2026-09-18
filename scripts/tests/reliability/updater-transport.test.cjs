const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { root, temp } = require('./fixtures.cjs');
function transport(fetch, globals = {}) {
  const filename = path.join(root, 'backend/services/desktopUpdateService.js');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8') + '\nmodule.exports = { ...module.exports, downloadFile, requestText, createHelperScript };', {
    module, require: createRequire(filename), __dirname: path.dirname(filename), __filename: filename,
    process: { ...process, versions: {} }, fetch, Response, Headers, AbortController, Buffer, URL, setTimeout, clearTimeout,
    ...globals
  }, { filename });
  return module.exports;
}
const repository = 'sdwurg180507280211/metersphere-control-panel';
const url = (file) => `https://github.com/${repository}/releases/download/desktop-v2.0.8/${file}`;
function metadata(overrides = {}) {
  return { version: '2.0.8', tag: 'desktop-v2.0.8', assets: [{ name: 'test.zip', arch: 'x64', type: 'zip', bytes: 20, sha256: 'a'.repeat(64), url: url('test.zip') }], ...overrides };
}
test('actual updater validates version and selects a full asset in the Node runtime', async () => {
  const responses = [new Response(JSON.stringify([{ tag_name: 'desktop-v2.0.8', assets: [{ name: 'latest.json', browser_download_url: url('latest.json') }] }])), new Response(JSON.stringify(metadata()))];
  const result = await transport(async () => responses.shift()).checkForUpdate({ currentVersion: '2.0.7', arch: 'x64' });
  assert.equal(result.updateAvailable, true); assert.equal(result.asset.updateMode, 'full');
  assert.equal(result.asset.url, url('test.zip'));
});
test('actual updater rejects metadata that claims a different release version', async () => {
  const responses = [new Response(JSON.stringify([{ tag_name: 'desktop-v2.0.8', assets: [{ name: 'latest.json', browser_download_url: url('latest.json') }] }])), new Response(JSON.stringify(metadata({ version: '9.0.0' })))];
  await assert.rejects(transport(async () => responses.shift()).checkForUpdate({ currentVersion: '2.0.7', arch: 'x64' }), /不一致/);
});
test('download streaming enforces the advertised byte cap and removes partial output', async (t) => {
  const destination = path.join(temp(t), 'download.zip');
  await assert.rejects(transport(async () => new Response('too many bytes')).downloadFile(url('test.zip'), destination, { maxBytes: 3 }), /超过允许大小/);
  assert.equal(fs.existsSync(destination), false);
  assert.equal(fs.existsSync(destination + '.download'), false);
});
test('download computes the real SHA256 and preserves the previous file on failure', async (t) => {
  const destination = path.join(temp(t), 'download.zip');
  const content = 'example zip bytes';
  const result = await transport(async () => new Response(content)).downloadFile(url('test.zip'), destination);
  assert.equal(result.sha256, crypto.createHash('sha256').update(content).digest('hex'));
  await assert.rejects(transport(async () => { throw new Error('offline'); }).downloadFile(url('test.zip'), destination), /offline/);
  assert.equal(fs.readFileSync(destination, 'utf8'), content);
});
test('untrusted redirect targets and HTTPS downgrades are rejected', async (t) => {
  const destination = path.join(temp(t), 'download.zip');
  for (const location of ['https://example.invalid/payload', 'http://github.com/payload']) {
    let calls = 0;
    await assert.rejects(transport(async () => { calls++; return new Response(null, { status: 302, headers: { location } }); }).downloadFile(url('test.zip'), destination));
    assert.equal(calls, 1);
  }
});
test('metadata response remains bounded and malformed JSON is not treated as a release', async () => {
  await assert.rejects(transport(async () => new Response('x'.repeat(2 * 1024 * 1024 + 1))).requestText(url('latest.json')), /元数据过大/);
  await assert.rejects(transport(async () => new Response('{bad')).checkForUpdate({ currentVersion: '2.0.7', arch: 'x64' }), /JSON/);
});
test('prepare rejects path traversal in asset names before changing update directories', async (t) => {
  const baseDir = temp(t);
  const updater = transport(async () => { throw new Error('Network must not be used'); }, { process: { ...process, platform: 'darwin', versions: {} } });
  for (const name of ['../outside.zip', 'nested/file.zip', '..\\outside.zip']) {
    await assert.rejects(updater.prepareUpdate({ updateAvailable: true, latestVersion: '2.0.8', asset: { name, arch: 'x64' } }, { baseDir }), /文件名/);
  }
  assert.deepEqual(fs.readdirSync(baseDir), []);
});
