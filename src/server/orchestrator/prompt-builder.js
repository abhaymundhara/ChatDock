/**
 * Prompt Builder
 * Constructs system prompts with tools, skills, and context
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

class PromptBuilder {
  constructor(options = {}) {
    // UPDATED: Load brain from project folder instead of home directory
    this.brainDir = options.brainDir || path.join(process.cwd(), 'brain');
    this.basePrompt = this.loadBrain() || this.getDefaultBasePrompt();
    this.thinkingMode = options.thinkingMode || 'balanced';
  }

  /**
   * Load SOUL.md and AGENTS.md from the brain directory
   */
  loadBrain() {
    try {
      const soulPath = path.join(this.brainDir, 'SOUL.md');
      const agentsPath = path.join(this.brainDir, 'AGENTS.md');
      
      let prompt = '';
      
      if (fs.existsSync(soulPath)) {
        prompt += fs.readFileSync(soulPath, 'utf-8') + '\n\n';
      }
      
      if (fs.existsSync(agentsPath)) {
        prompt += fs.readFileSync(agentsPath, 'utf-8') + '\n\n';
      }
      
      if (prompt.trim()) {
        return prompt;
      }
    } catch (e) {
      console.error('Failed to load brain:', e);
    }
    return null;
  }

  /**
   * Get the default base system prompt
   * @returns {string}
   */
  getDefaultBasePrompt() {
    return `You are ChatDock, a smart, friendly AI assistant.

## Persona & Tone
- **Natural & Conversational**: Speak like a human, not a robot.
- **Brief**: Give the answer directly. No "I have successfully..." or "Here is the result".
- **Casual but Professional**: Use "I've created..." instead of "The directory has been created...".
- **No Fluff**: Skip headers like "## Result" unless necessary for structure.

## Core Capabilities
- You have full access to the user's system (files, terminal, web).
- You are an expert engineer and problem solver.
- Cite sources when researching.

## Tool Discovery & Planning Protocol (MANDATORY)
You have access to 50+ tools. To ensure precision, you MUST follow this protocol:

1. **THINK FIRST**: For any complex request, start by calling the \`think\` tool to plan your approach.
   - Example: think({ problem: "User wants to find their resume", depth: "balanced" })

2. **DISCOVER TOOLS**: If you aren't 100% sure which tool to use, call \`tool_search\` first.
   - Example: tool_search({ query: "find files system" })

3. **PLAN BEFORE ACTING**:
   - Create a plan using \`todo_write\` for multi-step tasks.
   - NEVER guess tool arguments. Check \`tool_info\` if unsure.

4. **SMART EXECUTION**:
   - **File Search**: ALWAYS search user directories (~/Documents, ~/Desktop), NOT just (.)
   - **Command Line**: Use \`run_command\` only when no specific tool exists.

## Critical Rules
- 🛑 DO NOT call \`run_command\` blindly. Search for a specific tool first.
- 🛑 DO NOT default to searching the current directory (.) for personal files.
- ✅ ALWAYS use absolute paths (~/...) for file operations.

## File Search Best Practices
When searching for user files (documents, resumes, photos, etc.):
- Search in: ~/Documents, ~/Desktop, ~/Downloads, ~/Pictures
- Use home directory (~) as base, NOT current directory (.)
- Be case-insensitive (-iname not -name)
- Limit depth for performance (-maxdepth 3)

## Behavior
- If a task is complex, break it down into steps
- If you're unsure, ask for clarification
- If a tool fails, try to understand why and suggest alternatives
- Always explain what you're doing and why`;
  }

  /**
   * Build the full system prompt
   * @param {Object} options
   * @returns {string}
   */
  build(options = {}) {
    const { tools = [], skills = '', context = {}, thinkingMode } = options;
    const mode = thinkingMode || this.thinkingMode;
    
    const parts = [this.basePrompt];

    // Add thinking instructions based on mode
    if (mode !== 'quick') {
      parts.push(this.getThinkingInstructions(mode));
    }

    // Add tool definitions
    if (tools.length > 0) {
      parts.push(this.formatToolSection(tools));
    }

    // Add active skills
    if (skills) {
      parts.push(`\n## Active Skills\n${skills}`);
    }

    // Add context (current directory, files, etc.)
    if (Object.keys(context).length > 0) {
      parts.push(this.formatContextSection(context));
    }

    return parts.join('\n\n');
  }

  /**
   * Get thinking instructions based on mode
   * @param {string} mode
   * @returns {string}
   */
  getThinkingInstructions(mode) {
    if (mode === 'deep') {
      return `## Extended Thinking Mode
For this complex task, think carefully through each step:
1. Analyze the request thoroughly
2. Consider multiple approaches
3. Anticipate potential issues
4. Plan your actions before executing
5. Verify results after each step

Take your time to reason through the problem. It's better to be thorough than fast.`;
    }

    // Balanced mode
    return `## Thinking
Before taking actions, briefly reason about:
- What the user is asking for
- Which tools you'll need
- The order of operations`;
  }

  /**
   * Format the tool section for the prompt
   * @param {Array} tools
   * @returns {string}
   */
  formatToolSection(tools) {
    const toolList = tools.map(tool => {
      const params = tool.parameters?.properties 
        ? Object.entries(tool.parameters.properties)
            .map(([name, prop]) => `  - ${name}: ${prop.type} - ${prop.description || ''}`)
            .join('\n')
        : '  (no parameters)';
      
      const confirm = tool.requiresConfirmation ? ' ⚠️ Requires confirmation' : '';
      
      return `### ${tool.name}${confirm}\n${tool.description}\nParameters:\n${params}`;
    }).join('\n\n');

    return `## Available Tools
You have access to the following tools. Use them as needed.

${toolList}`;
  }

  /**
   * Format the context section
   * @param {Object} context
   * @returns {string}
   */
  formatContextSection(context) {
    const parts = ['## Current Context'];

    if (context.cwd) {
      parts.push(`Working directory: ${context.cwd}`);
    }

    if (context.openFiles && context.openFiles.length > 0) {
      parts.push(`Open files: ${context.openFiles.join(', ')}`);
    }

    if (context.gitBranch) {
      parts.push(`Git branch: ${context.gitBranch}`);
    }

    if (context.time) {
      parts.push(`Current time: ${context.time}`);
    }

    return parts.join('\n');
  }

  /**
   * Set thinking mode
   * @param {string} mode
   */
  setThinkingMode(mode) {
    if (['quick', 'balanced', 'deep'].includes(mode)) {
      this.thinkingMode = mode;
    }
  }

  /**
   * Set base prompt
   * @param {string} prompt
   */
  setBasePrompt(prompt) {
    this.basePrompt = prompt;
  }
}

module.exports = { PromptBuilder };
