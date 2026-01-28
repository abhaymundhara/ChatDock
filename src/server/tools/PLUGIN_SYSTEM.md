# ChatDock Tool Plugin System

## Overview

ChatDock uses a modular, plugin-based tool system where each tool lives in its own file and is automatically discovered and loaded by the registry.

## Architecture

### Directory Structure

```
src/server/tools/
├── registry.js          # Auto-loader that scans and registers all plugins
├── plugins/             # Tool plugin directory (scanned recursively)
│   ├── utils.js        # Shared utilities for all tools
│   ├── read-file.js    # File reading tool
│   ├── write-file.js   # File writing tool
│   ├── list-directory.js
│   ├── execute-shell.js
│   ├── get-current-time.js
│   ├── create-directory.js
│   ├── delete-file.js
│   ├── move-file.js
│   ├── get-file-info.js
│   └── search-files.js
```

### Plugin Format

Each tool plugin **must** export two things:

1. **`definition`** - OpenAI/Ollama tool schema
2. **`execute`** - Async function that executes the tool

```javascript
// Example: my-tool.js

const definition = {
  type: "function",
  function: {
    name: "my_tool",
    description: "Description of what this tool does",
    parameters: {
      type: "object",
      properties: {
        param1: {
          type: "string",
          description: "Description of param1",
        },
      },
      required: ["param1"],
    },
  },
};

async function execute(args) {
  try {
    // Tool implementation
    return {
      success: true,
      result: "some value",
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = { definition, execute };
```

## How It Works

### 1. Plugin Discovery

The `registry.js` automatically scans the `plugins/` directory **recursively** for `.js` files:

- Finds all `.js` files in `plugins/` and subdirectories
- Excludes `utils.js` (shared utilities)
- No hardcoded tool list needed!

### 2. Plugin Loading

For each discovered plugin file:

1. Requires the module
2. Validates it has `definition` and `execute` exports
3. Extracts the tool name from `definition.function.name`
4. Adds definition to `tools` array
5. Maps executor to `toolExecutors` object

### 3. Tool Registration

The registry exposes:

```javascript
module.exports = {
  tools, // Array of tool definitions for LLM
  toolExecutors, // Map of tool name → executor function
  // ... helper functions
};
```

## Creating a New Tool

### Step 1: Create Plugin File

Create a new file in `src/server/tools/plugins/`:

```bash
# File: src/server/tools/plugins/my-new-tool.js
```

### Step 2: Define Tool Structure

```javascript
const definition = {
  type: "function",
  function: {
    name: "my_new_tool",
    description: "Clear description for the LLM",
    parameters: {
      type: "object",
      properties: {
        input: {
          type: "string",
          description: "What this parameter is for",
        },
      },
      required: ["input"],
    },
  },
};

async function execute(args) {
  const { input } = args;

  try {
    // Your implementation here
    return {
      success: true,
      data: "result",
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = { definition, execute };
```

### Step 3: That's It!

The tool will be **automatically loaded** on next server start. No need to:

- Edit `registry.js`
- Manually register the tool
- Update any tool lists

## Using Shared Utilities

Import from `utils.js` for common functionality:

```javascript
const { resolvePath, getFileType } = require("./utils");

async function execute(args) {
  const fullPath = resolvePath(args.file_path);
  // ...
}
```

Available utilities:

- `resolvePath(path)` - Resolve `~`, relative paths to absolute
- `getFileType(stats)` - Get human-readable file type from fs.Stats

## Organizing Tools

You can organize tools in subdirectories:

```
plugins/
├── filesystem/
│   ├── read-file.js
│   ├── write-file.js
│   └── delete-file.js
├── system/
│   ├── execute-shell.js
│   └── get-current-time.js
└── utils.js
```

The recursive scanner will find them all!

## Tool Filtering

The registry includes smart server-side filtering to reduce LLM context:

- Analyzes user message for keywords
- Returns only relevant tools for the query
- Falls back to all tools if no patterns match

This improves performance without changing the plugin architecture.

## Benefits

✅ **Modular** - Each tool is self-contained  
✅ **Auto-discovery** - No manual registration needed  
✅ **Scalable** - Easy to add/remove tools  
✅ **Organized** - Can use subdirectories for grouping  
✅ **Testable** - Each tool can be tested independently  
✅ **Maintainable** - Changes to one tool don't affect others

## Migration from Old System

The old system had all tools hardcoded in `registry.js`. The new system:

1. Keeps the same tool names and functionality
2. Maintains backward compatibility with existing code
3. Simply splits each tool into its own file
4. Adds automatic discovery and loading

All existing tool names are preserved:

- `read_file`
- `write_file`
- `list_directory`
- `execute_shell`
- `get_current_time`
- `create_directory`
- `delete_file`
- `move_file`
- `get_file_info`
- `search_files`
