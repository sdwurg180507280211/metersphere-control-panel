/**
 * 前端构建进程管理 mixin
 * 包含构建、依赖安装、文件复制等
 */
const { spawn } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const logger = require('../../utils/logger');
const buildProgressService = require('../buildProgressService');
const { buildProcesses } = require('./shared');

module.exports = function applyBuildProcess(proto) {

  proto._registerBuildProcess = function(buildId, child, description) {
    buildProcesses.set(buildId, { pid: child.pid, child, description });
  };

  proto._clearBuildProcess = function(buildId, child = null) {
    const current = buildProcesses.get(buildId);
    if (!current) return;
    if (child && current.child !== child) return;
    buildProcesses.delete(buildId);
  };

  proto._throwIfCancelled = function(buildId) {
    if (buildProgressService.isBuildCancelled(buildId)) {
      const error = new Error('构建已取消');
      error.code = 'BUILD_CANCELLED';
      throw error;
    }
  };

  proto._getDependencyStateFile = function(frontendDir) {
    return path.join(frontendDir, 'node_modules', '.metersphere-control-panel-deps.json');
  };

  proto._getDependencyLockfile = function(frontendDir) {
    const candidates = ['package-lock.json', 'npm-shrinkwrap.json', 'package.json'];
    return candidates
      .map((file) => path.join(frontendDir, file))
      .find((file) => fs.existsSync(file)) || null;
  };

  proto._computeDependencyFingerprint = function(frontendDir) {
    const fingerprintSource = this._getDependencyLockfile(frontendDir);
    if (!fingerprintSource) {
      return null;
    }

    const content = fs.readFileSync(fingerprintSource);
    return {
      source: path.basename(fingerprintSource),
      hash: crypto.createHash('sha256').update(content).digest('hex')
    };
  };

  proto._readDependencyState = function(frontendDir) {
    const stateFile = this._getDependencyStateFile(frontendDir);
    if (!fs.existsSync(stateFile)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch (error) {
      return null;
    }
  };

  proto._writeDependencyState = function(frontendDir, fingerprint) {
    if (!fingerprint) {
      return;
    }

    const stateFile = this._getDependencyStateFile(frontendDir);
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({
      ...fingerprint,
      updatedAt: new Date().toISOString()
    }, null, 2));
  };

  proto._getDependencyInstallDecision = function(frontendDir, forceInstall = false) {
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
  };

  proto._runCommandWithProgress = function({ command, args, cwd, buildId, stepIndex, stepName, logType, detectMilestones = false }) {
    const extendedEnv = this._getExtendedEnv(process.env, command);

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        shell: true,
        detached: process.platform !== 'win32',
        env: extendedEnv
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

        if (detectMilestones) {
          if (message.includes('vite') && message.includes('building')) {
            buildProgressService.updateStep(buildId, stepIndex, 'running', 30, 'Vite 编译中...');
          } else if (message.includes('rendering chunks') || message.includes('computing gzip')) {
            buildProgressService.updateStep(buildId, stepIndex, 'running', 70, '生成产物...');
          } else if (message.includes('Build at:') || message.includes('✓ built in')) {
            buildProgressService.updateStep(buildId, stepIndex, 'running', 95, '即将完成...');
          }
        }
      };

      child.stdout?.on('data', handleOutput);
      child.stderr?.on('data', (raw) => {
        stderrOutput += raw.toString();
        handleOutput(raw);
      });

      child.on('error', (err) => {
        cleanup();
        reject(err);
      });

      child.on('close', (code) => {
        cleanup();

        if (buildProgressService.isBuildCancelled(buildId)) {
          reject(Object.assign(new Error('构建已取消'), { code: 'BUILD_CANCELLED' }));
          return;
        }

        if (code === 0) {
          buildProgressService.updateStep(buildId, stepIndex, 'completed', 100, `${stepName}完成`);
          resolve({ success: true });
        } else {
          reject(new Error(stderrOutput || `${stepName}失败 (退出码: ${code})`));
        }
      });
    });
  };

  proto.initBuild = async function(moduleConfig, options = {}) {
    return buildProgressService.startBuild(moduleConfig, options);
  };

  proto.executeBuild = async function(moduleConfig, buildId, options = {}) {
    const frontendDir = path.join(this._getProjectRoot(), moduleConfig.frontendPath);
    const targetDir = path.join(this._getProjectRoot(), moduleConfig.targetPath);
    const { command: npmCommand, argsPrefix: npmArgsPrefix } = this._resolveNpmCommand();

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

        const fullArgs = [...npmArgsPrefix, installCommand];
        logger.broadcastCommand(`cd ${moduleConfig.frontendPath} && ${npmCommand} ${fullArgs.join(' ')}`, 'build');

        await this._runCommandWithProgress({
          command: npmCommand,
          args: fullArgs,
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

      const buildArgs = [...npmArgsPrefix, 'run', 'build'];
      logger.broadcastCommand(`cd ${moduleConfig.frontendPath} && ${npmCommand} ${buildArgs.join(' ')}`, 'build');

      await this._runCommandWithProgress({
        command: npmCommand,
        args: buildArgs,
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
  };

  proto.buildFrontend = async function(moduleConfig, options = {}) {
    const buildId = await this.initBuild(moduleConfig, { jobId: options.jobId });
    return this.executeBuild(moduleConfig, buildId, options);
  };

  proto.cancelBuild = async function(buildId) {
    const build = buildProcesses.get(buildId);
    buildProgressService.cancelBuild(buildId);

    if (!build) {
      return { success: true, message: '构建标记已设置' };
    }

    const { child } = build;
    if (child?.pid) {
      await this._terminateProcess(child.pid);
    }

    this._clearBuildProcess(buildId);
    return { success: true, message: '构建进程已终止' };
  };

  proto._copyBuildFiles = async function(frontendDir, targetDir) {
    await fsp.rm(targetDir, { recursive: true, force: true });
    await fsp.mkdir(targetDir, { recursive: true });
    await fsp.cp(path.join(frontendDir, 'dist'), targetDir, { recursive: true });
  };
};
