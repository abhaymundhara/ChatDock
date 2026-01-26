function getBearerToken(headerValue) {
  if (!headerValue) return '';
  const match = String(headerValue).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function normalizeIp(ip) {
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

function parseAllowedIps(envValue) {
  if (!envValue) return [];
  return envValue
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((entry) => {
      if (entry.includes('/')) {
        const [base, bits] = entry.split('/');
        return { type: 'cidr', base: normalizeIp(base), bits: Number(bits) };
      }
      return { type: 'ip', value: normalizeIp(entry) };
    });
}

function ipToInt(ip) {
  const parts = ip.split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  return (
    ((parts[0] << 24) >>> 0) +
    (parts[1] << 16) +
    (parts[2] << 8) +
    parts[3]
  );
}

function isIpAllowed(ip, allowedList) {
  if (!allowedList || allowedList.length === 0) return true;
  const normalized = normalizeIp(ip);
  for (const entry of allowedList) {
    if (entry.type === 'ip') {
      if (normalized === entry.value) return true;
    } else if (entry.type === 'cidr') {
      const ipInt = ipToInt(normalized);
      const baseInt = ipToInt(entry.base);
      if (ipInt === null || baseInt === null) continue;
      const mask = entry.bits === 0 ? 0 : (~0 << (32 - entry.bits)) >>> 0;
      if ((ipInt & mask) === (baseInt & mask)) return true;
    }
  }
  return false;
}

function isAuthorized(token, apiKey) {
  if (!apiKey) return false;
  return token === apiKey;
}

function createAuthMiddleware({ apiKey, allowedIps }) {
  const allowedList = parseAllowedIps(allowedIps || '');
  const allowLocalUnauth = process.env.CHATDOCK_ALLOW_LOCAL_UNAUTH !== 'false';
  return (req, res, next) => {
    if (req.path === '/health') return next();
    const ip = normalizeIp(req.ip || req.socket?.remoteAddress || '');
    if (!isIpAllowed(ip, allowedList)) {
      return res.status(403).json({ error: 'IP not allowed' });
    }
    if (allowLocalUnauth && ip === '127.0.0.1') {
      return next();
    }
    const token = getBearerToken(req.headers?.authorization);
    if (!isAuthorized(token, apiKey)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return next();
  };
}

module.exports = {
  getBearerToken,
  normalizeIp,
  parseAllowedIps,
  isIpAllowed,
  isAuthorized,
  createAuthMiddleware
};
