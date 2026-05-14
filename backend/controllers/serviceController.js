/**
 * 服务控制器
 */
const processManager = require('../services/processManager');
const healthChecker = require('../services/healthChecker');
const infraChecker = require('../services/infraChecker');
const validator = require('../utils/validator');
const logger = require('../utils/logger');
const configManager = require('../services/configManager');
const serviceTaskService = require('../services/serviceTaskService');
const systemCommandService = require('../services/systemCommandService');
const jobService = require('../services/jobService');
const { createAppError, sendError } = require('../utils/errors');
const fs = require('fs');
const path = require('path');

async function enqueueServiceTask(res, taskFn, actionLabel) {
  try {
    const job = await taskFn();
    return res.status(202).json({
      success: true,
      message: `${actionLabel}任务已创建`,
      jobId: job.jobId,
      data: job
    });
  } catch (error) {
    logger.broadcast(`${actionLabel}失败: ${error.message}`, 'service');
    return sendError(res, error);
  }
}

const serviceController = {
  getCatalog(req, res) {
    res.json({ success: true, data: configManager.getResolvedConfig().serviceCatalog });
  },

  async getAllStatus(req, res) {
    try {
      const status = await processManager.getAllStatus();
      res.json({ success: true, data: status });
    } catch (error) {
      sendError(res, error);
    }
  },

  async getStatus(req, res) {
    try {
      const { id } = req.params;
      if (!validator.isValidService(id)) {
        return sendError(res, createAppError(400, 'INVALID_SERVICE_ID', '无效的服务 ID', { serviceId: id }));
      }
      const status = await processManager.getStatus(id);
      res.json({ success: true, data: status });
    } catch (error) {
      sendError(res, error);
    }
  },

  async healthCheck(req, res) {
    try {
      const { id } = req.params;
      if (!validator.isValidService(id)) {
        return sendError(res, createAppError(400, 'INVALID_SERVICE_ID', '无效的服务 ID', { serviceId: id }));
      }
      const result = await healthChecker.check(id);
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  },

  async start(req, res) {
    const { id } = req.params;
    if (!validator.isValidService(id)) {
      return sendError(res, createAppError(400, 'INVALID_SERVICE_ID', '无效的服务 ID', { serviceId: id }));
    }

    return enqueueServiceTask(res, () => serviceTaskService.startService(id), '启动服务');
  },

  async stop(req, res) {
    const { id } = req.params;
    if (!validator.isValidService(id)) {
      return sendError(res, createAppError(400, 'INVALID_SERVICE_ID', '无效的服务 ID', { serviceId: id }));
    }

    return enqueueServiceTask(res, () => serviceTaskService.stopService(id), '停止服务');
  },

  async restart(req, res) {
    const { id } = req.params;
    if (!validator.isValidService(id)) {
      return sendError(res, createAppError(400, 'INVALID_SERVICE_ID', '无效的服务 ID', { serviceId: id }));
    }

    return enqueueServiceTask(res, () => serviceTaskService.restartService(id), '重启服务');
  },

  async reload(req, res) {
    const { id } = req.params;
    if (!validator.isValidService(id)) {
      return sendError(res, createAppError(400, 'INVALID_SERVICE_ID', '无效的服务 ID', { serviceId: id }));
    }

    return enqueueServiceTask(res, () => serviceTaskService.reloadService(id), 'Reload 服务');
  },

  async startAll(req, res) {
    return enqueueServiceTask(res, () => serviceTaskService.startAllServices(), '批量启动服务');
  },

  async stopAll(req, res) {
    return enqueueServiceTask(res, () => serviceTaskService.stopAllServices(), '批量停止服务');
  },

  async restartAll(req, res) {
    return enqueueServiceTask(res, () => serviceTaskService.restartAllServices(), '批量重启服务');
  },

  async systemReload(req, res) {
    try {
      const { password } = req.body || {};
      if (typeof password !== 'string' || password.length === 0) {
        return sendError(res, createAppError(400, 'SUDO_PASSWORD_REQUIRED', '请输入管理员密码'));
      }

      await systemCommandService.reloadMsctl(password);
      return res.json({
        success: true,
        message: 'msctl reload 执行成功'
      });
    } catch (error) {
      logger.broadcast(`系统 reload 失败: ${error.message}`, 'service');
      return sendError(res, error);
    }
  },

  async tunnelStart(req, res) {
    try {
      const { ports } = req.body || {};
      if (!Array.isArray(ports) || ports.length === 0) {
        return sendError(res, createAppError(400, 'PORTS_REQUIRED', '请选择至少一个端口映射'));
      }

      const result = await systemCommandService.startTunnel(ports);
      return res.json({
        success: true,
        message: 'SSH 隧道已建立',
        data: result
      });
    } catch (error) {
      logger.broadcast(`SSH 隧道启动失败: ${error.message}`, 'service');
      return sendError(res, error);
    }
  },

  async tunnelStop(req, res) {
    try {
      const result = await systemCommandService.stopTunnel();
      return res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      logger.broadcast(`SSH 隧道停止失败: ${error.message}`, 'service');
      return sendError(res, error);
    }
  },

  async tunnelStatus(req, res) {
    try {
      const status = await systemCommandService.getTunnelStatus();
      return res.json({
        success: true,
        data: { status }
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  /**
   * 获取保存的 SSH 隧道配置
   */
  getTunnelConfig(req, res) {
    try {
      const editableConfig = configManager.getEditableConfig();
      const savedPorts = editableConfig.sshTunnel?.ports;
      const autoConnect = editableConfig.sshTunnel?.autoConnect;
      const enabled = editableConfig.sshTunnel?.enabled;
      const remoteHost = editableConfig.sshTunnel?.remoteHost || editableConfig.tunnel?.remoteHost || '';
      const remoteUser = editableConfig.sshTunnel?.remoteUser || editableConfig.tunnel?.remoteUser || '';
      return res.json({
        success: true,
        data: { ports: savedPorts || null, autoConnect: !!autoConnect, enabled: !!enabled, remoteHost, remoteUser }
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  /**
   * 保存 SSH 隧道配置
   */
  async saveTunnelConfig(req, res) {
    try {
      const { ports, autoConnect, enabled, remoteHost, remoteUser } = req.body || {};

      // 获取当前配置
      const currentConfig = configManager.getEditableConfig();
      const newConfig = {
        ...currentConfig,
        sshTunnel: {
          ...(currentConfig.sshTunnel || {}),
          remoteHost: remoteHost ?? currentConfig.sshTunnel?.remoteHost ?? currentConfig.tunnel?.remoteHost ?? '',
          remoteUser: remoteUser ?? currentConfig.sshTunnel?.remoteUser ?? currentConfig.tunnel?.remoteUser ?? '',
          ports,
          autoConnect: !!autoConnect,
          enabled: !!enabled
        }
      };

      // 保存草稿
      configManager.saveDraft(newConfig);
      configManager.applyConfig();

      return res.json({
        success: true,
        message: 'SSH 隧道配置已保存'
      });
    } catch (error) {
      logger.broadcast(`SSH 隧道配置保存失败: ${error.message}`, 'service');
      return sendError(res, error);
    }
  },

  async getInfraStatus(req, res) {
    try {
      const status = await infraChecker.checkAll();
      res.json({ success: true, data: status });
    } catch (error) {
      sendError(res, error);
    }
  },

  async buildSdk(req, res) {
    try {
      const resolvedConfig = configManager.getResolvedConfig();
      const projectRoot = resolvedConfig.projectRoot;

      if (!projectRoot || !fs.existsSync(path.join(projectRoot, 'framework', 'sdk-parent', 'pom.xml'))) {
        return sendError(res, createAppError(400, 'SDK_SOURCE_NOT_FOUND', 'SDK 源码目录不存在', {
          expectedPath: path.join(projectRoot || '', 'framework', 'sdk-parent')
        }));
      }

      const resourceKey = 'build:sdk';
      await jobService.assertWritableRequestAllowed(resourceKey, { action: 'build-sdk' });

      const job = await jobService.createJob({
        type: 'sdk.build',
        targetType: 'infrastructure',
        targetId: 'sdk-parent',
        stage: 'prepare',
        message: '准备构建 SDK'
      });

      const lockResult = await jobService.acquireLock(resourceKey, job);
      if (!lockResult.acquired) {
        await jobService.deleteJob(job.jobId);
        return sendError(res, createAppError(409, 'SDK_BUILD_BUSY', 'SDK 构建任务正在进行中', {
          lock: lockResult.lock
        }));
      }

      await jobService.startJob(job.jobId, {
        stage: 'building',
        progress: 10,
        message: '正在构建 SDK (mvn install -N + mvn clean install -pl framework,...)'
      });

      res.status(202).json({
        success: true,
        message: 'SDK 构建任务已创建',
        jobId: job.jobId
      });

      // Execute build asynchronously
      (async () => {
        try {
          const mavenCommand = processManager._resolveMavenCommand();

          // 第一步：安装根 POM（-N 只安装根，不递归子模块）
          const rootArgs = ['install', '-N', '-DskipTests'];
          logger.broadcastCommand(`${mavenCommand} ${rootArgs.join(' ')}`, 'service', 'sdk-build');
          await processManager._runCommand({
            command: mavenCommand,
            args: rootArgs,
            cwd: projectRoot,
            logType: 'service',
            serviceId: 'sdk-build',
            env: process.env,
            timeoutMs: 300000
          });

          // 第二步：构建 framework 及 sdk-parent 全部子模块
          const sdkArgs = [
            'clean', 'install',
            '-pl', 'framework,framework/sdk-parent,framework/sdk-parent/domain,framework/sdk-parent/sdk,framework/sdk-parent/xpack-interface,framework/sdk-parent/jmeter',
            '-DskipTests'
          ];
          logger.broadcastCommand(`${mavenCommand} ${sdkArgs.join(' ')}`, 'service', 'sdk-build');
          const result = await processManager._runCommand({
            command: mavenCommand,
            args: sdkArgs,
            cwd: projectRoot,
            logType: 'service',
            serviceId: 'sdk-build',
            env: process.env,
            timeoutMs: 600000
          });

          await jobService.completeJob(job.jobId, result, {
            stage: 'completed',
            message: 'SDK 构建完成'
          });

          logger.broadcast('SDK 构建完成，可以启动服务', 'service');
        } catch (error) {
          await jobService.failJob(job.jobId, error, {
            stage: 'failed',
            message: `SDK 构建失败: ${error.message}`
          });
        } finally {
          await jobService.releaseLock(resourceKey, job.jobId);
        }
      })().catch((error) => {
        logger.broadcast(`SDK 构建后台执行失败: ${error.message}`, 'service');
      });
    } catch (error) {
      logger.broadcast(`SDK 构建失败: ${error.message}`, 'service');
      return sendError(res, error);
    }
  }
};

module.exports = serviceController;
