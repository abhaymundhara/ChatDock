# Tasks Workflow + UI Design

**Date:** 2026-01-26

## Goal
Replace todo-based planning with a tasks system that supports dependencies, dynamic task creation, and an inline task strip UI inside the ACE bar. Execution continues automatically unless the model requests confirmation.

## Scope
- Rename planning tools from `todo_*` to `task_*`.
- Persist tasks to filesystem with dependency metadata.
- Stream task updates to the UI as the model refines the plan.
- Show tasks inline in the expanded ACE bar with status + inline edits.

## Non-goals
- Multi-session collaboration on the same task file.
- Complex workflow automation beyond task tracking.

## Task Data Model
Each task:
- `id` (string)
- `title` (string)
- `status` (`pending|in_progress|blocked|completed`)
- `dependsOn` (array of task ids)
- `notes` (optional string)

Plan object:
- `title` (string)
- `createdAt` / `updatedAt` (ISO)
- `tasks` (array)
- `dependencies` (map of taskId -> array of ids)

## Storage
- New file: `current_tasks.json` under user data dir.
- Use `process.env.CHATDOCK_USER_DATA` when set; fallback to `~/.chatdock/`.
- One-time migration: if `current_tasks.json` missing but `current_plan.json` exists, convert and save.

## Tools
- `task_write`: create/replace tasks. Supports `mode: "replace"|"append"` (default replace). Append merges by `id` and updates `dependencies`.
- `task_read`: returns current task plan.
- `task_update`: updates status/title for a specific task id.

## Orchestrator Events
When any `task_*` tool runs, emit:
```
{ "type": "tasks", "data": { "title": "...", "tasks": [...], "dependencies": {...}, "updatedAt": "..." } }
```
This lets the UI update live without parsing tool responses.

## UI (ACE bar)
- Task strip appears in expanded panel above messages.
- Each row shows: status pill, title, dependency hint.
- Inline edit: click title or status pill; updates via `task_write` (append) immediately.
- Read-only dependencies for now.
- Mobile: stack tasks with larger touch targets.

## Execution Flow
1. Model creates plan using `task_write`.
2. UI renders tasks from `tasks` events.
3. Model can append tasks over time with `mode: "append"`.
4. User edits update tasks via `task_write` (append).
5. Execution continues automatically unless the model asks for confirmation.
