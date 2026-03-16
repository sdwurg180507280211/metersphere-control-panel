const configManager = require('../services/configManager');
const sudoFileService = require('../services/sudoFileService');
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

  async validatePath(req, res) {
    const { path: targetPath } = req.body;
    try {
      const fs = require('fs');
      const exists = fs.existsSync(targetPath);
      res.json({ success: true, data: { exists } });
    } catch (error) {
      res.json({ success: true, data: { exists: false } });
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
      if (error.code === 'EACCES') {
        return res.json({
          success: false,
          code: 'EACCES',
          message: `权限不足：无法读取配置文件。路径: ${error.path || 'unknown'}`
        });
      }
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
      if (error.code === 'EACCES') {
        return res.json({
          success: false,
          code: 'EACCES',
          message: `权限不足：无法写入配置文件。路径: ${error.path || 'unknown'}`
        });
      }
      sendError(res, error);
    }
  },

  async getPropertiesWithSudo(req, res) {
    try {
      const { filename } = req.params;
      const { password } = req.body;
      const filePath = configManager.getPropertiesFilePath(filename);
      const content = await sudoFileService.readFile(filePath, password);
      res.json({ success: true, data: { content } });
    } catch (error) {
      sendError(res, error);
    }
  },

  async savePropertiesWithSudo(req, res) {
    try {
      const { filename } = req.params;
      const { content, password } = req.body;
      const filePath = configManager.getPropertiesFilePath(filename);
      await sudoFileService.writeFile(filePath, content, password);
      res.json({ success: true, message: '保存成功' });
    } catch (error) {
      sendError(res, error);
    }
  }
};

module.exports = configController;
