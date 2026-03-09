const packageTaskService = require('../services/packageTaskService');
const { sendError } = require('../utils/errors');

const packageController = {
  async getOptions(req, res) {
    try {
      const options = await packageTaskService.getOptions();
      res.json({ success: true, data: options });
    } catch (error) {
      sendError(res, error);
    }
  },

  async run(req, res) {
    try {
      const result = await packageTaskService.startTask(req.body || {});
      res.status(202).json({
        success: true,
        message: '打包任务已开始',
        data: result
      });
    } catch (error) {
      sendError(res, error);
    }
  },

  async getActive(req, res) {
    try {
      const activeTask = await packageTaskService.getActiveTask();
      res.json({ success: true, data: activeTask });
    } catch (error) {
      sendError(res, error);
    }
  }
};

module.exports = packageController;
