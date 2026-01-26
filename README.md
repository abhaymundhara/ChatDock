<div align="center">

# ChatDock

[![Platform](https://img.shields.io/badge/platform-%20Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/vakovalskii/LocalDesk)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**An intelligent agentic AI desktop assistant powered by local LLMs. ChatDock uses Ollama models with a sophisticated 5-phase agentic loop to understand, plan, and execute complex tasks autonomously through its extensive tool ecosystem.**

</div>

## 🚀 Features

### Core Capabilities

- **5-Phase Agentic Loop**: ANALYZE → PLAN → EXECUTE → OBSERVE → RESPOND cycle for intelligent task handling
- **52+ Integrated Tools**: File operations, Git integration, shell commands, web search, code execution, and more
- **4 Specialized Skills**: Code Navigator, File Editor, Git Expert, Research Assistant
- **Persistent Memory System**: Remembers user preferences, conversation history, and learns from interactions
- **URL Auto-Fetch**: Automatically detects, fetches, and comprehensively summarizes web content
- **Smart Planning**: Automatically creates task breakdowns for complex requests
- **Action-First Behavior**: Executes commands immediately without unnecessary conversation

### User Interface

- Always-on-top floating chat bar UI
- Global hotkey toggle (CommandOrControl+Shift+Space)
- Model picker powered by local Ollama models
- Rich HTML formatting with code syntax highlighting
- Auto-starts the local server on app launch

### Privacy & Control

- 100% local inference (no cloud dependency)
- Persistent memory stored locally at `~/ChatDock/Memory/`
- All data remains on your machine

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
- **Planning**: Task breakdown, todo management, complexity detection
- **PageIndex**: Project-wide code search and navigation
- **Utilities**: System info, clipboard, screenshots, and more

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

# Using npm
npm install

# Using bun
bun install
```

---

## 🧪 Development

```bash
# Using npm
npm run dev

# Using bun
bun run dev
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

## 📖 Roadmap

### Completed ✅

### Planned 🚧

- [ ] 5-phase agentic loop (ANALYZE, PLAN, EXECUTE, OBSERVE, RESPOND)
- [ ] Persistent memory system
- [ ] URL auto-fetch and summarization
- [ ] 52+ integrated tools
- [ ] 4 specialized skills
- [ ] Shell integration (open apps, run scripts)
- [ ] Git operations
- [ ] Rich message formatting
- [ ] Realtime screen context aware sessions
- [ ] Multi-chat sessions with context switching
- [ ] Auto-updates
- [ ] Custom skill development framework
- [ ] Voice input/output

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
