<div align="center">

# ChatDock

[![Platform](https://img.shields.io/badge/platform-%20Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/abhaymundhara/ChatDock)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<img src="https://visitor-badge.laobi.icu/badge?page_id=HKUDS.ChatDock&style=for-the-badge&color=00d4ff" alt="Views">

**A simple, local AI chat desktop assistant powered by Ollama. ChatDock provides a clean interface to chat with local LLMs on your machine.**

</div>

## ✨ Features

- 🖥️ **Desktop App**: Beautiful Electron UI with global keyboard shortcut
- ⌨️ **Quick Access**: Press `Cmd+Shift+Space` (Mac) or `Ctrl+Shift+Space` (Windows/Linux) to toggle
- 🧠 **Agentic Loop**: Proper tool→LLM→tool iteration with max 20 cycles
- 🔌 **Multi-Provider**: Ollama, OpenRouter, OpenAI, Groq
- 💬 **Multi-Channel**: Telegram, WhatsApp, Web UI
- 🛠️ **31 Tools**: Filesystem, shell, web, memory, cron, spawn, and more
- 📚 **5 Skills**: GitHub, weather, summarize, tmux, skill-creator
- 🧵 **Subagents**: Spawn background agents for complex tasks
- 📅 **Cron Scheduler**: Schedule automated tasks
- 🧠 **Memory**: Persistent long-term memory
- 🔒 **Security**: Path validation and command safety checks
- ⚡ **Tiny Model Support**: Optimized for models < 7B (Llama 3.2 1B, Qwen 0.5B, etc.)

## �️ Desktop Interface

ChatDock runs as a lightweight Electron app with:

- **Global Shortcut**: `Cmd/Ctrl + Shift + Space` to show/hide from anywhere
- **Command Palette**: Type `/` to access quick commands
- **Model Selector**: Switch models on-the-fly
- **Streaming Responses**: Real-time token streaming
- **System Tray**: Runs in background with tray icon

## �🚀 Quick Start

### Prerequisites

- [Ollama](https://ollama.com) running locally (or API keys for cloud providers)
- Node.js v18+
- A model pulled: `ollama pull llama3.2:3b`

### Installation

```bash
# Install dependencies
npm install

# Run onboarding wizard (optional)
npm run onboard

# Start the server
npm run server

# In another terminal, start the Electron app
npm start
```

### Check Status

```bash
npm run status
```

## 🏗️ Architecture

```
src/
├── main/            # Electron main process
├── renderer/        # Frontend UI (HTML/CSS/JS)
└── server/          # Backend API
    ├── agent/       # Core agent loop & context
    ├── bus/         # Async message bus
    ├── channels/    # Telegram, WhatsApp
    ├── cron/        # Scheduler
    ├── heartbeat/   # Proactive wake-up
    ├── providers/   # LLM providers (Ollama, OpenRouter, OpenAI, Groq)
    ├── session/     # Session management
    ├── skills/      # Markdown-based skills (5)
    ├── tools/       # Built-in tools (31)
    └── server.js    # Express API
```

## 🛠️ Tools (31 functions)

| Category | Tools |
|----------|-------|
| **Filesystem** | read_file, write_file, edit_file, list_directory, create_directory, delete_file, move_file, search_files, open_file, glob_search |
| **Shell** | execute_command, get_environment, get_system_info |
| **Web** | fetch_url, scrape_page |
| **Memory** | remember, recall, forget, search_memory |
| **Message** | send_message, notify_user |
| **Cron** | schedule_reminder, list_reminders, cancel_reminder, get_reminder |
| **Planner** | ask_user_question, todo, task |
| **Spawn** | spawn_subagent, list_subagents, get_subagent_status |

## 📚 Skills

| Skill | Description |
|-------|-------------|
| **github** | GitHub CLI (`gh`) integration |
| **weather** | Weather via wttr.in/Open-Meteo |
| **summarize** | URL/file/YouTube summarization |
| **tmux** | Interactive terminal sessions |
| **skill-creator** | Create new skills |

## ⚙️ Configuration

Edit `~/.chatdock/settings.json`:

```json
{
  "defaultProvider": "ollama",
  "model": "llama3.2:3b",
  "providers": {
    "ollama": { "apiBase": "http://127.0.0.1:11434" },
    "openrouter": { "apiKey": "sk-or-..." },
    "openai": { "apiKey": "sk-..." },
    "groq": { "apiKey": "gsk_..." }
  },
  "telegram": {
    "enabled": false,
    "token": "YOUR_BOT_TOKEN"
  },
  "whatsapp": {
    "enabled": false,
    "bridgeUrl": "ws://localhost:8080"
  }
}
```

## 🤖 Agent Workflow

```
User Message → Build Context → LLM Call → Tool Calls? 
                                              ↓ Yes
                                         Execute Tools → Add Results → Loop (max 20)
                                              ↓ No
                                         Return Response
```

## 📁 User Data

All user data is stored in `~/.chatdock/`:

```
~/.chatdock/
├── settings.json     # Configuration
├── cron.json         # Scheduled jobs
├── session.json      # Chat history
├── AGENTS.md         # Agent guidelines
├── SOUL.md           # Personality
├── USER.md           # User info
├── TOOLS.md          # Tool guidelines
├── IDENTITY.md       # Core identity
├── memory/           # Long-term memory
│   └── MEMORY.md
├── sessions/         # Session data
└── skills/           # User-created skills
```

## 🔌 API Endpoints

```bash
# Chat
POST /chat           { "message": "Hello", "model": "llama3.2:3b" }

# Providers
GET  /providers      # List available providers
GET  /models         # List available models

# Cron
GET  /cron/list      # List scheduled jobs
POST /cron/add       # Add a job
DELETE /cron/remove/:id

# Health
GET  /health         # Server status
```

## 🧩 Adding Skills

Create `~/.chatdock/skills/my-skill/SKILL.md`:

```markdown
---
name: my-skill
description: What this skill does
emoji: 🎯
---

# My Skill

Instructions for the agent...
```

## 🛠️ Development

```bash
npm run server    # Start server only
npm start         # Start Electron app
npm run onboard   # Run setup wizard
npm run status    # Check configuration
npm run build     # Build for production
```

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/my-feature`
3. **Commit** your changes: `git commit -m 'Add my feature'`
4. **Push** to the branch: `git push origin feature/my-feature`
5. **Open** a Pull Request

### Guidelines

- Keep PRs focused on a single feature or fix
- Add tests for new tools or skills
- Update documentation as needed
- Follow the existing code style

### Ideas for Contributions

- 🛠️ New tools (image generation, audio, etc.)
- 📚 New skills (Jira, Slack, Notion, etc.)
- 🌐 New channels (Discord, Matrix, etc.)
- 🔌 New providers (Anthropic, Mistral, etc.)
- 🐛 Bug fixes and improvements

## 📄 License

[MIT](LICENSE)
