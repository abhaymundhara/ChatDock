# Workflow Enforcement + ToolFinder Design

**Date:** 2026-01-26

## Goal
Force a deterministic workflow for every request: **UserInput → Tasks → ToolFinder → ToolCall**. Remove “standard query” bypasses. Always create tasks first. If the model uses tools, it must call ToolFinder first.

## Scope
- Always require `task_write` as the first tool call for every request.
- Rename tool `tool_search` → `tool_finder` and enforce it before any non-planning tool.
- Remove “standard query optional planning” logic and logs.
- Strengthen system prompts and brain instructions to match the workflow.
- Add a lightweight UI indicator for workflow steps in the ACE bar.

## Non-goals
- Multi-session task collaboration.
- Changing tool behaviors beyond rename + enforcement.

## Workflow Rules
1. **Task creation is mandatory**: `task_write` must be the first tool call for every request.
2. **ToolFinder gate**: Any tool call other than planning tools must be preceded by `tool_finder` in the current loop iteration.
3. **No “standard query” bypass**: even simple queries get a single-task plan.

## Tool Renames
- `tool_search` → `tool_finder` (same behavior, new name).
- Update references across prompt text, docs/brain, tests, and tool registry.

## Enforcement Mechanics
- Orchestrator tracks per-iteration flags:
  - `hasTaskPlan` (set after `task_write`)
  - `hasToolFinder` (set after `tool_finder`)
- If first tool is not `task_write`, inject an instruction requiring tasks and restart loop.
- If a non-planning tool is called without `tool_finder`, inject an instruction to call `tool_finder` first and restart loop.
- Planning tools allowed before ToolFinder: `task_write`, `think`, `ask_user`.

## UI Indicator
- Add a compact “workflow strip” above the tasks/messages in `ace-interface.html`.
- Steps show status: Pending → Active → Done.
- Reflects server events (new `workflow` stream event), or inferred locally from stream order.

## Expected Result
- Logs always show `task_write` first, then `tool_finder`, then any tool call.
- UI shows the workflow progress (Tasks → ToolFinder → ToolCall).
- Simple queries still generate tasks before response.
