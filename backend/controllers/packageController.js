const packageTaskService = require('../services/packageTaskService');
const packageHistoryService = require('../services/packageHistoryService');
const { createAppError, sendError } = require('../utils/errors');

const MAX_PAGE_SIZE = 100;

const packageController = {
  async getOptions(req, res) {
    try {
      const options = await packageTaskService.getOptions();
      res.json({ success: true, data: options });
    } catch (error) {
      sendError(res, error);
    }
  },

  async run(req, res) {
    try {
      const result = await packageTaskService.startTask(req.body || {});
      res.status(202).json({
        success: true,
        message: '打包任务已开始',
        data: result
      });
    } catch (error) {
      sendError(res, error);
    }
  },

  async cancel(req, res) {
    try {
      const result = await packageTaskService.cancelTask(req.body?.jobId || null);
      res.status(202).json({
        success: true,
        message: result.message || '取消请求已发送',
        data: result
      });
    } catch (error) {
      sendError(res, error);
    }
  },

  async getActive(req, res) {
    try {
      const activeTask = await packageTaskService.getActiveTask();
      res.json({ success: true, data: activeTask });
    } catch (error) {
      sendError(res, error);
    }
  },

  async getHistory(req, res) {
    try {
      if (!packageHistoryService.isReady()) {
        throw createAppError(503, 'HISTORY_UNAVAILABLE', '打包历史功能不可用，数据库未连接');
      }

      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.pageSize, 10) || 20));

      const result = await packageHistoryService.listRecords({ page, pageSize });
      res.json({ success: true, data: result });
    } catch (error) {
      sendError(res, error);
    }
  },

  async getHistoryById(req, res) {
    try {
      if (!packageHistoryService.isReady()) {
        throw createAppError(503, 'HISTORY_UNAVAILABLE', '打包历史功能不可用，数据库未连接');
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) {
        throw createAppError(400, 'INVALID_ID', '无效的历史记录 ID');
      }

      const record = await packageHistoryService.getRecordById(id);
      if (!record) {
        throw createAppError(404, 'RECORD_NOT_FOUND', '记录不存在');
      }
      res.json({ success: true, data: record });
    } catch (error) {
      sendError(res, error);
    }
  },

  async updateChangelog(req, res) {
    try {
      if (!packageHistoryService.isReady()) {
        throw createAppError(503, 'HISTORY_UNAVAILABLE', '打包历史功能不可用，数据库未连接');
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) {
        throw createAppError(400, 'INVALID_ID', '无效的历史记录 ID');
      }

      const { changelog } = req.body || {};
      if (changelog === undefined || changelog === null) {
        throw createAppError(400, 'MISSING_CHANGELOG', '缺少 changelog 参数');
      }

      const updated = await packageHistoryService.updateChangelog(id, changelog);
      if (!updated) {
        throw createAppError(404, 'RECORD_NOT_FOUND', '记录不存在');
      }
      res.json({ success: true, data: { id, changelog } });
    } catch (error) {
      sendError(res, error);
    }
  }
};

module.exports = packageController;
