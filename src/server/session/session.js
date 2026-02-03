/**
 * Session Manager
 * Manages conversation sessions for multi-user support
 */

const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

class SessionManager {
  constructor(config = {}) {
    this.config = config;
    this.sessionsDir = path.join(config.userDataPath || ".", "sessions");
    this.sessions = new Map(); // sessionId -> Session
    this.defaultSessionId = "default";
    
    // Ensure sessions directory exists
    try {
      if (!fs.existsSync(this.sessionsDir)) {
        fs.mkdirSync(this.sessionsDir, { recursive: true });
      }
    } catch (e) {
      console.error("[session] Failed to create sessions directory:", e);
    }
  }

  /**
   * Create a new session
   * @param {Object} options - Session options
   * @returns {Session}
   */
  create({ id, userId, channelId, metadata } = {}) {
    const sessionId = id || uuidv4();
    const session = new Session({
      id: sessionId,
      userId,
      channelId,
      metadata,
      sessionsDir: this.sessionsDir,
    });
    
    this.sessions.set(sessionId, session);
    console.log(`[session] Created session: ${sessionId}`);
    return session;
  }

  /**
   * Get or create a session
   * @param {string} sessionId - Session ID
   * @param {Object} options - Options for creating if not exists
   * @returns {Session}
   */
  getOrCreate(sessionId, options = {}) {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId);
    }
    
    // Try to load from disk
    const session = this._loadFromDisk(sessionId);
    if (session) {
      this.sessions.set(sessionId, session);
      return session;
    }
    
    // Create new
    return this.create({ id: sessionId, ...options });
  }

  /**
   * Get a session
   * @param {string} sessionId - Session ID
   * @returns {Session|null}
   */
  get(sessionId) {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId);
    }
    
    // Try to load from disk
    const session = this._loadFromDisk(sessionId);
    if (session) {
      this.sessions.set(sessionId, session);
      return session;
    }
    
    return null;
  }

  /**
   * Get or create the default session (for backward compatibility)
   * @returns {Session}
   */
  getDefault() {
    return this.getOrCreate(this.defaultSessionId);
  }

  /**
   * List all sessions
   * @returns {Array}
   */
  list() {
    const sessions = [];
    
    // From memory
    for (const [id, session] of this.sessions) {
      sessions.push(session.getInfo());
    }
    
    // From disk (not loaded yet)
    try {
      const files = fs.readdirSync(this.sessionsDir);
      for (const file of files) {
        if (file.endsWith(".json")) {
          const id = file.replace(".json", "");
          if (!this.sessions.has(id)) {
            sessions.push({ id, loaded: false });
          }
        }
      }
    } catch (e) {
      // ignore
    }
    
    return sessions;
  }

  /**
   * Delete a session
   * @param {string} sessionId - Session ID
   * @returns {boolean}
   */
  delete(sessionId) {
    this.sessions.delete(sessionId);
    
    const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return true;
    } catch (e) {
      console.error("[session] Failed to delete session:", e);
      return false;
    }
  }

  /**
   * Load a session from disk
   * @private
   */
  _loadFromDisk(sessionId) {
    const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        const session = new Session({
          ...data,
          sessionsDir: this.sessionsDir,
        });
        console.log(`[session] Loaded session from disk: ${sessionId}`);
        return session;
      }
    } catch (e) {
      console.error(`[session] Failed to load session ${sessionId}:`, e);
    }
    return null;
  }
}

/**
 * Session Class
 * Represents a single conversation session
 */
class Session {
  constructor({ id, userId, channelId, metadata, sessionsDir, history } = {}) {
    this.id = id;
    this.userId = userId;
    this.channelId = channelId;
    this.metadata = metadata || {};
    this.history = history || [];
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();
    this.sessionsDir = sessionsDir;
  }

  /**
   * Add a message to the session
   * @param {string} role - Message role (user, assistant, tool)
   * @param {string} content - Message content
   * @param {Object} metadata - Optional metadata
   */
  addMessage(role, content, metadata = {}) {
    this.history.push({
      role,
      content,
      timestamp: Date.now(),
      ...metadata,
    });
    this.lastActivityAt = Date.now();
    this.save();
  }

  /**
   * Get messages from this session
   * @param {number} limit - Max messages to return
   * @returns {Array}
   */
  getMessages(limit) {
    if (limit && this.history.length > limit) {
      return this.history.slice(-limit);
    }
    return [...this.history];
  }

  /**
   * Clear history
   */
  clear() {
    this.history = [];
    this.save();
  }

  /**
   * Get session info
   * @returns {Object}
   */
  getInfo() {
    return {
      id: this.id,
      userId: this.userId,
      channelId: this.channelId,
      messageCount: this.history.length,
      createdAt: this.createdAt,
      lastActivityAt: this.lastActivityAt,
      loaded: true,
    };
  }

  /**
   * Save session to disk
   */
  save() {
    if (!this.sessionsDir) return;
    
    const filePath = path.join(this.sessionsDir, `${this.id}.json`);
    try {
      const data = {
        id: this.id,
        userId: this.userId,
        channelId: this.channelId,
        metadata: this.metadata,
        history: this.history,
        createdAt: this.createdAt,
        lastActivityAt: this.lastActivityAt,
      };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      console.error(`[session] Failed to save session ${this.id}:`, e);
    }
  }
}

module.exports = { SessionManager, Session };
