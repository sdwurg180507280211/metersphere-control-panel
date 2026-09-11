const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopBridge', {
  openWorkspace: (projectId) => ipcRenderer.invoke('project:open-workspace', projectId),
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url)
});
