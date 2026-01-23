import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrayTemplate } from '../src/main/tray/tray-menu.js';

test('tray menu includes server url and actions', () => {
  const tpl = buildTrayTemplate({ serverUrl: 'http://127.0.0.1:3001' });
  const labels = tpl.map(i => i.label).filter(Boolean);
  assert.ok(labels.includes('Server: http://127.0.0.1:3001'));
  assert.ok(labels.includes('Ask AI'));
  assert.ok(labels.includes('Settings'));
  assert.ok(labels.includes('Quit'));
});
