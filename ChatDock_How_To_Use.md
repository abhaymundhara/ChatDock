# ChatDock (Jarvis) – How to Use Guide

This guide explains **how to use ChatDock / Jarvis correctly**, based on the current architecture and interaction model.
Please read this before using the system so expectations are clear.

---

## Core Philosophy

Jarvis is a **local-first, safety-first agent**.

- Planning is always visible and inspectable.
- It does **not** silently execute.
- Every action is explicit and reversible.

Think of Jarvis as:
> **Answer → Plan → Execute**, with human approval at every boundary.

---

## Interaction Modes (Very Important)

Jarvis operates in **three distinct modes**:

### 1. Answer Mode (Default)

This is the mode you are in **most of the time**.

Use this when you want:
- Explanations
- Suggestions
- Ideas
- Summaries
- Guidance

**Examples**
```
Explain execution modes and capabilities.
How should I organize a programming project?
What does this error mean?
```

In Answer Mode:
- Jarvis replies in natural language.
- No planning happens.
- No actions happen.
- Nothing is executed or changed.

---

### 2. Planner Mode (Explicit)

Planner Mode is **only activated when you explicitly ask for it**.

You activate it by typing:
```
plan
```
or
```
plan <goal>
```

**Example**
```
I want to organize my project workspace.
plan
```

In Planner Mode:
- Jarvis generates a **structured, step-by-step plan**
- The plan is shown as JSON
- Nothing is executed yet

You can inspect the plan using:
```
show plan
plan status
check plan readiness
```

---

### 3. Execution Mode (Always Explicit)

Execution only happens **after** a plan exists **and** you explicitly approve steps.

Typical flow:
```
plan
show plan
proceed with plan
execute step 1
allow step 1
```

Key points:
- Each step must be executed manually
- Sensitive steps require confirmation
- Execution can be disabled entirely

---

## Automatic Planning (Now Enabled)

Jarvis **can automatically plan** for task-like requests.

Example:
```
Organize my workspace
```

Jarvis will:
- Detect task intent
- Generate a plan
- Wait for your approval before execution

If you want **just an answer**, ask in question form (e.g. “How should I organize my workspace?”).

---

## Notes & Docs

Jarvis can save responses as **notes** or **docs**.
These are stored as Markdown files in your workspace.

### Save last response
```
save note
save doc
```

### List
```
list notes
list docs
```

### Open
```
open note <filename>
open doc <filename>
```

### Rename
```
rename note <old> to <new>
```

### Delete
```
delete note <filename>
delete doc <filename>
```

---

## Projects

Projects provide **scoped context, notes, and memory**.

### Create & switch
```
create project <name>
switch project <name>
```

### Check current project
```
current project
```

### Describe project
```
set project description <text>
```

Each project has:
- Its own notes
- Its own docs
- Its own memory
- Its own workspace context

---

## Memory System

Jarvis has **explicit memory** with **optional auto-memory** (configurable).

### Save memory
```
remember this
```

### View memory
```
list memories
show memory <id>
```

### Delete memory
```
forget memory <id>
```

### Search / Recall
```
search memories <query>
recall <query>
```

### Auto-memory controls
```
auto memory on
auto memory off
memory status
```

### Memory config
```
memory config
set memory <key> <value>
reset memory config
```

Memory can be:
- Global
- Project-specific

---

## Plans

Once a plan exists, you can:

### View
```
show plan
plan status
plan history
plan changes
```

### Edit
```
Edit this plan: add a step to export results
```

### Save & reuse
```
save plan
list plans
save plan as template
list plan templates
load plan <id>
```

### Locking
```
lock plan
unlock plan
```

Locked plans cannot be modified or executed.

---

## Execution Safety

### Execution modes
```
show execution mode
set execution mode manual
set execution mode disabled
```

- **Manual (default)**: every step must be approved
- **Disabled**: no execution allowed

---

## Capabilities

Jarvis can only do what capabilities allow.

### View
```
list capabilities
```

### Enable / disable
```
enable capability <name>
disable capability <name>
```

Examples:
- read_file
- write_file
- edit_file
- organize_files
- analyze_content
- os_action (future)

If a capability is disabled, steps using it cannot run.

---

## Execution Profiles

Profiles are **presets** for safety.

### View
```
list execution profiles
current execution profile
```

### Switch
```
use execution profile editor
use execution profile organizer
use execution profile safe
```

---

## Skills

Installable skills are supported with manifests (`skill.json`).

### List / install / remove
```
list skills
install skill <path>
remove skill <name-or-id>
```

---

## Plan Stats

```
plan stats
```

Shows plan success rate, average duration, and corrections.

---

## Channels (Backend Bridge)

```
list channels
register channel <channel> <userId>
remove channel <channel> <userId>
```

You can route Slack/Discord/email messages to the same local session via:
`/channels/ingest`.

---

## Slash Commands (UI)

```
/memory ...
/skills ...
/stats
/channels ...
```

Slash commands map to the same backend commands for faster control.

---

## Markdown Files & Workspace Layout

Default workspace location:
```
~/Desktop/chatdock_workspace
```

Common Markdown outputs:
- `notes/` → saved notes (`save note`)
- `docs/` → saved docs (`save doc`)
- `exports/` → exported plans and reports

You can open and edit these `.md` files directly in any editor.

---

## Sessions

Sessions allow long-running work.

### Save
```
save session
```

### Restore
```
list sessions
load session <id>
```

---

## Help System

Built-in help is always available:
```
help
help commands
help execution
```

---

## Mental Model to Remember

- Asking may trigger a plan (for task-like requests)
- Planning ≠ Execution
- Execution ≠ Automation

Jarvis always waits for **you**.

This is by design.

---

## Final Note

If something feels like:
> “Why didn’t Jarvis just do it?”

The answer is almost always:
> **Because you didn’t explicitly approve execution.**

Once you internalize this, Jarvis becomes extremely powerful, predictable, and safe.
