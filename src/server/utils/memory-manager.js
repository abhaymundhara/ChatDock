/**
 * Memory Manager
 * Manages persistent memory files for maintaining context across sessions
 * Enhanced with Clawdbot-style two-layer storage and FTS5 search
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

// For SQLite with FTS5 - using better-sqlite3 (sync, simpler)
let Database;
try {
  Database = require("better-sqlite3");
} catch {
  // Fallback to in-memory only if better-sqlite3 not available
  Database = null;
}

class MemoryManager {
  constructor(options = {}) {
    // Memory directory: ~/ChatDock/Memory/
    this.memoryDir =
      options.memoryDir || path.join(os.homedir(), "ChatDock", "Memory");
    this.userMemoryFile = path.join(this.memoryDir, "user.md");
    this.systemMemoryFile = path.join(this.memoryDir, "chatdock.md");
    
    // Clawdbot-style two-layer storage
    this.dailyDir = path.join(this.memoryDir, "daily");
    this.longTermFile = path.join(this.memoryDir, "MEMORY.md");
    this.dbPath = path.join(this.memoryDir, ".memory.sqlite");
    this.db = null;

    // In-memory cache
    this.userMemory = null;
    this.systemMemory = null;
    this.initialized = false;

    // Ensure memory directory exists
    this.initialize();
  }

  /**
   * Initialize memory directory and files
   */
  initialize() {
    try {
      // Create memory directory if it doesn't exist
      if (!fs.existsSync(this.memoryDir)) {
        fs.mkdirSync(this.memoryDir, { recursive: true });
        console.log(`[memory] Created memory directory: ${this.memoryDir}`);
      }

      // Create daily logs directory
      if (!fs.existsSync(this.dailyDir)) {
        fs.mkdirSync(this.dailyDir, { recursive: true });
        console.log(`[memory] Created daily logs directory: ${this.dailyDir}`);
      }

      // Create user.md if it doesn't exist
      if (!fs.existsSync(this.userMemoryFile)) {
        const defaultUserMemory = `# User Profile

## Preferences
- (No preferences stored yet)

## Projects
- (No projects tracked yet)

## History
- (No history yet)

---
*This file is automatically updated as ChatDock learns about you.*
`;
        fs.writeFileSync(this.userMemoryFile, defaultUserMemory, "utf-8");
        console.log(`[memory] Created user memory: ${this.userMemoryFile}`);
      }

      // Create chatdock.md if it doesn't exist
      if (!fs.existsSync(this.systemMemoryFile)) {
        const defaultSystemMemory = `# ChatDock Identity

You are ChatDock, a local AI assistant running on the user's machine.

## Core Behaviors
- Always confirm before destructive actions
- Prefer surgical edits over full file rewrites
- Cite sources when presenting research
- Learn and remember user preferences

## Session History
- (No sessions yet)

---
*This file tracks ChatDock's identity and learned behaviors.*
`;
        fs.writeFileSync(this.systemMemoryFile, defaultSystemMemory, "utf-8");
        console.log(`[memory] Created system memory: ${this.systemMemoryFile}`);
      }

      // Create MEMORY.md (long-term memory) if it doesn't exist
      if (!fs.existsSync(this.longTermFile)) {
        const defaultLongTermMemory = `# Long-term Memory

This file contains important facts, preferences, and lessons learned.
The agent saves critical information here that should persist indefinitely.

---

`;
        fs.writeFileSync(this.longTermFile, defaultLongTermMemory, "utf-8");
        console.log(`[memory] Created long-term memory: ${this.longTermFile}`);
      }

      // Load into cache
      this.loadMemory();
      
      // Setup FTS5 database
      this._setupDatabase();
      this._indexExistingMemories();
      
      this.initialized = true;
    } catch (error) {
      console.error(`[memory] Failed to initialize:`, error.message);
    }
  }

  /**
   * Setup SQLite database with FTS5
   */
  _setupDatabase() {
    if (!Database) {
      console.warn("[memory] better-sqlite3 not available, search will use fallback");
      this.memoryIndex = new Map();
      return;
    }

    try {
      this.db = new Database(this.dbPath);
      this.db.pragma("journal_mode = WAL");

      // Create memories table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          source TEXT NOT NULL,
          tags TEXT,
          permanent INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);

      // Create FTS5 virtual table for search
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
          id,
          content,
          tags,
          content=memories,
          content_rowid=rowid
        )
      `);

      // Create triggers to keep FTS in sync
      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
          INSERT INTO memories_fts(rowid, id, content, tags) 
          VALUES (new.rowid, new.id, new.content, new.tags);
        END
      `);

      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
          INSERT INTO memories_fts(memories_fts, rowid, id, content, tags) 
          VALUES ('delete', old.rowid, old.id, old.content, old.tags);
        END
      `);

      console.log("[memory] SQLite FTS5 database ready");
    } catch (error) {
      console.error("[memory] Database setup failed:", error.message);
      this.db = null;
      this.memoryIndex = new Map();
    }
  }

  /**
   * Index existing memory files
   */
  _indexExistingMemories() {
    if (!this.db) return;

    // Index MEMORY.md
    if (fs.existsSync(this.longTermFile)) {
      const content = fs.readFileSync(this.longTermFile, "utf-8");
      this._indexContent(content, "MEMORY.md", true);
    }

    // Index daily logs
    if (fs.existsSync(this.dailyDir)) {
      const files = fs.readdirSync(this.dailyDir).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        const filePath = path.join(this.dailyDir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        this._indexContent(content, file, false);
      }
    }
  }

  /**
   * Index content by splitting into chunks
   */
  _indexContent(content, source, permanent) {
    if (!this.db) return;

    const chunks = this._chunkContent(content);
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memories (id, content, source, tags, permanent, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const chunk of chunks) {
      if (chunk.trim().length < 10) continue;
      const id = this._generateId(source, chunk);
      const now = new Date().toISOString();
      const tags = this._extractTags(chunk);
      try {
        stmt.run(id, chunk, source, tags.join(","), permanent ? 1 : 0, now, now);
      } catch {
        // Ignore duplicates
      }
    }
  }

  /**
   * Split content into searchable chunks
   */
  _chunkContent(content) {
    return content
      .split(/\n## |\n\n+/)
      .filter(Boolean)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
  }

  /**
   * Extract tags from content
   */
  _extractTags(content) {
    const tags = [];
    const hashtagMatches = content.match(/#\w+/g);
    if (hashtagMatches) {
      tags.push(...hashtagMatches.map((t) => t.slice(1).toLowerCase()));
    }
    const keyPhrases = ["preference", "project", "remember", "important", "note"];
    for (const phrase of keyPhrases) {
      if (content.toLowerCase().includes(phrase)) {
        tags.push(phrase);
      }
    }
    return [...new Set(tags)];
  }

  /**
   * Generate a unique ID for a memory chunk
   */
  _generateId(source, content) {
    const hash = crypto
      .createHash("sha256")
      .update(source + content.substring(0, 100))
      .digest("hex")
      .substring(0, 12);
    return `mem_${hash}`;
  }

  /**
   * Get today's daily log file path
   */
  _getTodayLogPath() {
    const today = new Date().toISOString().split("T")[0];
    return path.join(this.dailyDir, `${today}.md`);
  }

  /**
   * Load memory files into cache
   */
  loadMemory() {
    try {
      this.userMemory = fs.readFileSync(this.userMemoryFile, "utf-8");
      this.systemMemory = fs.readFileSync(this.systemMemoryFile, "utf-8");
      console.log(
        `[memory] Loaded user memory (${this.userMemory.length} chars)`,
      );
      console.log(
        `[memory] Loaded system memory (${this.systemMemory.length} chars)`,
      );
    } catch (error) {
      console.error(`[memory] Failed to load memory:`, error.message);
    }
  }

  /**
   * Get user memory content
   * @returns {string}
   */
  getUserMemory() {
    if (!this.userMemory) {
      this.loadMemory();
    }
    return this.userMemory || "";
  }

  /**
   * Get system memory content
   * @returns {string}
   */
  getSystemMemory() {
    if (!this.systemMemory) {
      this.loadMemory();
    }
    return this.systemMemory || "";
  }

  /**
   * Get combined memory for context window
   * @returns {string}
   */
  getCombinedMemory() {
    const user = this.getUserMemory();
    const system = this.getSystemMemory();
    const recent = this.getRecentContext(3); // Last 3 days

    return `## Persistent Memory

