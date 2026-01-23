import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getToastMessage } from '../settings-ui.js';

test('toast message formats', () => {
  assert.equal(getToastMessage(true), 'Saved');
});
