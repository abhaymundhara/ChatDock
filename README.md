<div align="center">

# ChatDock

[![Platform](https://img.shields.io/badge/platform-%20Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/vakovalskii/LocalDesk)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

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
