const path = require('node:path');

function getServerConfig(env = process.env, defaults = {}) {
  const port = Number(env.CHAT_SERVER_PORT || defaults.port || 3001);
  const host = env.CHAT_SERVER_HOST || defaults.host || '0.0.0.0';
  const userDataPath =
    env.CHATDOCK_USER_DATA || env.USER_DATA_PATH || defaults.userDataPath || __dirname;
  const appPath = env.CHATDOCK_APP_PATH || defaults.appPath || process.cwd();
  const lastModelPath = path.join(userDataPath, 'last_model.txt');

  return { port, host, userDataPath, appPath, lastModelPath };
}

module.exports = { getServerConfig };
