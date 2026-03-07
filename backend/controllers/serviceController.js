/**
 * 服务控制器
 */
const processManager = require('../services/processManager');
const healthChecker = require('../services/healthChecker');
const validator = require('../utils/validator');
const logger = require('../utils/logger');
const config = require('../config');

const serviceController = {
  /**
   * 获取服务目录
   */
  getCatalog(req, res) {
    res.json({ success: true, data: config.serviceCatalog });
  },

  /**
   * 获取所有服务状态
   */
  async getAllStatus(req, res) {
    try {
      const status = await processManager.getAllStatus();
      res.json({ success: true, data: status });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * 获取单个服务状态
   */
  async getStatus(req, res) {
    try {
      const { id } = req.params;
      if (!validator.isValidService(id)) {
        return res.status(400).json({ success: false, error: '无效的服务 ID' });
      }
      const status = await processManager.getStatus(id);
      res.json({ success: true, data: status });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * 健康检查
   */
  async healthCheck(req, res) {
    try {
      const { id } = req.params;
      if (!validator.isValidService(id)) {
        return res.status(400).json({ success: false, error: '无效的服务 ID' });
      }
      const result = await healthChecker.check(id);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * 启动服务
   */
  async start(req, res) {
    try {
      const { id } = req.params;
      const service = validator.getValidService(id);

      const status = await processManager.getStatus(id);
      if (status.running) {
        return res.json({ success: false, error: '服务已在运行中' });
      }

      const result = await processManager.start(id, service);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.broadcast(`启动失败: ${error.message}`, 'service');
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * 停止服务
   */
  async stop(req, res) {
    try {
      const { id } = req.params;
      const service = validator.getValidService(id);

      const result = await processManager.stop(id, service);
      if (result.success) {
        res.json({ success: true, data: result });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      logger.broadcast(`停止失败: ${error.message}`, 'service');
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * 重启服务
   */
  async restart(req, res) {
    try {
      const { id } = req.params;
      const service = validator.getValidService(id);

      const result = await processManager.restart(id, service);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.broadcast(`重启失败: ${error.message}`, 'service');
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * 启动所有服务
   */
  async startAll(req, res) {
    try {
      logger.broadcast('\n========== 启动所有服务 ==========', 'service');
      const results = await processManager.startAll();
      res.json({ success: true, data: results });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * 停止所有服务
   */
  async stopAll(req, res) {
    try {
      logger.broadcast('\n========== 停止所有服务 ==========', 'service');
      const results = await processManager.stopAll();
      res.json({ success: true, data: results });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

module.exports = serviceController;
