# ChatDock Plugin-Based Tool Architecture

## Overview

ChatDock now uses a **plugin-based tool system** with **Anthropic Cowork pattern** for subagent spawning. This provides better modularity, maintainability, and aligns with industry best practices.

## Architecture Components

### 1. Plugin Manager (`src/server/tools/plugin-manager.js`)

Central registry that dynamically loads tool plugins from categories.

**Key Features:**

- Automatic plugin discovery from `plugins/` directory
- Category-based tool organization
- Tool metadata and enrichment
- Centralized tool execution

**API:**

```javascript
const registry = require("./tools/registry-new");

// Initialize (loads all plugins)
await registry.initialize();

// Get all tools
const allTools = await registry.getAllTools();

// Get tools by category
const fsTools = await registry.getToolsByCategory("fs");

// Get tools for a specialist
const fileTools = await registry.getToolsForSpecialist("file");

// Execute a tool
const result = await registry.executeTool("read_file", {
  path: "/tmp/test.txt",
});
```

### 2. Plugin Categories

| Category    | Purpose                  | Specialists                 | Tools                                                                              |
| ----------- | ------------------------ | --------------------------- | ---------------------------------------------------------------------------------- |
| **fs**      | Filesystem operations    | file, code                  | read_file, write_file, list_directory, create_directory, delete_file, search_files |
| **system**  | Shell commands           | shell, code                 | execute_command, get_environment, get_system_info                                  |
| **web**     | HTTP/web scraping        | web                         | fetch_url, scrape_page                                                             |
| **memory**  | Long-term storage        | file, conversation, planner | create_memory, list_memories, search_memories, recall                              |
| **planner** | Coordination & subagents | planner                     | ask_user_question, todo, task                                                      |

### 3. Tool Definitions

#### Planner Tools

**ask_user_question** - Clarification questions

- Use when user intent is underspecified
- Provides multiple-choice options
- Returns `{ requires_user_input: true, question, options }`

**todo** - Progress tracking (TodoWrite pattern)

- Track work items with exactly ONE in_progress at a time
- Parameters: `todos` array with `{ id, description, status }`
- Status: pending, in_progress, completed, failed

**task** - Spawn subagents (Cowork pattern)

- **When to use:**
  - **Parallelization**: 2+ independent items with multiple steps each
  - **Context-hiding**: High-token-cost subtasks without distraction
- Parameters: `{ agent_type, task_description, context }`
- Agent types: file, shell, web, code, conversation

### 4. Orchestrator (`src/server/orchestrator/orchestrator.js`)

Processes Planner's tool calls and coordinates execution.

**Flow:**

1. Planner analyzes user intent → calls tools (ask_user_question, todo, task)
2. Orchestrator processes tool calls:
   - **conversation** → Direct response
   - **clarification** → Return question to user
   - **task** → Spawn subagents via TaskExecutor

**Response Types:**

```javascript
// Conversation
{ type: 'conversation', content: '...' }

// Clarification
{ type: 'clarification', content: '...', question: '...', options: [...] }

// Task execution
{
  type: 'task',
  content: '...',
  todos: [...],
  results: [{ success, agent_type, task_id, result }],
  summary: 'Completed 2/2 tasks'
}
```

### 5. Task Executor (`src/server/orchestrator/task-executor.js`)

Spawns specialist subagents using SpecialistFactory.

**Features:**

- Single task execution
- Parallel task execution (Promise.all)
- Fresh context per subagent (no conversation history)

### 6. Specialist Factory (`src/server/orchestrator/specialist-factory.js`)

Creates specialists with fresh context and appropriate tools.

**Tool Access Matrix:**

- file → fs + memory
- shell → system + memory
- web → web + memory
- code → fs + system + memory
- conversation → memory only
- planner → all tools (for awareness)

## Plugin Development

### Creating a New Plugin

1. Create directory: `src/server/tools/plugins/<category>/`
2. Create `index.js` with this structure:

```javascript
// Tool definitions (OpenAI/Ollama format)
const tools = [
  {
    type: "function",
    function: {
      name: "my_tool",
      description: "...",
      parameters: {
        /* JSON Schema */
      },
    },
  },
];

// Tool executors
const executors = {
  async my_tool(args) {
    // Implementation
    return { success: true, data: "..." };
  },
};

// Plugin metadata
module.exports = {
  name: "My Tools",
  description: "...",
  version: "1.0.0",
  category: "mycategory",
  tools,
  executors,
  metadata: {
    specialists: ["file", "shell"], // Which specialists can use
    tags: ["tag1", "tag2"],
  },
};
```

3. Plugin is automatically loaded on next restart

### Best Practices

1. **Category Naming:** Use singular, lowercase (fs, not filesystem)
2. **Tool Names:** Use snake_case (read_file, not readFile)
3. **Error Handling:** Always return `{ success: boolean, error?: string }`
4. **Validation:** Validate all parameters before execution
5. **Documentation:** Clear descriptions for LLM understanding

## Migration from Old Registry

**Before (hardcoded):**

```javascript
const { tools, toolExecutors } = require("./tools/registry");
const fileTools = tools.filter((t) => t.function.name.startsWith("read_"));
```

**After (plugin-based):**

```javascript
const registry = require("./tools/registry-new");
await registry.initialize();
const fileTools = await registry.getToolsByCategory("fs");
```

## Testing

```bash
# Test plugin system
node test-plugins.js

# Expected output:
# - 5 plugins loaded
# - 17 total tools
# - Tool categorization working
# - Tool execution successful
```

## Benefits

1. **Modularity** - Each plugin is self-contained
2. **Discoverability** - Automatic loading, no manual registration
3. **Type Safety** - Consistent interface across all plugins
4. **Scalability** - Easy to add new tool categories
5. **Maintenance** - Clear separation of concerns
6. **Testing** - Plugins can be tested independently

## Future Enhancements

- [ ] Hot reload plugins without server restart
- [ ] Plugin versioning and compatibility checks
- [ ] Plugin marketplace/directory
- [ ] Sandboxed plugin execution
- [ ] Plugin dependencies and composition
