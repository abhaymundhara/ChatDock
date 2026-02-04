/**
 * Agent Memory
 * Manages conversation history and state
 */

const fs = require("fs");
const path = require("path");

class Memory {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.sessionsDir = path.join(userDataPath, "sessions");
    this.history = [];
    this.currentSessionId = "default";
    
    // Ensure sessions directory exists
    if (!fs.existsSync(this.sessionsDir)) {
      try {
        fs.mkdirSync(this.sessionsDir, { recursive: true });
      } catch (e) {
        console.error("Failed to create sessions directory:", e);
      }
    }
  }

  getSessionFile(sessionId) {
    return path.join(this.sessionsDir, `${sessionId || "default"}.json`);
  }

  load(sessionId = "default") {
    this.currentSessionId = sessionId;
    const sessionFile = this.getSessionFile(sessionId);
    
    try {
      if (fs.existsSync(sessionFile)) {
        const data = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
        this.history = data.history || [];
      } else {
        this.history = [];
      }
    } catch (e) {
      console.warn(`Failed to load session ${sessionId}:`, e);
      this.history = [];
    }
  }

  save() {
    const sessionFile = this.getSessionFile(this.currentSessionId);
    try {
      fs.writeFileSync(sessionFile, JSON.stringify({ history: this.history }, null, 2));
    } catch (e) {
      console.warn(`Failed to save session ${this.currentSessionId}:`, e);
    }
  }

  add(role, content, context = {}) {
    // context can contain userId/sessionId
    const sessionId = context.sessionId || "default";
    if (this.currentSessionId !== sessionId) {
      this.load(sessionId);
    }

    const msg = { role, content };
    if (context.userId) msg.name = context.userId;
    
    this.history.push(msg);
    this.save();
  }

  getMessages(sessionId = "default") {
    if (this.currentSessionId !== sessionId) {
      this.load(sessionId);
    }
    return [...this.history];
  }

  getRecentMessages(limit = 15, sessionId = "default") {
    const history = this.getMessages(sessionId);
    if (history.length <= limit) return history;
    return history.slice(-limit);
  }

  clear(sessionId = "default") {
    if (this.currentSessionId !== sessionId) {
      this.currentSessionId = sessionId;
    }
    this.history = [];
    this.save();
  }
}

module.exports = { Memory };
