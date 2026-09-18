const workspaceService = require('../services/workspaceService');
const { sendError } = require('../utils/errors');

const workspaceController = {
  async getSnapshot(req, res) {
    try {
      const deep = req.query.deep !== '0';
      const snapshot = await workspaceService.getSnapshot({ deep });
      res.json({ success: true, data: snapshot });
    } catch (error) {
      sendError(res, error);
    }
  }
};

module.exports = workspaceController;
