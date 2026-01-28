# ChatDock Tool Plugin Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        LLM (Ollama/OpenAI)                      │
│                                                                 │
│  Receives: tools[] array with all available tool definitions   │
│  Decides: which tool to call based on user query               │
│  Returns: tool_name + arguments                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    src/server/orchestrator                      │
│                                                                 │
│  • Receives tool call from LLM                                 │
│  • Looks up executor in toolExecutors map                      │
│  • Calls: toolExecutors[tool_name](args)                       │
│  • Returns result back to LLM                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  src/server/tools/registry.js                   │
│                         (Auto-Loader)                           │
│                                                                 │
│  On startup:                                                   │
│  1. Scans plugins/ directory recursively                       │
│  2. Requires each plugin file                                  │
│  3. Validates exports: { definition, execute }                 │
│  4. Builds:                                                    │
│     • tools[] array (for LLM)                                  │
│     • toolExecutors{} map (for execution)                      │
│                                                                 │
│  Exports:                                                      │
│  • tools (array of tool definitions)                           │
│  • toolExecutors (map of name → executor function)             │
│  • filterToolsForMessage (smart filtering)                     │
│  • initializeToolEmbeddings (initialization)                   │
│  • isToolSearchAvailable (feature flag)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  src/server/tools/plugins/                      │
│                    (Tool Plugin Directory)                      │
│                                                                 │
│  Automatically discovered files:                               │
│                                                                 │
│  ├─ utils.js              ← Shared utilities (excluded)        │
│  ├─ TEMPLATE.js           ← Template for new tools (excluded)  │
│  ├─ EXAMPLE.js            ← Best practices example (excluded)  │
│  │                                                              │
│  ├─ read-file.js          ← Tool: read_file                    │
│  ├─ write-file.js         ← Tool: write_file                   │
│  ├─ list-directory.js     ← Tool: list_directory               │
│  ├─ execute-shell.js      ← Tool: execute_shell                │
│  ├─ get-current-time.js   ← Tool: get_current_time             │
│  ├─ create-directory.js   ← Tool: create_directory             │
│  ├─ delete-file.js        ← Tool: delete_file                  │
│  ├─ move-file.js          ← Tool: move_file                    │
│  ├─ get-file-info.js      ← Tool: get_file_info                │
│  └─ search-files.js       ← Tool: search_files                 │
│                                                                 │
│  Each plugin exports:                                          │
│  • definition (OpenAI/Ollama schema)                           │
│  • execute (async function)                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Plugin Structure

```javascript
// Every plugin file follows this pattern:

const definition = {
  type: "function",
  function: {
    name: "tool_name",
    description: "What this tool does",
    parameters: {
      type: "object",
      properties: {
        /* params */
      },
      required: [
        /* required params */
      ],
    },
  },
};

async function execute(args) {
  try {
    // Tool implementation
    return { success: true /* results */ };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { definition, execute };
```

## Tool Discovery Flow

```
Startup
  │
  ├─ registry.js loads
  │   │
  │   ├─ scanPlugins(plugins/)
  │   │   │
  │   │   ├─ Read directory
  │   │   ├─ For each .js file (excluding utils, TEMPLATE, EXAMPLE)
  │   │   │   └─ Add to pluginFiles[]
  │   │   └─ Recursively scan subdirectories
  │   │
  │   └─ loadTools()
  │       │
  │       └─ For each plugin file:
  │           ├─ require(pluginFile)
  │           ├─ Validate { definition, execute }
  │           ├─ Extract tool name
  │           ├─ Add definition to tools[]
  │           └─ Add executor to toolExecutors{}
  │
  └─ Export { tools, toolExecutors, ... }
```

## Request Flow

```
User Query
  │
  ▼
LLM receives tools[] array
  │
  ├─ Analyzes query
  ├─ Selects appropriate tool
  └─ Returns: { tool_name, arguments }
  │
  ▼
Orchestrator receives tool call
  │
  ├─ Looks up: toolExecutors[tool_name]
  ├─ Executes: await executor(arguments)
  └─ Returns result
  │
  ▼
LLM receives result
  │
  └─ Generates response to user
```

## Adding a New Tool

```
1. Copy TEMPLATE.js
   $ cp plugins/TEMPLATE.js plugins/my-tool.js

2. Edit my-tool.js
   • Change tool name
   • Define parameters
   • Implement execute()

3. Restart server
   → Tool automatically discovered and loaded

4. LLM can now use your tool!
```

## Key Features

✅ **Auto-Discovery**: No manual registration needed  
✅ **Recursive Scanning**: Can organize tools in subdirectories  
✅ **Validation**: Ensures all plugins have proper structure  
✅ **Error Handling**: Gracefully handles malformed plugins  
✅ **Hot Loading**: Just restart server to pick up changes  
✅ **Modular**: Each tool is independent and testable  
✅ **Type-Safe**: Clear parameter schemas for LLM  
✅ **Extensible**: Add infinite tools without touching core code
