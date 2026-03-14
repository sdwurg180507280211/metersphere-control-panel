const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;
let server;

function createWindow(port = 5001) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const startURL = process.env.ELECTRON_START_URL || `http://localhost:${port}`;
  mainWindow.loadURL(startURL);

  // 仅开发环境打开开发者工具
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function startBackend() {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  const backendPath = isDev
    ? path.join(__dirname, 'backend/server.js')
    : path.join(process.resourcesPath, 'app/backend/server.js');

  console.log('=== Backend Startup Debug ===');
  console.log('Is packaged:', app.isPackaged);
  console.log('Is dev:', isDev);
  console.log('__dirname:', __dirname);
  console.log('process.resourcesPath:', process.resourcesPath);
  console.log('Backend path:', backendPath);
  console.log('Backend exists:', require('fs').existsSync(backendPath));

  try {
    const { startServer } = require(backendPath);
    console.log('Backend module loaded successfully');

    let port = 5001;
    let retries = 5;

    while (retries > 0) {
      try {
        console.log('Trying port:', port);
        server = await startServer(port);
        console.log(`Backend started on port ${port}`);
        return port;
      } catch (error) {
        if (error.code === 'EADDRINUSE' && retries > 1) {
          console.log(`Port ${port} in use, trying ${port + 1}`);
          port++;
          retries--;
          continue;
        }

        console.error('Failed to start backend:', error);
        const { dialog } = require('electron');
        dialog.showErrorBox(
          'Backend 启动失败',
          `无法启动后端服务:\n\n${error.message}\n\n请检查端口是否被占用或 Redis 是否运行。`
        );
        app.quit();
        return null;
      }
    }
  } catch (error) {
    console.error('Failed to load backend module:', error);
    const { dialog } = require('electron');
    dialog.showErrorBox(
      'Backend 模块加载失败',
      `无法加载后端模块:\n\n${error.message}\n\nPath: ${backendPath}`
    );
    app.quit();
    return null;
  }
}

app.on('ready', async () => {
  const port = await startBackend();
  if (port) {
    setTimeout(() => createWindow(port), 2000);
  }
});

let isQuitting = false;

async function cleanup() {
  if (server && !isQuitting) {
    isQuitting = true;
    console.log('Cleaning up backend server...');

    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Server close timeout'));
        }, 5000);

        server.close((err) => {
          clearTimeout(timeout);
          if (err) {
            console.error('Error closing server:', err);
            reject(err);
          } else {
            console.log('Backend server closed successfully');
            resolve();
          }
        });
      });
    } catch (error) {
      console.error('Cleanup error:', error);
    }

    server = null;
  }
}

app.on('window-all-closed', async () => {
  await cleanup();
  app.quit();
});

app.on('before-quit', async (event) => {
  if (server && !isQuitting) {
    event.preventDefault();
    await cleanup();
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
