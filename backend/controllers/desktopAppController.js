const desktopAppService = require('../services/desktopAppService');
const { sendError } = require('../utils/errors');

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
