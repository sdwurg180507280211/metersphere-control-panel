const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root, temp } = require('./fixtures.cjs');
const { acknowledgingExecutable } = require('./updater-fixture.cjs');
const script = path.join(root, 'backend/utils/install-update.sh');
function fixture(t, { mode = 'full', acknowledge = true, backup = false } = {}) {
  const directory = temp(t);
  const target = path.join(directory, 'Local Service Hub.app');
  const stage = path.join(directory, 'stage');
  const bin = path.join(directory, 'bin');
  for (const [bundle, version] of [[target, 'old'], [stage, 'new']]) {
    fs.mkdirSync(path.join(bundle, 'Contents/MacOS'), { recursive: true });
    fs.mkdirSync(path.join(bundle, 'Contents/Resources/app'), { recursive: true });
    fs.writeFileSync(path.join(bundle, 'Contents/Info.plist'), version);
    fs.writeFileSync(path.join(bundle, 'Contents/Resources/app/package.json'), JSON.stringify({ version: version === 'old' ? '2.0.7' : '2.0.8' }));
    fs.writeFileSync(path.join(bundle, 'Contents/MacOS/Local Service Hub'), acknowledgingExecutable(acknowledge), { mode: 0o755 });
  }
  fs.writeFileSync(path.join(target, 'Contents/Resources/app/stale.txt'), 'old');
  fs.writeFileSync(path.join(stage, 'Contents/Resources/app/added.txt'), 'new');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'ditto'), '#!/bin/sh\nif [ -d "$2" ]; then /bin/cp -R "$1/." "$2/"; else /bin/cp -R "$1" "$2"; fi\n', { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'open'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  if (backup) fs.mkdirSync(`${target}.previous`);
  const result = spawnSync('/bin/bash', [script, '2147483647', target, stage, directory, mode, '2.0.8', 'a'.repeat(64)],
    { env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` }, encoding: 'utf8', timeout: 12000 });
  const log = fs.readFileSync(path.join(directory, 'update-helper.log'), 'utf8');
  assert.ifError(result.error);
  return { result, target, stage, directory, log };
}
for (const mode of ['full', 'delta']) {
  test(`${mode} updater keeps backup until its own child acknowledges readiness`, (t) => {
    const state = fixture(t, { mode });
    assert.equal(state.result.status, 0, state.log);
    assert.equal(fs.readFileSync(path.join(state.target, 'Contents/Info.plist'), 'utf8'), 'new');
    assert.equal(fs.existsSync(path.join(state.target, 'Contents/Resources/app/stale.txt')), false);
    assert.equal(fs.readFileSync(path.join(state.target, 'Contents/Resources/app/added.txt'), 'utf8'), 'new');
    assert.equal(fs.existsSync(`${state.target}.previous`), false);
    assert.match(state.log, /update completed; confirmed by version=2.0.8 pid=\d+/);
  });
  test(`${mode} updater restores previous app when its exact child fails`, (t) => {
    const state = fixture(t, { mode, acknowledge: false });
    assert.equal(state.result.status, 1, state.log);
    assert.equal(fs.readFileSync(path.join(state.target, 'Contents/Info.plist'), 'utf8'), 'old');
    assert.equal(fs.readFileSync(path.join(state.target, 'Contents/Resources/app/stale.txt'), 'utf8'), 'old');
    assert.equal(fs.existsSync(`${state.target}.previous`), false);
    assert.match(state.log, /恢复旧版本/);
  });
}
test('updater refuses to overwrite an earlier recovery backup', (t) => {
  const state = fixture(t, { backup: true });
  assert.equal(state.result.status, 1, state.log);
  assert.equal(fs.readFileSync(path.join(state.target, 'Contents/Info.plist'), 'utf8'), 'old');
  assert.equal(fs.existsSync(`${state.target}.previous`), true);
  assert.match(state.log, /拒绝覆盖/);
});
