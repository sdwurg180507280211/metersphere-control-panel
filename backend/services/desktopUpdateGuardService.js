const jobService = require('./jobService');
const { createAppError } = require('../utils/errors');
const taskAdmission = require('./taskAdmissionService');
async function assertUpdateAllowed() {
  const jobs = (await jobService.getActiveJobs()).filter((job) => ['pending', 'running'].includes(job.status));
  if (jobs.length) throw createAppError(409, 'DESKTOP_UPDATE_TASKS_ACTIVE', '存在执行中的任务，完成后才能更新桌面应用', {
    jobs: jobs.map(({ jobId, type, targetId, status, stage }) => ({ jobId, type, targetId, status, stage }))
  });
  return true;
}
async function beginInstallation() {
  const release = taskAdmission.enterMaintenance();
  try {
    await assertUpdateAllowed();
    return release;
  } catch (error) {
    release();
    throw error;
  }
}
module.exports = { assertUpdateAllowed, beginInstallation };
