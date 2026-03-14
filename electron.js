const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;
let server;

function createWindow(port = 5000) {
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
  let port = 5000;
  let retries = 5;

  while (retries > 0) {
    try {
      const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
      const backendPath = isDev
        ? path.join(__dirname, 'backend/server.js')
        : path.join(process.resourcesPath, 'app.asar.unpacked/backend/server.js');

      console.log('Is packaged:', app.isPackaged);
      console.log('Backend path:', backendPath);
      console.log('Trying port:', port);

      const { startServer } = require(backendPath);
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
}

app.on('ready', async () => {
  const port = await startBackend();
  if (port) {
    setTimeout(() => createWindow(port), 2000);
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
