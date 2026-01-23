const toast = document.getElementById('toast');
const hotkeyInput = document.getElementById('hotkeyInput');
const saveHotkey = document.getElementById('saveHotkey');
const hotkeyStatus = document.getElementById('hotkeyStatus');
const promptInput = document.getElementById('promptInput');
const tempRange = document.getElementById('tempRange');
const tempValue = document.getElementById('tempValue');
const saveTemp = document.getElementById('saveTemp');
const saveAll = document.getElementById('saveAll');
const minBtn = document.getElementById('minBtn');
const closeBtn = document.getElementById('closeBtn');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

function setTempValue(v) {
  tempValue.textContent = Number(v).toFixed(1);
}

tempRange.addEventListener('input', () => setTempValue(tempRange.value));

async function loadSettings() {
  const data = await window.SettingsAPI.load();
  hotkeyInput.value = data.hotkey || '';
  promptInput.value = data.systemPrompt || '';
  tempRange.value = data.temperature ?? 0.7;
  setTempValue(tempRange.value);
}

async function saveSettings(payload) {
  const res = await window.SettingsAPI.save(payload);
  showToast(res.ok ? 'Saved' : 'Save failed');
  if (res.ok) {
    hotkeyStatus.textContent = '';
  } else if (res.error) {
    hotkeyStatus.textContent = res.error;
  }
}

saveHotkey.addEventListener('click', () => {
  saveSettings({ hotkey: hotkeyInput.value });
});

saveTemp.addEventListener('click', () => {
  saveSettings({ temperature: Number(tempRange.value) });
});

saveAll.addEventListener('click', () => {
  saveSettings({
    hotkey: hotkeyInput.value,
    systemPrompt: promptInput.value,
    temperature: Number(tempRange.value)
  });
});

minBtn.addEventListener('click', () => window.SettingsAPI.minimize());
closeBtn.addEventListener('click', () => window.SettingsAPI.close());

window.addEventListener('DOMContentLoaded', loadSettings);
