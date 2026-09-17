const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopBridge', {
  // Kept for old clients; this now selects a project in the existing window.
  openWorkspace: (projectId) => ipcRenderer.invoke('project:open-workspace', projectId),
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
  onSelectProject: (callback) => {
    const listener = (_event, projectId) => callback(projectId);
    ipcRenderer.on('console:select-project', listener);
    return () => ipcRenderer.removeListener('console:select-project', listener);
  },
  ready: () => ipcRenderer.send('console:ready')
});
