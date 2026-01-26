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

## Workflow Protocol (MANDATORY)
You have access to 50+ tools. You MUST follow this exact order:

1. **TASKS FIRST**: Always call \`task_write\` for EVERY request (simple or complex).
   - Example: task_write({ title: "Find and edit file", tasks: [
       { task: "Search for the file", status: "pending" },
       { task: "Read the file content", status: "pending" },
       { task: "Make the requested changes", status: "pending" }
     ]})
   - If needed, you MAY call \`think\` AFTER \`task_write\`, never instead of it.

2. **OPTIONAL CONFIRMATION**: If the user should confirm or edit tasks, call \`ask_user\` AFTER \`task_write\`.

3. **TOOL DISCOVERY**: If tools are needed, call \`tool_finder\` BEFORE any other tool.
   - Example: tool_finder({ query: "find files system" })
   - Do NOT bundle \`tool_finder\` with execution tools in the same response.
   - **AFTER tool_finder**: IMMEDIATELY execute the discovered tool - do NOT ask for permission!
   - ❌ WRONG: "Would you like me to use web_search?"
   - ✅ CORRECT: Immediately call web_search({ query: "latest news" })

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
1. **USE COMMON SENSE FOR AMBIGUOUS REQUESTS**
   - "open notes" → Search ~/Documents for notes files OR open Notes app
   - "create test.txt" → Ask where to save ONLY if truly ambiguous
   - "edit config" → Search common config locations first
2. **TRY FIRST, ASK LATER** - Be action-oriented:
   - ✅ Search likely locations: ~/Documents, ~/Desktop, ~/Downloads
   - ✅ Open default apps (Notes.app for "notes", etc.)
   - ❌ Don't immediately ask "which file?" - try finding it first
3. **ALWAYS use absolute paths** (~/Desktop/test.txt not test.txt)
4. **Only ask for clarification when:**
   - Multiple equally likely options found
   - No reasonable default exists
   - Could cause data loss or destructive action

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
- Always break complex requests into tasks first (use \`task_write\` for multi-step work)
- **ACTION FIRST**: Try to do the task before asking for clarification
- Search common locations before asking "which file?"
- If a tool fails, try alternatives before asking user
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
