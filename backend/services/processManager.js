/**
 * 进程管理服务
 * 统一管理服务的启动、停止和状态追踪
 */
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const buildProgressService = require('./buildProgressService');

const PID_DIR = path.join(__dirname, '../../.pids');

if (!fs.existsSync(PID_DIR)) {
  fs.mkdirSync(PID_DIR, { recursive: true });
}

const serviceProcesses = new Map();
const buildProcesses = new Map();

class ProcessManager {
  constructor() {
    this.pidDir = PID_DIR;
    this.projectRoot = config.projectRoot;
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

    child.stdout?.on('data', (data) => {
      logger.broadcast(data.toString(), 'service');
    });

    child.stderr?.on('data', (data) => {
      logger.broadcast(data.toString(), 'service');
    });

    child.on('close', (code, signal) => {
      logger.broadcast(`\n${serviceConfig.name} 进程退出，代码: ${code ?? 'null'}${signal ? `，信号: ${signal}` : ''}`, 'service');
      this._clearPid(serviceId, child.pid);
    });

    child.on('error', (err) => {
      logger.broadcast(`\n${serviceConfig.name} 进程错误: ${err.message}`, 'service');
      this._clearPid(serviceId, child.pid);
    });
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

    if (process.platform === 'win32') {
      await this._execFileSafe('taskkill', ['/PID', String(pid), '/T', '/F']);
      return;
    }

    killOne(-pid, 'SIGTERM') || killOne(pid, 'SIGTERM');

    const deadline = Date.now() + 5000;
    while (this._isProcessRunning(pid) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (this._isProcessRunning(pid)) {
      killOne(-pid, 'SIGKILL') || killOne(pid, 'SIGKILL');
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

  async start(serviceId, serviceConfig) {
    const status = await this.getStatus(serviceId);
    if (status.running) {
      return { pid: status.pid, alreadyRunning: true };
    }

    logger.broadcast(`\n========== 启动 ${serviceConfig.name} ==========`, 'service');
    logger.broadcast(`执行命令: ./mvnw -f ${serviceConfig.pom} spring-boot:run`, 'service');

    const child = spawn('./mvnw', ['-f', serviceConfig.pom, 'spring-boot:run'], {
      cwd: this.projectRoot,
      detached: process.platform !== 'win32',
      env: process.env
    });

    this._attachServiceProcess(serviceId, serviceConfig, child);
    return { pid: child.pid };
  }

  async stop(serviceId, serviceConfig) {
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
      return { success: false, error: '服务未运行或停止失败' };
    }

    for (const pid of pidCandidates) {
      await this._terminateProcess(pid);
    }

    this._clearPid(serviceId);
    logger.broadcast(`${serviceConfig.name} 已停止`, 'service');
    return { success: true, method: 'pid' };
  }

  async restart(serviceId, serviceConfig, delay = 2000) {
    await this.stop(serviceId, serviceConfig);
    await new Promise((resolve) => setTimeout(resolve, delay));

    const result = await this.start(serviceId, serviceConfig);
    return { ...result, restarted: true };
  }

  async getAllStatus() {
    const entries = await Promise.all(
      Object.keys(config.services).map(async (serviceId) => {
        const status = await this.getStatus(serviceId);
        return [serviceId, status.running];
      })
    );

    return Object.fromEntries(entries);
  }

  async getStatus(serviceId) {
    const serviceConfig = config.services[serviceId];
    const trackedPid = this._getPid(serviceId);
    if (trackedPid && this._isProcessRunning(trackedPid)) {
      return { running: true, pid: trackedPid };
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
    }

    return { running: Boolean(pid), pid };
  }

  async stopAll() {
    const results = [];
    const services = [...config.serviceCatalog].sort((a, b) => b.startOrder - a.startOrder);

    for (const item of services) {
      const result = await this.stop(item.id, config.services[item.id]);
      results.push({ serviceId: item.id, ...result });
    }

    return results;
  }

  async startAll() {
    const results = [];

    for (const item of config.serviceCatalog) {
      const status = await this.getStatus(item.id);
      if (status.running) {
        continue;
      }

      const result = await this.start(item.id, config.services[item.id]);
      results.push({ serviceId: item.id, ...result });
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    return results;
  }

  async initBuild(moduleConfig) {
    return buildProgressService.startBuild(moduleConfig);
  }

  _shouldInstallDependencies(frontendDir, forceInstall = false) {
    if (forceInstall) {
      return true;
    }

    return !fs.existsSync(path.join(frontendDir, 'node_modules'));
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
      if (this._shouldInstallDependencies(frontendDir, options.forceInstall)) {
        const installCommand = fs.existsSync(path.join(frontendDir, 'package-lock.json')) ? 'ci' : 'install';
        await this._runCommandWithProgress({
          command: 'npm',
          args: [installCommand],
          cwd: frontendDir,
          buildId,
          stepIndex: 1,
          stepName: '安装依赖',
          logType: 'build'
        });
      } else {
        await buildProgressService.updateStep(buildId, 1, 'completed', 100, '检测到 node_modules，跳过依赖安装');
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
