/**
 * 构建控制器
 */
const processManager = require('../services/processManager');
const validator = require('../utils/validator');
const configManager = require('../services/configManager');
const logger = require('../utils/logger');
const websocketService = require('../services/websocketService');
const jobService = require('../services/jobService');
const { createAppError, sendError } = require('../utils/errors');

const buildController = {
  async build(req, res) {
    try {
      const { module, forceInstall = false, autoRestart = false } = req.body;

      if (!validator.isValidModule(module)) {
        return sendError(res, createAppError(400, 'INVALID_MODULE_ID', '未知的模块', { moduleId: module }));
      }

      const moduleConfig = validator.getValidModule(module);
      const service = configManager.getResolvedConfig().services[moduleConfig.serviceId];
      const resourceKey = `module:${moduleConfig.id}`;

      await jobService.assertWritableRequestAllowed(resourceKey, {
        moduleId: moduleConfig.id,
        serviceId: moduleConfig.serviceId,
        action: 'build'
      });

      const job = await jobService.createJob({
        type: 'frontend.build',
        targetType: 'module',
        targetId: moduleConfig.id,
        stage: 'prepare',
        message: '准备前端构建任务',
        metadata: {
          moduleId: moduleConfig.id,
          moduleName: moduleConfig.name,
          serviceId: moduleConfig.serviceId,
          autoRestart,
          resourceKey
        }
      });

      const lockResult = await jobService.acquireLock(resourceKey, job);
      if (!lockResult.acquired) {
        await jobService.deleteJob(job.jobId);
        return sendError(res, createAppError(409, 'MODULE_BUSY', '模块正在处理中，请稍后再试', {
          moduleId: moduleConfig.id,
          lock: lockResult.lock
        }));
      }

      await jobService.startJob(job.jobId, {
        stage: 'prepare',
        progress: 5,
        message: '准备构建环境'
      });

      const buildId = await processManager.initBuild(moduleConfig, { jobId: job.jobId });
      await jobService.updateJob(job.jobId, {
        metadata: {
          buildId
        },
        message: '构建任务已开始'
      });

      res.status(202).json({
        success: true,
        message: '构建任务已开始',
        jobId: job.jobId,
        buildId,
        module: {
          id: moduleConfig.id,
          name: moduleConfig.name,
          serviceId: moduleConfig.serviceId
        },
        linkedService: service ? {
          id: moduleConfig.serviceId,
          name: service.name,
          port: service.port,
          running: false
        } : null
      });

      processManager.executeBuild(moduleConfig, buildId, { forceInstall }).then(async (result) => {
        if (!result.success || result.cancelled) {
          return;
        }

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

        websocketService.broadcast('build:completed', {
          buildId,
          jobId: job.jobId,
          module: {
            id: moduleConfig.id,
            name: moduleConfig.name,
            serviceId: moduleConfig.serviceId
          },
          linkedService: serviceStatus,
          timestamp: new Date().toISOString(),
          autoRestart: autoRestart && service !== undefined
        });

        if (autoRestart && service) {
          logger.broadcast(`\n========== 自动重启 ${service.name} 服务 ==========`, 'build');
          await processManager.restart(moduleConfig.serviceId, service, 2000);
        } else if (service) {
          logger.broadcast('\n========== 构建完成，服务待重启 ==========', 'build');
          logger.broadcast(`${moduleConfig.name} 前端构建成功，关联服务 ${service.name} 可以在服务管理页签中重启`, 'build');
        }
      }).catch((error) => {
        logger.broadcast(`构建失败: ${error.message}`, 'build');
      });
    } catch (error) {
      logger.broadcast(`构建失败: ${error.message}`, 'build');
      return sendError(res, error);
    }
  },

  async buildBatch(req, res) {
    try {
      const { modules, forceInstall = false, autoRestart = false } = req.body;

      if (!Array.isArray(modules) || modules.length === 0) {
        return sendError(res, createAppError(400, 'INVALID_PARAMETER', '请提供模块列表'));
      }

      const invalidModules = modules.filter((item) => !validator.isValidModule(item));
      if (invalidModules.length > 0) {
        return sendError(res, createAppError(400, 'INVALID_MODULE_ID', `无效的模块: ${invalidModules.join(', ')}`, {
          invalidModules
        }));
      }

      const linkedServices = modules
        .map((id) => {
          const moduleConfig = validator.getValidModule(id);
          const service = configManager.getResolvedConfig().services[moduleConfig.serviceId];
          return service ? { serviceId: moduleConfig.serviceId, serviceName: service.name } : null;
        })
        .filter(Boolean);

      const parentJob = await jobService.createJob({
        type: 'frontend.build.batch',
        targetType: 'batch',
        targetId: 'frontend-modules',
        stage: 'prepare',
        message: '准备批量构建任务',
        metadata: {
          modules,
          autoRestart
        },
        summary: {
          total: modules.length,
          succeeded: 0,
          failed: 0,
          running: modules.length
        }
      });
      await jobService.startJob(parentJob.jobId, {
        stage: 'prepare',
        progress: 5,
        message: '批量构建任务已开始'
      });

      res.status(202).json({
        success: true,
        message: '批量构建任务已开始',
        jobId: parentJob.jobId,
        modules,
        linkedServices,
        autoRestart
      });

      const buildResults = [];
      const servicesToRestart = new Set();
      const subJobs = [];

      for (let index = 0; index < modules.length; index += 1) {
        const moduleId = modules[index];
        const moduleConfig = validator.getValidModule(moduleId);
        const resourceKey = `module:${moduleConfig.id}`;
        const childJob = await jobService.createJob({
          type: 'frontend.build',
          targetType: 'module',
          targetId: moduleConfig.id,
          parentJobId: parentJob.jobId,
          stage: 'prepare',
          message: `准备构建 ${moduleConfig.name}`,
          metadata: {
            moduleId: moduleConfig.id,
            moduleName: moduleConfig.name,
            serviceId: moduleConfig.serviceId,
            resourceKey
          }
        });
        subJobs.push(childJob.jobId);

        try {
          await jobService.assertWritableRequestAllowed(resourceKey, {
            moduleId: moduleConfig.id,
            serviceId: moduleConfig.serviceId,
            action: 'build.batch'
          });

          const childLock = await jobService.acquireLock(resourceKey, childJob);
          if (!childLock.acquired) {
            await jobService.failJob(childJob.jobId, createAppError(409, 'MODULE_BUSY', '模块正在处理中，请稍后再试', {
              moduleId: moduleConfig.id,
              lock: childLock.lock
            }), {
              stage: 'failed'
            });
            buildResults.push({
              moduleId,
              moduleName: moduleConfig.name,
              success: false,
              error: '模块正在处理中，请稍后再试',
              jobId: childJob.jobId
            });
            continue;
          }

          await jobService.startJob(childJob.jobId, {
            stage: 'prepare',
            progress: 5,
            message: `开始构建 ${moduleConfig.name}`
          });
          await jobService.updateJob(parentJob.jobId, {
            subJobs,
            progress: Math.round((index / modules.length) * 100),
            message: `正在构建 ${moduleConfig.name}`
          });

          const result = await processManager.buildFrontend(moduleConfig, {
            forceInstall,
            jobId: childJob.jobId
          });

          buildResults.push({
            moduleId,
            moduleName: moduleConfig.name,
            ...result,
            jobId: childJob.jobId
          });

          if (result.success && !result.cancelled) {
            const service = configManager.getResolvedConfig().services[moduleConfig.serviceId];
            if (service) {
              servicesToRestart.add(moduleConfig.serviceId);
            }
          }
        } catch (error) {
          await jobService.failJob(childJob.jobId, error, {
            stage: 'failed'
          });
          buildResults.push({
            moduleId,
            moduleName: moduleConfig.name,
            success: false,
            error: error.message,
            code: error.code || 'INTERNAL_ERROR',
            jobId: childJob.jobId
          });
        }

        await jobService.updateJob(parentJob.jobId, {
          summary: {
            total: modules.length,
            succeeded: buildResults.filter((item) => item.success && !item.cancelled).length,
            failed: buildResults.filter((item) => !item.success && !item.cancelled).length,
            running: Math.max(modules.length - index - 1, 0)
          },
          subJobs
        });
      }

      const failedCount = buildResults.filter((item) => !item.success && !item.cancelled).length;
      const successCount = buildResults.filter((item) => item.success && !item.cancelled).length;
      const batchStatus = failedCount === 0
        ? 'all_succeeded'
        : successCount === 0
          ? 'all_failed'
          : 'partial_failed';

      await jobService.completeJob(parentJob.jobId, {
        results: buildResults,
        servicesToRestart: Array.from(servicesToRestart)
      }, {
        status: batchStatus,
        stage: 'completed',
        message: '批量构建任务已完成'
      });

      websocketService.broadcast('build:batchCompleted', {
        jobId: parentJob.jobId,
        results: buildResults,
        servicesToRestart: Array.from(servicesToRestart),
        timestamp: new Date().toISOString(),
        autoRestart
      });

      if (autoRestart && servicesToRestart.size > 0) {
        logger.broadcast('\n========== 自动重启关联服务 ==========', 'build');

        const servicesToRestartSorted = Array.from(servicesToRestart)
          .map((id) => ({ id, ...configManager.getResolvedConfig().services[id] }))
          .sort((a, b) => a.startOrder - b.startOrder);

        for (const service of servicesToRestartSorted) {
          logger.broadcast(`重启 ${service.name}...`, 'build');
          await processManager.restart(service.id, service, 1000);
        }
      }

      logger.broadcast('\n========== 批量构建任务结束 ==========', 'build');
    } catch (error) {
      logger.broadcast(`批量构建失败: ${error.message}`, 'build');
      if (!res.headersSent) {
        return sendError(res, error);
      }
    }
  },

  getModules(req, res) {
    res.json({ success: true, data: configManager.getResolvedConfig().frontendModules });
  },

  async startDevServer(req, res) {
    try {
      const { module } = req.body;
      const result = await processManager.startDevServer(module);

      if (result.success) {
        res.json({ success: true, message: '开发服务器已启动', module: result.module });
      } else {
        return sendError(res, createAppError(400, 'DEV_SERVER_ERROR', result.error));
      }
    } catch (error) {
      return sendError(res, error);
    }
  },

  async stopDevServer(req, res) {
    try {
      const { module } = req.body;
      const result = await processManager.stopDevServer(module);

      if (result.success) {
        res.json({ success: true, message: '开发服务器已停止' });
      } else {
        return sendError(res, createAppError(404, 'DEV_SERVER_NOT_RUNNING', result.error));
      }
    } catch (error) {
      return sendError(res, error);
    }
  },

  getDevServerStatus(req, res) {
    const { module } = req.query;
    const status = processManager.getDevServerStatus(module);
    res.json({ success: true, data: status });
  }
};

module.exports = buildController;
