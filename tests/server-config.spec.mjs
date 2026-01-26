import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { getServerConfig } from '../src/server/utils/server-config.js';

test('getServerConfig uses env overrides', () => {
  const env = {
    CHAT_SERVER_PORT: '4242',
    CHAT_SERVER_HOST: '0.0.0.0',
    CHATDOCK_USER_DATA: '/tmp/user',
    CHATDOCK_APP_PATH: '/tmp/app'
  };
  const config = getServerConfig(env);
  assert.equal(config.port, 4242);
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.userDataPath, '/tmp/user');
  assert.equal(config.appPath, '/tmp/app');
  assert.equal(config.lastModelPath, path.join('/tmp/user', 'last_model.txt'));
});
