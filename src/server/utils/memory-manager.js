/**
 * Memory Manager
 * Manages persistent memory files for maintaining context across sessions
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

class MemoryManager {
  constructor(options = {}) {
    // Memory directory: ~/ChatDock/Memory/
    this.memoryDir =
      options.memoryDir || path.join(os.homedir(), "ChatDock", "Memory");
    this.userMemoryFile = path.join(this.memoryDir, "user.md");
    this.systemMemoryFile = path.join(this.memoryDir, "chatdock.md");

    // In-memory cache
    this.userMemory = null;
    this.systemMemory = null;

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

      // Load into cache
      this.loadMemory();
    } catch (error) {
      console.error(`[memory] Failed to initialize:`, error.message);
    }
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

    return `## Persistent Memory

### User Context
${user}

### System Context
${system}
`;
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
    // TODO: Could use LLM to extract more sophisticated patterns
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
