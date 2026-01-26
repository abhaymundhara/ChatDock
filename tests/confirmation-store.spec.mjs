import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfirmationStore } from '../src/server/utils/confirmation-store.js';

test('confirmation store validates matching params', () => {
  const store = new ConfirmationStore({ ttlMs: 1000 });
  const { id } = store.issue('run_command', { cmd: 'ls' });
  const ok = store.verify(id, 'run_command', { cmd: 'ls' });
  assert.equal(ok, true);
});

test('confirmation store rejects mismatched params', () => {
  const store = new ConfirmationStore({ ttlMs: 1000 });
  const { id } = store.issue('run_command', { cmd: 'ls' });
  const ok = store.verify(id, 'run_command', { cmd: 'rm' });
  assert.equal(ok, false);
});
