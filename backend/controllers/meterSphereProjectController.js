const meterSphereProjectConfigService = require('../services/meterSphereProjectConfigService');
const { sendError } = require('../utils/errors');

const meterSphereProjectController = {
  get(req, res) {
    try {
      res.json({ success: true, data: meterSphereProjectConfigService.getProject() });
    } catch (error) {
      sendError(res, error);
    }
  },

  save(req, res) {
    try {
      const saved = meterSphereProjectConfigService.saveProject(req.body || {});
      res.json({ success: true, data: saved, message: 'MeterSphere 项目元数据已保存' });
    } catch (error) {
      sendError(res, error);
    }
  }
};

module.exports = meterSphereProjectController;
