<div align="center">

# ChatDock

[![CI](https://github.com/abhaymundhara/ChatDock/workflows/CI/badge.svg)](https://github.com/abhaymundhara/ChatDock/actions)
[![Platform](https://img.shields.io/badge/platform-%20Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/abhaymundhara/ChatDock)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-63%20passing-brightgreen.svg)](TESTING.md)

**A simple, local AI chat desktop assistant powered by Ollama. ChatDock provides a clean interface to chat with local LLMs on your machine.**

</div>

## 🚀 Features

### Core Capabilities

- **Local LLM Chat**: Simple streaming chat interface with Ollama models
- **Model Selection**: Easy model picker for switching between installed Ollama models
- **Customizable Settings**: Adjust system prompt and temperature settings
- **Privacy First**: 100% local inference with no cloud dependency

### User Interface

- Always-on-top floating chat bar UI
- Global hotkey toggle (CommandOrControl+Shift+Space)
- Model picker powered by local Ollama models
- Rich HTML formatting with code syntax highlighting
- Auto-starts the local server on app launch

### Privacy & Control

- 100% local inference (no cloud dependency)
- All data remains on your machine
- No tracking or analytics

---

## 🧱 Stack

### Frontend

- Electron (desktop shell)
- HTML/CSS/JavaScript
- ACE Editor for rich chat interface

### Backend

- Node.js + Express REST API
- Orchestrator with 5-phase agentic loop
- OllamaClient for LLM integration
- ToolRegistry and SkillLoader system

### AI Infrastructure

- Ollama (local model runtime)
- Memory Manager for persistent context
- Prompt Builder with action-first directives
- URL fetching and summarization pipeline

---

## 🛠️ Tool Categories

ChatDock comes equipped with 52+ tools organized into:

- **File Operations**: Read, write, list, delete, and manage files
- **Git Integration**: Status, diff, log, commit, push, branch operations
- **Shell Commands**: Open applications, run scripts, execute system commands
- **Web Research**: Search engines, URL fetching, content summarization
- **Code Execution**: Run Python, JavaScript, and other scripts
- **Planning & Task Management**: Claude Cowork-inspired task workflow with dependencies, status tracking, and progress visibility
- **PageIndex**: Project-wide code search and navigation
- **Utilities**: System info, clipboard, screenshots, and more

---

## 📋 Task Management (Claude Cowork-Style)

ChatDock uses a sophisticated task management system inspired by Claude Cowork for handling complex multi-step work:

### Key Features

- **Structured Task Lists**: Break down complex requests into specific, actionable items
- **Status Tracking**: Tasks progress through states: `pending` → `in_progress` → `completed`
- **Dependency Management**: Define task dependencies to ensure proper execution order
- **Progress Visibility**: Real-time progress indicators and active task highlighting in the UI
- **Workflow Enforcement**: Only ONE task can be in-progress at a time for focused execution

### Workflow Pattern

```
1. Plan → Create complete task list with specific items
2. Mark → Mark ONE task as 'in_progress' before starting work
3. Execute → Complete the work for that specific task
4. Complete → Mark it 'completed' IMMEDIATELY after finishing
5. Repeat → Move to next task and repeat steps 2-4
```

### Example Usage

```javascript
// 1. Create a task plan
task_write({
  title: "Implement Login Feature",
  tasks: [
    { id: "task_1", task: "Create login form UI", status: "pending" },
    {
      id: "task_2",
      task: "Add authentication API",
      status: "pending",
      dependsOn: ["task_1"],
    },
    {
      id: "task_3",
      task: "Write unit tests",
      status: "pending",
      dependsOn: ["task_2"],
    },
  ],
});

// 2. Mark first task as in-progress
task_update({ taskId: "task_1", status: "in_progress" });

// 3. [Work happens...]

// 4. Mark completed immediately
task_update({ taskId: "task_1", status: "completed" });

// 5. Move to next task
task_update({ taskId: "task_2", status: "in_progress" });
```

### UI Features

- **Progress Bar**: Visual indicator showing completed vs total tasks
- **Active Task Highlighting**: Currently in-progress task is prominently highlighted with a pulsing glow
- **Inline Editing**: Click task titles or status pills to edit directly
- **Real-time Updates**: Task changes stream in real-time without page refresh

---

## ✅ Prerequisites

- [Ollama](https://ollama.com) installed and running
- [Node.js](https://nodejs.org/) (v18+ recommended)
- [npm](https://www.npmjs.com/)

---

## 📦 Installation

```bash
git clone https://github.com/abhaymundhara/ChatDock.git
cd ChatDock

npm install
```

---

## 🧪 Development

```bash
npm run dev
```

---

## 🏗️ Production (Packaged Builds)

```bash
npm run build   # Builds installers for your current OS
```

Build outputs are written to `dist/`. To produce installers for Windows, macOS, and Linux, run `npm run build` on each OS.

---

## ⚙️ Configuration

Environment variables can be set in a `.env` file:

```bash
OLLAMA_BASE=http://127.0.0.1:11434
OLLAMA_MODEL=nemotron-3-nano:30b
CHAT_SERVER_PORT=3001
```

### Memory System

ChatDock stores persistent memory at `~/ChatDock/Memory/`:

- `user.md`: User preferences, command history, and learned patterns
- `chatdock.md`: System identity, capabilities, and session logs

---

## 📖 Project Status & Roadmap

### Phase 1: Core Infrastructure ✅ COMPLETE

**Core Features Implemented:**

- ✅ Electron desktop application with always-on-top floating chat bar
- ✅ Global hotkey toggle (CommandOrControl+Shift+Space)
- ✅ Local Ollama integration with streaming responses
- ✅ Model picker and switching capability
- ✅ Settings management (system prompt, temperature, model selection)
- ✅ Memory system with daily context persistence
- ✅ Brain context system (SOUL.md, AGENTS.md, TOOLS.md, USER.md)

### Phase 2: Tool System & Server-Side Filtering ✅ COMPLETE

**Core Tool Infrastructure:**

- ✅ Tool registry with 10+ built-in tools
- ✅ **Server-side rule-based tool filtering** (fast, no embeddings required)
- ✅ Rich filesystem tools: `read_file`, `write_file`, `list_directory`, `create_directory`, `delete_file`, `move_file`, `search_files`, `get_file_info`
- ✅ Safety checks: path validation, recursive directory operations, metadata enrichment
- ✅ Shell command execution with safe environments
- ✅ Error handling and structured JSON responses

**Performance Optimizations:**

- ✅ Removed embedding-based tool selection (replaced with faster rule-based filtering)
- ✅ Batch embedding support with keep-alive parameter in Ollama
- ✅ Added timing instrumentation to measure tool filtering (~1ms), execution (~4ms), and LLM inference latency
- ✅ Profiled server: tool filtering is 1ms, execution is 4ms; **LLM inference is primary latency source** (20-25s for large models)

**Server Updates:**

- ✅ Fixed request handling bugs (req.body reference, renderer vs API payload formats)
- ✅ Support for both renderer (`{ message }`) and API (`{ messages }`) request formats
- ✅ Logging and timing instrumentation for performance debugging
- ✅ `/chat`, `/tools`, `/health`, `/models` endpoints

### Phase 3: Caching & Performance Enhancement 🚧 IN PROGRESS

**LLM Response Caching (Prototype Created):**

- ✅ Created `src/server/utils/llm-cache.js` with in-memory LRU cache + TTL
- ✅ Cache key generation from message text, model, and tool names
- ✅ Cache statistics tracking (hits, misses, size)
- 🚧 **Pending Integration**: Hook cache into server flow for:
  - Repeated identical user queries (skip first LLM call, return cached structured response)
  - Short-lived parsed argument caching (reduce repeated tool-arg parsing)
  - Cache invalidation on filesystem writes (watch-based or explicit invalidation)

**Conservative Server-Side Argument Parser:**

- 🚧 Design phase: high-confidence pattern matching for common commands
  - Example patterns: "move X to Y", "delete X", "list X" → extract file paths via regex + context
  - Fallback to LLM if ambiguous or pattern doesn't match
  - Estimated impact: reduce first LLM call for 20-30% of simple commands

### Phase 4: Model & Hosting Optimization 📋 RECOMMENDED

**Immediate Recommendations:**

- 🚧 Switch to smaller/faster local models:
  - `llama3.2:3b` (3× faster than nemotron-3-nano:30b, ~3-5s per inference)
  - `all-minilm:latest` or `nomic-embed-text` (specialized for embedding, faster)
  - Ollama model library: test with `ollama pull llama3.2:3b` and update `.env`
- 🚧 Consider hosted LLM APIs for lower latency:
  - OpenAI GPT-4-turbo (~500ms per inference)
  - Anthropic Claude API (~1-2s per inference)
  - Local vLLM quantized models (AWQ, GPTQ formats)

**Estimated Impact:**

- Smaller model: 3–5× latency reduction (from ~25s to ~5-8s per tool call)
- Hosted API: 10–20× latency reduction (from ~25s to ~1-2s per tool call)

### Phase 5: Advanced Features 📋 PLANNED

**Near Term (Next Sprint):**

- [ ] Implement cache invalidation on filesystem writes
- [ ] Add cache metrics dashboard (hit rate, avg latency, memory usage)
- [ ] Conservative argument parser for "move", "delete", "list", "create" patterns
- [ ] Streaming response support for faster UI feedback
- [ ] Tool execution timeout and cancellation

**Medium Term:**

- [ ] Multi-turn conversation optimization (reuse embeddings for context)
- [ ] Tool history and favorites (cache frequently-used tool calls)
- [ ] Advanced task management (Claude Cowork-style task dependencies)
- [ ] Git integration (status, diff, commit, branch operations)
- [ ] URL fetching and web research tools
- [ ] Code execution sandbox (Python, JavaScript, shell scripts)

**Future:**

- [ ] Voice input/output
- [ ] Realtime screen context-aware sessions
- [ ] Multi-chat sessions with context switching
- [ ] Auto-updates and plugin system
- [ ] Custom skill development framework
- [ ] Distributed inference (multi-GPU, federated models)
- [ ] Vision/image understanding capabilities

### Phase 6: Testing & QA 📋 IN PROGRESS

- ✅ 20+ test specs created (unit tests for core modules)
- 🚧 Integration tests for server endpoints
- 🚧 Performance benchmarks and profiling suite
- 🚧 Cache invalidation and TTL expiry tests

### Known Limitations & Notes

1. **Primary Bottleneck**: LLM inference latency (20-25s for `nemotron-3-nano:30b`)
   - Solution: Switch to smaller model or hosted API (see Phase 4 above)

2. **Embeddings**: Removed from the critical path (server-side filtering replaced embedding-based selection)
   - Embedding model still available in registry if needed for custom features

3. **Cache Integration**: Prototype exists but not yet wired into server flow
   - Next step: add cache check on inbound requests and post-tool-execution caching

4. **Tool Execution**: Currently sequential; can be parallelized for read-only tools
   - Example: parallel `read_file` calls for independent file operations

---

## 🤝 Contributing

Contributions are welcome! To get started:

1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add new feature'`)
4. Push to your branch (`git push origin feature/your-feature`)
5. Open a Pull Request

If you want to chat about the project, feel free to reach out on Discord: **abhay066841**.

---

## 📜 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 🙌 Acknowledgements

- [Ollama](https://ollama.com) for local model APIs
- The open-source community for inspiration and tools
