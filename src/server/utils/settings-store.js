const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULTS = {
  hotkey: 'CommandOrControl+Shift+Space',
  systemPrompt: '',
  temperature: 0.7,
  apiKey: ''
};

function mergeSettings(partial) {
  return { ...DEFAULTS, ...(partial || {}) };
}

function getSettingsPath(userDataPath) {
  return path.join(userDataPath, 'settings.json');
}

function loadSettings(userDataPath) {
  try {
    const raw = fs.readFileSync(getSettingsPath(userDataPath), 'utf-8');
    return mergeSettings(JSON.parse(raw));
  } catch {
    return mergeSettings({});
  }
}

function saveSettings(userDataPath, settings) {
  const merged = mergeSettings(settings);
  fs.writeFileSync(getSettingsPath(userDataPath), JSON.stringify(merged, null, 2));
  return merged;
}

function ensureApiKey(userDataPath) {
  const existing = loadSettings(userDataPath);
  if (existing.apiKey) return existing.apiKey;
  const apiKey = crypto.randomBytes(32).toString('hex');
  saveSettings(userDataPath, { ...existing, apiKey });
  return apiKey;
}

module.exports = { DEFAULTS, mergeSettings, loadSettings, saveSettings, getSettingsPath, ensureApiKey };
