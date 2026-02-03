/**
 * Agent Memory
 * Manages conversation history and state
 */

const fs = require("fs");
const path = require("path");

class Memory {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.history = [];
    this.sessionFile = userDataPath ? path.join(userDataPath, "session.json") : null;
  }

  load() {
    if (!this.sessionFile) return;
    try {
      if (fs.existsSync(this.sessionFile)) {
        const data = JSON.parse(fs.readFileSync(this.sessionFile, "utf-8"));
        this.history = data.history || [];
      }
    } catch (e) {
      console.warn("Failed to load session:", e);
    }
  }

  save() {
    if (!this.sessionFile) return;
    try {
      fs.writeFileSync(this.sessionFile, JSON.stringify({ history: this.history }, null, 2));
    } catch (e) {
      console.warn("Failed to save session:", e);
    }
  }

  add(role, content, name = null) {
    const msg = { role, content };
    if (name) msg.name = name;
    this.history.push(msg);
    this.save();
  }

  getMessages() {
    return [...this.history];
  }

  getRecentMessages(limit = 15) {
    if (this.history.length <= limit) return this.getMessages();
    return this.history.slice(-limit);
  }

  clear() {
    this.history = [];
    this.save();
  }
}

module.exports = { Memory };
