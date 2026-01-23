import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServerEnv } from '../main.js';

test('server env includes port/model/base', () => {
  const env = buildServerEnv({ port: 3456, model: 'm1', base: 'http://127.0.0.1:11434' });
  assert.equal(env.CHAT_SERVER_PORT, '3456');
  assert.equal(env.OLLAMA_MODEL, 'm1');
  assert.equal(env.OLLAMA_BASE, 'http://127.0.0.1:11434');
});
