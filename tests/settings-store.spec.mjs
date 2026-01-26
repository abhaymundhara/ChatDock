import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSettings } from '../src/server/utils/settings-store.js';

test('mergeSettings applies defaults', () => {
  const merged = mergeSettings({});
  assert.equal(merged.hotkey, 'CommandOrControl+Shift+Space');
  assert.equal(merged.temperature, 0.7);
  assert.ok(typeof merged.systemPrompt === 'string');
  assert.ok('apiKey' in merged);
});
