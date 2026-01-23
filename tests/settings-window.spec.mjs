import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSettingsHtml } from '../src/main/settings/settings-window.js';

test('settings window has placeholder html', () => {
  const html = getSettingsHtml();
  assert.ok(html.includes('Settings'));
});
