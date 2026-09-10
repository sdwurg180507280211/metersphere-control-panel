const jobService = require('./jobService');
const { createAppError } = require('../utils/errors');

function isBlockingJob(job) {
  if (!job || !['pending', 'running'].includes(job.status)) return false;
  return job.type === 'package.run' || String(job.type || '').startsWith('frontend.build');
}

function summarizeJob(job) {
  return {
    jobId: job.jobId,
    type: job.type,
    status: job.status,
    stage: job.stage || null,
    message: job.message || ''
  };
}

async function getBlockingJobs() {
  const activeJobs = await jobService.getActiveJobs();
  return activeJobs.filter(isBlockingJob).map(summarizeJob);
}

async function assertUpdateAllowed() {
  const blockingJobs = await getBlockingJobs();
  if (blockingJobs.length > 0) {
    throw createAppError(
      409,
      'DESKTOP_UPDATE_TASKS_ACTIVE',
      '存在运行中的构建或打包任务，请任务结束后再更新 Local Service Hub',
      { blockingJobs }
    );
  }
  return true;
}

module.exports = {
  isBlockingJob,
  getBlockingJobs,
  assertUpdateAllowed
};
