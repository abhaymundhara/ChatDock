/**
 * Self-Improvement Module
 * Foundation for ClawdBot-style self-improving agent capabilities
 * 
 * This module provides:
 * - Learning extraction from conversations
 * - Pattern recognition for common tasks
 * - Skill suggestion based on repeated actions
 * - Memory updates with learned behaviors
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

class SelfImprove {
  constructor(options = {}) {
    this.memoryDir =
      options.memoryDir || path.join(os.homedir(), "ChatDock", "Memory");
    this.skillsDir =
      options.skillsDir ||
      path.join(process.cwd(), "src", "server", "skills");
    this.learningsFile = path.join(this.memoryDir, "learnings.md");

    // Pattern tracking
    this.actionPatterns = new Map(); // Track repeated actions
    this.preferencePatterns = new Map(); // Track user preferences
    this.errorPatterns = new Map(); // Track common errors for improvement
  }

  /**
   * Learn from a conversation exchange
   * @param {Array} messages - Conversation messages
   * @returns {Object} Extracted learnings
   */
  learnFromConversation(messages) {
    const learnings = {
      preferences: [],
      patterns: [],
      skillSuggestions: [],
      improvements: [],
    };

    // Analyze messages for patterns
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === "user") {
        // Extract preferences from user messages
        const prefs = this._extractPreferences(msg.content);
        learnings.preferences.push(...prefs);

        // Detect repeated task patterns
        const pattern = this._detectTaskPattern(msg.content);
        if (pattern) {
          this._trackPattern(pattern);
        }
      }

      // Look for correction patterns (user correcting the assistant)
      if (
        msg.role === "user" &&
        i > 0 &&
        messages[i - 1].role === "assistant"
      ) {
        const correction = this._detectCorrection(
          msg.content,
          messages[i - 1].content
        );
        if (correction) {
          learnings.improvements.push(correction);
        }
      }
    }

    // Check for skill creation opportunities
    const skillSuggestions = this._suggestSkills();
    learnings.skillSuggestions.push(...skillSuggestions);

    return learnings;
  }

  /**
   * Extract user preferences from message content
   * @param {string} content - User message
   * @returns {Array} Detected preferences
   */
  _extractPreferences(content) {
    const preferences = [];
    const lower = content.toLowerCase();

    // Preference indicators
    const preferencePatterns = [
      { pattern: /i prefer\s+(.+)/i, type: "explicit" },
      { pattern: /always use\s+(.+)/i, type: "instruction" },
      { pattern: /don't\s+(.+)/i, type: "avoidance" },
      { pattern: /i like\s+(.+)/i, type: "preference" },
      { pattern: /use (.+) instead/i, type: "substitute" },
    ];

    for (const { pattern, type } of preferencePatterns) {
      const match = content.match(pattern);
      if (match) {
        preferences.push({
          type,
          value: match[1].trim(),
          source: content.substring(0, 100),
        });
      }
    }

    return preferences;
  }

  /**
   * Detect task patterns for potential skill creation
   * @param {string} content - User message
   * @returns {Object|null} Detected pattern
   */
  _detectTaskPattern(content) {
    const lower = content.toLowerCase();

    // Common task categories
    const taskCategories = [
      { keywords: ["search", "find", "look for", "locate"], category: "search" },
      { keywords: ["create", "make", "generate", "build"], category: "create" },
      { keywords: ["summarize", "explain", "describe"], category: "summarize" },
      { keywords: ["convert", "transform", "change"], category: "convert" },
      { keywords: ["fix", "debug", "resolve", "solve"], category: "fix" },
      { keywords: ["open", "launch", "start"], category: "launch" },
    ];

    for (const { keywords, category } of taskCategories) {
      if (keywords.some((kw) => lower.includes(kw))) {
        return {
          category,
          content: content.substring(0, 200),
          timestamp: new Date().toISOString(),
        };
      }
    }

    return null;
  }

  /**
   * Track patterns over time
   * @param {Object} pattern
   */
  _trackPattern(pattern) {
    const key = pattern.category;
    const existing = this.actionPatterns.get(key) || { count: 0, examples: [] };

    existing.count++;
    if (existing.examples.length < 5) {
      existing.examples.push(pattern.content);
    }

    this.actionPatterns.set(key, existing);
  }

  /**
   * Detect user corrections to learn from mistakes
   * @param {string} userMessage - Current user message
   * @param {string} assistantMessage - Previous assistant response
   * @returns {Object|null} Correction pattern
   */
  _detectCorrection(userMessage, assistantMessage) {
    const correctionIndicators = [
      "no,",
      "wrong",
      "that's not",
      "i meant",
      "actually,",
      "not quite",
      "incorrect",
    ];

    const lower = userMessage.toLowerCase();
    if (correctionIndicators.some((ind) => lower.startsWith(ind))) {
      return {
        type: "correction",
        userSaid: userMessage.substring(0, 200),
        assistantSaid: assistantMessage.substring(0, 200),
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Suggest skills based on detected patterns
   * @returns {Array} Skill suggestions
   */
  _suggestSkills() {
    const suggestions = [];
    const SKILL_THRESHOLD = 3; // Suggest skill after 3 similar requests

    for (const [category, data] of this.actionPatterns) {
      if (data.count >= SKILL_THRESHOLD) {
        suggestions.push({
          category,
          count: data.count,
          examples: data.examples,
          suggestedSkillName: `auto-${category}`,
          description: `Automatically created skill for handling ${category} tasks`,
        });
      }
    }

    return suggestions;
  }

  /**
   * Save learnings to persistent storage
   * @param {Object} learnings
   */
  saveLearnings(learnings) {
    try {
      let content = "";

      if (fs.existsSync(this.learningsFile)) {
        content = fs.readFileSync(this.learningsFile, "utf-8");
      } else {
        content = "# Agent Learnings\n\nThis file tracks patterns and improvements learned from conversations.\n\n---\n\n";
      }

      const timestamp = new Date().toISOString();

      // Append new learnings
      if (learnings.preferences.length > 0) {
        content += `\n## Preferences (${timestamp})\n`;
        for (const pref of learnings.preferences) {
          content += `- **${pref.type}**: ${pref.value}\n`;
        }
      }

      if (learnings.improvements.length > 0) {
        content += `\n## Corrections/Improvements (${timestamp})\n`;
        for (const imp of learnings.improvements) {
          content += `- User corrected: "${imp.userSaid.substring(0, 50)}..."\n`;
        }
      }

      if (learnings.skillSuggestions.length > 0) {
        content += `\n## Skill Suggestions\n`;
        for (const skill of learnings.skillSuggestions) {
          content += `- **${skill.suggestedSkillName}**: ${skill.description} (${skill.count} occurrences)\n`;
        }
      }

      fs.writeFileSync(this.learningsFile, content, "utf-8");
      console.log("[self-improve] Saved learnings to", this.learningsFile);
    } catch (err) {
      console.error("[self-improve] Failed to save learnings:", err.message);
    }
  }

  /**
   * Get current pattern statistics
   * @returns {Object} Pattern stats
   */
  getStats() {
    const stats = {
      patterns: {},
      preferences: {},
      errors: {},
    };

    for (const [key, data] of this.actionPatterns) {
      stats.patterns[key] = data.count;
    }

    for (const [key, data] of this.preferencePatterns) {
      stats.preferences[key] = data;
    }

    return stats;
  }

  /**
   * Reset pattern tracking
   */
  reset() {
    this.actionPatterns.clear();
    this.preferencePatterns.clear();
    this.errorPatterns.clear();
  }
}

module.exports = { SelfImprove };
