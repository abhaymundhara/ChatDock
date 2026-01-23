const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('SettingsAPI', {
  load: () => ipcRenderer.invoke('settings:load'),
  save: (payload) => ipcRenderer.invoke('settings:save', payload),
  close: () => ipcRenderer.invoke('settings:close'),
  minimize: () => ipcRenderer.invoke('settings:minimize')
});
