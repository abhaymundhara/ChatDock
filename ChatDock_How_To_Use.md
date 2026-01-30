# ChatDock (Jarvis) – How to Use Guide

This guide explains **how to use ChatDock / Jarvis correctly**, based on the current architecture and interaction model.
Please read this before using the system so expectations are clear.

---

## Core Philosophy

Jarvis is a **local-first, safety-first agent**.

- It does **not** silently plan.
- It does **not** silently execute.
- Every action is explicit, inspectable, and reversible.

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

## Planning vs Automatic Planning

Jarvis **does NOT automatically plan** just because you asked for an action.

Example:
```
Organize my workspace
```

Jarvis will:
- Explain *how* to do it
- Suggest approaches
- NOT create a plan unless you say `plan`

This is intentional and safer than auto-planning systems.

---

## Notes & Docs

Jarvis can save responses as **notes** or **docs**.

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

Jarvis has **explicit memory**. Nothing is saved automatically.

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

- Asking ≠ Planning
- Planning ≠ Execution
- Execution ≠ Automation

Jarvis always waits for **you**.

This is by design.

---

## Final Note

If something feels like:
> “Why didn’t Jarvis just do it?”

The answer is almost always:
> **Because you didn’t explicitly ask it to plan or execute.**

Once you internalize this, Jarvis becomes extremely powerful, predictable, and safe.
