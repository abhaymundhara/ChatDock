const net = require('node:net');

function checkPortOnHost(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const timer = setTimeout(() => finish(false), 500);
    server.on('error', () => {
      clearTimeout(timer);
      finish(false);
    });
    server.listen({ port, host }, () => {
      clearTimeout(timer);
      server.close(() => finish(true));
    });
  });
}

async function checkPort(port) {
  // Ensure port is free for both IPv6 and IPv4 use.
  const ipv6 = await checkPortOnHost(port, '::').catch(() => false);
  if (!ipv6) return false;
  const ipv4 = await checkPortOnHost(port, '127.0.0.1').catch(() => false);
  return ipv4;
}

async function findAvailablePort(startPort, { maxTries = 50 } = {}) {
  let port = Number(startPort) || 3001;
  for (let i = 0; i < maxTries; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await checkPort(port);
    if (ok) return port;
    port += 1;
  }
  throw new Error('No available port found');
}

module.exports = { findAvailablePort };
