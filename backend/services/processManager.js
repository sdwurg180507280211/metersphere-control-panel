/**
 * 进程管理服务
 * 统一管理服务的启动、停止和状态追踪
 */
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const buildProgressService = require('./buildProgressService');
const healthChecker = require('./healthChecker');

const PID_DIR = path.join(__dirname, '../../.pids');
const BATCH_START_HEALTH_TIMEOUT = 120000;
const BATCH_START_HEALTH_INTERVAL = 3000;

if (!fs.existsSync(PID_DIR)) {
  fs.mkdirSync(PID_DIR, { recursive: true });
}

const serviceProcesses = new Map();
const serviceStatuses = new Map();
const buildProcesses = new Map();
const TRANSITIONAL_SERVICE_PHASES = new Set(['starting', 'checking_health', 'stopping', 'restarting']);

class ProcessManager {
  constructor() {
    this.pidDir = PID_DIR;
    this.projectRoot = config.projectRoot;
    this.serviceHealthMonitors = new Map();
  }

  _getBaseServiceStatus(serviceId, serviceConfig = config.services[serviceId]) {
    return {
      serviceId,
      name: serviceConfig?.name || serviceId,
      phase: 'stopped',
      running: false,
      pid: null,
      error: null,
      updatedAt: new Date().toISOString()
    };
  }

  _getCurrentServiceStatus(serviceId, serviceConfig = config.services[serviceId]) {
    return serviceStatuses.get(serviceId) || this._getBaseServiceStatus(serviceId, serviceConfig);
  }

