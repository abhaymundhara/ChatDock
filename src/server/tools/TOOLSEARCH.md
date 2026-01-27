# ToolSearch Implementation

## Overview

ToolSearch uses **embeddings-based ranking** to intelligently find relevant tools for each task, reducing token costs and improving accuracy.

## Design

### Two-Phase Workflow

**Phase 1: Discovery**

- Only `tool_search` is exposed to the model
- Model calls `tool_search` with a query describing the task
- Backend ranks all tools by semantic similarity
- Returns top-K most relevant tools

**Phase 2: Execution**

- Only the selected tools from Phase 1 are exposed
- Model uses the relevant tools to complete the task
- Much lower token cost (sending 2-4 tools vs all tools)

### Components

**1. Embedding Helper** ([embeddings.js](./embeddings.js))

- `embedText(text)` - Generate embedding vector using Ollama
- `cosineSimilarity(a, b)` - Calculate similarity between vectors

**2. Tool Embeddings** (Precomputed)

- At startup, each tool's `name + description` is embedded
- Stored in `toolEmbeddings` Map for fast lookup
- Only computed once, reused for all queries

**3. tool_search Tool**

```javascript
{
  name: "tool_search",
  description: "Search for relevant tools based on your task",
  parameters: {
    query: string,      // "read a file", "list directory"
    max_tools: number   // default: 4
  }
}
```

**4. Executor Logic**

1. Embed the query
2. Calculate cosine similarity with each tool embedding
3. Sort by similarity score (descending)
4. Return top-K tools with scores

## Usage Flow

```
User: "What's in my package.json?"
  ↓
Phase 1: Model calls tool_search
  query: "read file contents"
  → Returns: [read_file, list_directory]
  ↓
Phase 2: Model calls read_file
  file_path: "package.json"
  → Returns: file contents
  ↓
Model: "Your package.json contains..."
```

## Benefits

1. **Token Efficiency**: Only send 1 tool in Phase 1, then 2-4 in Phase 2 (vs all 7 tools)
2. **Smart Ranking**: Semantic matching finds the right tools even with different wording
3. **Scalable**: Works with 100+ tools without overwhelming context
4. **Automatic**: No manual tool selection needed

## Configuration

- **Default max_tools**: 4 (configurable per request)
- **Embedding model**: all-minilm (fast, good quality)
- **Max tool calls**: 10 (prevents infinite loops)

## Example Queries

| User Query           | tool_search Query         | Selected Tools               |
| -------------------- | ------------------------- | ---------------------------- |
| "Read my README"     | "read file contents"      | read_file, list_directory    |
| "Run npm install"    | "execute shell command"   | execute_shell                |
| "What time is it?"   | "get current time"        | get_current_time             |
| "Find all .js files" | "search files by pattern" | search_files, list_directory |

## Performance

- Embedding generation: ~50-100ms per query
- Similarity calculation: <1ms for all tools
- Total overhead: <200ms per request

## Future Improvements

- Cache query embeddings for repeated patterns
- Add tool usage statistics for popularity-based ranking
- Support tool combinations (e.g., "read and edit file")
- Dynamic tool loading based on user permissions
