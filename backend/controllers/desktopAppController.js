const desktopAppService = require('../services/desktopAppService');
const desktopAppConfigService = require('../services/desktopAppConfigService');
const { createAppError, sendError } = require('../utils/errors');

const desktopAppController = {
  getCatalog(req, res) {
    try {
      res.json({ success: true, data: desktopAppService.getCatalog() });
    } catch (error) {
      sendError(res, error);
    }
  },

  async getAllStatus(req, res) {
    try {
      res.json({ success: true, data: await desktopAppService.getAllStatus() });
    } catch (error) {
      sendError(res, error);
    }
  },

  save(req, res) {
    try {
      const saved = desktopAppConfigService.saveApp(req.body || {});
      res.json({ success: true, data: saved, message: '本地应用配置已保存' });
    } catch (error) {
      sendError(res, error);
    }
  },

  async remove(req, res) {
    try {
      const { id } = req.params;
      if (desktopAppConfigService.hasApp(id)) {
        const status = await desktopAppService.getStatus(id);
        if (status.running === true) {
          throw createAppError(409, 'DESKTOP_APP_RUNNING', '请先关闭服务再删除配置', {
            appId: id,
            port: status.port
          });
        }
      }
      const removed = desktopAppConfigService.removeApp(id);
      res.json({ success: true, data: removed, message: '本地应用已删除' });
    } catch (error) {
      sendError(res, error);
    }
  },

  async start(req, res) {
    try {
      res.json({ success: true, data: await desktopAppService.start(req.params.id) });
    } catch (error) {
      sendError(res, error);
    }
  },

  async stop(req, res) {
    try {
      res.json({ success: true, data: await desktopAppService.stop(req.params.id) });
    } catch (error) {
      sendError(res, error);
    }
  }
};

module.exports = desktopAppController;
