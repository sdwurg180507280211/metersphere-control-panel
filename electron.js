const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen, dialog } = require('electron');
const http = require('http');
const https = require('https');
const path = require('path');
const fixPath = require('fix-path');

// 修复 macOS 打包后的 PATH 问题，让 npm/node/java 等本地命令可被 Desktop Apps 使用。
fixPath();

let mainWindow = null;
let desktopWindow = null;
let tray = null;
let server = null;
let backendPort = null;
let accessToken = '';
let isQuitting = false;

const useExternalDevBackend = process.env.MS_ELECTRON_EXTERNAL_BACKEND === '1';

function buildRendererUrl({ desktop = false } = {}) {
  const base = process.env.ELECTRON_START_URL || `http://localhost:${backendPort}`;
  const url = new URL(base);
  if (accessToken) url.searchParams.set('token', accessToken);
  if (desktop) {
    url.searchParams.set('desktop', '1');
    url.hash = '';
  } else {
    url.searchParams.delete('desktop');
    url.hash = 'services';
  }
  return url.toString();
}

function sharedWebPreferences() {
  return {
    nodeIntegration: false,
    contextIsolation: true,
    preload: path.join(__dirname, 'electron-preload.js')
  };
}

function probeUrl(url) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      resolve(false);
      return;
    }

    const client = target.protocol === 'https:' ? https : http;
    const request = client.get(target, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 400);
    });

    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
    request.once('error', () => resolve(false));
  });
}

async function waitForDevStack(timeoutMs = 20000) {
  const rendererBase = process.env.ELECTRON_START_URL || 'http://localhost:3001';
  const healthUrl = new URL('/api/health', rendererBase).toString();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await probeUrl(healthUrl)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`开发服务未就绪: ${healthUrl}`);
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 960,
    minHeight: 680,
    show: false,
    backgroundColor: '#08101f',
    title: 'MeterSphere Control Panel',
    webPreferences: sharedWebPreferences()
  });

  mainWindow.loadURL(buildRendererUrl());
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin' && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function positionDesktopWindow() {
  if (!desktopWindow || desktopWindow.isDestroyed()) return;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width } = display.workArea;
  const [windowWidth] = desktopWindow.getSize();
  desktopWindow.setPosition(x + width - windowWidth - 18, y + 18, false);
}

function createDesktopWindow() {
  if (desktopWindow && !desktopWindow.isDestroyed()) {
    desktopWindow.show();
    desktopWindow.focus();
    return desktopWindow;
  }

  desktopWindow = new BrowserWindow({
    width: 430,
    height: 680,
    minWidth: 390,
    minHeight: 520,
    maxWidth: 560,
    frame: false,
    transparent: false,
    show: false,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#08101f',
    hasShadow: true,
    vibrancy: process.platform === 'darwin' ? 'sidebar' : undefined,
    visualEffectState: process.platform === 'darwin' ? 'active' : undefined,
    webPreferences: sharedWebPreferences()
  });

  desktopWindow.setAlwaysOnTop(true, 'floating');
  desktopWindow.loadURL(buildRendererUrl({ desktop: true }));
  desktopWindow.once('ready-to-show', () => {
    positionDesktopWindow();
    desktopWindow?.show();
  });

  desktopWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      desktopWindow.hide();
    }
  });

  desktopWindow.on('closed', () => {
    desktopWindow = null;
  });

  return desktopWindow;
}

function createTray() {
  if (tray) return tray;

  let icon = nativeImage.createEmpty();
  if (process.platform === 'darwin') {
    icon = nativeImage.createFromNamedImage('NSStatusAvailable');
    icon.setTemplateImage?.(true);
  }

  tray = new Tray(icon);
  tray.setToolTip('Local Service Hub');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示 Local Service Hub',
      click: () => createDesktopWindow()
    },
    {
      label: '打开完整控制面板',
      click: () => createMainWindow()
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => app.quit()
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (!desktopWindow || desktopWindow.isDestroyed() || !desktopWindow.isVisible()) {
      createDesktopWindow();
      return;
    }
    desktopWindow.hide();
  });

  return tray;
}

async function startBackend() {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  const backendPath = isDev
    ? path.join(__dirname, 'backend/server.js')
    : path.join(process.resourcesPath, 'app/backend/server.js');

  console.log('=== Backend Startup Debug ===');
  console.log('Is packaged:', app.isPackaged);
  console.log('Is dev:', isDev);
  console.log('Backend path:', backendPath);

  try {
    const { startServer } = require(backendPath);
    const localAuthService = require(path.join(path.dirname(backendPath), 'services/localAuthService.js'));

    let port = 5001;
    let retries = 5;

    while (retries > 0) {
      try {
        server = await startServer(port);
        return {
          port,
          token: localAuthService.getToken()
        };
      } catch (error) {
        if (error.code === 'EADDRINUSE' && retries > 1) {
          port += 1;
          retries -= 1;
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    console.error('Failed to start backend:', error);
    dialog.showErrorBox(
      'Backend 启动失败',
      `无法启动后端服务:\n\n${error.message}\n\n请检查端口、Node 环境或 Redis 配置。`
    );
    app.quit();
    return null;
  }

  return null;
}

ipcMain.on('desktop:open-main', () => {
  createMainWindow();
});

ipcMain.on('desktop:hide', () => {
  desktopWindow?.hide();
});

ipcMain.handle('desktop:set-always-on-top', (_event, value) => {
  if (!desktopWindow || desktopWindow.isDestroyed()) return false;
  desktopWindow.setAlwaysOnTop(Boolean(value), 'floating');
  return desktopWindow.isAlwaysOnTop();
});

ipcMain.handle('desktop:select-directory', async (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender) || desktopWindow || mainWindow;
  const result = await dialog.showOpenDialog(owner, {
    title: '选择本地应用项目目录',
    properties: ['openDirectory', 'createDirectory']
  });
  return result.canceled ? null : result.filePaths[0] || null;
});

app.whenReady().then(async () => {
  if (useExternalDevBackend) {
    backendPort = Number(process.env.MS_DEV_BACKEND_PORT || 3000);
    accessToken = process.env.MS_LOCAL_TOKEN || '';

    try {
      await waitForDevStack();
    } catch (error) {
      dialog.showErrorBox(
        '开发环境启动失败',
        `${error.message}\n\n请直接运行 npm run dev；它会同时启动 backend、Vite 和 Electron。`
      );
      app.quit();
      return;
    }

    createTray();
    createDesktopWindow();
    return;
  }

  const backend = await startBackend();
  if (!backend) return;

  backendPort = backend.port;
  accessToken = backend.token;

  createTray();
  createDesktopWindow();
});

async function cleanup() {
  if (isQuitting) return;
  isQuitting = true;

  tray?.destroy();
  tray = null;

  if (!server) return;

  try {
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 5000);
      server.close(() => {
        clearTimeout(timeout);
        resolve();
      });
    });
  } catch (error) {
    console.error('Cleanup error:', error);
  } finally {
    server = null;
  }
}

app.on('window-all-closed', () => {
  // macOS 上保持菜单栏常驻；退出由 Tray 菜单显式触发。
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (event) => {
  if (!isQuitting) {
    event.preventDefault();
    await cleanup();
    app.quit();
  }
});

app.on('activate', () => {
  createDesktopWindow();
});
