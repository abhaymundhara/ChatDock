# ChatDock Documentation

**Version**: 2.0 (Agentic Release)

**License**: MIT

**Platform**: macOS, Windows, Linux

ChatDock is a local-first, agentic AI assistant that runs on your desktop. It uses Ollama for local LLM inference and provides a floating, always-on-top interface for interacting with your computer through natural language.

---

## Table of Contents

1. [Overview](about:blank#overview)
2. [Architecture](about:blank#architecture)
3. [The Agentic Loop](about:blank#the-agentic-loop)
4. [Extended Thinking (Chain of Thought)](about:blank#extended-thinking-chain-of-thought)
5. [Tools](about:blank#tools)
6. [Tool Search & Discovery](about:blank#tool-search--discovery)
7. [Code Execution Tool](about:blank#code-execution-tool)
8. [Programmatic Tool Calling](about:blank#programmatic-tool-calling)
9. [Skills](about:blank#skills)
10. [Files API](about:blank#files-api)
11. [Memory & Context](about:blank#memory--context)
12. [Document Intelligence (PageIndex)](about:blank#document-intelligence-pageindex)
13. [Prompt Caching](about:blank#prompt-caching)
14. [Configuration](about:blank#configuration)
15. [Security & Permissions](about:blank#security--permissions)
16. [Best Practices](about:blank#best-practices)
17. [Troubleshooting](about:blank#troubleshooting)

---

## Overview

ChatDock transforms from a simple chat interface into an **autonomous agent** capable of:

- Reading and editing files on your system
- Running shell commands
- Searching the web
- Managing Git repositories
- Planning and executing multi-step tasks
- Learning your preferences over time

### Core Principles

| Principle | Description |
| --- | --- |
| **Local-First** | All LLM inference happens on your machine via Ollama. No data leaves your computer. |
| **No API Keys** | Every tool is implemented using native system capabilities. Zero cloud dependencies. |
| **8GB RAM Optimized** | Designed to run efficiently on laptops with limited resources. |
| **User Sovereignty** | You can inspect, modify, or extend every tool and skill. |

---

## Architecture

ChatDock follows a **three-tier architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│                     USER INTERFACE                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Floating HUD (ACE-style Pill)             │   │
│  │  • Text Input • State Indicator • Task Display      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    ORCHESTRATION LAYER                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Orchestrator │  │ Tool Loader  │  │ Skill Loader │      │
│  │  (Master Loop)│  │              │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                              │                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │    Memory    │  │    Cache     │  │   Planner    │      │
│  │    Manager   │  │    Layer     │  │   (TodoWrite)│      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     EXECUTION LAYER                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ File    │ │ Shell   │ │ Git     │ │ Web     │           │
│  │ System  │ │ Tools   │ │ Tools   │ │ Tools   │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
│                              │                              │
│                    Native System Access                     │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
~/ChatDock/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── main.js              # App lifecycle & IPC
│   │   ├── tray/                # System tray integration
│   │   └── settings/            # Settings window
│   ├── renderer/                # Floating UI
│   │   ├── Index.html           # Main chat interface
│   │   └── preload.js           # Context bridge
│   └── server/
│       ├── orchestrator.js      # The agentic loop
│       ├── tools/               # Native tool implementations
│       │   ├── file_system.js
│       │   ├── shell.js
│       │   ├── git.js
│       │   ├── web.js
│       │   ├── planning.js
│       │   └── utility.js
│       └── skills/              # Reasoning playbooks
│           ├── project-navigator/
│           ├── file-editor/
│           ├── research-expert/
│           └── ...
├── Memory/                      # Persistent context
│   ├── user.md                  # User preferences
│   ├── chatdock.md              # System identity
│   └── history/                 # Conversation logs
└── config/
    ├── settings.json            # User settings
    └── last_model.txt           # Last selected Ollama model
```

---

## The Agentic Loop

ChatDock uses an **explicit planning loop** inspired by Claude Code’s architecture. This ensures reliability on smaller local models.

### The Plan-Act-Observe Cycle

```
┌─────────────────────────────────────────────────────────┐
│                    USER REQUEST                          │
│         "Find my coursework and fix the typo"           │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  1. ANALYZE                              │
│  • Parse user intent                                     │
│  • Load relevant skills into context                     │
│  • Identify required tools                               │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   2. PLAN                                │
│  Generate a structured task list:                        │
│  ┌─────────────────────────────────────────────────┐    │
│  │ [ ] Search for coursework files                 │    │
│  │ [ ] Read the identified file                    │    │
│  │ [ ] Identify the typo                           │    │
│  │ [ ] Apply the fix                               │    │
│  │ [ ] Verify the change                           │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   3. EXECUTE                             │
│  For each task in the plan:                              │
│  • Select the appropriate tool                           │
│  • Execute with parameters                               │
│  • Capture output                                        │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   4. OBSERVE                             │
│  • Validate tool output                                  │
│  • Check for errors                                      │
│  • Update task status                                    │
│  • Decide: Continue, Retry, or Ask User                  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   5. RESPOND                             │
│  • Summarize results to user                             │
│  • Update persistent memory if needed                    │
└─────────────────────────────────────────────────────────┘
```

### Structured Output

To ensure reliable tool calling on local models, ChatDock forces the LLM to respond in a structured JSON format:

```json
{
  "thought": "I need to find the coursework file first.",
  "action": {
    "tool": "find_file",
    "parameters": {
      "name": "coursework",
      "directory": "~/Documents"
    }
  }
}
```

---

## Extended Thinking (Chain of Thought)

When faced with complex tasks like research, analysis, or multi-step problem-solving, giving the LLM space to “think” dramatically improves performance. ChatDock implements **Chain of Thought (CoT)** prompting to encourage step-by-step reasoning.

### Why Extended Thinking?

| Without CoT | With CoT |
| --- | --- |
| “The cheapest hotel is X” | “Let me analyze this step by step: First, I’ll search for hotels. Then compare prices. Consider location factors…” |
| Quick but often wrong | Slower but significantly more accurate |
| Black-box answer | Transparent reasoning process |

### How It Works

ChatDock uses a **thinking budget** system:

```jsx
// Thinking modes
{
  "quick": {
    "thinking_tokens": 0,      // No extended thinking
    "description": "Fast responses for simple queries"
  },
  "balanced": {
    "thinking_tokens": 500,    // Moderate thinking
    "description": "Default for most tasks"
  },
  "deep": {
    "thinking_tokens": 2000,   // Extended reasoning
    "description": "Complex analysis, debugging, research"
  }
}
```

### Triggering Extended Thinking

Extended thinking is automatically triggered when:

1. **Complex queries detected**: Multiple sub-tasks, comparisons, or analysis
2. **Explicit request**: User says “think through this” or “analyze carefully”
3. **Tool failures**: When a tool returns an error, the agent reflects before retrying
4. **Ambiguous context**: When the path forward is unclear

### The Thinking Format

```json
{
  "thinking": [
    "The user wants to find the cheapest hotel in Belfast.",
    "I should first search for hotels to get a list of options.",
    "Then I need to compare prices across the results.",
    "I should also consider factors like location and ratings.",
    "Let me start with a web search for 'Belfast hotels prices January 2026'."
  ],
  "action": {
    "tool": "web_search",
    "parameters": { "query": "Belfast hotels prices January 2026" }
  }
}
```

### UI Display

The thinking process is shown in the UI as an expandable “Thinking…” section:

```
┌─────────────────────────────────────────────────────────┐
│ 🧠 Thinking...                                    [▼]   │
├─────────────────────────────────────────────────────────┤
│ • Analyzing the request for hotel search                │
│ • Planning to compare prices across multiple sources    │
│ • Will need web_search and fetch_url tools              │
└─────────────────────────────────────────────────────────┘
```

### Configuration

```json
// In settings.json
{
  "thinkingMode": "balanced",      // "quick" | "balanced" | "deep"
  "showThinkingProcess": true,     // Display thinking in UI
  "thinkingBudgetTokens": 500      // Max tokens for thinking
}
```

---

## Tools

Tools are **atomic, executable functions** that perform actions on the system. They are the “hands” of the agent.

### Tool Categories

### File System Tools

| Tool | Description | Parameters |
| --- | --- | --- |
| `read_file` | Reads the content of a file | `path: string` |
| `write_file` | Creates or overwrites a file | `path: string, content: string` |
| `edit_file` | Applies surgical line-based edits | `path: string, edits: array` |
| `list_directory` | Lists contents of a directory | `path: string` |
| `glob` | Finds files matching a pattern | `pattern: string, cwd?: string` |
| `find_file` | Searches for a file by name | `name: string, directory?: string` |

### Search & Discovery Tools

| Tool | Description | Parameters |
| --- | --- | --- |
| `grep_search` | Regex search within files | `pattern: string, path: string, flags?: string` |
| `web_search` | Searches the web | `query: string` |
| `fetch_url` | Downloads and parses a webpage | `url: string` |

### Shell & System Tools

| Tool | Description | Parameters |
| --- | --- | --- |
| `run_command` | Executes a shell command | `command: string, cwd?: string` |
| `get_system_info` | Returns OS, CPU, RAM stats | None |
| `get_process_list` | Lists running processes | None |

### Git Tools

| Tool | Description | Parameters |
| --- | --- | --- |
| `git_status` | Shows repository status | `cwd?: string` |
| `git_diff` | Shows file differences | `cwd?: string, staged?: boolean` |
| `git_log` | Shows commit history | `cwd?: string, count?: number` |
| `git_commit` | Commits staged changes | `message: string, cwd?: string` |
| `git_push` | Pushes to remote | `cwd?: string` |

### Planning Tools

| Tool | Description | Parameters |
| --- | --- | --- |
| `todo_write` | Creates/updates task list | `tasks: array` |
| `todo_read` | Reads current task list | None |
| `ask_user` | Prompts user for input | `question: string` |

### Utility Tools

| Tool | Description | Parameters |
| --- | --- | --- |
| `clipboard_read` | Reads clipboard content | None |
| `clipboard_write` | Writes to clipboard | `content: string` |
| `open_url` | Opens URL in browser | `url: string` |
| `get_current_time` | Returns current datetime | None |

### Tool Definition Format

Each tool is a Node.js module in `src/server/tools/`:

```jsx
// src/server/tools/file_system.js

const fs = require('node:fs');
const path = require('node:path');

const read_file = {
  name: 'read_file',
  description: 'Reads the full content of a file at the specified path.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the file.'
      }
    },
    required: ['path']
  },
  run: async ({ path: filePath }) => {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found:${absolutePath}`);
    }
    return fs.readFileSync(absolutePath, 'utf-8');
  }
};

module.exports = { read_file };
```

### Adding Custom Tools

1. Create a new `.js` file in `src/server/tools/`
2. Export an object with `name`, `description`, `parameters`, and `run`
3. Restart ChatDock

The tool will be automatically discovered and available to the agent.

---

## Tool Search & Discovery

When working with hundreds or thousands of tools, loading all definitions into the context window is inefficient and can overwhelm local models. ChatDock implements a **Tool Search Tool** that enables dynamic discovery and loading of tools on-demand.

### The Problem with Static Tool Loading

| Approach | Tools in Context | Token Usage | Local Model Performance |
| --- | --- | --- | --- |
| Load All Tools | 50+ tools | 3,000+ tokens | ❌ Poor accuracy |
| Tool Search | 3-5 relevant tools | 300-500 tokens | ✅ High accuracy |

### How Tool Search Works

1. **Tool Catalog**: All tools are registered with their names, descriptions, and parameter info
2. **Semantic Matching**: When a request comes in, the catalog is searched for relevant tools
3. **On-Demand Loading**: Only matched tools are loaded into the LLM context
4. **Execution**: The LLM sees only what it needs

```
User Request: "Find my coursework file"

┌─────────────────────────────────────────────────────────┐
│                   TOOL SEARCH                            │
├─────────────────────────────────────────────────────────┤
│ Query: "find file coursework"                            │
│                                                          │
│ Catalog Search Results:                                  │
│ ├── find_file       (score: 0.95) ✓ LOAD                │
│ ├── glob            (score: 0.82) ✓ LOAD                │
│ ├── grep_search     (score: 0.71) ✓ LOAD                │
│ ├── read_file       (score: 0.65) - below threshold     │
│ └── web_search      (score: 0.12) - not relevant        │
└─────────────────────────────────────────────────────────┘
```

### The `tool_search` Meta-Tool

| Tool | Description | Parameters |
| --- | --- | --- |
| `tool_search` | Searches the tool catalog for relevant tools | `query: string, limit?: number` |

### Implementation

```jsx
// Tool catalog entry
{
  "name": "find_file",
  "description": "Recursively searches for a file by name in a directory tree.",
  "parameters": {
    "name": { "type": "string", "description": "File name or pattern to search for" },
    "directory": { "type": "string", "description": "Starting directory for search" }
  },
  "keywords": ["find", "search", "locate", "file", "name"]
}
```

### Search Algorithm

ChatDock uses a lightweight **keyword + fuzzy matching** approach (no embeddings required):

1. **Tokenize** the user query
2. **Match** against tool names, descriptions, and keywords
3. **Score** by relevance (TF-IDF style)
4. **Return** top N tools above threshold

```jsx
// Search configuration
{
  "toolSearchThreshold": 0.6,    // Minimum relevance score
  "toolSearchLimit": 5,          // Max tools to load
  "toolSearchKeywords": true     // Use keyword field for matching
}
```

### Benefits for Local Models

- **Reduced Context**: 90% fewer tokens used for tool definitions
- **Improved Accuracy**: LLM isn’t confused by irrelevant tools
- **Scalability**: Add hundreds of tools without performance loss
- **Dynamic Loading**: Tools loaded only when needed

---

## Code Execution Tool

ChatDock includes a **Code Execution Tool** that allows the agent to write and run code in a secure, sandboxed environment. This enables data analysis, file processing, complex calculations, and system automation.

### Capabilities

| Capability | Description | Example |
| --- | --- | --- |
| **Data Analysis** | Process CSV, JSON, parse logs | “Analyze my sales data” |
| **Calculations** | Complex math, statistics | “Calculate compound interest” |
| **File Processing** | Transform, convert, generate files | “Convert this CSV to JSON” |
| **Visualizations** | Generate charts and graphs | “Plot my expenses by month” |
| **System Commands** | Run Bash commands safely | “List all large files” |
| **Code Generation** | Write and test code snippets | “Write a Python script to…” |

### The `code_execute` Tool

```jsx
{
  name: 'code_execute',
  description: 'Executes code in a sandboxed environment',
  parameters: {
    language: 'string',    // 'javascript', 'python', 'bash'
    code: 'string',        // Code to execute
    timeout: 'number',     // Max execution time (ms)
    workdir: 'string'      // Working directory
  }
}
```

### Supported Languages

| Language | Runtime | Use Case |
| --- | --- | --- |
| JavaScript | Node.js (built-in) | Data processing, file ops |
| Python | System Python | Data analysis, ML, scripting |
| Bash | System shell | System commands, file ops |

### Sandbox Security

Code runs in a **restricted environment**:

```jsx
// Sandbox configuration
{
  "sandbox": {
    "enabled": true,
    "timeout": 30000,           // 30 second max
    "maxMemory": "256MB",       // Memory limit
    "allowNetwork": false,      // No network by default
    "allowFileWrite": true,     // Can write to workdir
    "restrictedPaths": [        // Blocked paths
      "/etc", "/usr", "/bin", "~/.ssh"
    ]
  }
}
```

### Example Usage

```
User: "Analyze my expenses.csv and show the total by category"

ChatDock:
1. file_read({ path: "~/Documents/expenses.csv" })
2. code_execute({
     language: "python",
     code: `
       import pandas as pd
       df = pd.read_csv('/tmp/expenses.csv')
       totals = df.groupby('category')['amount'].sum()
       print(totals.to_markdown())
     `
   })
3. Returns formatted table of expenses by category
```

---

## Programmatic Tool Calling

**Programmatic Tool Calling** allows the agent to write code that calls tools within a code execution container, reducing round trips and enabling data pre-processing before it reaches the model’s context.

### Why Programmatic Tool Calling?

| Traditional Approach | Programmatic Approach |
| --- | --- |
| 1 LLM call per tool | Multiple tools in 1 code block |
| High latency (N round trips) | Low latency (1 execution) |
| All data goes to context | Filter/process data first |
| Token expensive | Token efficient |

### How It Works

Instead of:

```
LLM → call tool A → LLM → call tool B → LLM → call tool C → LLM
```

Programmatic calling:

```
LLM → code_execute({
  // Call tools A, B, C programmatically
  // Process results
  // Return only relevant data
}) → LLM
```

### The ChatDock Tool API

Within code execution, tools are available via a simple API:

```jsx
// Inside code_execute block
const chatdock = require('@chatdock/tools');

// Call tools programmatically
const files = await chatdock.glob({ pattern: '**/*.md' });
const contents = await Promise.all(
  files.map(f => chatdock.read_file({ path: f }))
);

// Process and filter
const relevant = contents.filter(c => c.includes('coursework'));

// Return only what matters
return relevant.map(c => c.substring(0, 500));  // First 500 chars each
```

### Available Tool API

```jsx
// File operations
chatdock.read_file({ path })
chatdock.write_file({ path, content })
chatdock.list_directory({ path })
chatdock.glob({ pattern, cwd })

// Search
chatdock.grep_search({ pattern, path })
chatdock.web_search({ query })

// Git
chatdock.git_status({ cwd })
chatdock.git_diff({ cwd })

// System
chatdock.run_command({ command, cwd })
```

### Example: Multi-File Search

```jsx
// Traditional: 10+ LLM round trips
// Programmatic: 1 code execution

const chatdock = require('@chatdock/tools');

// Find all JS files
const files = await chatdock.glob({ pattern: 'src/**/*.js' });

// Search each for 'TODO'
const results = [];
for (const file of files) {
  const content = await chatdock.read_file({ path: file });
  if (content.includes('TODO')) {
    const lines = content.split('\n')
      .filter(l => l.includes('TODO'))
      .slice(0, 3);  // Max 3 per file
    results.push({ file, todos: lines });
  }
}

// Return summarized data (not full file contents)
return JSON.stringify(results, null, 2);
```

### Benefits

| Metric | Traditional | Programmatic |
| --- | --- | --- |
| Latency (10 files) | ~20 seconds | ~2 seconds |
| Token Usage | ~10,000 tokens | ~500 tokens |
| LLM Calls | 11 | 2 |
| Context Pollution | High | Low |

### Configuration

```json
// In settings.json
{
  "programmaticToolCalling": {
    "enabled": true,
    "maxExecutionTime": 60000,     // 60 seconds
    "allowedTools": ["all"],       // or specific list
    "autoOptimize": true           // Auto-suggest programmatic approach
  }
}
```

---

## Skills

Skills are **domain-specific knowledge and workflows** written in Markdown. They guide the agent’s reasoning without executing code directly. They are the “brain” of the agent.

### Skill Structure

```
src/server/skills/
└── file-editor/
    ├── SKILL.md        # Main instructions
    ├── examples/       # Optional: example inputs/outputs
    └── scripts/        # Optional: helper scripts
```

### SKILL.md Format

```markdown
---
name: file-editor
description: Use this skill when the user wants to modify, fix, or update an existing file. This skill teaches safe editing practices.
triggers:
  - edit
  - fix
  - update
  - change
  - modify
tools_used:
  - read_file
  - edit_file
  - git_diff
---

# File Editor Workflow

When asked to edit a file:

## 1. Understand the Change
-Clarify exactly what needs to be changed
-If ambiguous, use `ask_user` to confirm

## 2. Read Before Writing
-Always call `read_file` first
-Identify the exact lines to modify
-Never assume file contents

## 3. Apply Surgical Edits
-Use `edit_file` with precise line ranges
-Preserve surrounding context
-Avoid full file rewrites when possible

## 4. Verify the Change
-Call `read_file` again after editing
-Confirm the change was applied correctly
-If in a git repository, show `git_diff` to the user

## Best Practices
-Never delete files without explicit confirmation
-Create backups for critical files
-If unsure, show the proposed change and ask for approval
```

### Skill Loading

Skills are loaded into the agent’s context based on:

1. **Trigger Matching**: Keywords in the user’s request match skill triggers
2. **Explicit Invocation**: User mentions a skill by name (e.g., “use the debugger skill”)
3. **Tool Association**: If an action requires certain tools, the associated skill is loaded

### Shipped Skills

| Skill | Purpose | Key Tools |
| --- | --- | --- |
| `project-navigator` | Explore and understand codebases | `list_directory`, `read_file`, `glob` |
| `code-reader` | Deep-dive into specific files/functions | `read_file`, `grep_search` |
| `file-editor` | Safely modify files | `read_file`, `edit_file`, `git_diff` |
| `code-generator` | Create new files from specs | `write_file`, `run_command` |
| `research-expert` | Multi-step web research | `web_search`, `fetch_url` |
| `documentation-reader` | Parse and summarize docs | `fetch_url`, `read_file` |
| `debugger` | Diagnose and fix errors | `grep_search`, `read_file`, `run_command` |
| `test-runner` | Run and interpret test suites | `run_command` |
| `memory-architect` | Manage persistent context | `read_file`, `write_file` |

---

## Files API

ChatDock provides a comprehensive **Files API** for handling documents, PDFs, and other file types. This enables the agent to read, parse, and understand complex documents without manual conversion.

### Supported File Types

| Type | Extension | Parsing Method | Use Case |
| --- | --- | --- | --- |
| PDF | `.pdf` | `pdf-parse` (text) | Reports, papers, coursework |
| Word | `.docx` | `mammoth` | Documents, assignments |
| Markdown | `.md` | Native | Documentation, notes |
| Plain Text | `.txt` | Native | Logs, config files |
| HTML | `.html` | `cheerio` | Web pages, saved articles |
| JSON | `.json` | Native | Data files, configs |
| CSV | `.csv` | `csv-parse` | Spreadsheets, data |
| Code | `.js`, `.py`, etc. | Native + syntax highlighting | Source code |

### Files API Tools

| Tool | Description | Parameters |
| --- | --- | --- |
| `file_upload` | Registers a file with the Files API | `path: string` |
| `file_read` | Reads and parses a file’s content | `file_id: string` |
| `file_list` | Lists all registered files | None |
| `file_delete` | Removes a file from the registry | `file_id: string` |
| `file_info` | Returns metadata about a file | `file_id: string` |

### PDF Handling

PDFs are automatically parsed and made available as structured text:

```jsx
// PDF parsing configuration
{
  "pdfExtractImages": false,       // Skip images (save RAM)
  "pdfMaxPages": 100,              // Limit for large documents
  "pdfPreserveFormatting": true    // Keep tables/lists structure
}
```

### File Registry

Uploaded files are tracked in a local registry:

```
~/ChatDock/Files/
├── registry.json              # File metadata index
├── cache/                     # Parsed content cache
│   ├── coursework_abc123.txt  # Parsed PDF text
│   └── report_def456.txt
└── uploads/                   # Original files (optional)
```

### Example Usage

```
User: "Read my coursework PDF and summarize the introduction"

ChatDock:
1. file_upload({ path: "~/Documents/coursework.pdf" })
   → Returns: { file_id: "coursework_abc123", pages: 42, type: "pdf" }

2. file_read({ file_id: "coursework_abc123", pages: "1-5" })
   → Returns: Parsed text content of pages 1-5

3. Summarizes the introduction using the parsed content
```

### File Context Injection

When a file is referenced in conversation, its metadata is injected into context:

```json
{
  "active_files": [
    {
      "file_id": "coursework_abc123",
      "name": "coursework.pdf",
      "type": "pdf",
      "pages": 42,
      "indexed": true,
      "pageindex_id": "coursework_tree"
    }
  ]
}
```

### Integration with PageIndex

Files uploaded to the Files API can be automatically indexed with PageIndex:

```jsx
// Auto-indexing configuration
{
  "autoIndexPDFs": true,           // Index PDFs on upload
  "autoIndexThreshold": 10,        // Only index if > 10 pages
  "indexOnDemand": true            // Index when first queried
}
```

---

## Memory & Context

ChatDock uses a **persistent memory system** to maintain context across sessions.

### Memory Files

Located in `~/ChatDock/Memory/`:

### `user.md`

Stores user preferences and personality context:

```markdown
# User Profile

## Preferences
-Preferred language: Python
-Code style: PEP 8 with 4-space indentation
-Prefers concise responses

## Projects
-Coursework located at: ~/Documents/University/CS101
-Side project: ~/Code/my-app

## History
-Last worked on: Belfast hotel research
-Frequently used tools: file_editor, web_search
```

### `chatdock.md`

Stores the agent’s identity and system instructions:

```markdown
# ChatDock Identity

You are ChatDock, a local AI assistant running on the user's machine.

## Core Behaviors
-Always confirm before destructive actions
-Prefer surgical edits over full file rewrites
-Cite sources when presenting research

## Available Tools
[Auto-generated list of loaded tools]

## Active Skills
[Auto-generated list of loaded skills]
```

### Context Window Management

To stay within the context limits of local models (typically 4K-8K tokens):

1. **Rolling History**: Only the last N messages are included
2. **Summarization**: Older context is compressed into summaries
3. **On-Demand Loading**: Skills and tool definitions are loaded only when relevant
4. **Pruning**: Large tool outputs are truncated with ellipses

---

## Document Intelligence (PageIndex)

ChatDock integrates **PageIndex**, a vectorless, reasoning-based RAG (Retrieval Augmented Generation) system that enables intelligent document understanding without requiring vector databases.

### What is PageIndex?

Traditional RAG systems use vector similarity search, which often retrieves *similar* but not *relevant* information. PageIndex takes a different approach:

1. **No Vector Database**: Uses document structure and LLM reasoning instead of embeddings
2. **No Chunking**: Documents are organized into natural sections, not artificial chunks
3. **Human-like Retrieval**: Simulates how experts navigate complex documents
4. **Reasoning-based**: The LLM “thinks through” which sections are relevant

### How It Works

PageIndex transforms documents into a hierarchical tree structure:

```
Document: "Federal Reserve Annual Report 2023"
│
├── Executive Summary (pages 1-5)
│   └── Summary: "Overview of monetary policy decisions..."
│
├── Monetary Policy (pages 6-20)
│   ├── Interest Rate Decisions (pages 6-12)
│   │   └── Summary: "The FOMC raised rates by..."
│   └── Quantitative Tightening (pages 13-20)
│       └── Summary: "Balance sheet reduction continued..."
│
├── Financial Stability (pages 21-35)
│   ├── Banking Sector Health (pages 21-28)
│   └── Market Risks (pages 29-35)
│
└── Economic Outlook (pages 36-50)
```

When you ask a question, the LLM **reasons through the tree** to find the most relevant sections, rather than blindly matching vectors.

### PageIndex Tools

| Tool | Description | Parameters |
| --- | --- | --- |
| `pageindex_build` | Builds a PageIndex tree from a document | `file_path: string, max_pages_per_node?: number` |
| `pageindex_query` | Queries a PageIndex tree with reasoning | `index_id: string, query: string` |
| `pageindex_list` | Lists all indexed documents | None |
| `pageindex_delete` | Removes a document from the index | `index_id: string` |

### Local-First Implementation

Unlike the original PageIndex (which uses OpenAI), ChatDock’s implementation uses **local Ollama models**:

```jsx
// PageIndex configuration
{
  "model": "llama3.1:8b-instruct-q4_K_M",  // Local model
  "toc_check_pages": 20,                    // Pages to analyze for TOC
  "max_pages_per_node": 10,                 // Max pages per tree node
  "max_tokens_per_node": 8000               // Optimized for 8GB RAM
}
```

### Supported Document Types

| Type | Extension | Method |
| --- | --- | --- |
| PDF | `.pdf` | Text extraction via `pdf-parse` |
| Markdown | `.md` | Native heading-based parsing |
| Word | `.docx` | Conversion via `mammoth` |
| Plain Text | `.txt` | Line-based sectioning |
| HTML | `.html` | DOM-based section extraction |

### Example Usage

```
User: "What did the Federal Reserve say about inflation in 2023?"

ChatDock (with PageIndex):
1. Loads the indexed Federal Reserve report
2. Reasons: "Inflation → Monetary Policy → Interest Rates"
3. Navigates to the relevant tree node
4. Extracts pages 6-12 as context
5. Generates answer with page citations
```

### Tree Structure Format

The PageIndex tree is stored as JSON:

```json
{
  "title": "Federal Reserve Annual Report 2023",
  "doc_id": "fed_report_2023",
  "created_at": "2026-01-26T01:52:00Z",
  "nodes": [
    {
      "title": "Monetary Policy",
      "node_id": "0001",
      "start_page": 6,
      "end_page": 20,
      "summary": "This section covers FOMC decisions and rate changes.",
      "children": [
        {
          "title": "Interest Rate Decisions",
          "node_id": "0002",
          "start_page": 6,
          "end_page": 12,
          "summary": "The Fed raised rates by 25bp in Q1..."
        }
      ]
    }
  ]
}
```

### Storage Location

PageIndex trees are stored in `~/ChatDock/PageIndex/`:

```
~/ChatDock/PageIndex/
├── fed_report_2023.json      # Tree structure
├── fed_report_2023.pdf       # Original document (optional cache)
└── coursework_assignment.json
```

### Performance Considerations

| Metric | Value | Notes |
| --- | --- | --- |
| Index Build Time | 30-60 sec per 50 pages | Depends on model speed |
| Query Time | 2-5 seconds | Tree traversal + reasoning |
| Storage | ~5KB per 100 pages | JSON only, no embeddings |
| RAM Usage | +0 MB | No vector DB in memory |

### Comparison: PageIndex vs Vector RAG

| Aspect | Vector RAG | PageIndex |
| --- | --- | --- |
| Retrieval Method | Semantic similarity | LLM reasoning |
| Storage | Large embeddings | Lightweight JSON |
| Accuracy | Good for fuzzy matches | Better for precise queries |
| Explainability | “Black box” similarity | Full reasoning trace |
| Dependencies | Vector DB (Chroma, etc.) | None |
| RAM for 8GB laptop | May struggle | ✅ Optimized |

---

## Prompt Caching

ChatDock implements **Prompt Caching** to dramatically reduce latency and improve efficiency when working with large, repeated context (like system prompts, tool definitions, and document content).

### What is Prompt Caching?

When you interact with an LLM, a significant portion of the prompt remains constant:
- System prompt
- Tool definitions
- Loaded skills
- User preferences
- Document indexes

**Prompt Caching** stores the processed state of these static elements, so subsequent requests skip redundant processing.

### How It Works

```
First Request (Cache Miss):
┌─────────────────────────────────────────────────────────┐
│ System Prompt (500 tokens)     → Process → Cache        │
│ Tool Definitions (800 tokens)  → Process → Cache        │
│ Skill Context (300 tokens)     → Process → Cache        │
│ User Query (50 tokens)         → Process                │
├─────────────────────────────────────────────────────────┤
│ Total Processing: 1,650 tokens                          │
│ Time: ~2.5 seconds                                      │
└─────────────────────────────────────────────────────────┘

Second Request (Cache Hit):
┌─────────────────────────────────────────────────────────┐
│ System Prompt (500 tokens)     → FROM CACHE ✓           │
│ Tool Definitions (800 tokens)  → FROM CACHE ✓           │
│ Skill Context (300 tokens)     → FROM CACHE ✓           │
│ User Query (50 tokens)         → Process                │
├─────────────────────────────────────────────────────────┤
│ Total Processing: 50 tokens                             │
│ Time: ~0.3 seconds                                      │
└─────────────────────────────────────────────────────────┘
```

### Cache Layers

| Layer | What’s Cached | TTL | Invalidation |
| --- | --- | --- | --- |
| **System Prompt** | Base identity + instructions | Session | On settings change |
| **Tool Definitions** | All tool schemas | Session | On tool add/remove |
| **Skill Context** | Active skill instructions | Per-request | On skill change |
| **File Content** | Parsed document text | 5 minutes | On file modification |
| **PageIndex Trees** | Document tree structures | Persistent | On re-index |
| **Conversation History** | Previous messages | Rolling N | Per-message |

### Cache Configuration

```json
// In settings.json
{
  "promptCaching": {
    "enabled": true,
    "systemPromptCache": true,
    "toolDefinitionCache": true,
    "fileContentCacheTTL": 300,      // 5 minutes
    "maxCacheSize": "100MB",
    "persistAcrossSessions": false
  }
}
```

### Tool Output Cache

In addition to prompt caching, tool outputs are also cached:

| Cache Type | TTL | Storage |
| --- | --- | --- |
| File Content | 30 seconds | In-memory |
| Directory Listings | 60 seconds | In-memory |
| Web Search Results | 5 minutes | In-memory |
| Git Status | 10 seconds | In-memory |

### Performance Impact

| Metric | Without Caching | With Caching | Improvement |
| --- | --- | --- | --- |
| First Response | 2.5s | 2.5s | - |
| Subsequent Responses | 2.5s | 0.3-0.5s | **5-8x faster** |
| Token Processing | 100% | 10-15% | **85% reduction** |
| Memory Usage | Low | +50MB | Trade-off |

### Cache Invalidation

Caches are automatically invalidated when:

1. **System Prompt Changed**: User modifies settings
2. **Tool Added/Removed**: Tool registry updated
3. **Skill Modified**: SKILL.md file changed
4. **File Updated**: Watched file modified (via `fs.watch`)
5. **Session Timeout**: TTL expired

### Clearing Cache

```bash
# Via the UI
Settings > Advanced > Clear All Caches

# Via command
rm -rf ~/ChatDock/cache/

# Programmatically
chatdock.cache.clear('all')     # Clear everything
chatdock.cache.clear('tools')   # Clear tool definitions only
chatdock.cache.clear('files')   # Clear file content only
```

### Implementation Notes

For local Ollama models, prompt caching is implemented at the application level:

```jsx
// Prompt cache structure
const promptCache = new Map();

function getCachedPrompt(key) {
  const cached = promptCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }
  return null;
}

function setCachedPrompt(key, value, ttlMs) {
  promptCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}
```

---

## Configuration

### Settings File

Located at `~/ChatDock/config/settings.json`:

```json
{
  "hotkey": "CommandOrControl+Shift+Space",
  "model": "llama3.1:8b-instruct-q4_K_M",
  "temperature": 0.7,
  "systemPrompt": "",
  "theme": "dark",
  "confirmDestructive": true,
  "autoExecuteReadOnly": true,
  "maxHistoryMessages": 20,
  "cacheEnabled": true,
  "cacheTTL": 60
}
```

### Environment Variables

```bash
# .env file or system environment
OLLAMA_BASE=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.1:8b-instruct-q4_K_M
CHAT_SERVER_PORT=3001
```

### Recommended Models (8GB RAM)

| Model | Size | Best For |
| --- | --- | --- |
| `llama3.1:8b-instruct-q4_K_M` | ~5GB | General tasks, coding |
| `mistral-nemo:12b-instruct-q4_K_M` | ~7GB | Complex reasoning |
| `gemma2:9b-instruct-q4_K_M` | ~6GB | Instruction following |
| `qwen2.5:7b-instruct-q4_K_M` | ~5GB | Fast responses |

---

## Security & Permissions

### Permission Model

ChatDock uses a **tiered permission system**:

| Level | Actions | Confirmation Required |
| --- | --- | --- |
| **Read** | `read_file`, `list_directory`, `grep_search` | No |
| **Write** | `write_file`, `edit_file` | Preview shown |
| **Execute** | `run_command` | Command shown |
| **Destructive** | `rm`, `git push --force` | Explicit “CONFIRM” |

### Sandbox Considerations

ChatDock runs **natively** without a sandbox for maximum flexibility. This means:

- ✅ Full system access when needed
- ✅ No VM overhead
- ✅ Native tool performance
- ⚠️ User must review tool executions

### Recommended Practices

1. **Review Commands**: Always check `run_command` before approving
2. **Use Git**: Work in repositories so changes can be reverted
3. **Backup Critical Files**: Let ChatDock create `.bak` files before edits
4. **Limit Scope**: Configure allowed directories in settings

---

## Best Practices

### For Effective Prompting

1. **Be Specific**: “Fix the typo in line 42 of main.py” > “Fix the bug”
2. **Provide Context**: “In my Node.js project at ~/Code/app” > “In my project”
3. **Ask for Plans**: “Show me a plan before making changes”
4. **Use Skill Names**: “Use the debugger skill to find the issue”

### For Tool Management

1. **Start Small**: Begin with read-only tools, enable write tools as needed
2. **Check Outputs**: Review tool outputs in the UI before proceeding
3. **Use `ask_user`**: Configure the agent to ask when uncertain

### For Memory Management

1. **Update `user.md`**: Add your project locations and preferences
2. **Review `chatdock.md`**: Customize the agent’s personality
3. **Clear History**: Periodically clear old conversation logs

---

## Troubleshooting

### Common Issues

### “Ollama not responding”

```bash
# Check if Ollama is running
ollama list

# Restart Ollama
ollama serve
```

### “Tool execution failed”

1. Check the tool’s required dependencies
2. Verify file paths are absolute
3. Check permissions for the target file/directory

### “Context window exceeded”

1. Clear conversation history
2. Use a model with larger context
3. Reduce `maxHistoryMessages` in settings

### “Agent stuck in loop”

1. Press `Escape` or click “Stop” in the UI
2. Rephrase your request with more specificity
3. Use `ask_user` skill to force interaction

### Logs

```bash
# View ChatDock logs
tail -f ~/Library/Logs/ChatDock/main.log

# View Ollama logs
tail -f ~/.ollama/logs/server.log
```

### Getting Help

- **GitHub Issues**: [github.com/abhaymundhara/ChatDock/issues](https://github.com/abhaymundhara/ChatDock/issues)
- **Discord**: abhay066841

---

*This documentation is auto-generated and may be updated as ChatDock evolves.*