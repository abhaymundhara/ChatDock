# ChatDock Tools

ChatDock now supports tool calling using Ollama's OpenAI-compatible API.

## How It Works

1. Tools are defined in `registry.js` using the OpenAI function calling format
2. Tools are sent to Ollama with each chat request
3. When the model wants to use a tool, it returns a `tool_calls` response
4. The server executes the tool and sends the result back
5. The model uses the tool result to formulate its final response

## Available Tools

### File Operations

- **read_file**: Read contents of a file
- **write_file**: Write or create a file
- **list_directory**: List files and directories
- **search_files**: Search for files by pattern

### System Operations

- **execute_shell**: Execute shell commands (use with caution)
- **get_current_time**: Get current date and time

## Example Usage

Just ask the AI naturally:

- "Read the contents of package.json"
- "List all files in the src directory"
- "Create a new file called hello.txt with 'Hello World'"
- "What time is it?"
- "Find all .js files in the src folder"

The AI will automatically use the appropriate tools to fulfill your request.

## Adding New Tools

To add a new tool:

1. Add the tool definition to the `tools` array in `registry.js`
2. Add the executor function to the `toolExecutors` object
3. Restart the server

### Tool Definition Format

```javascript
{
  type: 'function',
  function: {
    name: 'tool_name',
    description: 'Clear description of what the tool does',
    parameters: {
      type: 'object',
      properties: {
        param_name: {
          type: 'string', // or 'number', 'boolean', etc.
          description: 'What this parameter does'
        }
      },
      required: ['param_name'] // List required parameters
    }
  }
}
```

### Executor Function Format

```javascript
async tool_name(args) {
  try {
    // Do something with args
    return { success: true, result: 'data' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

## Security Notes

- The `execute_shell` tool has a 30-second timeout
- All file operations should validate paths
- Consider sandboxing or restricting tool access in production
- Tool execution errors are caught and returned to the model

## Model Compatibility

Tool calling works with models that support function calling:

- llama3.1 and newer
- qwen2.5
- mistral-nemo
- And other models with tool support

Check [Ollama's model list](https://ollama.com/search?c=tool) for compatible models.
