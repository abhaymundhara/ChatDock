/**
 * Prompt Builder
 * Constructs system prompts with tools, skills, and context
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

class PromptBuilder {
  constructor(options = {}) {
    // UPDATED: Load brain from project folder instead of home directory
    const appPath = process.env.CHATDOCK_APP_PATH || process.cwd();
    this.brainDir = options.brainDir || path.join(appPath, "brain");
    this.basePrompt = this.loadBrain() || this.getDefaultBasePrompt();
    this.thinkingMode = options.thinkingMode || "balanced";
  }

  /**
   * Load SOUL.md and AGENTS.md from the brain directory
   */
  loadBrain() {
    try {
      const soulPath = path.join(this.brainDir, "SOUL.md");
      const agentsPath = path.join(this.brainDir, "AGENTS.md");

      let prompt = "";

      if (fs.existsSync(soulPath)) {
        prompt += fs.readFileSync(soulPath, "utf-8") + "\n\n";
      }

      if (fs.existsSync(agentsPath)) {
        prompt += fs.readFileSync(agentsPath, "utf-8") + "\n\n";
      }

      if (prompt.trim()) {
        return prompt;
      }
    } catch (e) {
      console.error("Failed to load brain:", e);
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

2. **PLAN MULTI-STEP TASKS**: For ANY task with multiple steps, use \`todo_write\` FIRST:
   - Example: todo_write({ title: "Find and edit file", tasks: [
       { task: "Search for the file", status: "pending" },
       { task: "Read the file content", status: "pending" },
       { task: "Make the requested changes", status: "pending" }
     ]})
   
   **Tasks requiring planning:**
   - Finding AND doing something
   - Creating/building/implementing anything
   - Analyzing, debugging, or fixing issues
   - Any request with "and", "then", or multiple actions

3. **DISCOVER TOOLS**: If you aren't 100% sure which tool to use, call \`tool_search\` first.
   - Example: tool_search({ query: "find files system" })

4. **SMART EXECUTION**:
   - **File Search**: ALWAYS search user directories (~/Documents, ~/Desktop), NOT just (.)
   - **Opening Apps**: Use \`open_app\` to launch applications
   - **Running Scripts**: Use \`run_script\` for .sh, .py, .js files
   - **Command Line**: Use \`run_command\` only when no specific tool exists.

## Critical Rules
- 🛑 DO NOT call \`run_command\` blindly. Search for a specific tool first.
- 🛑 DO NOT default to searching the current directory (.) for personal files.
- ✅ ALWAYS use absolute paths (~/...) for file operations.
- ✅ Use \`open_app\` for launching applications (e.g., "open Chrome", "launch Terminal")
- ✅ Use \`run_script\` for executing script files instead of \`run_command\`

## File Search Best Practices
When searching for user files (documents, resumes, photos, etc.):
- Search in: ~/Documents, ~/Desktop, ~/Downloads, ~/Pictures
- Use home directory (~) as base, NOT current directory (.)
- Be case-insensitive (-iname not -name)
- Limit depth for performance (-maxdepth 3)

## File Operations - CRITICAL RULES
When creating, writing, or modifying files:
1. **ALWAYS ASK FOR PATH CONFIRMATION** if not explicitly provided
   - ❌ WRONG: "I'll create test.txt" (where?)
   - ✅ CORRECT: "Where would you like me to create test.txt? (e.g., ~/Desktop, ~/Documents)"
2. **NEVER assume current directory (./) for user files**
   - Project files → OK to use current directory
   - User files → MUST ask or use explicit paths
3. **ALWAYS use absolute paths** (~/Desktop/test.txt not test.txt)

## After Tool Execution - MANDATORY
When tools return results:
1. **ACKNOWLEDGE WHAT WAS DONE** with specific details:
   - ✅ "Created test.txt at /Users/mac/Desktop with 15 bytes"
   - ❌ "Hello. How can I assist you today?"
2. **USE THE TOOL RESULTS** - don't ignore them!
   - Tool returns: { path: "/Users/mac/test.txt", bytes: 100 }
   - Response: "Created test.txt at /Users/mac/ with 100 bytes of content."
3. **NEVER give generic greetings after completing tasks**
   - ❌ "How can I help you?"
   - ✅ "Done! Created the file at [path]"

## Behavior
- If a task is complex, break it down into steps
- If you're unsure, ask for clarification
- If a tool fails, try to understand why and suggest alternatives
- Always explain what you're doing and why
- ALWAYS acknowledge completed actions with specific details from tool results`;
  }

  /**
   * Build the full system prompt
   * @param {Object} options
   * @returns {string}
   */
  build(options = {}) {
    const { tools = [], skills = "", context = {}, thinkingMode } = options;
    const mode = thinkingMode || this.thinkingMode;

    const parts = [this.basePrompt];

    // Add thinking instructions based on mode
    if (mode !== "quick") {
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

    return parts.join("\n\n");
  }

  /**
   * Get thinking instructions based on mode
   * @param {string} mode
   * @returns {string}
   */
  getThinkingInstructions(mode) {
    if (mode === "deep") {
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
    const toolList = tools
      .map((tool) => {
        const params = tool.parameters?.properties
          ? Object.entries(tool.parameters.properties)
              .map(
                ([name, prop]) =>
                  `  - ${name}: ${prop.type} - ${prop.description || ""}`,
              )
              .join("\n")
          : "  (no parameters)";

        const confirm = tool.requiresConfirmation
          ? " ⚠️ Requires confirmation"
          : "";

        return `### ${tool.name}${confirm}\n${tool.description}\nParameters:\n${params}`;
      })
      .join("\n\n");

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
    const parts = ["## Current Context"];

    if (context.cwd) {
      parts.push(`Working directory: ${context.cwd}`);
    }

    if (context.openFiles && context.openFiles.length > 0) {
      parts.push(`Open files: ${context.openFiles.join(", ")}`);
    }

    if (context.gitBranch) {
      parts.push(`Git branch: ${context.gitBranch}`);
    }

    if (context.time) {
      parts.push(`Current time: ${context.time}`);
    }

    // Add memory context
    if (context.memory) {
      parts.push(`\n${context.memory}`);
    }

    return parts.join("\n");
  }

  /**
   * Set thinking mode
   * @param {string} mode
   */
  setThinkingMode(mode) {
    if (["quick", "balanced", "deep"].includes(mode)) {
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
