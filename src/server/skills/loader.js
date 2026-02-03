/**
 * Skills Loader
 * Loads markdown-based skills (optional, loaded on demand)
 */

const fs = require("fs").promises;
const path = require("path");
const yaml = require("js-yaml");

class SkillsLoader {
  constructor() {
    this.skills = new Map(); // skill_name -> metadata + content
  }

  /**
   * Load all skills from SKILL.md files
   */
  async loadSkills() {
    try {
      const skillsDir = __dirname;
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillName = entry.name;
          const skillPath = path.join(skillsDir, skillName);

          try {
            await this.loadSkill(skillName, skillPath);
          } catch (error) {
            console.warn(
              `[skills-loader] Failed to load skill ${skillName}:`,
              error.message
            );
          }
        }
      }

      console.log(`[skills-loader] Loaded ${this.skills.size} skills`);
    } catch (error) {
      console.error("[skills-loader] Failed to load skills:", error.message);
      throw error;
    }
  }

  /**
   * Load a single skill from SKILL.md
   */
  async loadSkill(skillName, skillPath) {
    const skillFile = path.join(skillPath, "SKILL.md");

    try {
      await fs.access(skillFile);
    } catch {
      // Check for index.js (legacy tool-based skill)
      const indexPath = path.join(skillPath, "index.js");
      try {
        await fs.access(indexPath);
        // This is a legacy tool-based skill, skip it
        return;
      } catch {
        return; // Skip if no SKILL.md or index.js
      }
    }

    const content = await fs.readFile(skillFile, "utf-8");

    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
      console.warn(`[skills-loader] ${skillName}: No frontmatter found`);
      return;
    }

    const frontmatter = yaml.load(frontmatterMatch[1]);
    const markdown = frontmatterMatch[2].trim();

    this.skills.set(skillName, {
      name: frontmatter.name || skillName,
      description: frontmatter.description || "",
      metadata: frontmatter.metadata || {},
      content: markdown,
      path: skillFile,
    });

    console.log(`[skills-loader] Loaded skill '${frontmatter.name || skillName}'`);
  }

  /**
   * Get all skills
   */
  getAllSkills() {
    return Array.from(this.skills.values());
  }

  /**
   * Get a specific skill
   */
  getSkill(name) {
    return this.skills.get(name);
  }

  /**
   * Build a summary of available skills
   */
  buildSkillsSummary() {
    const skills = this.getAllSkills();
    if (skills.length === 0) return "";

    const lines = ["Available Skills:", ""];
    for (const skill of skills) {
      const emoji = skill.metadata?.emoji || "📄";
      lines.push(`${emoji} **${skill.name}**: ${skill.description}`);
      lines.push(`   Path: ${skill.path}`);
      lines.push("");
    }

    return lines.join("\n");
  }
}

// Singleton
let instance = null;
function getSkillsLoader() {
  if (!instance) instance = new SkillsLoader();
  return instance;
}

module.exports = { SkillsLoader, getSkillsLoader };
