let contextBridge;
let ipcRenderer;
try {
  const electron = require('electron');
  if (electron && typeof electron === 'object') {
    if (electron.contextBridge) {
      contextBridge = electron.contextBridge;
    }
    if (electron.ipcRenderer) {
      ipcRenderer = electron.ipcRenderer;
    }
  }
} catch {
  // Non-Electron environment (tests)
}

function getChatBase({ port }) {
  return `http://127.0.0.1:${port}`;
}

if (contextBridge && typeof contextBridge.exposeInMainWorld === 'function') {
  contextBridge.exposeInMainWorld('__CHAT_BASE__', {
    get: () => getChatBase({ port: Number(process.env.CHAT_SERVER_PORT || 3001) })
  });
  
  // Expose settings API
  if (ipcRenderer) {
    contextBridge.exposeInMainWorld('settingsAPI', {
      open: () => ipcRenderer.send('open-settings')
    });
  }
}

module.exports = { getChatBase };
