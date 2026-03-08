/**
 * 构建控制器
 */
const processManager = require('../services/processManager');
const validator = require('../utils/validator');
const config = require('../config');
const logger = require('../utils/logger');
const websocketService = require('../services/websocketService');

const buildController = {
  /**
   * 构建前端模块
   * 
   * 优化点：
   * 1. 构建完成后不再直接重启服务，而是通过 WebSocket 通知前端
   * 2. 前端收到通知后可以提示用户确认是否重启关联服务
   * 3. 这样构建和服务管理解耦，用户有更多控制权
   */
  async build(req, res) {
    try {
      const { module, forceInstall = false, autoRestart = false } = req.body;

      if (!validator.isValidModule(module)) {
        return res.status(400).json({ success: false, error: '未知的模块' });
      }

      const moduleConfig = validator.getValidModule(module);
      const service = config.services[moduleConfig.serviceId];
      const buildId = await processManager.initBuild(moduleConfig);

      res.json({ 
        success: true, 
        message: '构建任务已开始', 
        buildId,
        module: {
          id: moduleConfig.id,
          name: moduleConfig.name,
          serviceId: moduleConfig.serviceId
        },
        // 返回关联服务信息，方便前端展示
        linkedService: service ? {
          id: moduleConfig.serviceId,
          name: service.name,
          port: service.port,
          running: false // 将在构建完成后更新
        } : null
      });

      processManager.executeBuild(moduleConfig, buildId, { forceInstall }).then(async (result) => {
        if (!result.success || result.cancelled) {
          return;
        }

        // 构建成功后，获取服务最新状态
        let serviceStatus = null;
        if (service) {
          const status = await processManager.getStatus(moduleConfig.serviceId);
          serviceStatus = {
            id: moduleConfig.serviceId,
            name: service.name,
            port: service.port,
            running: status.running,
            phase: status.phase
          };
        }

        // 通过 WebSocket 广播构建完成事件，而不是直接重启服务
        websocketService.broadcast('build:completed', {
          buildId,
          module: {
            id: moduleConfig.id,
            name: moduleConfig.name,
            serviceId: moduleConfig.serviceId
          },
          linkedService: serviceStatus,
          timestamp: new Date().toISOString(),
          // 如果请求中指定了 autoRestart=true，则自动重启
          autoRestart: autoRestart && service !== undefined
        });

        // 只有在显式指定 autoRestart=true 时才自动重启（向后兼容）
        if (autoRestart && service) {
          logger.broadcast(`\n========== 自动重启 ${service.name} 服务 ==========`, 'build');
          await processManager.restart(moduleConfig.serviceId, service, 2000);
        } else if (service) {
          logger.broadcast(`\n========== 构建完成，服务待重启 ==========`, 'build');
          logger.broadcast(`${moduleConfig.name} 前端构建成功，关联服务 ${service.name} 可以在服务管理页签中重启`, 'build');
        }
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
   * 
   * 优化点：
   * 1. 支持构建完成后批量重启关联服务（可选）
   * 2. 返回详细的构建结果和服务状态
   */
  async buildBatch(req, res) {
    try {
      const { modules, forceInstall = false, autoRestart = false } = req.body;

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

      // 收集关联的服务信息
      const linkedServices = modules
        .map((id) => {
          const moduleConfig = validator.getValidModule(id);
          const service = config.services[moduleConfig.serviceId];
          return service ? { serviceId: moduleConfig.serviceId, serviceName: service.name } : null;
        })
        .filter(Boolean);

      res.json({ 
        success: true, 
        message: '批量构建任务已开始', 
        modules,
        linkedServices,
        autoRestart
      });

      const buildResults = [];
      const servicesToRestart = new Set();

      for (const moduleId of modules) {
        const moduleConfig = validator.getValidModule(moduleId);
        const result = await processManager.buildFrontend(moduleConfig, { forceInstall });
        
        buildResults.push({
          moduleId,
          moduleName: moduleConfig.name,
          ...result
        });

        if (result.success && !result.cancelled) {
          const service = config.services[moduleConfig.serviceId];
          if (service) {
            servicesToRestart.add(moduleConfig.serviceId);
          }
        } else if (!result.success && !result.cancelled) {
          // 构建失败时停止后续构建
          break;
        }
      }

      // 批量构建完成后，通知前端
      websocketService.broadcast('build:batchCompleted', {
        results: buildResults,
        servicesToRestart: Array.from(servicesToRestart),
        timestamp: new Date().toISOString(),
        autoRestart
      });

      // 如果启用了自动重启，按启动顺序重启所有关联服务
      if (autoRestart && servicesToRestart.size > 0) {
        logger.broadcast(`\n========== 自动重启关联服务 ==========`, 'build');
        
        // 按 startOrder 排序
        const servicesToRestartSorted = Array.from(servicesToRestart)
          .map((id) => ({ id, ...config.services[id] }))
          .sort((a, b) => a.startOrder - b.startOrder);

        for (const service of servicesToRestartSorted) {
          logger.broadcast(`重启 ${service.name}...`, 'build');
          await processManager.restart(service.id, service, 1000);
        }
      }

      logger.broadcast('\n========== 批量构建任务结束 ==========', 'build');
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
