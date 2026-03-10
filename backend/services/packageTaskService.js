const packageConfig = require('../config/package');
const configManager = require('./configManager');
const packageService = require('./packageService');
const jobService = require('./jobService');
const websocketService = require('./websocketService');
const logger = require('../utils/logger');
const { createAppError } = require('../utils/errors');

class PackageTaskService {
  async getOptions() {
    let script = null;

    try {
      script = {
        valid: true,
        resolvedPath: packageService.resolvePackageScriptPath(null, configManager.getResolvedConfig())
      };
    } catch (error) {
      script = {
        valid: false,
        error: error.message,
        details: error.details || {}
      };
    }

    return {
      services: packageConfig.getPackageServiceOptions(configManager.getResolvedConfig()),
      defaults: packageConfig.getPackageDefaults(configManager.getResolvedConfig().package || {}),
      capabilities: packageConfig.PACKAGE_CAPABILITIES,
      script
    };
  }

  async getActiveTask() {
    const activeJobs = await jobService.getActiveJobs();
    return activeJobs.find((job) => job.type === 'package.run' && ['pending', 'running'].includes(job.status)) || null;
  }

  async startTask(payload = {}) {
    const options = packageService.preparePackageRunOptions(payload);

    await jobService.assertWritableRequestAllowed(packageConfig.PACKAGE_RESOURCE_KEY, {
      action: 'package.run',
      services: options.services
    });

    const job = await jobService.createJob({
      type: 'package.run',
      targetType: 'package',
      targetId: 'metersphere',
      stage: 'prepare',
      progress: 0,
      message: '准备执行打包脚本',
      metadata: {
        resourceKey: packageConfig.PACKAGE_RESOURCE_KEY,
        services: options.services,
        imageVersion: options.imageVersion,
        parallelBuild: options.parallelBuild,
        maxJobs: options.maxJobs,
        buildOnly: options.buildOnly,
        packagePath: options.packagePath || null,
        scriptPath: options.scriptPath
      }
    });

    const lockResult = await jobService.acquireLock(packageConfig.PACKAGE_RESOURCE_KEY, job);
    if (!lockResult.acquired) {
      await jobService.deleteJob(job.jobId);
      throw createAppError(409, 'PACKAGE_TASK_BUSY', '已有打包任务正在运行，请稍后再试', {
        lock: lockResult.lock
      });
    }

    await jobService.startJob(job.jobId, {
      stage: 'spawn',
      progress: 5,
      message: '打包任务已启动'
    });

    websocketService.broadcastPackageEvent('started', {
      jobId: job.jobId,
      status: 'running',
      services: options.services,
      imageVersion: options.imageVersion,
      parallelBuild: options.parallelBuild,
      maxJobs: options.maxJobs
    });

    this._executeTask(job, options).catch(() => {
      // 已在内部写入任务失败状态
    });

    return {
      jobId: job.jobId,
      status: 'running',
      services: options.services,
      imageVersion: options.imageVersion,
      parallelBuild: options.parallelBuild,
      maxJobs: options.maxJobs,
      buildOnly: options.buildOnly,
      packagePath: options.packagePath || null,
      scriptPath: options.scriptPath
    };
  }

  async _executeTask(job, options) {
    const startedAt = Date.now();
    let heartbeatTimer = null;
    let settled = false;

    const stopHeartbeat = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const pushHeartbeat = async () => {
      const heartbeatAt = new Date().toISOString();

      await jobService.renewLock(packageConfig.PACKAGE_RESOURCE_KEY, job.jobId).catch(() => null);
      await jobService.updateJob(job.jobId, {
        stage: 'running',
        progress: 10,
        message: '打包脚本运行中',
        metadata: {
          lastHeartbeatAt: heartbeatAt
        }
      }).catch(() => null);

      websocketService.broadcastPackageEvent('heartbeat', {
        jobId: job.jobId,
        status: 'running',
        heartbeatAt
      });
    };

    logger.broadcast('\n========== 开始执行 MeterSphere 打包 ==========', 'package');
    logger.broadcast(`脚本路径: ${options.scriptPath}`, 'package');
    logger.broadcast(`目标服务: ${options.services.join(', ')}`, 'package');
    logger.broadcast(`镜像版本: ${options.imageVersion}`, 'package');
    logger.broadcast(`并行构建: ${options.parallelBuild} / 最大线程: ${options.maxJobs}`, 'package');

    const child = packageService.spawnPackageProcess(options, {
      onStdout: (message) => logger.broadcast(message, 'package'),
      onStderr: (message) => logger.broadcast(message, 'package')
    });

    await jobService.updateJob(job.jobId, {
      stage: 'running',
      progress: 10,
      message: '打包脚本运行中',
      metadata: {
        pid: child.pid,
        lastHeartbeatAt: new Date().toISOString()
      }
    });

    heartbeatTimer = setInterval(() => {
      if (!settled) {
        pushHeartbeat().catch(() => null);
      }
    }, packageConfig.PACKAGE_HEARTBEAT_INTERVAL_MS);
    heartbeatTimer.unref?.();

    await new Promise((resolve) => {
      const settleFailure = async (error, result = null) => {
        if (settled) {
          return;
        }

        settled = true;
        stopHeartbeat();
        await jobService.failJob(job.jobId, error, {
          stage: 'failed',
          message: error.message,
          result
        }).catch(() => null);

        websocketService.broadcastPackageEvent('failed', {
          jobId: job.jobId,
          status: 'failed',
          error: {
            code: error.code || 'PACKAGE_TASK_FAILED',
            message: error.message,
            details: error.details || {}
          },
          result
        });

        resolve();
      };

      const settleSuccess = async (code, signal) => {
        if (settled) {
          return;
        }

        settled = true;
        stopHeartbeat();

        const result = {
          exitCode: code,
          signal,
          durationMs: Date.now() - startedAt,
          services: options.services,
          imageVersion: options.imageVersion,
          parallelBuild: options.parallelBuild,
          maxJobs: options.maxJobs,
          buildOnly: options.buildOnly,
          packagePath: options.packagePath || null,
          scriptPath: options.scriptPath
        };

        if (code === 0) {
          await jobService.completeJob(job.jobId, result, {
            stage: 'completed',
            progress: 100,
            message: '打包任务已完成'
          }).catch(() => null);

          websocketService.broadcastPackageEvent('completed', {
            jobId: job.jobId,
            status: 'success',
            result
          });
          return resolve();
        }

        const error = createAppError(500, 'PACKAGE_SCRIPT_FAILED', `打包脚本执行失败，退出码 ${code}`, {
          exitCode: code,
          signal
        });
        await settleFailure(error, result);
      };

      child.once('error', (error) => {
        logger.broadcast(`打包进程启动失败: ${error.message}`, 'package');
        settleFailure(createAppError(500, 'PACKAGE_PROCESS_ERROR', '打包进程启动失败', {
          cause: error.message
        }));
      });

      child.once('close', (code, signal) => {
        settleSuccess(code, signal).catch(() => null);
      });
    });
  }
}

module.exports = new PackageTaskService();
