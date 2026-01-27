/**
 * Conversation Store
 * Persists and retrieves conversation history for context continuity
 * Implements ClawdBot-style "search over injection" pattern
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

class ConversationStore {
  constructor(options = {}) {
    // Storage directory
    this.baseDir =
      options.baseDir || path.join(os.homedir(), "ChatDock", "Memory");
    this.conversationsDir = path.join(this.baseDir, "conversations");

    // Configuration
    this.maxHistoryLength = options.maxHistoryLength || 20; // Max messages to keep in memory
    this.maxStoredConversations = options.maxStoredConversations || 50; // Max conversation files

    // In-memory cache of current session
    this.currentSession = {
      id: this._generateSessionId(),
      messages: [],
      startedAt: new Date().toISOString(),
    };

    // Initialize
    this._ensureDirectories();
    
    // Load most recent conversation for context continuity
    this._loadRecentConversation();
  }

  /**
   * Generate a unique session ID
   */
  _generateSessionId() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString("hex");
    return `${timestamp}-${random}`;
  }

  /**
   * Ensure storage directories exist
   */
  _ensureDirectories() {
    if (!fs.existsSync(this.conversationsDir)) {
      fs.mkdirSync(this.conversationsDir, { recursive: true });
    }
  }

  /**
   * Load most recent conversation file to bootstrap context
   * This ensures context continuity across server restarts
   */
  _loadRecentConversation() {
    try {
      const files = fs.readdirSync(this.conversationsDir);
      const mdFiles = files
        .filter((f) => f.endsWith(".md"))
        .sort()
        .reverse();

      if (mdFiles.length === 0) return;

      // Load the most recent conversation file
      const recentFile = mdFiles[0];
      const content = fs.readFileSync(
        path.join(this.conversationsDir, recentFile),
        "utf-8"
      );

      // Parse messages from Markdown format
      const lines = content.split("\n");
      const messages = [];

      for (const line of lines) {
        if (line.startsWith("**User:**")) {
          messages.push({
            role: "user",
            content: line.replace(/^\*\*User:\*\*\s*/, "").trim(),
          });
        } else if (line.startsWith("**Assistant:**")) {
          messages.push({
            role: "assistant",
            content: line.replace(/^\*\*Assistant:\*\*\s*/, "").trim(),
          });
        }
      }

      // Only load recent messages (last N)
      const recentMessages = messages.slice(-this.maxHistoryLength);
      this.currentSession.messages = recentMessages;

      console.log(
        `[conversation-store] Loaded ${recentMessages.length} messages from ${recentFile}`
      );
    } catch (err) {
      console.error(
        "[conversation-store] Failed to load recent conversation:",
        err.message
      );
    }
  }

  /**
   * Add a message to the current conversation
   * @param {Object} message - { role: 'user'|'assistant', content: string }
   */
  addMessage(message) {
    const enrichedMessage = {
      ...message,
      timestamp: new Date().toISOString(),
    };

    this.currentSession.messages.push(enrichedMessage);

    // Trim if exceeds max length (keep most recent)
    if (this.currentSession.messages.length > this.maxHistoryLength * 2) {
      this.currentSession.messages = this.currentSession.messages.slice(
        -this.maxHistoryLength
      );
    }

    // Auto-save periodically
    if (this.currentSession.messages.length % 4 === 0) {
      this._saveCurrentSession();
    }

    return enrichedMessage;
  }

  /**
   * Add a user message and assistant response pair
   * @param {string} userMessage
   * @param {string} assistantResponse
   */
  addExchange(userMessage, assistantResponse) {
    this.addMessage({ role: "user", content: userMessage });
    this.addMessage({ role: "assistant", content: assistantResponse });
    this._saveCurrentSession();
  }

  /**
   * Get recent conversation history
   * @param {number} limit - Number of messages to return
   * @returns {Array} Recent messages
   */
  getRecentHistory(limit = 10) {
    const messages = this.currentSession.messages.slice(-limit);
    return messages.map(({ role, content }) => ({ role, content }));
  }

  /**
   * Get full conversation context formatted for LLM
   * @param {number} limit - Number of recent messages
   * @returns {string} Formatted context
   */
  getFormattedContext(limit = 6) {
    const recent = this.getRecentHistory(limit);
    if (recent.length === 0) return "";

    const formatted = recent
      .map((m) => {
        const role = m.role === "user" ? "User" : "Assistant";
        return `${role}: ${m.content}`;
      })
      .join("\n\n");

    return `## Recent Conversation Context\n\n${formatted}`;
  }

  /**
   * Search past conversations for relevant context
   * Uses simple keyword matching (can be enhanced with embeddings later)
   * @param {string} query
   * @param {number} limit
   * @returns {Array} Relevant message snippets
   */
  searchRelevant(query, limit = 5) {
    const results = [];
    const queryTerms = query.toLowerCase().split(/\s+/);

    // Search current session first
    for (const msg of this.currentSession.messages) {
      const content = msg.content.toLowerCase();
      const matchCount = queryTerms.filter((term) =>
        content.includes(term)
      ).length;
      if (matchCount > 0) {
        results.push({
          ...msg,
          score: matchCount / queryTerms.length,
          source: "current",
        });
      }
    }

    // Search saved conversations
    try {
      const files = fs.readdirSync(this.conversationsDir);
      const mdFiles = files
        .filter((f) => f.endsWith(".md"))
        .sort()
        .reverse()
        .slice(0, 10); // Check last 10 sessions

      for (const file of mdFiles) {
        const content = fs.readFileSync(
          path.join(this.conversationsDir, file),
          "utf-8"
        );
        const contentLower = content.toLowerCase();
        const matchCount = queryTerms.filter((term) =>
          contentLower.includes(term)
        ).length;

        if (matchCount > 0) {
          // Extract relevant snippets
          const lines = content.split("\n");
          for (const line of lines) {
            if (
              line.startsWith("**User:**") ||
              line.startsWith("**Assistant:**")
            ) {
              const lineLower = line.toLowerCase();
              if (queryTerms.some((term) => lineLower.includes(term))) {
                results.push({
                  content: line.replace(/^\*\*(User|Assistant):\*\*\s*/, ""),
                  role: line.startsWith("**User:**") ? "user" : "assistant",
                  score: matchCount / queryTerms.length,
                  source: file,
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("[conversation-store] Search error:", err.message);
    }

    // Sort by score and return top results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ role, content, source }) => ({ role, content, source }));
  }

  /**
   * Get context with semantic relevance
   * Combines recent history + relevant past context
   * @param {string} currentQuery - Current user message for relevance search
   * @param {Object} options
   * @returns {Object} { recent: Array, relevant: Array }
   */
  getContextForQuery(currentQuery, options = {}) {
    const { recentLimit = 6, relevantLimit = 3 } = options;

    return {
      recent: this.getRecentHistory(recentLimit),
      relevant: this.searchRelevant(currentQuery, relevantLimit),
    };
  }

  /**
   * Save current session to disk
   */
  _saveCurrentSession() {
    if (this.currentSession.messages.length === 0) return;

    try {
      const filename = `${this.currentSession.startedAt.split("T")[0]}_${this.currentSession.id}.md`;
      const filepath = path.join(this.conversationsDir, filename);

      const content = this._formatSessionAsMarkdown();
      fs.writeFileSync(filepath, content, "utf-8");

      // Cleanup old files
      this._cleanupOldSessions();
    } catch (err) {
      console.error("[conversation-store] Save error:", err.message);
    }
  }

  /**
   * Format current session as Markdown
   */
  _formatSessionAsMarkdown() {
    const lines = [
      `# Conversation - ${this.currentSession.startedAt}`,
      "",
      `Session ID: ${this.currentSession.id}`,
      "",
      "---",
      "",
    ];

    for (const msg of this.currentSession.messages) {
      const role = msg.role === "user" ? "User" : "Assistant";
      const time = msg.timestamp
        ? new Date(msg.timestamp).toLocaleTimeString()
        : "";
      lines.push(`**${role}:** ${msg.content}`);
      if (time) lines.push(`*${time}*`);
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Clean up old conversation files
   */
  _cleanupOldSessions() {
    try {
      const files = fs.readdirSync(this.conversationsDir);
      const mdFiles = files.filter((f) => f.endsWith(".md")).sort();

      if (mdFiles.length > this.maxStoredConversations) {
        const toDelete = mdFiles.slice(
          0,
          mdFiles.length - this.maxStoredConversations
        );
        for (const file of toDelete) {
          fs.unlinkSync(path.join(this.conversationsDir, file));
        }
        console.log(
          `[conversation-store] Cleaned up ${toDelete.length} old sessions`
        );
      }
    } catch (err) {
      console.error("[conversation-store] Cleanup error:", err.message);
    }
  }

  /**
   * Start a new session (preserves history file)
   */
  newSession() {
    this._saveCurrentSession();
    this.currentSession = {
      id: this._generateSessionId(),
      messages: [],
      startedAt: new Date().toISOString(),
    };
    return this.currentSession.id;
  }

  /**
   * Clear current session (without saving)
   */
  clear() {
    this.currentSession.messages = [];
  }

  /**
   * Force save current session
   */
  flush() {
    this._saveCurrentSession();
  }

  /**
   * Get session stats
   */
  getStats() {
    let totalSessions = 0;
    try {
      const files = fs.readdirSync(this.conversationsDir);
      totalSessions = files.filter((f) => f.endsWith(".md")).length;
    } catch {}

    return {
      sessionId: this.currentSession.id,
      currentMessages: this.currentSession.messages.length,
      startedAt: this.currentSession.startedAt,
      totalSavedSessions: totalSessions,
    };
  }
}

module.exports = { ConversationStore };
