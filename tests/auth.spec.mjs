import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeIp,
  parseAllowedIps,
  isIpAllowed,
  getBearerToken,
  isAuthorized,
  createAuthMiddleware
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

test('auth middleware allows loopback without token by default', () => {
  const original = process.env.CHATDOCK_ALLOW_LOCAL_UNAUTH;
  delete process.env.CHATDOCK_ALLOW_LOCAL_UNAUTH;
  const middleware = createAuthMiddleware({ apiKey: 'secret', allowedIps: '' });
  let nextCalled = false;
  const req = { path: '/models', ip: '127.0.0.1', headers: {} };
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };

  middleware(req, res, () => {
    nextCalled = true;
  });

  if (original === undefined) {
    delete process.env.CHATDOCK_ALLOW_LOCAL_UNAUTH;
  } else {
    process.env.CHATDOCK_ALLOW_LOCAL_UNAUTH = original;
  }

  assert.equal(nextCalled, true);
});

test('auth middleware rejects remote without token', () => {
  const middleware = createAuthMiddleware({ apiKey: 'secret', allowedIps: '' });
  const req = { path: '/models', ip: '10.0.0.2', headers: {} };
  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };

  middleware(req, res, () => {});

  assert.equal(res.statusCode, 401);
  assert.equal(res.payload?.error, 'Unauthorized');
});
