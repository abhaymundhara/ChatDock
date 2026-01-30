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
- No silent planning or execution
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
- List, inspect, and forget memories
- Global and project-specific memory scopes
- No hidden or automatic memory writes

### 🧭 Planner & Execution Engine
- Structured JSON plans
- Step-by-step execution
- Per-step permission (`allow` / `deny`)
- Dry runs and undo support
- Plan history, locking, templates, and export

### 🔐 Safety-First Execution
- Execution modes: `manual` / `disabled`
- Capability-based permissions
- Execution profiles (safe, editor, organizer, analysis)
- Audit logs for all actions

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

### Ask Questions (Default Mode)
```
Explain execution modes and capabilities.
How should I organize a programming project?
```

### Create a Plan
```
I want to organize my workspace.
plan
```

### Inspect the Plan
```
show plan
plan status
check plan readiness
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

---

## 🧠 Memory

```text
remember this
list memories
show memory <id>
forget memory <id>
```

Memory is always explicit and user-controlled.

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
