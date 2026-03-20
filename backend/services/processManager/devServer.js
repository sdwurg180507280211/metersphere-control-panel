/**
 * 开发服务器管理 mixin
 */
const { spawn } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const logger = require('../../utils/logger');
const { devServerProcesses } = require('./shared');

module.exports = function applyDevServer(proto) {

  proto.startDevServer = async function(moduleId) {
    if (devServerProcesses.has(moduleId)) {
      return { success: false, error: '开发服务器已在运行中' };
    }

    const pid = this._getPid(`devserver-${moduleId}`);
    if (pid && this._isProcessRunning(pid)) {
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
        detached: false
      });

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
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

    const devServer = devServerProcesses.get(moduleId);
    if (!devServer) {
      return { success: false, error: '开发服务器未运行' };
    }

    await this._terminateProcess(devServer.pid);
    this._clearPid(`devserver-${moduleId}`, devServer.pid);
    devServerProcesses.delete(moduleId);
    return { success: true };
  };

  proto.getDevServerStatus = function(moduleId) {
    const devServer = devServerProcesses.get(moduleId);
    if (devServer) {
      return {
        running: true,
        module: { id: devServer.module.id, name: devServer.module.name }
      };
    }

    const pid = this._getPid(`devserver-${moduleId}`);
    if (pid && this._isProcessRunning(pid)) {
      const validator = require('../../utils/validator');
      if (validator.isValidModule(moduleId)) {
        const moduleConfig = validator.getValidModule(moduleId);
        return {
          running: true,
          module: { id: moduleConfig.id, name: moduleConfig.name }
        };
      }
    }

    return { running: false, module: null };
  };

  proto.getAllDevServerStatus = function() {
    if (devServerProcesses.size === 0) {
      return { running: false, module: null };
    }

    const [moduleId, devServer] = devServerProcesses.entries().next().value;
    return {
      running: true,
      module: { id: devServer.module.id, name: devServer.module.name }
    };
  };
};
