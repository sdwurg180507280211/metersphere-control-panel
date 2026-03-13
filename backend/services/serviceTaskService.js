const validator = require('../utils/validator');
const logger = require('../utils/logger');
const configManager = require('./configManager');
const processManager = require('./processManager');
const healthChecker = require('./healthChecker');
const jobService = require('./jobService');
const { createAppError } = require('../utils/errors');

const HEALTH_INTERVAL_MS = 3000;
const HEALTH_TIMEOUT_MS = Number.parseInt(process.env.MS_SERVICE_HEALTH_TIMEOUT_MS || '120000', 10);
const START_STAGE_TIMEOUT_MS = Number.parseInt(process.env.MS_SERVICE_START_TIMEOUT_MS || '60000', 10);
const STOP_STAGE_TIMEOUT_MS = Number.parseInt(process.env.MS_SERVICE_STOP_TIMEOUT_MS || '60000', 10);
const COMPILE_STAGE_TIMEOUT_MS = Number.parseInt(process.env.MS_SERVICE_COMPILE_TIMEOUT_MS || '600000', 10);
const COMPENSATION_START_TIMEOUT_MS = Number.parseInt(process.env.MS_SERVICE_COMPENSATION_TIMEOUT_MS || '60000', 10);
const START_TOTAL_TIMEOUT_MS = Number.parseInt(process.env.MS_SERVICE_START_TOTAL_TIMEOUT_MS || '180000', 10);
const STOP_TOTAL_TIMEOUT_MS = Number.parseInt(process.env.MS_SERVICE_STOP_TOTAL_TIMEOUT_MS || '90000', 10);
const RESTART_TOTAL_TIMEOUT_MS = Number.parseInt(process.env.MS_SERVICE_RESTART_TOTAL_TIMEOUT_MS || '240000', 10);
const RELOAD_TOTAL_TIMEOUT_MS = Number.parseInt(process.env.MS_SERVICE_RELOAD_TOTAL_TIMEOUT_MS || '480000', 10);
const BATCH_START_TOTAL_TIMEOUT_MS = Number.parseInt(process.env.MS_SERVICE_BATCH_START_TOTAL_TIMEOUT_MS || '1800000', 10);
const BATCH_STOP_TOTAL_TIMEOUT_MS = Number.parseInt(process.env.MS_SERVICE_BATCH_STOP_TOTAL_TIMEOUT_MS || '1200000', 10);
const BATCH_RESTART_TOTAL_TIMEOUT_MS = Number.parseInt(process.env.MS_SERVICE_BATCH_RESTART_TOTAL_TIMEOUT_MS || '2400000', 10);

class ServiceTaskService {
  _createTimingContext(totalTimeoutMs) {
    return {
      startedAt: Date.now(),
      deadlineAt: Date.now() + totalTimeoutMs,
      totalTimeoutMs
    };
  }

  _getRemainingMs(timingContext) {
    return Math.max(timingContext.deadlineAt - Date.now(), 0);
  }

  _createTimeoutError(code, message, details = {}) {
    return createAppError(503, code, message, details);
  }

  async _runStage(stage, operation, options = {}) {
    const remainingMs = this._getRemainingMs(options.timingContext);
    if (remainingMs <= 0) {
      throw this._createTimeoutError('TASK_TIMEOUT', '任务总超时', {
        stage,
        totalTimeoutMs: options.timingContext.totalTimeoutMs,
        ...options.details
      });
    }

    const stageTimeoutMs = options.stageTimeoutMs ? Math.min(options.stageTimeoutMs, remainingMs) : remainingMs;
    return operation(stageTimeoutMs);
  }

  async _createServiceJob({ serviceId, type, stage, message, metadata = {}, parentJobId = null }) {
    return jobService.createJob({
      type,
      targetType: 'service',
      targetId: serviceId,
      parentJobId,
      stage,
      message,
      metadata: {
        serviceId,
        resourceKey: `service:${serviceId}`,
        ...metadata
      }
    });
  }

  async _createBatchJob({ type, targetId, message, metadata = {}, summary }) {
    return jobService.createJob({
      type,
      targetType: 'batch',
      targetId,
      stage: 'prepare',
      message,
      metadata: {
        resourceKey: 'batch:services',
        ...metadata
      },
      summary
    });
  }

  async _acquireServiceLock(serviceId, job) {
    const resourceKey = `service:${serviceId}`;
    const result = await jobService.acquireLock(resourceKey, job);
    if (!result.acquired) {
      await jobService.deleteJob(job.jobId);
      throw createAppError(409, 'SERVICE_BUSY', '服务正在处理中，请稍后再试', {
        serviceId,
        lock: result.lock
      });
    }
    return resourceKey;
  }

