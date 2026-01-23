import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldAutoPull } from '../server-config.js';

test('auto-pull is disabled by default', () => {
  assert.equal(shouldAutoPull(), false);
});
