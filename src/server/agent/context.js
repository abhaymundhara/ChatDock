/**
 * Agent Context
 * Builds prompts and manages context window
 * Updated with Agentic features (Bootstrap files, Identity)
 */

const fs = require("fs");
const path = require("path");
const { getServerConfig } = require("../config/settings");

class Context {
  constructor(toolsLoader, skillsLoader) {
    this.toolsLoader = toolsLoader;
    this.skillsLoader = skillsLoader;
    this.config = getServerConfig();
    this.bootstrapFiles = ["AGENTS.md", "SOUL.md", "USER.md", "TOOLS.md", "IDENTITY.md"];
  }

  getIdentity() {
    const now = new Date().toLocaleString("en-US", { 
      weekday: "long", 
      year: "numeric", 
      month: "long", 
      day: "numeric", 
      hour: "2-digit", 
      minute: "2-digit",
      timeZoneName: "short"
    });
    const workspace = this.config.userDataPath;

    return `# ChatDock 🤖

You are ChatDock, a helpful AI assistant running locally on the user's machine.

## Your Capabilities

You have access to powerful tools that allow you to:
- **File Operations**: Read, write, edit, and search files
- **Shell Commands**: Execute system commands (with safety checks)
- **Web Access**: Search the web and fetch content from URLs
- **Memory**: Store and recall information across sessions
- **Subagents**: Spawn background agents for complex tasks

## Current Context

**Time**: ${now}
**Workspace**: ${workspace}
**Memory Location**: ${path.join(workspace, "memory", "MEMORY.md")}
**Skills Directory**: ${path.join(workspace, "skills")}

## Important Guidelines

- When responding to questions, provide direct, helpful answers
- Always explain what you're doing before using tools
- Be accurate, concise, and transparent
- Remember important information by writing to your memory file
- Respect workspace boundaries and user privacy
- **Only use tools when explicitly requested or necessary to answer the user's question**
- If the user says "hi" or greets you, simply greet them back without running tools unless asked
`;
  }

  loadBootstrapFiles() {
    let content = "";
    for (const filename of this.bootstrapFiles) {
      const filePath = path.join(this.config.userDataPath, filename);
      if (fs.existsSync(filePath)) {
        try {
          const fileContent = fs.readFileSync(filePath, "utf-8");
          content += `\n\n## ${filename}\n\n${fileContent}`;
        } catch(e) { /* ignore */ }
      }
    }
    return content;
  }

  loadMemoryContext() {
    const memPath = path.join(this.config.userDataPath, "memory", "MEMORY.md");
    if (fs.existsSync(memPath)) {
      try {
        const mem = fs.readFileSync(memPath, "utf-8");
        return `\n\n# Memory\n\n${mem}`;
      } catch(e) { return ""; }
    }
    return "";
  }

  buildSystemPrompt(systemPromptOverride) {
    const parts = [];

    // 1. Identity
    parts.push(this.getIdentity());

    // 2. Bootstrap Files
    parts.push(this.loadBootstrapFiles());

    // 3. Memory
    const memory = this.loadMemoryContext();
    if (memory) parts.push(memory);

    // 4. Skills Summary
    const skillsSummary = this.skillsLoader.buildSkillsSummary();
    if (skillsSummary) {
      parts.push(`\n\n# Skills\n\n${skillsSummary}\n\nTo use a skill, read its SKILL.md file using the read_file tool.`);
    }

    // 5. Override (if any)
    if (systemPromptOverride) {
      parts.push(`## Additional Instructions\n${systemPromptOverride}`);
    }

    return parts.join("\n\n---\n\n");
  }

  /**
   * Build complete messages list for LLM call
   * @param {Array} history - Previous messages from memory
   * @param {string} currentMessage - The new user message
   * @returns {Array} - Complete messages array including system prompt
   */
  buildMessages(history, currentMessage) {
    const messages = [];

    // System prompt
    messages.push({ role: "system", content: this.buildSystemPrompt() });

    // History
    if (history && history.length > 0) {
      messages.push(...history);
    }

    // Current user message
    if (currentMessage) {
      messages.push({ role: "user", content: currentMessage });
    }

    return messages;
  }

  /**
   * Add assistant message to message list
   * @param {Array} messages - Current messages
   * @param {string} content - Assistant content
   * @param {Array} toolCalls - Optional tool calls
   * @returns {Array} - Updated messages
   */
  addAssistantMessage(messages, content, toolCalls = null) {
    const msg = { role: "assistant", content: content || "" };

    if (toolCalls && toolCalls.length > 0) {
      msg.tool_calls = toolCalls;
    }

    messages.push(msg);
    return messages;
  }

  /**
   * Add tool result to message list
   * @param {Array} messages - Current messages
   * @param {string} toolCallId - ID of the tool call
   * @param {string} toolName - Name of the tool
   * @param {string} result - Tool execution result
   * @returns {Array} - Updated messages
   */
  addToolResult(messages, toolCallId, toolName, result) {
    messages.push({
      role: "tool",
      tool_call_id: toolCallId,
      name: toolName,
      content: result,
    });
    return messages;
  }
}

module.exports = { Context };
