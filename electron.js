const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;
let server;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const startURL = process.env.ELECTRON_START_URL || 'http://localhost:5000';
  mainWindow.loadURL(startURL);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function startBackend() {
  try {
    const { startServer } = require('./backend/server.js');
    server = await startServer(5000);
    console.log('Backend started on port 5000');
  } catch (error) {
    console.error('Failed to start backend:', error);
  }
}

app.on('ready', async () => {
  await startBackend();
  setTimeout(createWindow, 2000);
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