  async _waitForHealthy(serviceId, timingContext, extraDetails = {}) {
    const remainingMs = this._getRemainingMs(timingContext);
    if (remainingMs <= 0) {
      throw this._createTimeoutError('TASK_TIMEOUT', '任务总超时', {
        serviceId,
        ...extraDetails
      });
    }

    const result = await healthChecker.waitForHealthy(serviceId, {
      timeout: Math.min(HEALTH_TIMEOUT_MS, remainingMs),
      interval: HEALTH_INTERVAL_MS,
      initialDelay: 1500,
      deadlineAt: timingContext.deadlineAt
    });

    if (!result.healthy) {
      const terminalFailure = ['HEALTH_ENDPOINT_NOT_FOUND', 'HEALTH_CHECK_UNAUTHORIZED'].includes(result.failureCode);
      throw createAppError(
        result.timedOut || !terminalFailure ? 503 : 500,
        result.timedOut ? 'HEALTH_CHECK_TIMEOUT' : (result.failureCode || 'HEALTH_CHECK_FAILED'),
        result.error || '健康检查失败',
        {
          serviceId,
          statusCode: result.statusCode,
          details: result.details,
          attempts: result.attempts,
          durationMs: result.durationMs,
          mode: result.mode,
          path: result.path,
          port: result.port,
          terminal: result.terminal,
          ...extraDetails
        }
      );
    }

    return result;
  }

  async _runStartFlow(serviceId, serviceConfig, job, timingContext) {
    const resourceKey = await this._acquireServiceLock(serviceId, job);

    try {
      await jobService.startJob(job.jobId, {
        stage: 'start_new_process',
        progress: 20,
        message: '启动新进程'
      });

      const startResult = await this._runStage('start_new_process', () => processManager.start(serviceId, serviceConfig), {
        stageTimeoutMs: START_STAGE_TIMEOUT_MS,
        timingContext,
        details: { serviceId }
      });
      await jobService.renewLock(resourceKey, job.jobId);

      await jobService.updateJob(job.jobId, {
        stage: 'health_check',
        progress: 80,
        message: '等待健康检查通过'
      });

      const health = await this._waitForHealthy(serviceId, timingContext);
      return jobService.completeJob(job.jobId, { startResult, health }, {
        stage: 'completed',
        message: '服务启动完成'
      });
    } catch (error) {
      await jobService.failJob(job.jobId, error, {
        stage: 'failed'
      });
      throw error;
    } finally {
      await jobService.releaseLock(resourceKey, job.jobId);
    }
  }

  async _runStopFlow(serviceId, serviceConfig, job, timingContext) {
    const resourceKey = await this._acquireServiceLock(serviceId, job);

    try {
      await jobService.startJob(job.jobId, {
        stage: 'stop_old_process',
        progress: 30,
        message: '停止服务进程'
      });

      const result = await this._runStage('stop_old_process', () => processManager.stop(serviceId, serviceConfig), {
        stageTimeoutMs: STOP_STAGE_TIMEOUT_MS,
        timingContext,
        details: { serviceId }
      });

      return jobService.completeJob(job.jobId, result, {
        stage: 'completed',
        message: '服务停止完成'
      });
    } catch (error) {
      await jobService.failJob(job.jobId, error, {
        stage: 'failed'
      });
      throw error;
    } finally {
      await jobService.releaseLock(resourceKey, job.jobId);
    }
  }

  async _runRestartFlow(serviceId, serviceConfig, job, timingContext) {
    const resourceKey = await this._acquireServiceLock(serviceId, job);

    try {
      await jobService.startJob(job.jobId, {
        stage: 'stop_old_process',
        progress: 20,
        message: '停止旧进程'
      });
      const stopResult = await this._runStage('stop_old_process', () => processManager.stop(serviceId, serviceConfig, {
        phase: 'restarting',
        finalPhase: 'restarting'
      }), {
        stageTimeoutMs: STOP_STAGE_TIMEOUT_MS,
        timingContext,
        details: { serviceId }
      });

      await jobService.renewLock(resourceKey, job.jobId);
      await jobService.updateJob(job.jobId, {
        stage: 'start_new_process',
        progress: 55,
        message: '启动新进程'
      });
      const startResult = await this._runStage('start_new_process', () => processManager.start(serviceId, serviceConfig, { phase: 'restarting' }), {
        stageTimeoutMs: START_STAGE_TIMEOUT_MS,
        timingContext,
        details: { serviceId }
      });

      await jobService.updateJob(job.jobId, {
        stage: 'health_check',
        progress: 80,
        message: '等待健康检查通过'
      });
      const health = await this._waitForHealthy(serviceId, timingContext);

      return jobService.completeJob(job.jobId, { stopResult, startResult, health }, {
        stage: 'completed',
        message: '服务重启完成'
      });
    } catch (error) {
      await jobService.failJob(job.jobId, error, {
        stage: 'failed'
      });
      throw error;
    } finally {
      await jobService.releaseLock(resourceKey, job.jobId);
    }
  }

