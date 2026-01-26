import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('src/renderer/ace-interface.html', 'utf-8');

test('ace interface includes workflow strip container', () => {
  assert.ok(html.includes('workflow-strip'));
  assert.ok(html.includes('workflow-steps'));
});

test('ace interface handles workflow stream events', () => {
  assert.ok(html.includes('event.type === "workflow"'));
});
