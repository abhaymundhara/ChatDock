import { test } from 'node:test';
import assert from 'node:assert/strict';

// Basic contract: preload should expose window.__CHAT_BASE__ via contextBridge
// We can't run Electron here, so this test asserts the preload module exports
// a factory that returns the base URL string.
import { getChatBase, getAuthHeaders } from '../src/renderer/preload.js';

test('preload exposes chat base url', () => {
  const base = getChatBase({ port: 3001 });
  assert.equal(base, 'http://127.0.0.1:3001');
});

test('preload provides auth headers', () => {
  const headers = getAuthHeaders({ apiKey: 'secret' });
  assert.equal(headers.Authorization, 'Bearer secret');
});
