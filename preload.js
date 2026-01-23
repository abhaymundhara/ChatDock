let contextBridge;
try {
  const electron = require('electron');
  if (electron && typeof electron === 'object' && electron.contextBridge) {
    contextBridge = electron.contextBridge;
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
}

module.exports = { getChatBase };
