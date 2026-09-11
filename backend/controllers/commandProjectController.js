const commandProjectService = require('../services/commandProjectService');
const commandProjectConfigService = require('../services/commandProjectConfigService');
const { createAppError, sendError } = require('../utils/errors');

const commandProjectController = {
  getCatalog(req, res) {
    try {
      res.json({ success: true, data: commandProjectService.getCatalog() });
    } catch (error) {
      sendError(res, error);
    }
  },

  async getAllStatus(req, res) {
    try {
      res.json({ success: true, data: await commandProjectService.getAllStatus() });
    } catch (error) {
      sendError(res, error);
    }
  },

  save(req, res) {
    try {
      const saved = commandProjectConfigService.saveProject(req.body || {});
      res.json({ success: true, data: saved, message: '本地应用配置已保存' });
    } catch (error) {
      sendError(res, error);
    }
  },

  async remove(req, res) {
    try {
      const { id } = req.params;
      if (commandProjectConfigService.hasProject(id)) {
        const status = await commandProjectService.getStatus(id);
        if (status.running === true) {
          throw createAppError(409, 'DESKTOP_APP_RUNNING', '请先关闭服务再删除配置', {
            appId: id,
            port: status.port
          });
        }
      }
      const removed = commandProjectConfigService.removeProject(id);
      res.json({ success: true, data: removed, message: '本地应用已删除' });
    } catch (error) {
      sendError(res, error);
    }
  },

  async start(req, res) {
    try {
      res.json({ success: true, data: await commandProjectService.start(req.params.id) });
    } catch (error) {
      sendError(res, error);
    }
  },

  async stop(req, res) {
    try {
      res.json({ success: true, data: await commandProjectService.stop(req.params.id) });
    } catch (error) {
      sendError(res, error);
    }
  }
};

module.exports = commandProjectController;
