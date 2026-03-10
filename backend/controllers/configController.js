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
  }
};

module.exports = configController;
