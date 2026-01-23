function buildTrayTemplate({ serverUrl }) {
  return [
    { label: `Server: ${serverUrl}`, enabled: false },
    { type: 'separator' },
    { label: 'Ask AI', id: 'ask-ai' },
    { label: 'Settings', id: 'settings' },
    { type: 'separator' },
    { label: 'Quit', id: 'quit' }
  ];
}

module.exports = { buildTrayTemplate };