  _setServiceStatus(serviceId, updates = {}, options = {}) {
    const serviceConfig = options.serviceConfig || config.services[serviceId];
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

  _getPidFile(serviceId) {
    return path.join(this.pidDir, `${serviceId}.pid`);
  }

  _savePid(serviceId, pid) {
    fs.writeFileSync(this._getPidFile(serviceId), String(pid));
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

  _attachServiceProcess(serviceId, serviceConfig, child) {
    serviceProcesses.set(serviceId, {
      pid: child.pid,
      pom: serviceConfig.pom,
      port: serviceConfig.port,
      child
    });
    this._savePid(serviceId, child.pid);
    const current = this._getCurrentServiceStatus(serviceId, serviceConfig);
    this._setServiceStatus(serviceId, {
      phase: current.phase,
      running: current.phase === 'running',
      pid: child.pid
    }, { serviceConfig });

    child.stdout?.on('data', (data) => {
      logger.broadcast(data.toString(), 'service', serviceId);
    });

    child.stderr?.on('data', (data) => {
      logger.broadcast(data.toString(), 'service', serviceId);
    });

    child.on('close', (code, signal) => {
      logger.broadcast(`
${serviceConfig.name} 进程退出，代码: ${code ?? 'null'}${signal ? `，信号: ${signal}` : ''}`, 'service');
      this._clearPid(serviceId, child.pid);
      this._clearHealthMonitor(serviceId);

      const currentStatus = this._getCurrentServiceStatus(serviceId, serviceConfig);
      if (currentStatus.phase === 'restarting') {
        this._setServiceStatus(serviceId, {
          phase: 'restarting',
          running: false,
          pid: null
        }, { serviceConfig });
        return;
      }

      if (currentStatus.phase === 'stopping') {
        this._setServiceStatus(serviceId, {
          phase: 'stopped',
          running: false,
          pid: null,
          error: null
        }, { serviceConfig });
        return;
      }

      this._setServiceStatus(serviceId, {
        phase: 'failed',
        running: false,
        pid: null,
        error: code === 0 && !signal ? null : `${serviceConfig.name} 进程异常退出`
      }, { serviceConfig });
    });

    child.on('error', (err) => {
      logger.broadcast(`
${serviceConfig.name} 进程错误: ${err.message}`, 'service');
      this._clearPid(serviceId, child.pid);
      this._clearHealthMonitor(serviceId);
      this._setServiceStatus(serviceId, {
        phase: 'failed',
        running: false,
        pid: null,
        error: err.message
      }, { serviceConfig });
    });
  }

  _broadcastServiceStatus(status) {
    try {
      const websocketService = require('./websocketService');
      websocketService.broadcastServiceStatus?.(status);
    } catch (error) {
      // ignore websocket availability issues
    }
  }

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

    // 先找到所有子进程
    const childPids = await this._findChildPids(pid);

    if (process.platform === 'win32') {
      await this._execFileSafe('taskkill', ['/PID', String(pid), '/T', '/F']);
      return;
    }

    // macOS/Linux: 先终止子进程，再终止父进程
    // 注意：不使用 -pid（进程组），避免误杀其他服务
    for (const childPid of childPids) {
      killOne(childPid, 'SIGTERM');
    }
    killOne(pid, 'SIGTERM');

    const deadline = Date.now() + 5000;
    while (this._isProcessRunning(pid) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // 强制终止
    if (this._isProcessRunning(pid)) {
      for (const childPid of childPids) {
        if (this._isProcessRunning(childPid)) {
          killOne(childPid, 'SIGKILL');
        }
      }
      killOne(pid, 'SIGKILL');
    }
  }

  /**
   * 查找指定进程的所有子进程
   */
  async _findChildPids(parentPid) {
    try {
      // macOS: 使用 pgrep -P 查找子进程
      const stdout = await this._execFileSafe('pgrep', ['-P', String(parentPid)]);
      return stdout
        .split(/\s+/)
        .map((value) => parseInt(value, 10))
        .filter((pid) => !Number.isNaN(pid));
    } catch (error) {
      return [];
    }
  }

  _registerBuildProcess(buildId, child, description) {
    buildProcesses.set(buildId, { pid: child.pid, child, description });
  }

  _clearBuildProcess(buildId, child = null) {
    const current = buildProcesses.get(buildId);
    if (!current) return;
    if (child && current.child !== child) return;

    buildProcesses.delete(buildId);
  }

  _throwIfCancelled(buildId) {
    if (buildProgressService.isBuildCancelled(buildId)) {
      const error = new Error('构建已取消');
      error.code = 'BUILD_CANCELLED';
      throw error;
    }
  }

  _resolveMavenCommand() {
    const wrapperName = process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw';
    const wrapperPath = path.join(this.projectRoot, wrapperName);

    if (fs.existsSync(wrapperPath)) {
      return wrapperPath;
    }

    return process.platform === 'win32' ? 'mvn.cmd' : 'mvn';
  }

  async start(serviceId, serviceConfig, options = {}) {
    const status = await this.getStatus(serviceId);
    if (status.running || this._isTransitionalPhase(status.phase)) {
      return { pid: status.pid, alreadyRunning: true, phase: status.phase };
    }

    this._clearHealthMonitor(serviceId);
    this._setServiceStatus(serviceId, {
      phase: options.phase || 'starting',
      running: false,
      pid: null,
      error: null
    }, { serviceConfig });

    const mavenCommand = this._resolveMavenCommand();
    logger.broadcast(`
========== 启动 ${serviceConfig.name} ==========`, 'service', serviceId);
    logger.broadcast(`执行命令: ${mavenCommand} -f ${serviceConfig.pom} spring-boot:run`, 'service', serviceId);

    // 确保日志目录存在（使用控制面板项目自己的 logs 目录）
    const logDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // 设置 JVM 崩溃日志路径，统一输出到控制面板项目的 logs/ 目录
    const errorFilePath = path.join(logDir, `hs_err_pid%p_${serviceId}.log`);
    const jvmOpts = `-XX:ErrorFile=${errorFilePath}`;

    // 使用 JAVA_TOOL_OPTIONS 环境变量确保 JVM 参数生效
    const child = spawn(mavenCommand, ['-f', serviceConfig.pom, 'spring-boot:run'], {
      cwd: this.projectRoot,
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        JAVA_TOOL_OPTIONS: `${process.env.JAVA_TOOL_OPTIONS || ''} ${jvmOpts}`.trim()
      }
    });

    this._attachServiceProcess(serviceId, serviceConfig, child);

    if (options.monitorHealth !== false) {
      this._monitorServiceHealth(serviceId, serviceConfig, {
        phase: 'checking_health',
        initialDelay: options.initialHealthDelay ?? 1500
      });
    }

    return { pid: child.pid, phase: options.phase || 'starting' };
  }

  async stop(serviceId, serviceConfig, options = {}) {
    this._clearHealthMonitor(serviceId);
    this._setServiceStatus(serviceId, {
      phase: options.phase || 'stopping',
      running: false,
      error: null
    }, { serviceConfig });

    const pidCandidates = new Set();
    const trackedPid = this._getPid(serviceId);
    if (trackedPid) {
      pidCandidates.add(trackedPid);
    }

    for (const pid of await this._findPidsByPom(serviceConfig.pom)) {
      pidCandidates.add(pid);
    }

    for (const pid of await this._findPidsByPort(serviceConfig.port)) {
      pidCandidates.add(pid);
    }

    if (pidCandidates.size === 0) {
      this._clearPid(serviceId);
      this._setServiceStatus(serviceId, {
        phase: options.finalPhase || 'stopped',
        running: false,
        pid: null
      }, { serviceConfig });
      return { success: false, error: '服务未运行或停止失败' };
    }

    for (const pid of pidCandidates) {
      await this._terminateProcess(pid);
    }

    this._clearPid(serviceId);
    logger.broadcast(`${serviceConfig.name} 已停止`, 'service', serviceId);
    this._setServiceStatus(serviceId, {
      phase: options.finalPhase || 'stopped',
      running: false,
      pid: null,
      error: null
    }, { serviceConfig });
    return { success: true, method: 'pid', phase: options.finalPhase || 'stopped' };
  }

  async restart(serviceId, serviceConfig, delay = 2000) {
    this._clearHealthMonitor(serviceId);
    this._setServiceStatus(serviceId, {
      phase: 'restarting',
      running: false,
      error: null
    }, { serviceConfig });

    await this.stop(serviceId, serviceConfig, { phase: 'restarting', finalPhase: 'restarting' });
    await new Promise((resolve) => setTimeout(resolve, delay));

    const result = await this.start(serviceId, serviceConfig, { phase: 'restarting' });
    return { ...result, restarted: true, phase: 'restarting' };
  }

  async getAllStatus() {
    const entries = await Promise.all(
      Object.keys(config.services).map(async (serviceId) => {
        const status = await this.getStatus(serviceId);
        return [serviceId, status];
      })
    );

    return Object.fromEntries(entries);
  }

  async _resolveObservedServiceStatus(serviceId, serviceConfig, current, pid) {
    if (current.phase === 'stopping') {
      return this._setServiceStatus(serviceId, {
        running: false,
        pid,
        phase: 'stopping'
      }, { serviceConfig, broadcast: false });
    }

    const health = await healthChecker.check(serviceId);
    if (health.healthy) {
      return this._setServiceStatus(serviceId, {
        running: true,
        pid,
        phase: 'running',
        error: null
      }, { serviceConfig, broadcast: false });
    }

    if (current.phase === 'starting' || current.phase === 'checking_health' || current.phase === 'restarting') {
      return this._setServiceStatus(serviceId, {
        running: true,
        pid,
        phase: 'failed',
        error: health.error || '健康检查未通过'
      }, { serviceConfig, broadcast: false });
    }

    if (current.phase === 'failed') {
      return this._setServiceStatus(serviceId, {
        running: true,
        pid,
        phase: 'failed',
        error: current.error || health.error || '健康检查未通过'
      }, { serviceConfig, broadcast: false });
    }

    return this._setServiceStatus(serviceId, {
      running: true,
      pid,
      phase: 'failed',
      error: health.error || '健康检查未通过'
    }, { serviceConfig, broadcast: false });
  }

  async getStatus(serviceId) {
    const serviceConfig = config.services[serviceId];
    const current = this._getCurrentServiceStatus(serviceId, serviceConfig);
    const trackedPid = this._getPid(serviceId);

    if (trackedPid && this._isProcessRunning(trackedPid)) {
      // 若进程存在但状态是过渡状态，自动恢复健康检查流程
      if (this._isTransitionalPhase(current.phase)) {
        // 检查是否已经在健康检查监控中
        if (!this.serviceHealthMonitors.has(serviceId)) {
          logger.broadcast(`[${serviceConfig.name}] 检测到进程运行中但状态为 ${current.phase}，自动恢复健康检查`, 'service', serviceId);
          // 自动恢复健康检查流程
          this._monitorServiceHealth(serviceId, serviceConfig, {
            phase: 'checking_health',
            initialDelay: 500
          });
        }
        // 返回当前过渡状态（已更新为 checking_health），不直接判定为失败
        return this._getCurrentServiceStatus(serviceId, serviceConfig);
      }
      return this._resolveObservedServiceStatus(serviceId, serviceConfig, current, trackedPid);
    }

    const pidsByPom = await this._findPidsByPom(serviceConfig.pom);
    const pid = pidsByPom[0] || (await this._findPidsByPort(serviceConfig.port))[0] || null;
    if (pid) {
      this._savePid(serviceId, pid);
      serviceProcesses.set(serviceId, {
        pid,
        pom: serviceConfig.pom,
        port: serviceConfig.port,
        child: null
      });

      // 同样处理外部发现的进程
      if (this._isTransitionalPhase(current.phase)) {
        if (!this.serviceHealthMonitors.has(serviceId)) {
          logger.broadcast(`[${serviceConfig.name}] 检测到外部进程运行中但状态为 ${current.phase}，自动恢复健康检查`, 'service');
          this._monitorServiceHealth(serviceId, serviceConfig, {
            phase: 'checking_health',
            initialDelay: 500
          });
        }
        return this._getCurrentServiceStatus(serviceId, serviceConfig);
      }

      return this._resolveObservedServiceStatus(serviceId, serviceConfig, current, pid);
    }

    this._clearPid(serviceId);

    if (current.phase === 'failed') {
      return this._setServiceStatus(serviceId, {
        running: false,
        pid: null,
        phase: 'failed'
      }, { serviceConfig, broadcast: false });
    }

    return this._setServiceStatus(serviceId, {
      running: false,
      pid: null,
      phase: 'stopped',
      error: current.phase === 'stopping' ? null : current.error
    }, { serviceConfig, broadcast: false });
  }

  async _rollbackStartedServices(startedServices) {
    const rollbackResults = [];

    for (const item of [...startedServices].reverse()) {
      logger.broadcast(`回滚服务启动: ${item.name}`, 'service', item.id);
      const result = await this.stop(item.id, config.services[item.id]);
      rollbackResults.push({ serviceId: item.id, ...result, rollback: true });
    }

    return rollbackResults;
  }

  async _startServicesBatch(services, options = {}) {
    const results = [];
    const startedServices = [];
    const rollbackOnFailure = options.rollbackOnFailure !== false;

    for (let index = 0; index < services.length; index += 1) {
      const item = services[index];
      const status = await this.getStatus(item.id);
      let startResult;

      if (status.running) {
        logger.broadcast(`${item.name} 已在运行，等待健康检查通过...`, 'service', item.id);
        startResult = { pid: status.pid, alreadyRunning: true };
      } else {
        startResult = await this.start(item.id, config.services[item.id], { monitorHealth: false, phase: 'starting' });
        startedServices.push(item);
      }

      this._setServiceStatus(item.id, {
        phase: 'checking_health',
        running: startResult.alreadyRunning,
        pid: startResult.pid || status.pid || null
      }, { serviceConfig: config.services[item.id] });

      const healthResult = await healthChecker.waitForHealthy(item.id, {
        timeout: BATCH_START_HEALTH_TIMEOUT,
        interval: BATCH_START_HEALTH_INTERVAL,
        initialDelay: startResult.alreadyRunning ? 0 : 2000
      });

      if (healthResult.healthy) {
        logger.broadcast(`${item.name} 健康检查通过，继续启动下一个服务`, 'service', item.id);
        this._setServiceStatus(item.id, {
          phase: 'running',
          running: true,
          pid: startResult.pid || status.pid || this._getPid(item.id) || null,
          error: null
        }, { serviceConfig: config.services[item.id] });
        results.push({ serviceId: item.id, ...startResult, health: healthResult, healthy: true });
        continue;
      }

      const failureMessage = healthResult.error || '健康检查未通过';
      logger.broadcast(`${item.name} 启动后未在预期时间内通过健康检查：${failureMessage}`, 'service');
      this._setServiceStatus(item.id, {
        phase: 'failed',
        running: Boolean(this._getPid(item.id)),
        pid: this._getPid(item.id) || null,
        error: failureMessage
      }, { serviceConfig: config.services[item.id] });
      results.push({
        serviceId: item.id,
        ...startResult,
        health: healthResult,
        healthy: false,
        error: failureMessage
      });

      if (rollbackOnFailure && startedServices.length > 0) {
        const rollbackResults = await this._rollbackStartedServices(startedServices);
        results.push(...rollbackResults);
      }

      for (const skipped of services.slice(index + 1)) {
        results.push({
          serviceId: skipped.id,
          skipped: true,
          reason: `${item.name} 健康检查未通过，已停止后续批量启动`
        });
      }

      break;
    }

    return results;
  }

  async _stopServicesBatch(services, options = {}) {
    const results = [];
    const ignoreNotRunning = options.ignoreNotRunning !== false;

    for (const item of services) {
      const result = await this.stop(item.id, config.services[item.id]);
      if (ignoreNotRunning || result.success) {
        results.push({ serviceId: item.id, ...result });
      } else {
        results.push({ serviceId: item.id, ...result, failed: true });
      }
    }

    return results;
  }

  async stopAll(options = {}) {
    const services = [...config.serviceCatalog].sort((a, b) => b.startOrder - a.startOrder);
    return this._stopServicesBatch(services, options);
  }

  async startAll(options = {}) {
    const services = [...config.serviceCatalog];
    return this._startServicesBatch(services, options);
  }

  async restartAll() {
    const stopResults = await this.stopAll({ ignoreNotRunning: true });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const startResults = await this.startAll({ rollbackOnFailure: true });

    return {
      stopResults,
      startResults
    };
  }

  async initBuild(moduleConfig) {
    return buildProgressService.startBuild(moduleConfig);
  }

  _getDependencyStateFile(frontendDir) {
    return path.join(frontendDir, 'node_modules', '.metersphere-control-panel-deps.json');
  }

  _getDependencyLockfile(frontendDir) {
    const candidates = ['package-lock.json', 'npm-shrinkwrap.json', 'package.json'];
    return candidates
      .map((file) => path.join(frontendDir, file))
      .find((file) => fs.existsSync(file)) || null;
  }

  _computeDependencyFingerprint(frontendDir) {
    const fingerprintSource = this._getDependencyLockfile(frontendDir);
    if (!fingerprintSource) {
      return null;
    }

    const content = fs.readFileSync(fingerprintSource);
    return {
      source: path.basename(fingerprintSource),
      hash: crypto.createHash('sha256').update(content).digest('hex')
    };
  }

  _readDependencyState(frontendDir) {
    const stateFile = this._getDependencyStateFile(frontendDir);
    if (!fs.existsSync(stateFile)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch (error) {
      return null;
    }
  }

  _writeDependencyState(frontendDir, fingerprint) {
    if (!fingerprint) {
      return;
    }

    const stateFile = this._getDependencyStateFile(frontendDir);
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({
      ...fingerprint,
      updatedAt: new Date().toISOString()
    }, null, 2));
  }

  _getDependencyInstallDecision(frontendDir, forceInstall = false) {
    if (forceInstall) {
      return { shouldInstall: true, reason: '用户手动启用了强制安装依赖' };
    }

    if (!fs.existsSync(path.join(frontendDir, 'node_modules'))) {
      return { shouldInstall: true, reason: '未检测到 node_modules，需要先安装依赖' };
    }

    const fingerprint = this._computeDependencyFingerprint(frontendDir);
    if (!fingerprint) {
      return { shouldInstall: false, reason: '未检测到 lockfile，沿用现有 node_modules' };
    }

    const previousState = this._readDependencyState(frontendDir);
    if (!previousState) {
      this._writeDependencyState(frontendDir, fingerprint);
      return { shouldInstall: false, reason: `已记录当前 ${fingerprint.source} 指纹，沿用现有 node_modules`, fingerprint };
    }

    if (previousState.hash !== fingerprint.hash || previousState.source !== fingerprint.source) {
      return { shouldInstall: true, reason: `${fingerprint.source} 已变更，需要重新安装依赖`, fingerprint };
    }

    return { shouldInstall: false, reason: `${fingerprint.source} 未变化，跳过依赖安装`, fingerprint };
  }

  async executeBuild(moduleConfig, buildId, options = {}) {
    const frontendDir = path.join(this.projectRoot, moduleConfig.frontendPath);
    const targetDir = path.join(this.projectRoot, moduleConfig.targetPath);

    logger.broadcast(`\n========== 构建 ${moduleConfig.name} 前端 ==========`, 'build');
    logger.broadcast(`构建ID: ${buildId}`, 'build');

    try {
      await buildProgressService.updateStep(buildId, 0, 'running', 50, '准备构建环境...');
      await new Promise((resolve) => setTimeout(resolve, 300));
      this._throwIfCancelled(buildId);
      await buildProgressService.updateStep(buildId, 0, 'completed', 100, '环境准备完成');

      await buildProgressService.updateStep(buildId, 1, 'running', 0, '检查依赖...');
      const dependencyDecision = this._getDependencyInstallDecision(frontendDir, options.forceInstall);
      if (dependencyDecision.shouldInstall) {
        const installCommand = fs.existsSync(path.join(frontendDir, 'package-lock.json')) ? 'ci' : 'install';
        logger.broadcast(`依赖安装原因: ${dependencyDecision.reason}`, 'build');
        await this._runCommandWithProgress({
          command: 'npm',
          args: [installCommand],
          cwd: frontendDir,
          buildId,
          stepIndex: 1,
          stepName: '安装依赖',
          logType: 'build'
        });
        this._writeDependencyState(frontendDir, dependencyDecision.fingerprint || this._computeDependencyFingerprint(frontendDir));
      } else {
        await buildProgressService.updateStep(buildId, 1, 'completed', 100, dependencyDecision.reason);
      }

      this._throwIfCancelled(buildId);
      await buildProgressService.updateStep(buildId, 2, 'running', 0, '开始编译...');
      logger.broadcast(`cd ${moduleConfig.frontendPath}`, 'build');
      logger.broadcast('npm run build', 'build');

      await this._runCommandWithProgress({
        command: 'npm',
        args: ['run', 'build'],
        cwd: frontendDir,
        buildId,
        stepIndex: 2,
        stepName: '编译构建',
        logType: 'build',
        detectMilestones: true
      });

      this._throwIfCancelled(buildId);
      await buildProgressService.updateStep(buildId, 3, 'running', 50, '复制构建文件...');
      await this._copyBuildFiles(frontendDir, targetDir);
      await buildProgressService.updateStep(buildId, 3, 'completed', 100, '文件复制完成');

      this._throwIfCancelled(buildId);
      await buildProgressService.updateStep(buildId, 4, 'completed', 100, '构建流程完成');
      await buildProgressService.completeBuild(buildId, true);

      return { success: true, buildId };
    } catch (error) {
      if (error.code === 'BUILD_CANCELLED' || buildProgressService.isBuildCancelled(buildId)) {
        logger.broadcast(`\n⚪ 构建已取消: ${moduleConfig.name}`, 'build');
        return { success: false, cancelled: true, error: '构建已取消', buildId };
      }

      await buildProgressService.completeBuild(buildId, false, error.message);
      logger.broadcast(`\n✗ 构建失败: ${error.message}`, 'build');
      return { success: false, error: error.message, buildId };
    }
  }

  async buildFrontend(moduleConfig, options = {}) {
    const buildId = await this.initBuild(moduleConfig);
    return this.executeBuild(moduleConfig, buildId, options);
  }

  _runCommandWithProgress({ command, args, cwd, buildId, stepIndex, stepName, logType, detectMilestones = false }) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        detached: process.platform !== 'win32',
        env: process.env
      });

      this._registerBuildProcess(buildId, child, `${command} ${args.join(' ')}`);

      let stderrOutput = '';
      let progress = 0;
      const progressInterval = setInterval(() => {
        if (buildProgressService.isBuildCancelled(buildId)) {
          return;
        }

        progress = Math.min(progress + 10, 90);
        buildProgressService.updateStep(buildId, stepIndex, 'running', progress, `${stepName}进行中...`);
      }, 2000);

      const cleanup = () => {
        clearInterval(progressInterval);
        this._clearBuildProcess(buildId, child);
      };

      const handleOutput = (raw) => {
        const message = raw.toString();
        logger.broadcast(message, logType);

        if (!detectMilestones) {
          return;
        }

        const normalized = message.toLowerCase();
        if (normalized.includes('building')) {
          buildProgressService.updateStep(buildId, stepIndex, 'running', 30, '正在编译...');
        } else if (normalized.includes('optimizing')) {
          buildProgressService.updateStep(buildId, stepIndex, 'running', 70, '优化中...');
        }
      };

      child.stdout?.on('data', handleOutput);
      child.stderr?.on('data', (raw) => {
        stderrOutput += raw.toString();
        handleOutput(raw);
      });

      child.on('error', (error) => {
        cleanup();
        reject(error);
      });

      child.on('close', async (code) => {
        cleanup();

        if (buildProgressService.isBuildCancelled(buildId)) {
          resolve({ success: false, cancelled: true });
          return;
        }

        if (code === 0) {
          await buildProgressService.updateStep(buildId, stepIndex, 'completed', 100, `${stepName}完成`);
          resolve({ success: true });
          return;
        }

        await buildProgressService.updateStep(buildId, stepIndex, 'failed', progress, `${stepName}失败`);
        reject(new Error(stderrOutput || `${stepName}失败`));
      });
    });
  }

  async cancelBuild(buildId) {
    const current = buildProcesses.get(buildId);
    if (!current && !buildProgressService.isBuildCancelled(buildId)) {
      return buildProgressService.cancelBuild(buildId);
    }

    if (current?.pid) {
      await this._terminateProcess(current.pid);
      this._clearBuildProcess(buildId);
    }

    const cancelled = await buildProgressService.cancelBuild(buildId);
    if (cancelled) {
      logger.broadcast(`取消构建任务: ${buildId}`, 'build');
    }

    return cancelled;
  }

  async _copyBuildFiles(frontendDir, targetDir) {
    await fsp.rm(targetDir, { recursive: true, force: true });
    await fsp.mkdir(targetDir, { recursive: true });
    await fsp.cp(path.join(frontendDir, 'dist'), targetDir, { recursive: true });
  }
}

module.exports = new ProcessManager();