  async _runReloadFlow(serviceId, serviceConfig, job, timingContext) {
    const resourceKey = await this._acquireServiceLock(serviceId, job);
    let stopCompleted = false;
    let compensationAttempted = false;

    try {
      await jobService.startJob(job.jobId, {
        stage: 'compile',
        progress: 10,
        message: '编译服务代码'
      });
      const compileResult = await this._runStage('compile', (stageTimeoutMs) => processManager.compileService(serviceId, serviceConfig, {
        timeoutMs: stageTimeoutMs
      }), {
        stageTimeoutMs: COMPILE_STAGE_TIMEOUT_MS,
        timingContext,
        details: { serviceId }
      });

      await jobService.renewLock(resourceKey, job.jobId);
      await jobService.updateJob(job.jobId, {
        stage: 'stop_old_process',
        progress: 35,
        message: '停止旧进程'
      });
      const stopResult = await this._runStage('stop_old_process', () => processManager.stop(serviceId, serviceConfig, {
        phase: 'restarting',
        finalPhase: 'restarting'
      }), {
        stageTimeoutMs: STOP_STAGE_TIMEOUT_MS,
        timingContext,
        details: { serviceId }
      });
      stopCompleted = stopResult.success;

      await jobService.renewLock(resourceKey, job.jobId);
      await jobService.updateJob(job.jobId, {
        stage: 'start_new_process',
        progress: 60,
        message: '启动新进程'
      });
      const startResult = await this._runStage('start_new_process', () => processManager.start(serviceId, serviceConfig, { phase: 'restarting' }), {
        stageTimeoutMs: START_STAGE_TIMEOUT_MS,
        timingContext,
        details: { serviceId }
      });

      await jobService.updateJob(job.jobId, {
        stage: 'health_check',
        progress: 80,
        message: '等待健康检查通过'
      });
      const health = await this._waitForHealthy(serviceId, timingContext);

      return jobService.completeJob(job.jobId, {
        compileResult,
        stopResult,
        startResult,
        health
      }, {
        stage: 'completed',
        message: '服务 reload 完成'
      });
    } catch (error) {
      if (stopCompleted && !compensationAttempted) {
        compensationAttempted = true;
        try {
          await jobService.updateJob(job.jobId, {
            stage: 'compensation_start',
            progress: 90,
            message: '执行补偿启动'
          });
          logger.broadcast(`执行补偿启动: ${serviceConfig.name}`, 'service', serviceId);
          await this._runStage('compensation_start', () => processManager.start(serviceId, serviceConfig, { phase: 'restarting' }), {
            stageTimeoutMs: COMPENSATION_START_TIMEOUT_MS,
            timingContext,
            details: { serviceId, compensation: true }
          });
          const recoveryHealth = await this._waitForHealthy(serviceId, timingContext, { compensation: true });
          return jobService.completeJob(job.jobId, {
            recovered: true,
            health: recoveryHealth,
            compensation: true
          }, {
            status: 'recovered',
            stage: 'completed',
            message: 'reload 失败后已通过补偿启动恢复'
          });
        } catch (compensationError) {
          await jobService.failJob(job.jobId, createAppError(500, 'START_FAILED', compensationError.message, {
            serviceId,
            compensation: true
          }), {
            status: 'failed_service_down',
            stage: 'failed',
            message: 'reload 失败且补偿启动未恢复服务'
          });
          throw compensationError;
        }
      }

      await jobService.failJob(job.jobId, error, {
        stage: 'failed'
      });
      throw error;
    } finally {
      await jobService.releaseLock(resourceKey, job.jobId);
    }
  }

  _buildBatchSummary(total, results) {
    return {
      total,
      succeeded: results.filter((item) => item.success).length,
      failed: results.filter((item) => !item.success).length,
      running: Math.max(total - results.length, 0)
    };
  }

