const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./fixtures.cjs');
function gate() { return load('backend/services/taskAdmissionService.js'); }
test('maintenance refuses in-flight unpublished job reservations', () => {
  const admission = gate();
  const release = admission.reserve();
  assert.throws(() => admission.enterMaintenance(), { code: 'DESKTOP_UPDATE_TASKS_ACTIVE' });
  release(); release();
  const leave = admission.enterMaintenance();
  assert.throws(() => admission.reserve(), { code: 'DESKTOP_UPDATE_MAINTENANCE' });
  leave(); leave();
  admission.reserve()();
});
test('actual job creation holds admission throughout asynchronous persistence', async () => {
  const admission = gate();
  const service = load('backend/services/jobService.js', { './taskAdmissionService': admission });
  service.destroy();
  service._redisRequiredForJobs = () => false;
  let persisted;
  service._persistJob = () => new Promise((resolve) => { persisted = resolve; });
  const pending = service.createJob({ type: 'fixture' });
  assert.throws(() => admission.enterMaintenance(), { code: 'DESKTOP_UPDATE_TASKS_ACTIVE' });
  persisted(); await pending;
  const leave = admission.enterMaintenance();
  await assert.rejects(service.createJob({}), { code: 'DESKTOP_UPDATE_MAINTENANCE' });
  leave();
  service._persistJob = async () => { throw Error('disk failure'); };
  await assert.rejects(service.createJob({}), /disk failure/);
  admission.enterMaintenance()();
});
test('installation closes admission before awaiting the active job check', async () => {
  const admission = gate();
  let answer;
  const guard = load('backend/services/desktopUpdateGuardService.js', {
    './taskAdmissionService': admission,
    './jobService': { getActiveJobs: () => new Promise((resolve) => { answer = resolve; }) }
  });
  const pending = guard.beginInstallation();
  assert.throws(() => admission.reserve(), { code: 'DESKTOP_UPDATE_MAINTENANCE' });
  answer([{ jobId: 'active', status: 'running' }]);
  await assert.rejects(pending, { code: 'DESKTOP_UPDATE_TASKS_ACTIVE' });
  admission.reserve()();
  const success = guard.beginInstallation();
  answer([]);
  const release = await success;
  assert.throws(() => admission.reserve(), { code: 'DESKTOP_UPDATE_MAINTENANCE' });
  release();
  admission.reserve()();
});
test('a failed active-job lookup releases maintenance rather than wedging the app', async () => {
  const admission = gate();
  const guard = load('backend/services/desktopUpdateGuardService.js', {
    './taskAdmissionService': admission, './jobService': { getActiveJobs: async () => { throw Error('lookup'); } }
  });
  await assert.rejects(guard.beginInstallation(), /lookup/);
  admission.reserve()();
});
test('helper launch failure reopens admission and permits a subsequent installation', async () => {
  const admission = gate();
  let launches = 0, timer;
  const controller = load('backend/controllers/desktopUpdateController.js', {
    '../services/desktopUpdateGuardService': { assertUpdateAllowed: async () => {}, beginInstallation: async () => admission.enterMaintenance() },
    '../services/desktopUpdateService': {
      checkForUpdate: async () => ({ updateAvailable: true, latestVersion: 'fixture' }),
      prepareUpdate: async () => ({}),
      launchInstallHelper: async () => { if (++launches === 1) throw Error('helper failure'); }
    },
    electron: { app: { isPackaged: true, getVersion: () => 'fixture', quit: () => {} } }
  }, { process: { ...process, platform: 'darwin', versions: { ...process.versions, electron: '44' } }, setTimeout: (fn) => { timer = fn; return { unref() {} }; } });
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await controller.install({}, res);
  assert.equal(res.code, 500);
  admission.reserve()();
  await controller.install({}, res);
  assert.equal(res.body.success, true);
  assert.equal(typeof timer, 'function');
  assert.throws(() => admission.reserve(), { code: 'DESKTOP_UPDATE_MAINTENANCE' });
});
