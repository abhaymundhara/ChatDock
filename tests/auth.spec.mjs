import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeIp,
  parseAllowedIps,
  isIpAllowed,
  getBearerToken,
  isAuthorized
} from '../src/server/utils/auth.js';

test('normalizeIp strips ipv6 prefix', () => {
  assert.equal(normalizeIp('::ffff:127.0.0.1'), '127.0.0.1');
});

test('parseAllowedIps handles empty', () => {
  assert.deepEqual(parseAllowedIps(''), []);
});

test('isIpAllowed allows when list empty', () => {
  assert.equal(isIpAllowed('10.0.0.1', []), true);
});

test('isIpAllowed supports cidr', () => {
  const list = parseAllowedIps('10.0.0.0/24');
  assert.equal(isIpAllowed('10.0.0.42', list), true);
  assert.equal(isIpAllowed('10.0.1.1', list), false);
});

test('isAuthorized checks bearer token', () => {
  assert.equal(isAuthorized(getBearerToken('Bearer abc'), 'abc'), true);
  assert.equal(isAuthorized(getBearerToken('Bearer wrong'), 'abc'), false);
});
