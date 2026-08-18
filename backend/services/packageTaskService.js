const packageConfig = require('../config/package');
const configManager = require('./configManager');
const packageService = require('./packageService');
const jobService = require('./jobService');
const websocketService = require('./websocketService');
const packageHistoryService = require('./packageHistoryService');
const packageReleaseMetadataService = require('./packageReleaseMetadataService');
const logger = require('../utils/logger');
const { createAppError } = require('../utils/errors');

/**
 * 递增镜像版本号
 * "v2.10.26.09-lts" -> "v2.10.26.10-lts"
 * "v2.10.26.9" -> "v2.10.26.10"
 * 无法解析时返回原值
 */
function incrementVersion(version) {
  if (!version || typeof version !== 'string') return version;
  // 匹配: 前缀(含最后一个点前的数字) + 序号(最后一个点后的数字) + 后缀(-xxx)
  const match = version.match(/^(.*\.)(\d+)(-\S+)?$/);
  if (!match) return version;
  const prefix = match[1];
  const seqStr = match[2];
  const suffix = match[3] || '';
  const next = parseInt(seqStr, 10) + 1;
  // 保留原始前导零位数（如 09 -> 10，001 -> 002）
  const padded = seqStr.length > 1 ? String(next).padStart(seqStr.length, '0') : String(next);
  return `${prefix}${padded}${suffix}`;
}

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
        serviceImageVersions: options.serviceImageVersions,
        parallelBuild: options.parallelBuild,
        maxJobs: options.maxJobs,
        buildOnly: options.buildOnly,
        packagePath: options.packagePath || null,
        scriptPath: options.scriptPath,
        changelog: options.changelog || null
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
      serviceImageVersions: options.serviceImageVersions,
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
      serviceImageVersions: options.serviceImageVersions,
      parallelBuild: options.parallelBuild,
      maxJobs: options.maxJobs,
      buildOnly: options.buildOnly,
      packagePath: options.packagePath || null,
      scriptPath: options.scriptPath,
      changelog: options.changelog || null
    };
  }

  async _executeTask(job, options) {
    const startedAt = Date.now();
    let heartbeatTimer = null;
    let settled = false;
    let gitSnapshot = null;
    const gitSnapshotPromise = packageReleaseMetadataService.collectSnapshot()
      .then((snapshot) => {
        gitSnapshot = snapshot;
        return snapshot;
      })
      .catch((metaErr) => {
        logger.broadcast(`Git 快照采集失败: ${metaErr.message}`, 'package');
        gitSnapshot = {
          gitBranch: null,
          gitCommit: null,
          gitSubject: null,
          metadataWarnings: [`Git 快照采集失败: ${metaErr.message}`]
        };
        return gitSnapshot;
      });

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
    const packageCmd = `${options.scriptPath} ${options.services.join(' ')}`;
    logger.broadcastCommand(packageCmd, 'package');

    const cleanLogText = (message = '') => message.replace(/\x1b\[[0-9;]*m/g, '');

    // 有实质意义的外部命令，才作为 CMD 级别显示
    // 也匹配 if !、time、nice 等前缀包装的命令
    const REAL_COMMAND = /^(?:if ! |time |nice |ionice |sudo |nohup |setsid |eval |exec )*(mvn|maven|docker|npm|npx|yarn|pnpm|git|curl|wget|tar|zip|unzip|cp|mv|rm|mkdir|chmod|chown|ssh|scp|rsync|java|javac|javap|gradle|make|cmake|gcc|g\+\+|podman|buildah|skopeo|crane|helm|kubectl|aws|az|gcloud|s2i)\b/;

    const child = packageService.spawnPackageProcess(options, {
      onStdout: (message) => {
        const cleaned = cleanLogText(message);
        if (cleaned.trim()) {
          logger.broadcast(cleaned, 'package');
        }
      },
      onStderr: (message) => {
        const lines = cleanLogText(message).split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('+ ') || trimmed.startsWith('++ ')) {
            const cmd = trimmed.replace(/^\++\s*/, '');
            // 变量赋值 (VAR=...) 和非外部命令 → 普通日志
            if (/^[A-Z_][A-Z_0-9]*=/.test(cmd) || !REAL_COMMAND.test(cmd)) {
              logger.broadcast(line, 'package');
            } else {
              logger.broadcastCommand(cmd, 'package');
            }
          } else if (trimmed) {
            logger.broadcast(line, 'package');
          }
        }
      }
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

    const writeHistoryRecord = async ({ status, result = null, error = null, nextImageVersions = null }) => {
      try {
        logger.broadcast(`开始写入打包历史: job=${job.jobId}, status=${status}`, 'package');
        const releaseMeta = await packageReleaseMetadataService.collect({
          gitSnapshot: gitSnapshot || await gitSnapshotPromise,
          resolvePreviousSuccessCommit: (branch) => packageHistoryService.getLatestSuccessfulCommit({ branch })
        }).catch((metaErr) => {
          logger.broadcast(`发布元数据采集失败: ${metaErr.message}`, 'package');
          return {};
        });

        const historyId = await packageHistoryService.createRecord({
          jobId: job.jobId,
          status,
          services: options.services,
          serviceImageVersions: options.serviceImageVersions,
          nextImageVersions,
          exitCode: result?.exitCode ?? null,
          durationMs: result?.durationMs ?? (Date.now() - startedAt),
          scriptPath: options.scriptPath,
          parallelBuild: options.parallelBuild,
          maxJobs: options.maxJobs,
          buildOnly: options.buildOnly || false,
          packagePath: options.packagePath || null,
          changelog: options.changelog || null,
          startedAt: new Date(startedAt).toISOString(),
          finishedAt: new Date().toISOString(),
          errorCode: error?.code || null,
          errorMessage: error?.message || null,
          errorDetails: error?.details || null,
          gitBranch: releaseMeta.gitBranch || null,
          gitCommit: releaseMeta.gitCommit || null,
          gitSubject: releaseMeta.gitSubject || null,
          previousSuccessCommit: releaseMeta.previousSuccessCommit || null,
          commits: releaseMeta.commits || null,
          changedFiles: releaseMeta.changedFiles || null,
          changeSummary: releaseMeta.changeSummary || null,
          releaseItems: releaseMeta.releaseItems || null,
          metadataWarnings: releaseMeta.metadataWarnings || null
        });
        logger.broadcast(historyId ? `打包历史写入完成: id=${historyId}` : '打包历史未写入：历史服务未就绪或写入失败', 'package');
      } catch (historyErr) {
        logger.broadcast(`打包历史写入失败: ${historyErr.message}`, 'package');
      }
    };

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

        await writeHistoryRecord({
          status: 'failed',
          result,
          error: {
            code: error.code || 'PACKAGE_TASK_FAILED',
            message: error.message,
            details: error.details || {}
          }
        });

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

        const result = {
          exitCode: code,
          signal,
          durationMs: Date.now() - startedAt,
          services: options.services,
          serviceImageVersions: options.serviceImageVersions,
          parallelBuild: options.parallelBuild,
          maxJobs: options.maxJobs,
          buildOnly: options.buildOnly,
          packagePath: options.packagePath || null,
          scriptPath: options.scriptPath
        };

        // 非 0 退出码必须先走失败收尾。不能提前设置 settled，
        // 否则 settleFailure 会直接 return，导致任务永久停留在 running。
        if (code !== 0) {
          const error = createAppError(500, 'PACKAGE_SCRIPT_FAILED', `打包脚本执行失败，退出码 ${code}`, {
            exitCode: code,
            signal
          });
          await settleFailure(error, result);
          return;
        }

        settled = true;
        stopHeartbeat();

        // 打包成功：自动递增每个服务的镜像版本号
        const nextVersions = {};
        for (const serviceId of options.services) {
          const current = options.serviceImageVersions?.[serviceId];
          const next = incrementVersion(current);
          if (next !== current) {
            nextVersions[serviceId] = next;
            logger.broadcast(`[${serviceId}] 版本递增: ${current} -> ${next}`, 'package');
          }
        }

        // 写回 config（持久化递增后的版本）
        try {
          configManager.updateServiceImageVersions(nextVersions);
        } catch (err) {
          logger.broadcast(`版本递增写回失败: ${err.message}`, 'package');
        }

        const resultWithVersions = {
          ...result,
          serviceImageVersions: options.serviceImageVersions,
          nextImageVersions: nextVersions
        };

        await jobService.completeJob(job.jobId, resultWithVersions, {
          stage: 'completed',
          progress: 100,
          message: '打包任务已完成'
        }).catch(() => null);

        await writeHistoryRecord({
          status: 'succeeded',
          result: resultWithVersions,
          nextImageVersions: nextVersions
        });

        websocketService.broadcastPackageEvent('completed', {
          jobId: job.jobId,
          status: 'success',
          result: resultWithVersions,
          nextImageVersions: nextVersions
        });

        resolve();
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