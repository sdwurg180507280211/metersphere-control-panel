const jobService = require('../services/jobService');
const processManager = require('../services/processManager');
const { createAppError, sendError } = require('../utils/errors');

const jobController = {
  async getJob(req, res) {
    try {
      const job = await jobService.getJob(req.params.jobId);
      if (!job) {
        return sendError(res, createAppError(404, 'JOB_NOT_FOUND', '任务不存在', { jobId: req.params.jobId }));
      }

      res.json({ success: true, data: job });
    } catch (error) {
      sendError(res, error);
    }
  },

  async getActiveJobs(req, res) {
    try {
      const jobs = await jobService.getActiveJobs();
      res.json({ success: true, data: jobs });
    } catch (error) {
      sendError(res, error);
    }
  },

  async getRecentJobs(req, res) {
    try {
      const limit = Number.parseInt(req.query.limit, 10) || 20;
      const jobs = await jobService.getRecentJobs(limit);
      res.json({ success: true, data: jobs });
    } catch (error) {
      sendError(res, error);
    }
  },

  async cancelJob(req, res) {
    try {
      const job = await jobService.getJob(req.params.jobId);
      if (!job) {
        return sendError(res, createAppError(404, 'JOB_NOT_FOUND', '任务不存在', { jobId: req.params.jobId }));
      }

      const buildId = job.metadata?.buildId;
      if (!buildId) {
        return sendError(res, createAppError(400, 'JOB_CANCEL_NOT_SUPPORTED', '当前任务暂不支持取消', {
          jobId: req.params.jobId,
          type: job.type
        }));
      }

      const cancelled = await processManager.cancelBuild(buildId);
      if (!cancelled) {
        return sendError(res, createAppError(409, 'JOB_NOT_RUNNING', '任务不存在或已完成', {
          jobId: req.params.jobId,
          buildId
        }));
      }

      res.json({ success: true, message: '任务已取消', data: { jobId: req.params.jobId, buildId } });
    } catch (error) {
      sendError(res, error);
    }
  }
};

module.exports = jobController;
