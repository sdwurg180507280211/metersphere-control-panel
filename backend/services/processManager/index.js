/**
 * 进程管理服务
 * 统一管理服务的启动、停止和状态追踪
 *
 * 模块拆分：
 * - shared.js          共享状态和常量
 * - serviceLifecycle.js 服务启停、批量操作、状态管理
 * - buildProcess.js     前端构建、依赖管理
 * - devServer.js        开发服务器管理
 */
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const configManager = require('../configManager');
const logger = require('../../utils/logger');
const healthChecker = require('../healthChecker');
const {
  PID_DIR,
  BATCH_START_HEALTH_TIMEOUT,
  BATCH_START_HEALTH_INTERVAL,
  serviceProcesses,
  serviceStatuses,
  TRANSITIONAL_SERVICE_PHASES
} = require('./shared');

const applyServiceLifecycle = require('./serviceLifecycle');
const applyBuildProcess = require('./buildProcess');
const applyDevServer = require('./devServer');

class ProcessManager {
  constructor() {
    this.pidDir = PID_DIR;
    this.serviceHealthMonitors = new Map();
  }

  // ── 配置访问 ──

  _getRuntimeConfig() {
    return configManager.getResolvedConfig();
  }

  _getProjectRoot() {
    return this._getRuntimeConfig().projectRoot;
  }

  _getServiceConfig(serviceId) {
    return this._getRuntimeConfig().services[serviceId];
  }

  _getServiceCatalog() {
    return this._getRuntimeConfig().serviceCatalog;
  }

  // ── 状态管理基础 ──

  _getBaseServiceStatus(serviceId, serviceConfig = null) {
    const effectiveServiceConfig = serviceConfig || this._getServiceConfig(serviceId);
    return {
      serviceId,
      name: effectiveServiceConfig?.name || serviceId,
      phase: 'stopped',
      running: false,
      pid: null,
      error: null,
      updatedAt: new Date().toISOString()
    };
  }

  _getCurrentServiceStatus(serviceId, serviceConfig = null) {
    return serviceStatuses.get(serviceId) || this._getBaseServiceStatus(serviceId, serviceConfig);
  }

  _setServiceStatus(serviceId, updates = {}, options = {}) {
    const serviceConfig = options.serviceConfig || this._getServiceConfig(serviceId);
    const current = this._getCurrentServiceStatus(serviceId, serviceConfig);
    const next = {
      ...current,
      ...updates,
      serviceId,
      name: serviceConfig?.name || current.name || serviceId,
      updatedAt: new Date().toISOString()
    };

    if (updates.phase && updates.phase !== 'failed' && !Object.prototype.hasOwnProperty.call(updates, 'error')) {
      next.error = null;
    }

    if (!Object.prototype.hasOwnProperty.call(updates, 'pid') && current.pid && next.running) {
      next.pid = current.pid;
    }

    serviceStatuses.set(serviceId, next);
    if (options.broadcast !== false) {
      this._broadcastServiceStatus(next);
    }
    return next;
  }

  _isTransitionalPhase(phase) {
    return TRANSITIONAL_SERVICE_PHASES.has(phase);
  }

  // ── 健康监控 ──

  _clearHealthMonitor(serviceId) {
    this.serviceHealthMonitors.delete(serviceId);
  }

