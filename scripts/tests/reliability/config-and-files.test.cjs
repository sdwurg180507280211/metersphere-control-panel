const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { temp } = require('./fixtures.cjs');
const store = require('../../../backend/utils/configFileStore');
const { replaceDirectory } = require('../../../backend/utils/atomicDirectory');

test('private configuration and backup survive alternating metadata and settings edits', (t) => {
  const file = path.join(temp(t), 'nested/config.json');
  store.transaction(file, () => ({ port: 3000, projects: {} }));
  const base = store.read(file);
  store.transaction(file, (raw) => ({ ...raw, projects: { metersphere: { name: 'New' } } }));
  store.transaction(file, (latest) => store.mergeOwned(latest, base, { ...base, port: 5000 }, ['port']));
  assert.equal(store.read(file).projects.metersphere.name, 'New');
  assert.equal(store.read(file).port, 5000);
  assert.equal(JSON.parse(fs.readFileSync(file + '.bak')).port, 3000);
  if (process.platform !== 'win32') for (const p of [file, file + '.bak']) assert.equal(fs.statSync(p).mode & 0o777, 0o600);
});
test('concurrent changes to the same owned field report conflict, not lost update', (t) => {
  const file = path.join(temp(t), 'config.json');
  store.transaction(file, () => ({ port: 3000 }));
  const base = store.read(file);
  store.transaction(file, (raw) => ({ ...raw, port: 4000 }));
  assert.throws(() => store.transaction(file, (latest) => store.mergeOwned(latest, base, { port: 5000 }, ['port'])), { code: 'CONFIG_CONFLICT' });
  assert.equal(store.read(file).port, 4000);
});
test('stale revision refuses a write and releases lock', (t) => {
  const file = path.join(temp(t), 'config.json');
  store.transaction(file, () => ({ x: 1 }));
  assert.throws(() => store.transaction(file, () => ({ x: 2 }), { expectedRevision: 'old' }), { code: 'CONFIG_CONFLICT' });
  assert.equal(fs.existsSync(file + '.lock'), false);
  assert.equal(store.read(file).x, 1);
});
test('corrupt original and its bytes are preserved', (t) => {
  const file = path.join(temp(t), 'config.json'); fs.writeFileSync(file, '{broken');
  assert.throws(() => store.transaction(file, () => ({})), { code: 'CONFIG_READ_FAILED' });
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});
test('failed serialization does not replace original or backup', (t) => {
  const file = path.join(temp(t), 'config.json'); store.transaction(file, () => ({ x: 1 }));
  assert.throws(() => store.transaction(file, () => ({ x: 1n })));
  assert.equal(store.read(file).x, 1);
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['config.json']);
});
test('configuration lock prevents reentrant writers', (t) => {
  const file = path.join(temp(t), 'config.json');
  store.transaction(file, (raw) => {
    assert.throws(() => store.transaction(file, () => ({})), { code: 'CONFIG_CONFLICT' });
    return { ok: true };
  });
  assert.equal(store.read(file).ok, true);
});
test('configuration refuses symlink targets and backups', (t) => {
  const root = temp(t), file = path.join(root, 'config.json'), other = path.join(root, 'other');
  fs.writeFileSync(other, 'keep'); fs.symlinkSync(other, file);
  assert.throws(() => store.transaction(file, () => ({})));
  fs.unlinkSync(file); fs.writeFileSync(file, '{}'); fs.symlinkSync(other, file + '.bak');
  assert.throws(() => store.transaction(file, () => ({ x: 1 })));
  assert.equal(fs.readFileSync(other, 'utf8'), 'keep');
});
function fixture(t) {
  const root = temp(t), source = path.join(root, 'frontend/dist'), target = path.join(root, 'backend/static');
  fs.mkdirSync(source, { recursive: true }); fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(source, 'index.html'), 'new'); fs.writeFileSync(path.join(target, 'index.html'), 'old');
  return { root, source, target };
}
test('successful publication swaps complete assets', async (t) => {
  const f = fixture(t); await replaceDirectory(f.source, f.target, { projectRoot: f.root });
  assert.equal(fs.readFileSync(path.join(f.target, 'index.html'), 'utf8'), 'new');
  assert.deepEqual(fs.readdirSync(path.dirname(f.target)), ['static']);
});
test('missing or empty output does not destroy last working build', async (t) => {
  const f = fixture(t); fs.rmSync(f.source, { recursive: true });
  await assert.rejects(replaceDirectory(f.source, f.target, { projectRoot: f.root }));
  fs.mkdirSync(f.source);
  await assert.rejects(replaceDirectory(f.source, f.target, { projectRoot: f.root }));
  assert.equal(fs.readFileSync(path.join(f.target, 'index.html'), 'utf8'), 'old');
});
test('partial copy failure preserves old assets and cleans stage', async (t) => {
  const f = fixture(t);
  await assert.rejects(replaceDirectory(f.source, f.target, { projectRoot: f.root,
    io: { ...fsp, cp: async (source, stage) => { await fsp.mkdir(stage); throw new Error('copy failed'); } } }));
  assert.equal(fs.readFileSync(path.join(f.target, 'index.html'), 'utf8'), 'old');
  assert.deepEqual(fs.readdirSync(path.dirname(f.target)), ['static']);
});
test('failed final rename restores the backup', async (t) => {
  const f = fixture(t); let renames = 0;
  await assert.rejects(replaceDirectory(f.source, f.target, { projectRoot: f.root,
    io: { ...fsp, rename: async (...args) => { if (++renames === 2) throw new Error('injected'); return fsp.rename(...args); } } }));
  assert.equal(fs.readFileSync(path.join(f.target, 'index.html'), 'utf8'), 'old');
});
test('a failed rollback preserves backup and recovery journal', async (t) => {
  const f = fixture(t); let renames = 0;
  await assert.rejects(replaceDirectory(f.source, f.target, { projectRoot: f.root,
    io: { ...fsp, rename: async (...args) => { if (++renames > 1) throw new Error('injected'); return fsp.rename(...args); } } }), { code: 'PUBLISH_RECOVERY_REQUIRED' });
  const journal = JSON.parse(fs.readFileSync(f.target + '.ms-publish.lock'));
  assert.equal(fs.readFileSync(path.join(journal.backup, 'index.html'), 'utf8'), 'old');
});
test('cancelled publication leaves current assets untouched', async (t) => {
  const f = fixture(t);
  await assert.rejects(replaceDirectory(f.source, f.target, { projectRoot: f.root, assertActive: () => { throw new Error('cancelled'); } }));
  assert.equal(fs.readFileSync(path.join(f.target, 'index.html'), 'utf8'), 'old');
});
test('out-of-root destination and output symlinks are rejected', async (t) => {
  const f = fixture(t), outside = temp(t);
  await assert.rejects(replaceDirectory(f.source, path.join(outside, 'target'), { projectRoot: f.root }));
  fs.symlinkSync(path.join(f.target, 'index.html'), path.join(f.source, 'link'));
  await assert.rejects(replaceDirectory(f.source, f.target, { projectRoot: f.root }));
});
test('overlapping source and target are rejected', async (t) => {
  const f = fixture(t);
  await assert.rejects(replaceDirectory(f.source, f.source, { projectRoot: f.root }));
  await assert.rejects(replaceDirectory(f.source, path.join(f.source, 'nested'), { projectRoot: f.root }));
});
test('existing publication journal blocks a new transaction', async (t) => {
  const f = fixture(t); fs.writeFileSync(f.target + '.ms-publish.lock', 'interrupted');
  await assert.rejects(replaceDirectory(f.source, f.target, { projectRoot: f.root }), { code: 'PUBLISH_BUSY' });
});
