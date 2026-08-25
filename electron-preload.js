const { contextBridge, ipcRenderer, shell } = require('electron');

function normalizeLocalUrl(rawUrl) {
  const target = new URL(String(rawUrl || ''));
  const allowedProtocol = target.protocol === 'http:' || target.protocol === 'https:';
  const allowedHost = target.hostname === '127.0.0.1' || target.hostname === 'localhost';

  if (!allowedProtocol || !allowedHost) {
    throw new Error('只允许访问本机 HTTP(S) 服务');
  }

  return target.toString();
}

contextBridge.exposeInMainWorld('desktopBridge', {
  openMainWindow: () => ipcRenderer.send('desktop:open-main'),
  openExternal: (url) => shell.openExternal(normalizeLocalUrl(url))
});
