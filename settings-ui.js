function getToastMessage(ok) {
  return ok ? 'Saved' : 'Save failed';
}

module.exports = { getToastMessage };
