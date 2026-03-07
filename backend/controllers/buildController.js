/**
 * 构建控制器
 */
const processManager = require('../services/processManager');
const validator = require('../utils/validator');
const config = require('../config');
const logger = require('../utils/logger');

const buildController = {
  /**
   * 构建前端模块
   */
  async build(req, res) {
    try {
      const { module, forceInstall = false } = req.body;

      if (!validator.isValidModule(module)) {
        return res.status(400).json({ success: false, error: '未知的模块' });
      }

      const moduleConfig = validator.getValidModule(module);
      const buildId = await processManager.initBuild(moduleConfig);

      res.json({ success: true, message: '构建任务已开始', buildId });

      processManager.executeBuild(moduleConfig, buildId, { forceInstall }).then(async (result) => {
        if (!result.success || result.cancelled) {
          return;
        }

        const service = config.services[moduleConfig.serviceId];
        if (!service) {
          return;
        }

        logger.broadcast(`\n========== 重启 ${service.name} 服务 ==========`, 'build');
        await processManager.restart(moduleConfig.serviceId, service, 2000);
      }).catch((error) => {
        logger.broadcast(`构建失败: ${error.message}`, 'build');
      });
    } catch (error) {
      logger.broadcast(`构建失败: ${error.message}`, 'build');
      res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * 批量构建多个模块
   */
  async buildBatch(req, res) {
    try {
      const { modules, forceInstall = false } = req.body;

      if (!Array.isArray(modules) || modules.length === 0) {
        return res.status(400).json({ success: false, error: '请提供模块列表' });
      }

      const invalidModules = modules.filter((item) => !validator.isValidModule(item));
      if (invalidModules.length > 0) {
        return res.status(400).json({
          success: false,
          error: `无效的模块: ${invalidModules.join(', ')}`
        });
      }

      res.json({ success: true, message: '批量构建任务已开始', modules });

      for (const moduleId of modules) {
        const moduleConfig = validator.getValidModule(moduleId);
        const result = await processManager.buildFrontend(moduleConfig, { forceInstall });
        if (!result.success && !result.cancelled) {
          break;
        }
      }

      logger.broadcast('\n========== 所有模块构建完成 ==========', 'build');
    } catch (error) {
      logger.broadcast(`批量构建失败: ${error.message}`, 'build');
    }
  },

  /**
   * 获取可构建的模块列表
   */
  getModules(req, res) {
    res.json({ success: true, data: config.frontendModules });
  }
};

module.exports = buildController;
