import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { findAvailablePort } from '../src/shared/port-allocator.js';

test('finds next free port when start is in use', async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen({ port: 0, host: '127.0.0.1' }, resolve));
  const usedPort = server.address().port;

  try {
    const nextPort = await findAvailablePort(usedPort);
    assert.notEqual(nextPort, usedPort);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
