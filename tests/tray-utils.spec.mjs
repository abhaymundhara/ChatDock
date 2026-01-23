import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTrayTitle } from '../tray-utils.js';

test('tray title shows on macOS', () => {
  assert.equal(getTrayTitle('darwin'), 'ChatDock');
});

test('tray title empty on other platforms', () => {
  assert.equal(getTrayTitle('win32'), '');
});
