const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopBridge', {
  openMainWindow: () => ipcRenderer.send('desktop:open-main'),
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url)
});
