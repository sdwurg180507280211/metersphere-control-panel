const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, nativeTheme, dialog, screen, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const path = require('path');
const fixPath = require('fix-path');
const { hardenBrowserWindow } = require('./electron-security');

fixPath();
app.setName('Local Service Hub');

const APP_DATA_DIR = path.join(os.homedir(), '.metersphere-control-panel');
const HUB_WINDOW_STATE_PATH = path.join(APP_DATA_DIR, 'window-state.json');
const DEFAULT_HUB_WINDOW_BOUNDS = { width: 1240, height: 820 };
const MIN_HUB_WINDOW_BOUNDS = { width: 760, height: 540 };

let hubWindow = null;
let tray = null;
let server = null;
let backendPort = null;
let accessToken = '';
let backendShutdown = null;
let isQuitting = false;
let hubWindowStateTimer = null;
let rendererReady = false;
let pendingHubFocus = false;
let consoleNavigationReady = false;
let pendingProjectSelection = null;

const useExternalDevBackend = process.env.MS_ELECTRON_EXTERNAL_BACKEND === '1';
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) app.quit();

function applyDevelopmentDockIcon() {
  if (process.platform !== 'darwin' || app.isPackaged || !app.dock) return;
  const iconPath = path.join(__dirname, 'build', 'icon.icns');
  if (!fs.existsSync(iconPath)) {
    console.warn(`开发模式图标不存在: ${iconPath}`);
    return;
  }
  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    console.warn(`开发模式图标无法读取: ${iconPath}`);
    return;
  }
  app.dock.setIcon(icon);
}

function buildRendererUrl() {
  const base = process.env.ELECTRON_START_URL || `http://localhost:${backendPort}`;
  const url = new URL(base);
  if (accessToken) url.searchParams.set('token', accessToken);
  url.searchParams.delete('desktop');
  url.searchParams.delete('view');
  // Leave the hash empty so the console can restore its last project.
  return url.toString();
}

function sharedWebPreferences() {
  return {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    preload: path.join(__dirname, 'electron-preload.js')
  };
}

