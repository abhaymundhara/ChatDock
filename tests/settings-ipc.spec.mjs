import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateHotkey } from '../settings-ipc.js';

test('hotkey validation rejects empty', () => {
  assert.equal(validateHotkey(''), false);
});
