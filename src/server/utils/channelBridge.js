const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

let sessionsPath = null;
let sessionMap = new Map(); // key: channel:userId => sessionId

function loadSessions() {
  if (!sessionsPath || !fs.existsSync(sessionsPath)) return;
  try {
    const raw = fs.readFileSync(sessionsPath, "utf-8");
    const data = JSON.parse(raw);
    if (data && typeof data === "object" && data.sessions) {
      sessionMap = new Map(Object.entries(data.sessions));
    }
  } catch {
    sessionMap = new Map();
  }
}

function persistSessions() {
  if (!sessionsPath) return;
  const payload = {
    updatedAt: new Date().toISOString(),
    sessions: Object.fromEntries(sessionMap.entries())
  };
  fs.writeFileSync(sessionsPath, JSON.stringify(payload, null, 2), "utf-8");
}

function initChannelBridge(workspaceRoot) {
  if (!workspaceRoot) return;
  const configDir = path.join(workspaceRoot, "config");
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  sessionsPath = path.join(configDir, "channel_sessions.json");
  loadSessions();
}

function buildKey(channel, userId) {
  return `${channel}:${userId}`;
}

function createSessionId(channel, userId) {
  const hash = crypto
    .createHash("sha256")
    .update(`${channel}:${userId}`)
    .digest("hex")
    .slice(0, 12);
  return `channel-${channel}-${hash}`;
}

function getOrCreateSessionId(channel, userId) {
  const key = buildKey(channel, userId);
  if (sessionMap.has(key)) {
    return sessionMap.get(key);
  }
  const sessionId = createSessionId(channel, userId);
  sessionMap.set(key, sessionId);
  persistSessions();
  return sessionId;
}

function registerChannelSession(channel, userId, sessionId) {
  const key = buildKey(channel, userId);
  const finalSessionId = sessionId || createSessionId(channel, userId);
  sessionMap.set(key, finalSessionId);
  persistSessions();
  return finalSessionId;
}

function removeChannelSession(channel, userId) {
  const key = buildKey(channel, userId);
  if (!sessionMap.has(key)) return false;
  sessionMap.delete(key);
  persistSessions();
  return true;
}

function listChannelSessions() {
  return Array.from(sessionMap.entries()).map(([key, sessionId]) => {
    const [channel, userId] = key.split(":");
    return { channel, userId, sessionId };
  });
}

module.exports = {
  initChannelBridge,
  getOrCreateSessionId,
  registerChannelSession,
  removeChannelSession,
  listChannelSessions
};
