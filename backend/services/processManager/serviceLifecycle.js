/**
 * 服务生命周期管理 mixin
 * 包含服务启动、停止、重启、状态查询、批量操作
 */
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../../utils/logger');
const healthChecker = require('../healthChecker');
const { LOG_DIR, serviceProcesses, serviceStatuses, BATCH_START_HEALTH_TIMEOUT, BATCH_START_HEALTH_INTERVAL } = require('./shared');

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

module.exports = function applyServiceLifecycle(proto) {

  proto._spawnDetachedService = function(mavenCommand, serviceConfig, javaToolOptions, serviceLogFile) {
    return new Promise((resolve, reject) => {
      const logRedirect = `>> ${shellQuote(serviceLogFile)} 2>&1`;
      const command = [
        javaToolOptions ? `JAVA_TOOL_OPTIONS=${shellQuote(javaToolOptions)}` : '',
        'nohup',
        shellQuote(mavenCommand),
        '-f',
        shellQuote(serviceConfig.pom),
        'clean',
        'spring-boot:run',
        `${logRedirect} & echo $!`
      ].filter(Boolean).join(' ');

      const launcher = spawn('sh', ['-c', command], {
        cwd: this._getProjectRoot(),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env
      });

      let stdout = '';
      let stderr = '';
      launcher.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      launcher.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      launcher.on('error', reject);
      launcher.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr.trim() || `服务启动命令失败，退出码: ${code}`));
          return;
        }

        const pid = parseInt(stdout.trim(), 10);
        if (!pid || Number.isNaN(pid)) {
          reject(new Error(stderr.trim() || '服务启动成功但未获取到 PID'));
          return;
        }

        resolve({ pid });
      });
    });
  };

  proto._attachServiceProcess = function(serviceId, serviceConfig, child) {
    const tailProcess = this._attachServiceLogTail(serviceId);

    serviceProcesses.set(serviceId, {
      pid: child.pid,
      pom: serviceConfig.pom,
      port: serviceConfig.port,
      child,
      tailProcess
    });
    this._savePid(serviceId, child.pid);
    const current = this._getCurrentServiceStatus(serviceId, serviceConfig);
    this._setServiceStatus(serviceId, {
      phase: current.phase,
      running: current.phase === 'running',
      pid: child.pid
    }, { serviceConfig });

    if (typeof child.on === 'function') {
      child.on('close', (code, signal) => {
        if (this.isControlPanelShuttingDown()) {
          return;
        }

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
  };

  proto.compileService = async function(serviceId, serviceConfig, options = {}) {
    const mavenCommand = this._resolveMavenCommand();
    const compileArgs = ['-f', serviceConfig.pom, '-DskipTests', 'compile'];
    logger.broadcast(`
========== 编译 ${serviceConfig.name} ==========`, 'service', serviceId);
    logger.broadcastCommand(`cd ${this._getProjectRoot()} && ${mavenCommand} ${compileArgs.join(' ')}`, 'service', serviceId);

    await this._runCommand({
      command: mavenCommand,
      args: compileArgs,
      cwd: this._getProjectRoot(),
      logType: 'service',
      serviceId,
      env: process.env,
      timeoutMs: options.timeoutMs || 0
    });

    return {
      success: true,
      command: mavenCommand,
      args: compileArgs,
      cwd: this._getProjectRoot()
    };
  };

  proto.start = async function(serviceId, serviceConfig, options = {}) {
    const status = await this.getStatus(serviceId);

    if (status.running || this._isTransitionalPhase(status.phase)) {
      return { pid: status.pid, alreadyRunning: true, phase: status.phase };
    }

    if (serviceConfig.dependencies?.length > 0) {
      const allowedPhases = ['running', 'checking_health'];
      for (const depId of serviceConfig.dependencies) {
        const depStatus = await this.getStatus(depId);
        if (!allowedPhases.includes(depStatus.phase)) {
          const depConfig = this._getServiceConfig(depId);
          const error = `${serviceConfig.name} 依赖 ${depConfig?.name || depId} 服务，请先启动 ${depConfig?.name || depId}`;
          logger.broadcast(`⚠️  ${error}`, 'service', serviceId);
          throw new Error(error);
        }
      }
    }

    this._clearHealthMonitor(serviceId);
    this._setServiceStatus(serviceId, {
      phase: options.phase || 'starting',
      running: false,
      pid: null,
      error: null
    }, { serviceConfig });

    const mavenCommand = this._resolveMavenCommand();
    const startCmd = `cd ${this._getProjectRoot()} && ${mavenCommand} -f ${serviceConfig.pom} clean spring-boot:run`;
    logger.broadcast(`
========== 启动 ${serviceConfig.name} ==========`, 'service', serviceId);

    const errorFilePath = path.join(LOG_DIR, `hs_err_pid%p_${serviceId}.log`);
    // JAVA_TOOL_OPTIONS is parsed by the JVM as whitespace-separated options.
    // Quote the ErrorFile value so paths containing spaces (e.g. the packaged
    // app path ".../Local Service Hub.app/...") are treated as a single value.
    const errorFileOpt = `-XX:ErrorFile=${shellQuote(errorFilePath)}`;
    const serviceLogFile = path.join(LOG_DIR, `${serviceId}.log`);

    // Build JAVA_TOOL_OPTIONS: env base + config jvmOptions + per-service override + error file
    const resolvedConfig = this._getRuntimeConfig();
    const globalJvmOptions = resolvedConfig.jvmOptions || '';
    const serviceJvmOverride = serviceConfig.jvmOptions || '';
    const effectiveJvmOptions = serviceJvmOverride || globalJvmOptions;

    const javaToolOptions = [
      process.env.JAVA_TOOL_OPTIONS || '',
      effectiveJvmOptions,
      errorFileOpt
    ].filter(Boolean).join(' ').trim();

    if (javaToolOptions) {
      logger.broadcastCommand(`JAVA_TOOL_OPTIONS="${javaToolOptions}" ${startCmd}`, 'service', serviceId);
    } else {
      logger.broadcastCommand(startCmd, 'service', serviceId);
    }

    const child = await this._spawnDetachedService(mavenCommand, serviceConfig, javaToolOptions, serviceLogFile);

    this._attachServiceProcess(serviceId, serviceConfig, child);

    if (options.monitorHealth !== false) {
      this._monitorServiceHealth(serviceId, serviceConfig, {
        phase: 'checking_health',
        initialDelay: options.initialHealthDelay ?? 1500
      });
    }

    return { pid: child.pid, phase: options.phase || 'starting' };
  };

  proto.stop = async function(serviceId, serviceConfig, options = {}) {
    this._clearHealthMonitor(serviceId);
    this._stopServiceLogTail(serviceId);

    this._setServiceStatus(serviceId, {
      phase: options.phase || 'stopping',
      running: false,
      error: null
    }, { serviceConfig });

    const pidCandidates = new Map();
    const skippedPids = [];
    const registerPid = (pid, source) => {
      if (!pid) {
        return;
      }

      const existing = pidCandidates.get(pid);
      if (existing) {
        existing.sources.add(source);
        return;
      }

      pidCandidates.set(pid, { pid, sources: new Set([source]) });
    };

    const trackedPid = this._getPid(serviceId);
    if (trackedPid) {
      registerPid(trackedPid, 'tracked');
    }

    for (const pid of await this._findPidsByPom(serviceConfig.pom)) {
      registerPid(pid, 'pom');
    }

    // 对 port 来源的 PID 做归属验证，防止误杀其他服务
    const portPids = await this._findPidsByPort(serviceConfig.port);
    for (const pid of portPids) {
      // 跳过已注册的 PID（tracked/pom 来源已验证）
      if (pidCandidates.has(pid)) continue;

      // 检查是否属于其他已追踪服务
      const ownerServiceId = this._isTrackedByOtherService(pid, serviceId);
      if (ownerServiceId) {
        const ownerConfig = this._getServiceConfig(ownerServiceId);
        skippedPids.push({ pid, reason: `属于 ${ownerConfig?.name || ownerServiceId}` });
        continue;
      }

      // 验证命令行是否包含目标 pom，或是追踪进程的子进程
      const belongs = await this._isPidBelongsToService(pid, serviceConfig, trackedPid);
      if (belongs) {
        registerPid(pid, 'port');
      } else {
        // 最后检查是否属于其他已追踪服务的子进程
        const ownerByTree = await this._isOwnedByOtherService(pid, serviceId);
        if (ownerByTree) {
          const ownerConfig = this._getServiceConfig(ownerByTree);
          skippedPids.push({ pid, reason: `属于 ${ownerConfig?.name || ownerByTree} 子进程` });
        } else {
          // 无法确认归属，保守跳过并记录警告
          skippedPids.push({ pid, reason: '无法确认归属' });
        }
      }
    }

    if (skippedPids.length > 0) {
      const skipInfo = skippedPids.map(({ pid, reason }) => `PID ${pid}(${reason})`).join(', ');
      logger.broadcast(`跳过可能不属于本服务的进程: ${skipInfo}`, 'service', serviceId);
    }

    if (pidCandidates.size === 0) {
      this._clearPid(serviceId);
      this._setServiceStatus(serviceId, {
        phase: options.finalPhase || 'stopped',
        running: false,
        pid: null
      }, { serviceConfig });
      return { success: true, method: 'none', phase: options.finalPhase || 'stopped' };
    }

    const pids = [...pidCandidates.values()].map(({ pid, sources }) => `${pid}(${[...sources].join('/')})`).join(', ');
    logger.broadcastCommand(`kill ${serviceConfig.name} [${pids}]`, 'service', serviceId);

    for (const { pid } of pidCandidates.values()) {
      await this._terminateProcess(pid);
    }

    const mandatoryRemaining = [];
    for (const { pid, sources } of pidCandidates.values()) {
      if (!this._isProcessRunning(pid)) {
        continue;
      }

      if (sources.has('tracked') || sources.has('pom')) {
        mandatoryRemaining.push(pid);
      }
    }

    if (mandatoryRemaining.length > 0) {
      this._setServiceStatus(serviceId, {
        phase: 'failed',
        running: true,
        pid: mandatoryRemaining[0],
        error: `停止失败，仍有服务进程存活: ${mandatoryRemaining.join(', ')}`
      }, { serviceConfig });
      return { success: false, method: 'pid', phase: 'failed' };
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
  };

  proto.restart = async function(serviceId, serviceConfig, delay = 2000) {
    this._clearHealthMonitor(serviceId);
    this._setServiceStatus(serviceId, {
      phase: 'restarting',
      running: false,
      error: null
    }, { serviceConfig });

    const stopResult = await this.stop(serviceId, serviceConfig, { phase: 'restarting', finalPhase: 'restarting' });
    if (!stopResult.success) {
      return { ...stopResult, restarted: false, phase: 'failed' };
    }
    await new Promise((resolve) => setTimeout(resolve, delay));

    const result = await this.start(serviceId, serviceConfig, { phase: 'restarting' });
    return { ...result, restarted: true, phase: 'restarting' };
  };

  proto.getAllStatus = async function() {
    const entries = await Promise.all(
      Object.keys(this._getRuntimeConfig().services).map(async (serviceId) => {
        const status = await this.getStatus(serviceId);
        return [serviceId, status];
      })
    );

    return Object.fromEntries(entries);
  };

  proto._resolveObservedServiceStatus = async function(serviceId, serviceConfig, current, pid) {
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
        running: false,
        pid,
        phase: 'failed',
        error: health.error || '健康检查未通过'
      }, { serviceConfig, broadcast: false });
    }

    // 如果服务已经在 running 且进程还活着，即使健康检查暂时失败也不标记为 failed
    // 这避免了重启下游服务时导致上游 gateway 被误标记为失败
    if (current.phase === 'running' && pid && this._isProcessRunning(pid)) {
      logger.broadcast(`[${serviceConfig.name}] 健康检查暂时失败，但进程仍在运行，保持 running 状态: ${health.error}`, 'service', serviceId);
      return this._setServiceStatus(serviceId, {
        running: true,
        pid,
        phase: 'running',
        error: health.error // 仍然保存错误信息供显示
      }, { serviceConfig, broadcast: false });
    }

    if (current.phase === 'failed') {
      return this._setServiceStatus(serviceId, {
        running: false,
        pid,
        phase: 'failed',
        error: current.error || health.error || '健康检查未通过'
      }, { serviceConfig, broadcast: false });
    }

    return this._setServiceStatus(serviceId, {
      running: false,
      pid,
      phase: 'failed',
      error: health.error || '健康检查未通过'
    }, { serviceConfig, broadcast: false });
  };

  proto.getStatus = async function(serviceId) {
    const serviceConfig = this._getServiceConfig(serviceId);
    const current = this._getCurrentServiceStatus(serviceId, serviceConfig);
    const trackedPid = this._getPid(serviceId);

    if (trackedPid && this._isProcessRunning(trackedPid)) {
      if (this._isTransitionalPhase(current.phase)) {
        if (!this.serviceHealthMonitors.has(serviceId)) {
          logger.broadcast(`[${serviceConfig.name}] 检测到进程运行中但状态为 ${current.phase}，自动恢复健康检查`, 'service', serviceId);
          this._monitorServiceHealth(serviceId, serviceConfig, {
            phase: 'checking_health',
            initialDelay: 500
          });
        }
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
  };

  proto._rollbackStartedServices = async function(startedServices) {
    const rollbackResults = [];

    for (const item of [...startedServices].reverse()) {
      logger.broadcast(`回滚服务启动: ${item.name}`, 'service', item.id);
      const result = await this.stop(item.id, this._getServiceConfig(item.id));
      rollbackResults.push({ serviceId: item.id, ...result, rollback: true });
    }

    return rollbackResults;
  };

  proto._startServicesBatch = async function(services, options = {}) {
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
        startResult = await this.start(item.id, this._getServiceConfig(item.id), { monitorHealth: false, phase: 'starting' });
        startedServices.push(item);
      }

      this._setServiceStatus(item.id, {
        phase: 'checking_health',
        running: startResult.alreadyRunning,
        pid: startResult.pid || status.pid || null
      }, { serviceConfig: this._getServiceConfig(item.id) });

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
        }, { serviceConfig: this._getServiceConfig(item.id) });
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
      }, { serviceConfig: this._getServiceConfig(item.id) });
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
  };

  proto._stopServicesBatch = async function(services, options = {}) {
    const results = [];
    const ignoreNotRunning = options.ignoreNotRunning !== false;

    for (const item of services) {
      const result = await this.stop(item.id, this._getServiceConfig(item.id));
      if (ignoreNotRunning || result.success) {
        results.push({ serviceId: item.id, ...result });
      } else {
        results.push({ serviceId: item.id, ...result, failed: true });
      }
    }

    return results;
  };

  proto.stopAll = async function(options = {}) {
    const services = [...this._getServiceCatalog()].sort((a, b) => b.startOrder - a.startOrder);
    return this._stopServicesBatch(services, options);
  };

  proto.startAll = async function(options = {}) {
    const services = [...this._getServiceCatalog()];
    return this._startServicesBatch(services, options);
  };

  proto.restartAll = async function() {
    const stopResults = await this.stopAll({ ignoreNotRunning: true });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const startResults = await this.startAll({ rollbackOnFailure: true });
    return {
      stopResults,
      startResults
    };
  };
};