### User Context
${user}

### System Context
${system}

### Recent Memory
${recent}
`;
  }

  /**
   * Save content to memory (Clawdbot-style)
   * @param {string} content - Content to save
   * @param {Object} options
   * @param {string[]} options.tags - Optional tags
   * @param {boolean} options.permanent - If true, also save to MEMORY.md
   * @returns {Object} - Saved memory info
   */
  save(content, options = {}) {
    const { tags = [], permanent = false } = options;
    const timestamp = new Date().toISOString();
    const id = this._generateId(timestamp, content);

    // Always append to today's daily log
    const dailyPath = this._getTodayLogPath();
    const tagStr = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
    const entry = `\n## ${timestamp}${tagStr}\n\n${content}\n`;

    if (!fs.existsSync(dailyPath)) {
      const date = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      fs.writeFileSync(dailyPath, `# Daily Log - ${date}\n`);
    }
    fs.appendFileSync(dailyPath, entry);

    // If permanent, also append to MEMORY.md
    if (permanent) {
      fs.appendFileSync(this.longTermFile, entry);
    }

    // Index in database
    const source = permanent ? "MEMORY.md" : path.basename(dailyPath);
    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO memories (id, content, source, tags, permanent, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(id, content, source, tags.join(","), permanent ? 1 : 0, timestamp, timestamp);
    }

    console.log(`[memory] Saved: ${id} (permanent: ${permanent})`);
    return { id, saved: true, permanent, source };
  }

  /**
   * Search memories using FTS5
   * @param {string} query - Search query
   * @param {number} limit - Max results
   * @returns {Array} - Matching memories with snippets
   */
  search(query, limit = 10) {
    if (!this.db) {
      // Fallback to simple search in memory index
      const results = [];
      if (this.memoryIndex) {
        for (const [id, mem] of this.memoryIndex) {
          if (mem.content.toLowerCase().includes(query.toLowerCase())) {
            results.push({ ...mem, score: 1 });
            if (results.length >= limit) break;
          }
        }
      }
      return results;
    }

    try {
      const stmt = this.db.prepare(`
        SELECT 
          m.id,
          m.content,
          m.source,
          m.tags,
          m.permanent,
          m.created_at,
          bm25(memories_fts) as score,
          snippet(memories_fts, 1, '**', '**', '...', 32) as snippet
        FROM memories_fts
        JOIN memories m ON memories_fts.id = m.id
        WHERE memories_fts MATCH ?
        ORDER BY bm25(memories_fts)
        LIMIT ?
      `);

      const safeQuery = query
        .replace(/['"]/g, "")
        .split(/\s+/)
        .map((w) => `${w}*`)
        .join(" ");
      return stmt.all(safeQuery, limit);
    } catch (error) {
      console.error("[memory] Search error:", error.message);
      // Fallback to LIKE search
      try {
        const stmt = this.db.prepare(`
          SELECT id, content, source, tags, permanent, created_at, 0 as score
          FROM memories
          WHERE content LIKE ?
          LIMIT ?
        `);
        return stmt.all(`%${query}%`, limit);
      } catch {
        return [];
      }
    }
  }

  /**
   * Get a specific memory by ID
   * @param {string} id - Memory ID
   * @returns {Object|null} - Memory or null if not found
   */
  get(id) {
    if (!this.db) {
      return this.memoryIndex?.get(id) || null;
    }
    const stmt = this.db.prepare("SELECT * FROM memories WHERE id = ?");
    return stmt.get(id) || null;
  }

  /**
   * Get recent memory context for last N days
   * @param {number} days - Number of days to include
   * @returns {string} - Formatted memory context
   */
  getRecentContext(days = 7) {
    const context = [];
    const now = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      const logPath = path.join(this.dailyDir, `${dateStr}.md`);

      if (fs.existsSync(logPath)) {
        const content = fs.readFileSync(logPath, "utf-8");
        const truncated =
          content.length > 2000
            ? content.substring(0, 2000) + "\n...[truncated]"
            : content;
        context.push(truncated);
      }
    }

    // Include long-term memory highlights
    if (fs.existsSync(this.longTermFile)) {
      const longTermContent = fs.readFileSync(this.longTermFile, "utf-8");
      const truncated =
        longTermContent.length > 3000
          ? longTermContent.substring(0, 3000) + "\n...[truncated]"
          : longTermContent;
      context.unshift(`## Long-term Memory\n\n${truncated}`);
    }

    return context.join("\n\n---\n\n");
  }

  /**
   * Update user memory with new information
   * @param {string} section - Section to update (preferences, projects, history)
   * @param {string} content - Content to add or update
   */
  updateUserMemory(section, content) {
    try {
      let memory = this.getUserMemory();

      // Find the section
      const sectionRegex = new RegExp(`## ${section}[\\s\\S]*?(?=##|$)`, "i");
      const match = memory.match(sectionRegex);

      if (match) {
        // Section exists, append to it
        const existingSection = match[0];
        const updatedSection = existingSection.trimEnd() + `\n- ${content}`;
        memory = memory.replace(sectionRegex, updatedSection);
      } else {
        // Section doesn't exist, create it
        memory += `\n## ${section}\n- ${content}\n`;
      }

      // Save to file and cache
      fs.writeFileSync(this.userMemoryFile, memory, "utf-8");
      this.userMemory = memory;

      console.log(`[memory] Updated user memory: ${section}`);
      return true;
    } catch (error) {
      console.error(`[memory] Failed to update user memory:`, error.message);
      return false;
    }
  }

  /**
   * Update system memory with new behaviors or learnings
   * @param {string} section - Section to update
   * @param {string} content - Content to add
   */
  updateSystemMemory(section, content) {
    try {
      let memory = this.getSystemMemory();

      // Find the section
      const sectionRegex = new RegExp(`## ${section}[\\s\\S]*?(?=##|$)`, "i");
      const match = memory.match(sectionRegex);

      if (match) {
        const existingSection = match[0];
        const updatedSection = existingSection.trimEnd() + `\n- ${content}`;
        memory = memory.replace(sectionRegex, updatedSection);
      } else {
        memory += `\n## ${section}\n- ${content}\n`;
      }

      fs.writeFileSync(this.systemMemoryFile, memory, "utf-8");
      this.systemMemory = memory;

      console.log(`[memory] Updated system memory: ${section}`);
      return true;
    } catch (error) {
      console.error(`[memory] Failed to update system memory:`, error.message);
      return false;
    }
  }

  /**
   * Log a session event
   * @param {string} event - Event description
   */
  logSession(event) {
    const timestamp = new Date().toISOString();
    const entry = `${timestamp}: ${event}`;
    return this.updateSystemMemory("Session History", entry);
  }

  /**
   * Extract learnings from conversation
   * @param {Array} messages - Conversation messages
   * @returns {Object} - Extracted learnings
   */
  extractLearnings(messages) {
    const learnings = {
      preferences: [],
      projects: [],
      tools: [],
    };

    // Simple keyword-based extraction
    for (const msg of messages) {
      if (msg.role === "user") {
        const content = msg.content.toLowerCase();

        // Detect preferences
        if (content.includes("i prefer") || content.includes("i like")) {
          learnings.preferences.push(msg.content);
        }

        // Detect project mentions
        if (content.includes("project") || content.includes("working on")) {
          learnings.projects.push(msg.content);
        }
      }

      // Track tool usage
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          learnings.tools.push(tc.function.name);
        }
      }
    }

    return learnings;
  }

  /**
   * Save conversation learnings to memory
   * @param {Array} messages - Conversation messages
   */
  saveConversationLearnings(messages) {
    const learnings = this.extractLearnings(messages);

    // Save preferences
    for (const pref of learnings.preferences) {
      this.updateUserMemory("Preferences", pref);
    }

    // Save projects
    for (const proj of learnings.projects) {
      this.updateUserMemory("Projects", proj);
    }

    // Update tool usage history
    if (learnings.tools.length > 0) {
      const toolSummary = `Used tools: ${[...new Set(learnings.tools)].join(", ")}`;
      this.updateUserMemory("History", toolSummary);
    }
  }

  /**
   * Flush pending writes (for graceful shutdown)
   */
  flush() {
    if (this.db) {
      try {
        this.db.pragma("wal_checkpoint(TRUNCATE)");
      } catch (error) {
        console.error("[memory] Flush error:", error.message);
      }
    }
    console.log("[memory] Flushed");
  }

  /**
   * Close the database connection
   */
  close() {
    if (this.db) {
      this.flush();
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Get stats about stored memories
   */
  getStats() {
    if (!this.db) {
      return { count: this.memoryIndex?.size || 0, dbAvailable: false };
    }

    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM memories");
    const { count } = stmt.get();

    const permanentStmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM memories WHERE permanent = 1",
    );
    const { count: permanentCount } = permanentStmt.get();

    return {
      total: count,
      permanent: permanentCount,
      daily: count - permanentCount,
      dbAvailable: true,
    };
  }

  /**
   * Clear all memory (factory reset)
   */
  clearMemory() {
    try {
      if (fs.existsSync(this.userMemoryFile)) {
        fs.unlinkSync(this.userMemoryFile);
      }
      if (fs.existsSync(this.systemMemoryFile)) {
        fs.unlinkSync(this.systemMemoryFile);
      }
      if (fs.existsSync(this.longTermFile)) {
        fs.unlinkSync(this.longTermFile);
      }

      // Clear daily logs
      if (fs.existsSync(this.dailyDir)) {
        const files = fs.readdirSync(this.dailyDir);
        for (const file of files) {
          fs.unlinkSync(path.join(this.dailyDir, file));
        }
      }

      // Clear database
      if (this.db) {
        this.db.exec("DELETE FROM memories");
        this.db.exec("DELETE FROM memories_fts");
      }

      this.userMemory = null;
      this.systemMemory = null;

      this.initialize();
      console.log(`[memory] Memory cleared and reset`);
      return true;
    } catch (error) {
      console.error(`[memory] Failed to clear memory:`, error.message);
      return false;
    }
  }
}

module.exports = { MemoryManager };

