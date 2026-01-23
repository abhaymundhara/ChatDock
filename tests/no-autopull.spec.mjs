import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('server has no auto-pull logic or pull endpoint', () => {
  const serverPath = path.join(process.cwd(), 'src/server/server.js');
  const src = fs.readFileSync(serverPath, 'utf-8');
  assert.ok(!src.includes('/models/pull'));
  assert.ok(!src.includes('ensureModel'));
});
