function validateHotkey(hk) {
  return Boolean(hk && hk.trim().length > 0);
}

module.exports = { validateHotkey };
