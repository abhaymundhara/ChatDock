/**
 * Skill Loader
 * Discovers and manages skill playbooks from the skills directory
 */

const fs = require('node:fs');
const path = require('node:path');

class SkillLoader {
  constructor(options = {}) {
    this.skills = new Map();
    this.activeSkills = new Set();
    this.skillsDir = options.skillsDir || path.join(__dirname, '../skills');
  }

  /**
   * Load all skills from the skills directory
   */
  async load() {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
      return;
    }

    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await this.loadSkill(entry.name);
      }
    }
  }

  /**
   * Load a single skill from its directory
   * @param {string} skillName
   */
  async loadSkill(skillName) {
    const skillPath = path.join(this.skillsDir, skillName, 'SKILL.md');
    
    if (!fs.existsSync(skillPath)) {
      return;
    }

    try {
      const content = fs.readFileSync(skillPath, 'utf-8');
      const { frontmatter, body } = this.parseFrontmatter(content);
      
      this.skills.set(skillName, {
        name: frontmatter.name || skillName,
        description: frontmatter.description || '',
        triggers: frontmatter.triggers || [],
        toolsUsed: frontmatter.tools_used || [],
        content: body
      });
    } catch (error) {
      console.error(`Failed to load skill ${skillName}:`, error.message);
    }
  }

  /**
   * Parse YAML frontmatter from markdown
   * @param {string} content
   * @returns {{frontmatter: Object, body: string}}
   */
  parseFrontmatter(content) {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);
    
    if (!match) {
      return { frontmatter: {}, body: content };
    }

    const frontmatterStr = match[1];
    const body = match[2];
    
    // Simple YAML parser for our use case
    const frontmatter = {};
    const lines = frontmatterStr.split('\n');
    let currentKey = null;
    let currentArray = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Array item
      if (trimmed.startsWith('- ') && currentKey) {
        if (!currentArray) {
          currentArray = [];
        }
        currentArray.push(trimmed.slice(2).trim());
        frontmatter[currentKey] = currentArray;
        continue;
      }

      // Key-value pair
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim();
        
        if (value) {
          frontmatter[key] = value;
          currentArray = null;
        } else {
          currentKey = key;
          currentArray = [];
        }
      }
    }

    return { frontmatter, body };
  }

  /**
   * Activate a skill by name
   * @param {string} name
   */
  activate(name) {
    if (this.skills.has(name)) {
      this.activeSkills.add(name);
    }
  }

  /**
   * Deactivate a skill by name
   * @param {string} name
   */
  deactivate(name) {
    this.activeSkills.delete(name);
  }

  /**
   * Auto-select skills based on user message
   * @param {string} message
   */
  autoSelect(message) {
    const messageLower = message.toLowerCase();
    
    for (const [name, skill] of this.skills) {
      for (const trigger of skill.triggers) {
        if (messageLower.includes(trigger.toLowerCase())) {
          this.activate(name);
          break;
        }
      }
    }
  }

  /**
   * Get active skill content for the prompt
   * @returns {string}
   */
  getActive() {
    const parts = [];
    
    for (const name of this.activeSkills) {
      const skill = this.skills.get(name);
      if (skill) {
        parts.push(`## Skill: ${skill.name}\n${skill.content}`);
      }
    }
    
    return parts.join('\n\n');
  }

  /**
   * Get all skill definitions
   * @returns {Array}
   */
  getDefinitions() {
    return Array.from(this.skills.values()).map(skill => ({
      name: skill.name,
      description: skill.description,
      triggers: skill.triggers
    }));
  }

  /**
   * Get the number of loaded skills
   * @returns {number}
   */
  count() {
    return this.skills.size;
  }

  /**
   * Clear active skills
   */
  clearActive() {
    this.activeSkills.clear();
  }
}

module.exports = { SkillLoader };
