const configManager = require('../services/configManager');
const { sendError } = require('../utils/errors');

const configController = {
  getConfig(req, res) {
    try {
      res.json({ success: true, data: configManager.getConfigPageData() });
    } catch (error) {
      sendError(res, error);
    }
  },

  validate(req, res) {
    try {
      const result = configManager.validateDraft(req.body?.draft || {});
      res.json({ success: true, data: result });
    } catch (error) {
      sendError(res, error);
    }
  },

  save(req, res) {
    try {
      const result = configManager.saveDraft(req.body?.draft || {});
      res.json({ success: true, data: result });
    } catch (error) {
      sendError(res, error);
    }
  },

  async apply(req, res) {
    try {
      const result = await configManager.applyConfig();
      res.json({ success: true, data: result });
    } catch (error) {
      sendError(res, error);
    }
  },

  refreshDiagnostics(req, res) {
    try {
      const result = configManager.refreshDiagnostics();
      res.json({ success: true, data: result });
    } catch (error) {
      sendError(res, error);
    }
  },

  async scanProject(req, res) {
    try {
      const { projectRoot } = req.body || {};
      const result = await configManager.scanProject(projectRoot);
      res.json({ success: true, data: result });
    } catch (error) {
      sendError(res, error);
    }
  },

  async testRedis(req, res) {
    try {
      const { host, port, password, db } = req.body;
      const redis = require('redis');

      const client = redis.createClient({
        socket: { host, port: parseInt(port) },
        password: password || undefined,
        database: parseInt(db) || 0
      });

      await client.connect();
      await client.ping();
      await client.quit();

      res.json({ success: true, message: 'Redis连接成功' });
    } catch (error) {
      res.json({ success: false, message: error.message || 'Redis连接失败' });
    }
  },

  getProperties(req, res) {
    try {
      const { filename } = req.params;
      const content = configManager.getPropertiesFile(filename);
      res.json({ success: true, data: { content } });
    } catch (error) {
      sendError(res, error);
    }
  },

  saveProperties(req, res) {
    try {
      const { filename } = req.params;
      const { content } = req.body;
      configManager.savePropertiesFile(filename, content);
      res.json({ success: true, message: '保存成功' });
    } catch (error) {
      sendError(res, error);
    }
  }
};

module.exports = configController;