  _monitorServiceHealth(serviceId, serviceConfig, options = {}) {
    const token = Symbol(serviceId);
    this.serviceHealthMonitors.set(serviceId, token);

    const initialDelay = options.initialDelay ?? 1500;
    const phase = options.phase || 'checking_health';

    (async () => {
      if (initialDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, initialDelay));
      }

      if (this.serviceHealthMonitors.get(serviceId) !== token) {
        return;
      }

      const current = this._getCurrentServiceStatus(serviceId, serviceConfig);
      this._setServiceStatus(serviceId, {
        phase,
        running: false,
        pid: current.pid || this._getPid(serviceId) || null
      }, { serviceConfig });

      const healthResult = await healthChecker.waitForHealthy(serviceId, {
        timeout: BATCH_START_HEALTH_TIMEOUT,
        interval: BATCH_START_HEALTH_INTERVAL,
        initialDelay: 0
      });

      if (this.serviceHealthMonitors.get(serviceId) !== token) {
        return;
      }

      const pid = this._getPid(serviceId);
      if (healthResult.healthy) {
        this._setServiceStatus(serviceId, {
          phase: 'running',
          running: true,
          pid,
          error: null
        }, { serviceConfig });
      } else {
        this._setServiceStatus(serviceId, {
          phase: 'failed',
          running: Boolean(pid),
          pid,
          error: healthResult.error || '健康检查未通过'
        }, { serviceConfig });
      }

      if (this.serviceHealthMonitors.get(serviceId) === token) {
        this.serviceHealthMonitors.delete(serviceId);
      }
    })().catch((error) => {
      if (this.serviceHealthMonitors.get(serviceId) === token) {
        this.serviceHealthMonitors.delete(serviceId);
      }
      this._setServiceStatus(serviceId, {
        phase: 'failed',
        running: false,
        pid: null,
        error: error.message
      }, { serviceConfig });
    });
  }

  // ── PID 管理 ──

  _getPidFile(serviceId) {
    return path.join(this.pidDir, `${serviceId}.pid`);
  }

  _savePid(serviceId, pid) {
    fs.writeFileSync(this._getPidFile(serviceId), String(pid));
  }

  /**
   * 恢复已存在的后端服务进程（从 PID 文件恢复）
   * 应在后端启动时调用，恢复重启前正在运行的服务
   */
  async restoreServices() {
    if (!fs.existsSync(this.pidDir)) {
      return 0;
    }

    let restoredCount = 0;
    const files = fs.readdirSync(this.pidDir);

    for (const file of files) {
      // 跳过开发服务器的 PID (devserver-*.pid)
      if (file.startsWith('devserver-')) {
        continue;
      }

      // 只处理 .pid 文件
      if (!file.endsWith('.pid')) {
        continue;
      }

      const serviceId = file.replace('.pid', '');
      const pid = this._getPid(serviceId);

      if (!pid) {
        // PID 文件无效，清理
        this._clearPid(serviceId);
        continue;
      }

      // 检查进程是否还在运行
      if (this._isProcessRunning(pid)) {
        // 获取服务配置
        const serviceConfig = this._getServiceConfig(serviceId);
        if (!serviceConfig) {
          // 服务配置不存在，清理
          this._clearPid(serviceId);
          continue;
        }

        // 恢复到内存状态
        serviceProcesses.set(serviceId, {
          pid,
          pom: serviceConfig.pom,
          port: serviceConfig.port,
          child: null  // spawn 引用丢失，无法获取新日志，这是已知限制
        });

        // 设置状态为 checking_health，触发健康检查
        this._setServiceStatus(serviceId, {
          phase: 'checking_health',
          running: false,
          pid
        }, { serviceConfig, broadcast: false });

        // 启动健康监控，自动更新最终状态
        this._monitorServiceHealth(serviceId, serviceConfig, {
          phase: 'checking_health',
          initialDelay: 1000
        });

        logger.broadcast(`恢复后端服务: ${serviceConfig.name} (PID: ${pid})`, 'system');
        restoredCount++;
      } else {
        // 进程已死，清理 PID 文件
        this._clearPid(serviceId);
      }
    }

    if (restoredCount > 0) {
      logger.broadcast(`共恢复 ${restoredCount} 个后端服务进程`, 'system');
    }

    return restoredCount;
  }


  _clearPid(serviceId, expectedPid = null) {
    const tracked = serviceProcesses.get(serviceId);
    if (expectedPid && tracked?.pid && tracked.pid !== expectedPid) {
      return;
    }

    serviceProcesses.delete(serviceId);
    const pidFile = this._getPidFile(serviceId);
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
  }

  _getPid(serviceId) {
    const tracked = serviceProcesses.get(serviceId);
    if (tracked?.pid) {
      return tracked.pid;
    }

    const pidFile = this._getPidFile(serviceId);
    if (!fs.existsSync(pidFile)) {
      return null;
    }

    const pid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
    return Number.isNaN(pid) ? null : pid;
  }

  _isProcessRunning(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return false;
    }
  }

  // ── WebSocket 广播 ──

  _broadcastServiceStatus(status) {
    try {
      const websocketService = require('../websocketService');
      websocketService.broadcastServiceStatus?.(status);
    } catch (error) {
      // ignore websocket availability issues
    }
  }

  // ── 进程工具 ──

  async _execFileSafe(command, args) {
    return new Promise((resolve) => {
      execFile(command, args, (error, stdout = '') => {
        if (error) {
          resolve('');
          return;
        }

        resolve(stdout);
      });
    });
  }

  async _findPidsByPom(pom) {
    const stdout = await this._execFileSafe('pgrep', ['-f', pom]);
    return stdout
      .split(/\s+/)
      .map((value) => parseInt(value, 10))
      .filter((pid) => !Number.isNaN(pid) && pid !== process.pid);
  }

  async _findPidsByPort(port) {
    if (!port) return [];

    const stdout = await this._execFileSafe('lsof', ['-ti', `tcp:${port}`]);
    return stdout
      .split(/\s+/)
      .map((value) => parseInt(value, 10))
      .filter((pid) => !Number.isNaN(pid) && pid !== process.pid);
  }

  async _terminateProcess(pid) {
    if (!pid || !this._isProcessRunning(pid)) {
      return;
    }

    const killOne = (targetPid, signal) => {
      try {
        process.kill(targetPid, signal);
        return true;
      } catch (error) {
        return false;
      }
    };

    const childPids = await this._findChildPids(pid);

    if (process.platform === 'win32') {
      await this._execFileSafe('taskkill', ['/PID', String(pid), '/T', '/F']);
      return;
    }

    for (const childPid of childPids) {
      killOne(childPid, 'SIGTERM');
    }
    killOne(pid, 'SIGTERM');

    const deadline = Date.now() + 5000;
    while (this._isProcessRunning(pid) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (this._isProcessRunning(pid)) {
      for (const childPid of childPids) {
        if (this._isProcessRunning(childPid)) {
          killOne(childPid, 'SIGKILL');
        }
      }
      killOne(pid, 'SIGKILL');
    }
  }

  async _findChildPids(parentPid) {
    try {
      const stdout = await this._execFileSafe('pgrep', ['-P', String(parentPid)]);
      return stdout
        .split(/\s+/)
        .map((value) => parseInt(value, 10))
        .filter((pid) => !Number.isNaN(pid));
    } catch (error) {
      return [];
    }
  }

  // ── 命令解析 ──

  _resolveMavenCommand() {
    const wrapperName = process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw';
    const wrapperPath = path.join(this._getProjectRoot(), wrapperName);

    if (fs.existsSync(wrapperPath)) {
      return wrapperPath;
    }

    return process.platform === 'win32' ? 'mvn.cmd' : 'mvn';
  }

  _resolveNpmCommand() {
    const config = this._getRuntimeConfig();
    if (config.npmPath && fs.existsSync(config.npmPath)) {
      return { command: config.npmPath, argsPrefix: [] };
    }

    if (process.env.npm_execpath && path.isAbsolute(process.env.npm_execpath)) {
      return {
        command: process.execPath,
        argsPrefix: [process.env.npm_execpath]
      };
    }

    const { execSync } = require('child_process');

    try {
      const npmPath = execSync('which npm', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      if (npmPath && fs.existsSync(npmPath)) {
        return { command: npmPath, argsPrefix: [] };
      }
    } catch (e) {}

    const commonPaths = [
      '/usr/local/bin/npm',
      '/opt/homebrew/bin/npm',
      '/usr/bin/npm',
      path.join(process.env.HOME || '', '.nvm/versions/node/*/bin/npm')
    ];

    for (const npmPath of commonPaths) {
      if (fs.existsSync(npmPath)) {
        return { command: npmPath, argsPrefix: [] };
      }
    }

    if (process.env.PATH) {
      const paths = process.env.PATH.split(':');
      for (const p of paths) {
        const npmPath = path.join(p, 'npm');
        if (fs.existsSync(npmPath)) {
          return { command: npmPath, argsPrefix: [] };
        }
      }
    }

    return {
      command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
      argsPrefix: []
    };
  }

  _getExtendedEnv(baseEnv = process.env, commandPath = null) {
    if (!commandPath || !path.isAbsolute(commandPath)) {
      return baseEnv;
    }

    const commandDir = path.dirname(commandPath);
    const env = { ...baseEnv };
    const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
    const oldPath = env[pathKey] || '';

    if (!oldPath.includes(commandDir)) {
      const separator = process.platform === 'win32' ? ';' : ':';
      env[pathKey] = oldPath ? `${commandDir}${separator}${oldPath}` : commandDir;
    }

    return env;
  }

  _runCommand({ command, args, cwd, logType = 'service', serviceId = null, env = process.env, timeoutMs = 0 }) {
    const extendedEnv = this._getExtendedEnv(env, command);

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        detached: false,
        env: extendedEnv
      });

      let stderrOutput = '';
      let settled = false;
      let killTimer = null;

      const finishResolve = (value) => {
        if (settled) {
          return;
        }
        settled = true;
        if (killTimer) {
          clearTimeout(killTimer);
        }
        resolve(value);
      };

      const finishReject = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (killTimer) {
          clearTimeout(killTimer);
        }
        reject(error);
      };

      if (timeoutMs > 0) {
        killTimer = setTimeout(() => {
          try {
            child.kill('SIGTERM');
          } catch (error) {
            // ignore kill failure
          }

          setTimeout(() => {
            try {
              child.kill('SIGKILL');
            } catch (error) {
              // ignore kill failure
            }
          }, 2000).unref?.();

          const timeoutError = new Error(`命令执行超时: ${command} ${args.join(' ')}`);
          timeoutError.code = 'COMMAND_TIMEOUT';
          timeoutError.details = { command, args, cwd, timeoutMs };
          finishReject(timeoutError);
        }, timeoutMs);
      }

      child.stdout?.on('data', (raw) => {
        logger.broadcast(raw.toString(), logType, serviceId);
      });
      child.stderr?.on('data', (raw) => {
        const message = raw.toString();
        stderrOutput += message;
        logger.broadcast(message, logType, serviceId);
      });
      child.on('error', finishReject);
      child.on('close', (code) => {
        if (settled) {
          return;
        }

        if (code === 0) {
          finishResolve({ success: true });
          return;
        }

        finishReject(new Error(stderrOutput || `命令执行失败: ${command} ${args.join(' ')}`));
      });
    });
  }
}

// 应用 mixin
applyServiceLifecycle(ProcessManager.prototype);
applyBuildProcess(ProcessManager.prototype);
applyDevServer(ProcessManager.prototype);

module.exports = new ProcessManager();
