const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopBridge', {
  openMainWindow: () => ipcRenderer.send('desktop:open-main'),
  hideWindow: () => ipcRenderer.send('desktop:hide'),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('desktop:set-always-on-top', Boolean(value)),
  selectDirectory: () => ipcRenderer.invoke('desktop:select-directory')
});
