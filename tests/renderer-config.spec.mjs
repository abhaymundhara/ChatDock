import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveChatBase } from '../renderer-config.js';

test('renderer uses injected base url when available', () => {
  const base = resolveChatBase({ injected: 'http://127.0.0.1:4000' });
  assert.equal(base, 'http://127.0.0.1:4000');
});
