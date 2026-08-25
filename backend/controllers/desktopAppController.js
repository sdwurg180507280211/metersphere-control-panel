const desktopAppService = require('../services/desktopAppService');
const desktopAppConfigService = require('../services/desktopAppConfigService');
const { createAppError, sendError } = require('../utils/errors');

async function assertStopped(id, action) {
  if (!desktopAppConfigService.hasApp(id)) return;
  const status = await desktopAppService.getStatus(id);
  if (status.running) {
    throw createAppError(409, 'DESKTOP_APP_RUNNING', `请先停止应用再${action}`, { appId: id, pid: status.pid });
  }
}

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

  detect(req, res) {
    try {
      res.json({ success: true, data: desktopAppConfigService.detectDirectory(req.body?.cwd) });
    } catch (error) {
      sendError(res, error);
    }
  },

  async save(req, res) {
    try {
      const id = String(req.body?.id || '').trim().toLowerCase();
      const exists = desktopAppConfigService.hasApp(id);
      if (exists && req.body?.createOnly === true) {
        throw createAppError(409, 'DESKTOP_APP_ID_EXISTS', `应用 ID 已存在: ${id}`, { appId: id });
      }
      if (exists) {
        await assertStopped(id, '修改配置');
      }
      const saved = desktopAppConfigService.saveApp(req.body || {});
      res.json({ success: true, data: saved, message: '本地应用配置已保存' });
    } catch (error) {
      sendError(res, error);
    }
  },

  async remove(req, res) {
    try {
      const { id } = req.params;
      await assertStopped(id, '删除');
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
  },

  async restart(req, res) {
    try {
      res.json({ success: true, data: await desktopAppService.restart(req.params.id) });
    } catch (error) {
      sendError(res, error);
    }
  },

  logs(req, res) {
    try {
      res.json({
        success: true,
        data: {
          id: req.params.id,
          content: desktopAppService.readLogs(req.params.id, req.query.tail)
        }
      });
    } catch (error) {
      sendError(res, error);
    }
  }
};

module.exports = desktopAppController;
