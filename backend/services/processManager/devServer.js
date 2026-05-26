/**
 * 开发服务器管理 mixin
 */
const { spawn } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const logger = require('../../utils/logger');
const configManager = require('../../services/configManager');
const { devServerProcesses } = require('./shared');

module.exports = function applyDevServer(proto) {
  proto._resolveDevServerPort = async function(moduleConfig) {
    if (moduleConfig.devPort) {
      return moduleConfig.devPort;
    }

    let devPort = 4200;

    try {
      const modulePath = path.join(this._getProjectRoot(), moduleConfig.frontendPath);
      const vueConfigPath = path.join(modulePath, 'vue.config.js');
      if (fs.existsSync(vueConfigPath)) {
        const vueConfigContent = await fsp.readFile(vueConfigPath, 'utf8');
        const portMatch = vueConfigContent.match(/port:\s*(\d+)/);
        if (portMatch) {
          return parseInt(portMatch[1]);
        }
      }

      const viteConfigPath = ['vite.config.ts', 'vite.config.js']
        .map((file) => path.join(modulePath, file))
        .find((file) => fs.existsSync(file));
      if (viteConfigPath) {
        const viteConfigContent = await fsp.readFile(viteConfigPath, 'utf8');
        const portMatch = viteConfigContent.match(/port:\s*(\d+)/);
        if (portMatch) {
          return parseInt(portMatch[1]);
        }
      }
    } catch (error) {
      logger.broadcast(`解析开发服务器端口失败: ${error.message}`, 'devserver');
    }

    return devPort;
  };

  proto._buildDevServerModuleInfo = async function(moduleConfig) {
    return {
      id: moduleConfig.id,
      name: moduleConfig.name,
      port: await this._resolveDevServerPort(moduleConfig)
    };
  };

  proto._findDevServerListenerPid = async function(moduleInfo, rootPid = null) {
    const portPids = await this._findPidsByPort(moduleInfo.port);
    if (portPids.length === 0) {
      return rootPid;
    }

    if (rootPid && portPids.includes(rootPid)) {
      return rootPid;
    }

    if (rootPid) {
      for (const pid of portPids) {
        if (await this._isProcessDescendantOf(rootPid, pid)) {
          return pid;
        }
      }
      return null;
    }

    return portPids[0];
  };

  proto._trackDevServer = async function(moduleId, moduleInfo, pid, child = null) {
    const listenerPid = await this._findDevServerListenerPid(moduleInfo, pid);
    const tracked = {
      pid,
      listenerPid,
      module: moduleInfo,
      child
    };
    devServerProcesses.set(moduleId, tracked);
    return tracked;
  };

  proto._clearDevServerTracking = function(moduleId, expectedPid = null) {
    const tracked = devServerProcesses.get(moduleId);
    if (expectedPid !== null) {
      const trackedPids = [tracked?.pid, tracked?.listenerPid].filter(Boolean);
      if (trackedPids.length > 0 && !trackedPids.includes(expectedPid)) {
        return;
      }
    }

    devServerProcesses.delete(moduleId);
    this._clearPidFile(`devserver-${moduleId}`, expectedPid);
  };

  proto._isTrackedDevServerRunning = function(devServer) {
    if (!devServer) {
      return false;
    }

    const runtimePid = devServer.listenerPid || devServer.pid;
    if (runtimePid && this._isProcessRunning(runtimePid)) {
      return true;
    }

    return Boolean(devServer.pid && this._isProcessRunning(devServer.pid));
  };

  proto._restoreDevServerByModule = async function(moduleConfig) {
    const moduleId = moduleConfig.id;
    const pidKey = `devserver-${moduleId}`;
    const pid = this._getPid(pidKey);

    if (!pid) {
      return null;
    }

    if (!this._isProcessRunning(pid)) {
      this._clearPidFile(pidKey, pid);
      return null;
    }

    const moduleInfo = await this._buildDevServerModuleInfo(moduleConfig);
    const tracked = await this._trackDevServer(moduleId, moduleInfo, pid, null);
    return {
      tracked,
      restored: !tracked.child
    };
  };

  /**
   * 恢复已存在的开发服务器进程（从 PID 文件恢复）
   * 应在后端启动时调用
   */
  proto.restoreDevServers = async function() {
    const modules = (configManager.getResolvedConfig().frontendModules || []);
    let restoredCount = 0;

    for (const module of modules) {
      const restored = await this._restoreDevServerByModule(module);
      if (restored?.tracked) {
        logger.broadcast(`恢复开发服务器: ${module.name} (PID: ${restored.tracked.pid})`, 'devserver');
        restoredCount++;
      }
    }

    if (restoredCount > 0) {
      logger.broadcast(`共恢复 ${restoredCount} 个开发服务器进程`, 'devserver');
    }
    return restoredCount;
  };

  proto.startDevServer = async function(moduleId) {
    // 先尝试恢复可能存在的进程
    if (devServerProcesses.has(moduleId)) {
      const existing = devServerProcesses.get(moduleId);
      if (this._isTrackedDevServerRunning(existing)) {
        return { success: false, error: '开发服务器已在运行中' };
      } else {
        // 进程已死，清理
        this._clearDevServerTracking(moduleId, existing.pid || existing.listenerPid || null);
      }
    }

    const validator = require('../../utils/validator');
    if (!validator.isValidModule(moduleId)) {
      return { success: false, error: '未知的模块' };
    }

    const moduleConfig = validator.getValidModule(moduleId);
    const restored = await this._restoreDevServerByModule(moduleConfig);
    if (restored?.tracked) {
      return { success: false, error: '开发服务器已在运行中' };
    }

    const modulePath = path.join(this._getProjectRoot(), moduleConfig.frontendPath);
    const { command: npmCommand, argsPrefix: npmArgsPrefix } = this._resolveNpmCommand();

    const pkgPath = path.join(modulePath, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      return { success: false, error: '模块缺少 package.json' };
    }

    let devScript = moduleConfig.devScript || null;
    let devPort = await this._resolveDevServerPort(moduleConfig);

    try {
      const pkg = JSON.parse(await fsp.readFile(pkgPath, 'utf8'));

      if (pkg.scripts) {
        const moduleName = pkg.name;
        if (!devScript && moduleName && pkg.scripts[moduleName]) {
          devScript = moduleName;
          logger.broadcast(`使用模块名称脚本: npm run ${moduleName}`, 'devserver');
        }

        if (!devScript) {
          devScript = Object.keys(pkg.scripts).find(key =>
            ['serve', 'dev', 'start'].includes(key) &&
            (pkg.scripts[key].includes('vue-cli-service') || pkg.scripts[key].includes('vite'))
          );
        }

        if (!devScript) {
          devScript = Object.keys(pkg.scripts).find(key =>
            pkg.scripts[key].includes('vue-cli-service serve') ||
            (pkg.scripts[key].includes('vite') && !pkg.scripts[key].includes('build'))
          );
        }

        if (devScript && !pkg.scripts[devScript]) {
          return { success: false, error: `模块缺少开发脚本: ${devScript}` };
        }

        devScript = devScript || 'serve';
      }

    } catch (e) {
      logger.broadcast(`解析模块配置失败: ${e.message}`, 'devserver');
    }

    const moduleInfo = { id: moduleConfig.id, name: moduleConfig.name, port: devPort };
    const fullCommand = `cd ${moduleConfig.frontendPath} && ${npmCommand} ${npmArgsPrefix.join(' ')} run ${devScript}`;
    logger.broadcastCommand(fullCommand, 'devserver', moduleId);

    return new Promise((resolve) => {
      const child = spawn(npmCommand, [...npmArgsPrefix, 'run', devScript], {
        cwd: modulePath,
        env: { ...process.env, PORT: devPort.toString() },
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let resolved = false;
      const timeout = setTimeout(async () => {
        if (!resolved) {
          resolved = true;
          // 让子进程脱离父进程，独立运行（但仍保留 child 引用用于日志）
          if (process.platform !== 'win32') {
            child.unref();
          }
          // 保存 child 引用，用于日志捕获
          await this._trackDevServer(moduleId, moduleInfo, child.pid, child);
          this._savePid(`devserver-${moduleId}`, child.pid);
          resolve({ success: true, module: moduleInfo });
        }
      }, 2000);

      child.on('error', (err) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          resolve({ success: false, error: `启动失败: ${err.message}` });
        }
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          resolve({ success: false, error: `进程立即退出 (代码: ${code})` });
        } else {
          logger.broadcast(`${moduleInfo.name} 开发服务器已停止 (退出码: ${code})`, 'devserver');
          this._clearDevServerTracking(moduleId, child.pid);
        }
      });

      child.stdout?.on('data', (data) => logger.broadcast(data.toString(), 'devserver'));
      child.stderr?.on('data', (data) => logger.broadcast(data.toString(), 'devserver'));
    });
  };

  proto.stopDevServer = async function(moduleId) {
    logger.broadcastCommand(`stop dev-server ${moduleId}`, 'devserver', moduleId);
    if (!moduleId && devServerProcesses.size > 0) {
      moduleId = devServerProcesses.keys().next().value;
    }

    let devServer = devServerProcesses.get(moduleId);
    let pid = devServer?.pid;
    const validator = require('../../utils/validator');

    // 如果内存中没有，尝试从 PID 文件获取
    if (!pid) {
      pid = this._getPid(`devserver-${moduleId}`);
      if (pid && validator.isValidModule(moduleId)) {
        const moduleConfig = validator.getValidModule(moduleId);
        const moduleInfo = await this._buildDevServerModuleInfo(moduleConfig);
        devServer = await this._trackDevServer(moduleId, moduleInfo, pid, null);
      }
    }

    if (!pid) {
      return { success: false, error: '开发服务器未运行' };
    }

    // 终止进程
    const listenerPid = devServer?.listenerPid;
    await this._terminateProcess(pid, { protectDevServers: false });
    if (listenerPid && listenerPid !== pid && this._isProcessRunning(listenerPid)) {
      await this._terminateProcess(listenerPid, { protectDevServers: false });
    }
    this._clearDevServerTracking(moduleId, pid);
    return { success: true };
  };

  proto.getDevServerStatus = async function(moduleId) {
    const devServer = devServerProcesses.get(moduleId);
    if (devServer) {
      // 检查进程是否还在运行
      if (!this._isTrackedDevServerRunning(devServer)) {
        // 进程已死，清理
        this._clearDevServerTracking(moduleId, devServer.pid || devServer.listenerPid || null);
        return { running: false, module: null };
      }
      return {
        running: true,
        module: { id: devServer.module.id, name: devServer.module.name, port: devServer.module.port }
      };
    }

    const validator = require('../../utils/validator');
    if (validator.isValidModule(moduleId)) {
      const moduleConfig = validator.getValidModule(moduleId);
      const restored = await this._restoreDevServerByModule(moduleConfig);
      if (restored?.tracked) {
        logger.broadcast(`自动恢复开发服务器跟踪: ${moduleConfig.name} (PID: ${restored.tracked.pid})`, 'devserver');
        return {
          running: true,
          module: { id: moduleConfig.id, name: moduleConfig.name, port: restored.tracked.module.port }
        };
      }
    }

    return { running: false, module: null };
  };

  proto.getAllDevServerStatus = async function() {
    // 先尝试恢复所有可能丢失的进程
    const modules = (configManager.getResolvedConfig().frontendModules || []);
    for (const module of modules) {
      if (!devServerProcesses.has(module.id)) {
        const restored = await this._restoreDevServerByModule(module);
        if (restored?.tracked) {
          logger.broadcast(`自动恢复开发服务器跟踪: ${module.name} (PID: ${restored.tracked.pid})`, 'devserver');
        }
      }
    }

    const runningModules = {};
    for (const [moduleId, devServer] of devServerProcesses.entries()) {
      if (!this._isTrackedDevServerRunning(devServer)) {
        this._clearDevServerTracking(moduleId, devServer.pid || devServer.listenerPid || null);
        continue;
      }

      if (devServer.module) {
        runningModules[devServer.module.id] = {
          id: devServer.module.id,
          name: devServer.module.name,
          port: devServer.module.port
        };
      }
    }

    const firstModule = Object.values(runningModules)[0] || null;
    return {
      running: Object.keys(runningModules).length > 0,
      module: firstModule,
      runningModules
    };
  };
};
