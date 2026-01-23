function resolveChatBase({ injected }) {
  return injected || 'http://127.0.0.1:3001';
}

module.exports = { resolveChatBase };
