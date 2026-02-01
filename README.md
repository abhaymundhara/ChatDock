# ChatDock

**ChatDock** is a local-first, safety-oriented AI assistant framework designed to give you a *ChatDock-like* agent on your own machine — transparent, controllable, and extensible.

Unlike cloud-based agent systems, ChatDock prioritizes:
- Explicit user intent
- Inspectable planning
- Controlled execution
- Local ownership of data and memory

---

## ✨ Key Features

### 🧠 Explicit Agent Architecture
- Clear separation between **Answer**, **Plan**, and **Execute**
- Planning is always visible; no silent execution
- Human approval at every boundary

### 📂 Workspace & Project Awareness
- Project-scoped workspaces
- Isolated notes, docs, and memory per project
- Safe sandboxed filesystem access

### 📝 Notes & Docs Management
- Save AI responses as notes or documents
- List, open, rename, and delete files
- Clean separation between exploratory notes and structured docs

### 🧷 Explicit Memory System
- Manual memory (`remember this`)
- Auto-memory (configurable, opt-out)
- Search/recall memories
- Global and project-specific memory scopes

### 🧭 Planner & Execution Engine
- Structured JSON plans
- Step-by-step execution
- Per-step permission (`allow` / `deny`)
- Dry runs and undo support
- Plan history, locking, templates, and export
- Execution ledger with step status + output
- Plan stats (success rate, duration, corrections)

### 🔐 Safety-First Execution
- Execution modes: `manual` / `disabled`
- Capability-based permissions
- Execution profiles (safe, editor, organizer, analysis)
- Audit logs for all actions

### 🧰 Skill Registry + Manifests
- Built-in skills + installable skills
- `skill.json` manifests with required capabilities
- Skill-aware planning

### 📡 Multi-Channel Bridge (Backend)
- Channel sessions mapped to a single local state
- Ingest endpoint for Slack/Discord/email connectors

### 💾 Sessions & Persistence
- Save and restore long-running sessions
- Reusable plans and templates
- Deterministic behavior across restarts

---

## 🧩 Core Design Philosophy

ChatDock is built around three explicit phases:

```
Answer → Plan → Execute
```

- **Answer:** Natural language assistance, no actions
- **Plan:** Structured, inspectable steps
- **Execute:** Explicit, permissioned actions

Nothing happens unless the user asks for it.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm or yarn
- macOS, Windows, or Linux
- Local LLM runtime (e.g. Ollama)

---

### Installation

```bash
git clone https://github.com/abhaymundhara/ChatDock.git
cd ChatDock
npm install
```

---

### Running ChatDock

```bash
npm run dev
```

This launches:
- The Electron desktop app
- The local chat server (default: `http://localhost:3001`)

---

## 🗣️ How to Use (Quick Guide)

Full guide: `ChatDock_How_To_Use.md`

### Ask Questions (Default Mode)
```
Explain execution modes and capabilities.
How should I organize a programming project?
```

### Create a Plan (Auto-planning)
```
Organize my workspace.
```
ChatDock detects task intent and creates a plan automatically. You still approve before any execution.

You can also explicitly say:
```
plan
```

### Inspect the Plan
```
show plan
plan status
check plan readiness
```

### Edit the Plan
```
Edit this plan: add a step to export results.
```

### Execute Steps
```
proceed with plan
execute step 1
allow step 1
```

---

## 📂 Projects

```text
create project <name>
switch project <name>
current project
set project description <text>
```

Each project has its own:
- Workspace
- Notes & docs
- Memory
- Context

---

## 📝 Notes & Docs

```text
save note
save doc
list notes
list docs
open note <name>
open doc <name>
rename note <old> to <new>
delete note <name>
```

### Markdown Files & Workspace Layout

Default workspace:
```
~/Desktop/chatdock_workspace
```

Markdown outputs:
- `notes/` → saved notes (`save note`)
- `docs/` → saved docs (`save doc`)
- `exports/` → exported plans and reports

---

## 🧠 Memory

```text
remember this
search memories <query>
recall <query>
list memories
show memory <id>
forget memory <id>
auto memory on
auto memory off
memory status
memory config
set memory <key> <value>
reset memory config
```

Memory is user-controlled, with auto-memory optional and configurable.

---

## ⏰ Reminders

```text
add reminder <text>
remind me <text>
list reminders
show reminder <id>
done reminder <id>
delete reminder <id>
snooze reminder <id> <minutes>
check reminders
```

---

## 🧰 Skills

```text
list skills
install skill <path>
remove skill <name-or-id>
```

Skill manifests live in `skill.json` and include:
```json
{
  "name": "My Skill",
  "version": "1.0.0",
  "requiredCaps": ["read_file"]
}
```

---

## 📊 Plan Stats

```text
plan stats
```

Tracks success rate, average completion time, and corrections.

---

## 📡 Channels (Backend Bridge)

```text
list channels
register channel <channel> <userId>
remove channel <channel> <userId>
```

Use `/channels/ingest` in the server API to pipe messages from Slack/Discord/email into the same local session.

---

## ⌨️ Slash Commands (UI)

```text
/memory ...
/skills ...
/stats
/channels ...
```

Slash commands map to the same backend commands for quicker control.

---

## 🧭 Planning & Execution

```text
plan
show plan
plan status
execute step <n>
allow step <n>
deny step <n>
```

Additional features:
- Plan locking
- Undo / rollback
- Plan templates
- Export plans

---

## 🔐 Execution Safety

### Execution Modes
```text
show execution mode
set execution mode manual
set execution mode disabled
```

### Capabilities
```text
list capabilities
enable capability <name>
disable capability <name>
```

### Execution Profiles
```text
list execution profiles
use execution profile editor
```

---

## 💾 Sessions

```text
save session
list sessions
load session <id>
```

Sessions allow long-running workflows without losing state.

---

## 🆘 Help & Discoverability

```text
help
help commands
help execution
```

---

## 🏗️ Architecture Overview

- **Electron**: Desktop UI
- **Express**: Local chat & control server
- **Planner Engine**: Structured plan generation
- **Capability Registry**: Controlled tool access
- **Execution Engine**: Step-by-step executor
- **Local Filesystem**: Notes, docs, memory, sessions

All data stays on your machine.

---

## 🔒 Why ChatDock?

ChatDock is for users who want:
- Full control over AI actions
- Local-first privacy
- Inspectable reasoning
- Deterministic behavior
- A foundation for building powerful personal agents

It is intentionally different from cloud-first autonomous agents.

---

## 🛣️ Roadmap (High-Level)

- Intent-aware plan suggestions
- Agent routing and role-based agents
- OS-level actions (opt-in)
- Voice input/output
- Plugin ecosystem
- Cross-device sync (optional, user-controlled)

---

## 🤝 Contributing

Contributions are welcome.

Before contributing:
- Read the architecture
- Respect the safety and explicit-control principles
- Avoid introducing silent automation

---

## 📄 License

MIT License

---

## 🙌 Acknowledgements

Inspired by:
- Personal AI assistants (ChatDock)
- Agentic workflows
- Modern local LLM ecosystems
### ⏰ Reminders
- Add reminders with optional due times
- List, snooze, and complete reminders
