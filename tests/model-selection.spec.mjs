import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseModel } from '../src/shared/choose-model.js';

test('uses requested model when provided', () => {
  assert.equal(chooseModel({ requested: 'm1', last: 'm2', available: ['m3'] }), 'm1');
});

test('uses last model when no requested', () => {
  assert.equal(chooseModel({ requested: '', last: 'm2', available: ['m3'] }), 'm2');
});

test('uses first available model when no requested or last', () => {
  assert.equal(chooseModel({ requested: '', last: '', available: ['m3', 'm4'] }), 'm3');
});

test('returns null when nothing available', () => {
  assert.equal(chooseModel({ requested: '', last: '', available: [] }), null);
});
