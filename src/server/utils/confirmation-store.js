const crypto = require('node:crypto');

function stableStringify(value) {
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      return `[${value.map(stableStringify).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashPayload(tool, params) {
  const payload = `${tool}:${stableStringify(params)}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

class ConfirmationStore {
  constructor({ ttlMs = 2 * 60 * 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.store = new Map();
  }

  issue(tool, params) {
    const id = crypto.randomUUID
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + this.ttlMs;
    this.store.set(id, { hash: hashPayload(tool, params), expiresAt });
    return { id, expiresAt };
  }

  verify(id, tool, params) {
    const entry = this.store.get(id);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(id);
      return false;
    }
    const ok = entry.hash === hashPayload(tool, params);
    if (ok) this.store.delete(id);
    return ok;
  }
}

module.exports = { ConfirmationStore };
