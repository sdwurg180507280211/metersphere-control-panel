/**
 * 服务控制器
 */
const processManager = require('../services/processManager');
const healthChecker = require('../services/healthChecker');
const validator = require('../utils/validator');
const logger = require('../utils/logger');
const configManager = require('../services/configManager');
const serviceTaskService = require('../services/serviceTaskService');
const systemCommandService = require('../services/systemCommandService');
const { createAppError, sendError } = require('../utils/errors');

async function enqueueServiceTask(res, taskFn, actionLabel) {
  try {
    const job = await taskFn();
    return res.status(202).json({
      success: true,
      message: `${actionLabel}任务已创建`,
      jobId: job.jobId,
      data: job
    });
  } catch (error) {
    logger.broadcast(`${actionLabel}失败: ${error.message}`, 'service');
    return sendError(res, error);
  }
}

const serviceController = {
  getCatalog(req, res) {
    res.json({ success: true, data: configManager.getResolvedConfig().serviceCatalog });
  },

  async getAllStatus(req, res) {
    try {
      const status = await processManager.getAllStatus();
      res.json({ success: true, data: status });
    } catch (error) {
      sendError(res, error);
    }
  },

  async getStatus(req, res) {
    try {
      const { id } = req.params;
      if (!validator.isValidService(id)) {
        return sendError(res, createAppError(400, 'INVALID_SERVICE_ID', '无效的服务 ID', { serviceId: id }));
      }
      const status = await processManager.getStatus(id);
      res.json({ success: true, data: status });
    } catch (error) {
      sendError(res, error);
    }
  },

  async healthCheck(req, res) {
    try {
      const { id } = req.params;
      if (!validator.isValidService(id)) {
        return sendError(res, createAppError(400, 'INVALID_SERVICE_ID', '无效的服务 ID', { serviceId: id }));
      }
      const result = await healthChecker.check(id);
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  },

  async start(req, res) {
    const { id } = req.params;
    if (!validator.isValidService(id)) {
      return sendError(res, createAppError(400, 'INVALID_SERVICE_ID', '无效的服务 ID', { serviceId: id }));
    }

    return enqueueServiceTask(res, () => serviceTaskService.startService(id), '启动服务');
  },

  async stop(req, res) {
    const { id } = req.params;
    if (!validator.isValidService(id)) {
      return sendError(res, createAppError(400, 'INVALID_SERVICE_ID', '无效的服务 ID', { serviceId: id }));
    }

    return enqueueServiceTask(res, () => serviceTaskService.stopService(id), '停止服务');
  },

  async restart(req, res) {
    const { id } = req.params;
    if (!validator.isValidService(id)) {
      return sendError(res, createAppError(400, 'INVALID_SERVICE_ID', '无效的服务 ID', { serviceId: id }));
    }

    return enqueueServiceTask(res, () => serviceTaskService.restartService(id), '重启服务');
  },

  async reload(req, res) {
    const { id } = req.params;
    if (!validator.isValidService(id)) {
      return sendError(res, createAppError(400, 'INVALID_SERVICE_ID', '无效的服务 ID', { serviceId: id }));
    }

    return enqueueServiceTask(res, () => serviceTaskService.reloadService(id), 'Reload 服务');
  },

  async startAll(req, res) {
    return enqueueServiceTask(res, () => serviceTaskService.startAllServices(), '批量启动服务');
  },

  async stopAll(req, res) {
    return enqueueServiceTask(res, () => serviceTaskService.stopAllServices(), '批量停止服务');
  },

  async restartAll(req, res) {
    return enqueueServiceTask(res, () => serviceTaskService.restartAllServices(), '批量重启服务');
  },

  async systemReload(req, res) {
    try {
      const { password } = req.body || {};
      if (typeof password !== 'string' || password.length === 0) {
        return sendError(res, createAppError(400, 'SUDO_PASSWORD_REQUIRED', '请输入管理员密码'));
      }

      await systemCommandService.reloadMsctl(password);
      return res.json({
        success: true,
        message: 'msctl reload 执行成功'
      });
    } catch (error) {
      logger.broadcast(`系统 reload 失败: ${error.message}`, 'service');
      return sendError(res, error);
    }
  }
};

module.exports = serviceController;
