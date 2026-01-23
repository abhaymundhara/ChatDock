function getTrayTitle(platform) {
  return platform === 'darwin' ? 'ChatDock' : '';
}

module.exports = { getTrayTitle };