  async _executeBatchAction({
    type,
    targetId,
    message,
    actionLabel,
    services,
    totalTimeoutMs,
    childType,
    childMessageBuilder,
    childRunner
  }) {
    await jobService.assertWritableRequestAllowed('batch:services', {
      action: actionLabel,
      scope: 'batch.services'
    });

    const parentJob = await this._createBatchJob({
      type,
      targetId,
      message,
      metadata: {
        services: services.map((item) => item.id),
        action: actionLabel
      },
      summary: {
        total: services.length,
        succeeded: 0,
        failed: 0,
        running: services.length
      }
    });

    const batchLock = await jobService.acquireLock('batch:services', parentJob);
    if (!batchLock.acquired) {
      await jobService.deleteJob(parentJob.jobId);
      throw createAppError(409, 'BATCH_BUSY', '批量服务任务正在处理中，请稍后再试', {
        action: actionLabel,
        lock: batchLock.lock
      });
    }

    const startedParentJob = await jobService.startJob(parentJob.jobId, {
      stage: 'prepare',
      progress: services.length === 0 ? 100 : 5,
      message: `${message}已开始`
    });
    const timingContext = this._createTimingContext(totalTimeoutMs);

    (async () => {
      const results = [];
      const subJobs = [];

      try {
        for (let index = 0; index < services.length; index += 1) {
          const serviceItem = services[index];
          const serviceId = serviceItem.id;
          const serviceConfig = validator.getValidService(serviceId);

          const childJob = await this._createServiceJob({
            serviceId,
            type: childType,
            stage: 'prepare',
            message: childMessageBuilder(serviceItem),
            metadata: {
              batchJobId: parentJob.jobId,
              batchAction: actionLabel
            },
            parentJobId: parentJob.jobId
          });
          subJobs.push(childJob.jobId);

          await jobService.updateJob(parentJob.jobId, {
            subJobs,
            stage: 'running_children',
            progress: Math.max(5, Math.round((index / Math.max(services.length, 1)) * 100)),
            message: `正在处理 ${serviceItem.name}`,
            summary: this._buildBatchSummary(services.length, results)
          });

          try {
            await jobService.assertWritableRequestAllowed(`service:${serviceId}`, {
              serviceId,
              action: actionLabel,
              parentJobId: parentJob.jobId
            });
            const completedJob = await childRunner(serviceId, serviceConfig, childJob, timingContext);
            results.push({
              serviceId,
              serviceName: serviceItem.name,
              success: true,
              status: completedJob.status,
              jobId: childJob.jobId,
              result: completedJob.result || null
            });
          } catch (error) {
            results.push({
              serviceId,
              serviceName: serviceItem.name,
              success: false,
              code: error.code || 'INTERNAL_ERROR',
              error: error.message,
              details: error.details || {},
              jobId: childJob.jobId
            });

            if (serviceConfig.critical && actionLabel.includes('start')) {
              logger.broadcast(`关键服务 ${serviceItem.name} 启动失败，停止后续服务启动`, 'service');
              throw createAppError(500, 'CRITICAL_SERVICE_FAILED', `关键服务 ${serviceItem.name} 启动失败`, {
                serviceId,
                serviceName: serviceItem.name
              });
            }
          }

          await jobService.updateJob(parentJob.jobId, {
            subJobs,
            summary: this._buildBatchSummary(services.length, results),
            progress: Math.round(((index + 1) / Math.max(services.length, 1)) * 100),
            message: index === services.length - 1 ? `${message}执行完成` : `已完成 ${index + 1}/${services.length} 个服务`
          });
        }

        const succeededCount = results.filter((item) => item.success).length;
        const failedCount = results.filter((item) => !item.success).length;
        const status = failedCount === 0
          ? 'all_succeeded'
          : succeededCount === 0
            ? 'all_failed'
            : 'partial_failed';

        await jobService.completeJob(parentJob.jobId, {
          results
        }, {
          status,
          stage: 'completed',
          progress: 100,
          subJobs,
          summary: this._buildBatchSummary(services.length, results),
          message: `${message}已完成`
        });
      } catch (error) {
        await jobService.failJob(parentJob.jobId, error, {
          stage: 'failed',
          subJobs,
          summary: this._buildBatchSummary(services.length, results)
        });
      } finally {
        await jobService.releaseLock('batch:services', parentJob.jobId);
      }
    })().catch((error) => {
      logger.broadcast(`${message}后台执行失败: ${error.message}`, 'service');
    });

    return startedParentJob;
  }

