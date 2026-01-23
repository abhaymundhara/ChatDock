import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSettingsHtml } from '../settings-window.js';

test('settings window has placeholder html', () => {
  const html = getSettingsHtml();
  assert.ok(html.includes('Settings'));
});
