const path = require('path');
const desktopUpdateService = require('../services/desktopUpdateService');
const { createAppError, sendError } = require('../utils/errors');
const packageJson = require('../../package.json');

function getElectronApp() {
  if (!process.versions?.electron) return null;
  try {
    const electron = require('electron');
    return electron?.app || null;
  } catch {
    return null;
  }
}

function getRuntimeInfo() {
  const electronApp = getElectronApp();
  const packaged = Boolean(electronApp?.isPackaged);
  const version = packaged ? electronApp.getVersion() : packageJson.version;
  return {
    electronApp,
    packaged,
    version,
    arch: process.arch,
    platform: process.platform
  };
}

function getTargetAppPath() {
  return path.resolve(path.dirname(process.execPath), '..', '..');
}

const desktopUpdateController = {
  info(req, res) {
    const runtime = getRuntimeInfo();
    res.json({
      success: true,
      data: {
        currentVersion: runtime.version,
        arch: runtime.arch,
        platform: runtime.platform,
        installSupported: runtime.packaged && runtime.platform === 'darwin'
      }
    });
  },

  async check(req, res) {
    try {
      const runtime = getRuntimeInfo();
      if (!runtime.packaged || runtime.platform !== 'darwin') {
        res.json({
          success: true,
          data: {
            currentVersion: runtime.version,
            latestVersion: null,
            updateAvailable: false,
            notes: '',
            installSupported: false,
            development: true
          }
        });
        return;
      }

      const result = await desktopUpdateService.checkForUpdate({
        currentVersion: runtime.version,
        arch: runtime.arch
      });
      res.json({
        success: true,
        data: {
          ...result,
          installSupported: true
        }
      });
    } catch (error) {
      sendError(res, createAppError(
        502,
        'DESKTOP_UPDATE_CHECK_FAILED',
        `检查更新失败: ${error.message}`
      ));
    }
  },

  async install(req, res) {
    try {
      const runtime = getRuntimeInfo();
      if (!runtime.packaged || runtime.platform !== 'darwin' || !runtime.electronApp) {
        throw createAppError(400, 'DESKTOP_UPDATE_NOT_PACKAGED', '在线安装只支持已打包的 macOS App');
      }

      const update = await desktopUpdateService.checkForUpdate({
        currentVersion: runtime.version,
        arch: runtime.arch
      });
      if (!update.updateAvailable) {
        throw createAppError(409, 'DESKTOP_UPDATE_NOT_AVAILABLE', '当前已经是最新版本');
      }

      const prepared = await desktopUpdateService.prepareUpdate(update);
      await desktopUpdateService.launchInstallHelper({
        targetAppPath: getTargetAppPath(),
        stagedAppPath: prepared.stagedAppPath,
        updateDir: prepared.updateDir,
        currentPid: process.pid
      });

      res.json({
        success: true,
        data: {
          currentVersion: runtime.version,
          latestVersion: update.latestVersion,
          bytes: prepared.bytes,
          sha256: prepared.sha256,
          restarting: true
        },
        message: '更新包已校验，Local Service Hub 将退出并安装新版本'
      });

      const timer = setTimeout(() => runtime.electronApp.quit(), 350);
      timer.unref?.();
    } catch (error) {
      if (error?.status || error?.statusCode) {
        sendError(res, error);
        return;
      }
      sendError(res, createAppError(
        500,
        'DESKTOP_UPDATE_INSTALL_FAILED',
        `安装更新失败: ${error.message}`
      ));
    }
  }
};

module.exports = desktopUpdateController;