  async startService(serviceId) {
    const serviceConfig = validator.getValidService(serviceId);
    const resourceKey = `service:${serviceId}`;
    await jobService.assertWritableRequestAllowed(resourceKey, { serviceId, action: 'start' });

    const job = await this._createServiceJob({
      serviceId,
      type: 'service.start',
      stage: 'prepare',
      message: '准备启动服务'
    });
    const timingContext = this._createTimingContext(START_TOTAL_TIMEOUT_MS);

    return this._runStartFlow(serviceId, serviceConfig, job, timingContext);
  }

  async stopService(serviceId) {
    const serviceConfig = validator.getValidService(serviceId);
    const resourceKey = `service:${serviceId}`;
    await jobService.assertWritableRequestAllowed(resourceKey, { serviceId, action: 'stop' });

    const job = await this._createServiceJob({
      serviceId,
      type: 'service.stop',
      stage: 'prepare',
      message: '准备停止服务'
    });
    const timingContext = this._createTimingContext(STOP_TOTAL_TIMEOUT_MS);

    return this._runStopFlow(serviceId, serviceConfig, job, timingContext);
  }

  async restartService(serviceId) {
    const serviceConfig = validator.getValidService(serviceId);
    const resourceKey = `service:${serviceId}`;
    await jobService.assertWritableRequestAllowed(resourceKey, { serviceId, action: 'restart' });

    const job = await this._createServiceJob({
      serviceId,
      type: 'service.restart',
      stage: 'prepare',
      message: '准备重启服务'
    });
    const timingContext = this._createTimingContext(RESTART_TOTAL_TIMEOUT_MS);

    return this._runRestartFlow(serviceId, serviceConfig, job, timingContext);
  }

  async reloadService(serviceId) {
    const serviceConfig = validator.getValidService(serviceId);
    const resourceKey = `service:${serviceId}`;
    await jobService.assertWritableRequestAllowed(resourceKey, { serviceId, action: 'reload' });

    const job = await this._createServiceJob({
      serviceId,
      type: 'service.reload',
      stage: 'prepare',
      message: '准备执行 reload'
    });
    const timingContext = this._createTimingContext(RELOAD_TOTAL_TIMEOUT_MS);

    return this._runReloadFlow(serviceId, serviceConfig, job, timingContext);
  }

  async startAllServices() {
    logger.broadcast('\n========== 启动所有服务 ==========', 'service');
    const services = [...configManager.getResolvedConfig().serviceCatalog];
    return this._executeBatchAction({
      type: 'service.batch.start',
      targetId: 'all-services',
      message: '批量启动服务',
      actionLabel: 'start-all',
      services,
      totalTimeoutMs: BATCH_START_TOTAL_TIMEOUT_MS,
      childType: 'service.start',
      childMessageBuilder: (service) => `准备启动 ${service.name}`,
      childRunner: (serviceId, serviceConfig, childJob, timingContext) => this._runStartFlow(serviceId, serviceConfig, childJob, timingContext)
    });
  }

  async stopAllServices() {
    logger.broadcast('\n========== 停止所有服务 ==========', 'service');
    const services = [...configManager.getResolvedConfig().serviceCatalog].sort((a, b) => b.startOrder - a.startOrder);
    return this._executeBatchAction({
      type: 'service.batch.stop',
      targetId: 'all-services',
      message: '批量停止服务',
      actionLabel: 'stop-all',
      services,
      totalTimeoutMs: BATCH_STOP_TOTAL_TIMEOUT_MS,
      childType: 'service.stop',
      childMessageBuilder: (service) => `准备停止 ${service.name}`,
      childRunner: (serviceId, serviceConfig, childJob, timingContext) => this._runStopFlow(serviceId, serviceConfig, childJob, timingContext)
    });
  }

  async restartAllServices() {
    logger.broadcast('\n========== 重启所有服务 ==========', 'service');
    const services = [...configManager.getResolvedConfig().serviceCatalog];
    return this._executeBatchAction({
      type: 'service.batch.restart',
      targetId: 'all-services',
      message: '批量重启服务',
      actionLabel: 'restart-all',
      services,
      totalTimeoutMs: BATCH_RESTART_TOTAL_TIMEOUT_MS,
      childType: 'service.restart',
      childMessageBuilder: (service) => `准备重启 ${service.name}`,
      childRunner: (serviceId, serviceConfig, childJob, timingContext) => this._runRestartFlow(serviceId, serviceConfig, childJob, timingContext)
    });
  }
}

module.exports = new ServiceTaskService();
