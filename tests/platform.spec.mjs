import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { getHotkey, getIndexHtmlPath } from '../main.js';

test('hotkey uses CommandOrControl', () => {
  assert.equal(getHotkey(), 'CommandOrControl+Shift+Space');
});

test('index html path is correct', () => {
  const p = getIndexHtmlPath();
  assert.equal(path.basename(p), 'Index.html');
});