function probeUrl(url) {
  return new Promise((resolve) => {
    let target;
    try { target = new URL(url); } catch { resolve(false); return; }
    const client = target.protocol === 'https:' ? https : http;
    const request = client.get(target, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 400);
    });
    request.setTimeout(1000, () => { request.destroy(); resolve(false); });
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

function readHubWindowState() {
  try {
    if (!fs.existsSync(HUB_WINDOW_STATE_PATH)) return null;
    const value = JSON.parse(fs.readFileSync(HUB_WINDOW_STATE_PATH, 'utf8'));
    return value && typeof value === 'object' ? value : null;
  } catch { return null; }
}

function isFiniteNumber(value) { return typeof value === 'number' && Number.isFinite(value); }
function clamp(value, min, max, fallback) {
  if (!isFiniteNumber(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
function isBoundsVisible(bounds) {
  if (!isFiniteNumber(bounds?.x) || !isFiniteNumber(bounds?.y)) return false;
  return screen.getAllDisplays().some(({ workArea }) => {
    const left = Math.max(bounds.x, workArea.x);
    const top = Math.max(bounds.y, workArea.y);
    const right = Math.min(bounds.x + bounds.width, workArea.x + workArea.width);
    const bottom = Math.min(bounds.y + bounds.height, workArea.y + workArea.height);
    return right - left >= 120 && bottom - top >= 80;
  });
}
function getHubWindowState() {
  const saved = readHubWindowState();
  const primary = screen.getPrimaryDisplay().workArea;
  const width = clamp(saved?.width, MIN_HUB_WINDOW_BOUNDS.width, primary.width, DEFAULT_HUB_WINDOW_BOUNDS.width);
  const height = clamp(saved?.height, MIN_HUB_WINDOW_BOUNDS.height, primary.height, DEFAULT_HUB_WINDOW_BOUNDS.height);
  const candidate = { width, height, x: isFiniteNumber(saved?.x) ? Math.round(saved.x) : undefined, y: isFiniteNumber(saved?.y) ? Math.round(saved.y) : undefined };
  const hasSavedPosition = isBoundsVisible(candidate);
  return { bounds: hasSavedPosition ? candidate : { width, height }, shouldCenter: !hasSavedPosition, maximized: saved?.maximized === true };
}
function persistHubWindowState() {
  if (!hubWindow || hubWindow.isDestroyed()) return;
  try {
    const bounds = hubWindow.getNormalBounds();
    const value = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, maximized: hubWindow.isMaximized() };
    fs.mkdirSync(APP_DATA_DIR, { recursive: true });
    const tempPath = `${HUB_WINDOW_STATE_PATH}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.renameSync(tempPath, HUB_WINDOW_STATE_PATH);
  } catch (error) { console.warn(`保存窗口状态失败: ${error.message}`); }
}
function scheduleHubWindowStateSave() {
  clearTimeout(hubWindowStateTimer);
  hubWindowStateTimer = setTimeout(() => { hubWindowStateTimer = null; persistHubWindowState(); }, 250);
  hubWindowStateTimer.unref?.();
}
function focusHubWindow() {
  const window = createHubWindow();
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show(); window.focus(); app.focus({ steal: true });
}
function requestHubFocus() {
  if (!rendererReady || !backendPort) { pendingHubFocus = true; return; }
  pendingHubFocus = false;
  focusHubWindow();
}
function markRendererReady() { rendererReady = true; createTray(); requestHubFocus(); }

function flushProjectSelection() {
  if (!consoleNavigationReady || !hubWindow || hubWindow.isDestroyed() || !pendingProjectSelection) return;
  hubWindow.webContents.send('console:select-project', pendingProjectSelection);
  pendingProjectSelection = null;
}

function requestProjectSelection(projectId) {
  pendingProjectSelection = projectId;
  requestHubFocus();
  flushProjectSelection();
}

function createHubWindow() {
  if (hubWindow && !hubWindow.isDestroyed()) return hubWindow;
  if (!rendererReady || !backendPort) return null;
  const savedState = getHubWindowState();
  hubWindow = new BrowserWindow({ ...savedState.bounds, minWidth: MIN_HUB_WINDOW_BOUNDS.width, minHeight: MIN_HUB_WINDOW_BOUNDS.height, show: false, resizable: true, backgroundColor: '#0b1322', title: 'Local Service Hub', webPreferences: sharedWebPreferences() });
  hardenBrowserWindow(hubWindow, { backendPort, startUrl: process.env.ELECTRON_START_URL });
  consoleNavigationReady = false;
  hubWindow.webContents.on('did-start-loading', () => { consoleNavigationReady = false; });
  hubWindow.loadURL(buildRendererUrl());
  hubWindow.once('ready-to-show', () => { if (savedState.shouldCenter) hubWindow?.center(); if (savedState.maximized) hubWindow?.maximize(); hubWindow?.show(); hubWindow?.focus(); });
  hubWindow.on('move', scheduleHubWindowStateSave);
  hubWindow.on('resize', scheduleHubWindowStateSave);
  hubWindow.on('maximize', scheduleHubWindowStateSave);
  hubWindow.on('unmaximize', scheduleHubWindowStateSave);
  hubWindow.on('close', (event) => {
    persistHubWindowState();
    if (process.platform === 'darwin' && !isQuitting) { event.preventDefault(); hubWindow.hide(); }
  });
  hubWindow.on('closed', () => { clearTimeout(hubWindowStateTimer); hubWindowStateTimer = null; hubWindow = null; consoleNavigationReady = false; });
  return hubWindow;
}

function createTray() {
  if (tray) return tray;
  let icon = nativeImage.createEmpty();
  if (process.platform === 'darwin') { icon = nativeImage.createFromNamedImage('NSStatusAvailable'); icon.setTemplateImage?.(true); }
  tray = new Tray(icon);
  tray.setToolTip('Local Service Hub');
  const contextMenu = Menu.buildFromTemplate([
    { label: '打开 Local Service Hub', click: () => requestHubFocus() },
    { label: '切换到 MeterSphere', click: () => requestProjectSelection('metersphere') },
    { type: 'separator' },
    { label: '退出 Local Service Hub', click: () => app.quit() }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => requestHubFocus());
  return tray;
}

async function startBackend() {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  const backendPath = isDev ? path.join(__dirname, 'backend/server.js') : path.join(process.resourcesPath, 'app/backend/server.js');
  console.log('=== Backend Startup Debug ==='); console.log('Is packaged:', app.isPackaged); console.log('Is dev:', isDev); console.log('Backend path:', backendPath);
  try {
    const { startServer } = require(backendPath);
    const servicesDir = path.join(path.dirname(backendPath), 'services');
    const localAuthService = require(path.join(servicesDir, 'localAuthService.js'));
    backendShutdown = require(path.join(servicesDir, 'backendShutdownService.js')).shutdownBackend;
    let port = 5001; let retries = 5;
    while (retries > 0) {
      try { server = await startServer(port); return { port, token: localAuthService.getToken() }; }
      catch (error) { if (error.code === 'EADDRINUSE' && retries > 1) { port += 1; retries -= 1; continue; } throw error; }
    }
  } catch (error) {
    console.error('Failed to start backend:', error);
    dialog.showErrorBox('Local Service Hub 启动失败', `无法启动内置服务:\n\n${error.message}\n\n请检查端口、Node 环境或 Redis 配置。`);
    app.quit();
    return null;
  }
  return null;
}

ipcMain.on('console:ready', (event) => {
  if (!hubWindow || event.sender !== hubWindow.webContents) return;
  consoleNavigationReady = true;
  flushProjectSelection();
});
ipcMain.handle('project:open-workspace', async (_event, projectId) => {
  if (projectId !== 'metersphere') {
    throw new Error(`不支持的项目工作区: ${projectId || 'unknown'}`);
  }
  requestProjectSelection('metersphere');
  return true;
});
ipcMain.handle('desktop:open-external', async (_event, rawUrl) => {
  let target;
  try { target = new URL(String(rawUrl || '')); } catch { throw new Error('服务访问地址无效'); }
  const allowedProtocol = target.protocol === 'http:' || target.protocol === 'https:';
  const allowedHost = target.hostname === '127.0.0.1' || target.hostname === 'localhost';
  if (!allowedProtocol || !allowedHost) throw new Error('只允许访问本机 HTTP(S) 服务');
  await shell.openExternal(target.toString());
  return true;
});
app.on('second-instance', () => { if (!hasSingleInstanceLock) return; requestHubFocus(); });
app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  nativeTheme.themeSource = 'dark'; applyDevelopmentDockIcon(); app.dock?.show();
  if (useExternalDevBackend) {
    backendPort = Number(process.env.MS_DEV_BACKEND_PORT || 3000); accessToken = process.env.MS_LOCAL_TOKEN || '';
    try { await waitForDevStack(); }
    catch (error) { dialog.showErrorBox('开发环境启动失败', `${error.message}\n\n请直接运行 npm run dev；它会同时启动 backend、Vite 和 Electron。`); app.quit(); return; }
    markRendererReady(); return;
  }
  const backend = await startBackend();
  if (!backend) return;
  backendPort = backend.port; accessToken = backend.token; markRendererReady();
});
async function cleanup() {
  if (isQuitting) return;
  isQuitting = true; rendererReady = false; pendingHubFocus = false;
  clearTimeout(hubWindowStateTimer); hubWindowStateTimer = null; persistHubWindowState();
  tray?.destroy(); tray = null;
  if (!server) return;
  try {
    if (backendShutdown) await backendShutdown(server, { keepServices: true, httpCloseTimeoutMs: 5000 });
    else await new Promise((resolve) => { const timeout = setTimeout(resolve, 5000); server.close(() => { clearTimeout(timeout); resolve(); }); });
  } catch (error) { console.error('Cleanup error:', error); }
  finally { server = null; }
}
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', async (event) => { if (!isQuitting) { event.preventDefault(); await cleanup(); app.quit(); } });
app.on('activate', () => { requestHubFocus(); });
