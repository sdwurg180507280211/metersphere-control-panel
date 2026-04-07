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

  /**
   * 恢复已存在的开发服务器进程（从 PID 文件恢复）
   * 应在后端启动时调用
   */
  proto.restoreDevServers = async function() {
    const validator = require('../../utils/validator');
    const modules = (configManager.getResolvedConfig().frontendModules || []);
    let restoredCount = 0;

    for (const module of modules) {
      const pidKey = `devserver-${module.id}`;
      const pid = this._getPid(pidKey);

      if (pid && this._isProcessRunning(pid)) {
        // 尝试从模块配置中获取端口信息
        let devPort = 4200;
        try {
          const modulePath = path.join(this._getProjectRoot(), module.frontendPath);
          const vueConfigPath = path.join(modulePath, 'vue.config.js');
          if (fs.existsSync(vueConfigPath)) {
            const vueConfigContent = await fsp.readFile(vueConfigPath, 'utf8');
            const portMatch = vueConfigContent.match(/port:\s*(\d+)/);
            if (portMatch) {
              devPort = parseInt(portMatch[1]);
            }
          }
        } catch (e) {
          // 忽略解析错误，使用默认端口
        }

        const moduleInfo = { id: module.id, name: module.name, port: devPort };
        devServerProcesses.set(module.id, {
          pid,
          module: moduleInfo,
          child: null
        });
        logger.broadcast(`恢复开发服务器: ${module.name} (PID: ${pid})`, 'devserver');
        restoredCount++;
      } else if (pid) {
        // PID 文件存在但进程已死，清理
        this._clearPid(pidKey);
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
      if (existing.pid && this._isProcessRunning(existing.pid)) {
        return { success: false, error: '开发服务器已在运行中' };
      } else {
        // 进程已死，清理
        devServerProcesses.delete(moduleId);
      }
    }

    const pid = this._getPid(`devserver-${moduleId}`);
    if (pid && this._isProcessRunning(pid)) {
      // 进程存在但内存中没有，恢复跟踪
      const validator = require('../../utils/validator');
      if (validator.isValidModule(moduleId)) {
        const moduleConfig = validator.getValidModule(moduleId);
        // 尝试获取端口
        let devPort = 4200;
        try {
          const modulePath = path.join(this._getProjectRoot(), moduleConfig.frontendPath);
          const vueConfigPath = path.join(modulePath, 'vue.config.js');
          if (fs.existsSync(vueConfigPath)) {
            const vueConfigContent = await fsp.readFile(vueConfigPath, 'utf8');
            const portMatch = vueConfigContent.match(/port:\s*(\d+)/);
            if (portMatch) {
              devPort = parseInt(portMatch[1]);
            }
          }
        } catch (e) {}
        const moduleInfo = { id: moduleConfig.id, name: moduleConfig.name, port: devPort };
        devServerProcesses.set(moduleId, { pid, module: moduleInfo, child: null });
      }
      return { success: false, error: '开发服务器已在运行中' };
    }
    if (pid) {
      this._clearPid(`devserver-${moduleId}`);
    }

    const validator = require('../../utils/validator');
    if (!validator.isValidModule(moduleId)) {
      return { success: false, error: '未知的模块' };
    }

    const moduleConfig = validator.getValidModule(moduleId);
    const modulePath = path.join(this._getProjectRoot(), moduleConfig.frontendPath);
    const { command: npmCommand, argsPrefix: npmArgsPrefix } = this._resolveNpmCommand();

    const pkgPath = path.join(modulePath, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      return { success: false, error: '模块缺少 package.json' };
    }

    let devScript = null;
    let devPort = 4200;

    try {
      const pkg = JSON.parse(await fsp.readFile(pkgPath, 'utf8'));

      if (pkg.scripts) {
        const moduleName = pkg.name;
        if (moduleName && pkg.scripts[moduleName]) {
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

        devScript = devScript || 'serve';
      }

      const vueConfigPath = path.join(modulePath, 'vue.config.js');
      if (fs.existsSync(vueConfigPath)) {
        const vueConfigContent = await fsp.readFile(vueConfigPath, 'utf8');
        const portMatch = vueConfigContent.match(/port:\s*(\d+)/);
        if (portMatch) {
          devPort = parseInt(portMatch[1]);
        }
      }
    } catch (e) {
      logger.broadcast(`解析模块配置失败: ${e.message}`, 'devserver');
    }

    const moduleInfo = { id: moduleConfig.id, name: moduleConfig.name, port: devPort };

    return new Promise((resolve) => {
      const child = spawn(npmCommand, [...npmArgsPrefix, 'run', devScript], {
        cwd: modulePath,
        env: { ...process.env, PORT: devPort.toString() },
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          // 让子进程脱离父进程，独立运行（但仍保留 child 引用用于日志）
          if (process.platform !== 'win32') {
            child.unref();
          }
          // 保存 child 引用，用于日志捕获
          devServerProcesses.set(moduleId, { pid: child.pid, module: moduleInfo, child });
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
          this._clearPid(`devserver-${moduleId}`, child.pid);
          devServerProcesses.delete(moduleId);
        }
      });

      child.stdout?.on('data', (data) => logger.broadcast(data.toString(), 'devserver'));
      child.stderr?.on('data', (data) => logger.broadcast(data.toString(), 'devserver'));
    });
  };

  proto.stopDevServer = async function(moduleId) {
    if (!moduleId && devServerProcesses.size > 0) {
      moduleId = devServerProcesses.keys().next().value;
    }

    let devServer = devServerProcesses.get(moduleId);
    let pid = devServer?.pid;

    // 如果内存中没有，尝试从 PID 文件获取
    if (!pid) {
      pid = this._getPid(`devserver-${moduleId}`);
    }

    if (!pid) {
      return { success: false, error: '开发服务器未运行' };
    }

    // 终止进程
    await this._terminateProcess(pid);
    this._clearPid(`devserver-${moduleId}`, pid);
    devServerProcesses.delete(moduleId);
    return { success: true };
  };

  proto.getDevServerStatus = async function(moduleId) {
    const devServer = devServerProcesses.get(moduleId);
    if (devServer) {
      // 检查进程是否还在运行
      if (devServer.pid && !this._isProcessRunning(devServer.pid)) {
        // 进程已死，清理
        devServerProcesses.delete(moduleId);
        this._clearPid(`devserver-${moduleId}`);
        return { running: false, module: null };
      }
      return {
        running: true,
        module: { id: devServer.module.id, name: devServer.module.name, port: devServer.module.port }
      };
    }

    const pid = this._getPid(`devserver-${moduleId}`);
    if (pid && this._isProcessRunning(pid)) {
      // 进程存在但内存映射丢失，自动恢复
      const validator = require('../../utils/validator');
      if (validator.isValidModule(moduleId)) {
        const moduleConfig = validator.getValidModule(moduleId);
        // 尝试获取端口信息
        let devPort = 4200;
        try {
          const modulePath = path.join(this._getProjectRoot(), moduleConfig.frontendPath);
          const vueConfigPath = path.join(modulePath, 'vue.config.js');
          if (fs.existsSync(vueConfigPath)) {
            const vueConfigContent = await fsp.readFile(vueConfigPath, 'utf8');
            const portMatch = vueConfigContent.match(/port:\s*(\d+)/);
            if (portMatch) {
              devPort = parseInt(portMatch[1]);
            }
          }
        } catch (e) {}
        // 恢复内存映射
        const moduleInfo = { id: moduleConfig.id, name: moduleConfig.name, port: devPort };
        devServerProcesses.set(moduleId, { pid, module: moduleInfo, child: null });
        logger.broadcast(`自动恢复开发服务器跟踪: ${moduleConfig.name} (PID: ${pid})`, 'devserver');
        return {
          running: true,
          module: { id: moduleConfig.id, name: moduleConfig.name, port: devPort }
        };
      }
    } else if (pid) {
      // PID 文件存在但进程已死，清理
      this._clearPid(`devserver-${moduleId}`);
    }

    return { running: false, module: null };
  };

  proto.getAllDevServerStatus = async function() {
    // 先尝试恢复所有可能丢失的进程
    const modules = (configManager.getResolvedConfig().frontendModules || []);
    for (const module of modules) {
      if (!devServerProcesses.has(module.id)) {
        const pid = this._getPid(`devserver-${module.id}`);
        if (pid && this._isProcessRunning(pid)) {
          // 自动恢复
          let devPort = 4200;
          try {
            const modulePath = path.join(this._getProjectRoot(), module.frontendPath);
            const vueConfigPath = path.join(modulePath, 'vue.config.js');
            if (fs.existsSync(vueConfigPath)) {
              const vueConfigContent = await fsp.readFile(vueConfigPath, 'utf8');
              const portMatch = vueConfigContent.match(/port:\s*(\d+)/);
              if (portMatch) {
                devPort = parseInt(portMatch[1]);
              }
            }
          } catch (e) {}
          const moduleInfo = { id: module.id, name: module.name, port: devPort };
          devServerProcesses.set(module.id, { pid, module: moduleInfo, child: null });
          logger.broadcast(`自动恢复开发服务器跟踪: ${module.name} (PID: ${pid})`, 'devserver');
        } else if (pid) {
          this._clearPid(`devserver-${module.id}`);
        }
      }
    }

    // 检查所有已跟踪进程，清理已死的
    const runningModules = {};
    for (const [moduleId, devServer] of devServerProcesses.entries()) {
      if (devServer.pid && !this._isProcessRunning(devServer.pid)) {
        // 进程已死，清理
        devServerProcesses.delete(moduleId);
        this._clearPid(`devserver-${moduleId}`);
      } else if (devServer.module) {
        runningModules[devServer.module.id] = {
          id: devServer.module.id,
          name: devServer.module.name,
          port: devServer.module.port
        };
      }
    }

    return {
      running: devServerProcesses.size > 0,
      runningModules
    };
  };
};
