/**
 * Bootstrap Utility
 * Initializes the workspace with default "soul" files
 * Ported from ChatDock CLI
 */

const fs = require("fs");
const path = require("path");
const { getServerConfig } = require("../config/settings");

const DEFAULT_TEMPLATES = {
  "AGENTS.md": `# Agent Instructions

You are a helpful AI assistant. Be concise, accurate, and friendly.

## Guidelines

- Always explain what you're doing before taking actions
- Ask for clarification when the request is ambiguous
- Use tools to help accomplish tasks
- Remember important information in your memory files
`,
  "SOUL.md": `# Soul

I am ChatDock, a lightweight AI assistant.

## Personality

- Helpful and friendly
- Concise and to the point
- Curious and eager to learn

## Values

- Accuracy over speed
- User privacy and safety
- Transparency in actions
`,
  "USER.md": `# User

Information about the user goes here.

## Preferences

- Communication style: (casual/formal)
- Timezone: (your timezone)
- Language: (your preferred language)
`,
  "IDENTITY.md": `# Identity

I am ChatDock, your personal AI assistant running locally on your machine.

## Core Capabilities
- File system operations (read, write, search)
- Web search and content fetching
- Command execution with safety checks
- Memory and learning from interactions

## Limitations
- I operate primarily within your workspace directory
- I cannot access external services without explicit tools
- I respect your privacy and data security
`,
  "TOOLS.md": `# Tool Usage Guidelines

## Best Practices
- Always explain what you're doing before using tools
- Verify paths are within the workspace when possible
- Ask for confirmation before destructive operations
- Use the least privileged tool for the task

## Safety
- Never execute commands that could harm the system
- Validate all file paths before operations
- Be cautious with shell commands
- Respect workspace boundaries
`
};

function bootstrapWorkspace() {
  const config = getServerConfig();
  const workspace = config.userDataPath;

  console.log(`[bootstrap] Checking workspace at ${workspace}...`);

  // Ensure workspace exists
  if (!fs.existsSync(workspace)) {
    fs.mkdirSync(workspace, { recursive: true });
  }

  // Create templates
  for (const [filename, content] of Object.entries(DEFAULT_TEMPLATES)) {
    const filePath = path.join(workspace, filename);
    if (!fs.existsSync(filePath)) {
      console.log(`[bootstrap] Creating ${filename}...`);
      fs.writeFileSync(filePath, content, "utf-8");
    }
  }

  // Create memory structure
  const memoryDir = path.join(workspace, "memory");
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }

  const memoryFile = path.join(memoryDir, "MEMORY.md");
  if (!fs.existsSync(memoryFile)) {
    console.log(`[bootstrap] Creating memory/MEMORY.md...`);
    fs.writeFileSync(memoryFile, `# Long-term Memory

This file stores important information that should persist across sessions.

## User Information
(Important facts about the user)

## Preferences
- Communication style: 
- Timezone: 
- Language: 

## Project Context
(Current projects and their status)

## Important Notes
(Things to remember across sessions)

## Learned Patterns
(User habits and preferences discovered over time)
`, "utf-8");
  }

  console.log("[bootstrap] Workspace ready.");
}

module.exports = { bootstrapWorkspace };
