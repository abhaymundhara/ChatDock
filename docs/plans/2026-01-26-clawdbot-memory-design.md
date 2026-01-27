# Clawdbot-Style Memory Design

**Goal:** Mirror Clawdbot’s workspace-based memory so ChatDock keeps context across sessions without bloating prompts.

## Summary
ChatDock already has a MemoryManager + memory tools, but memory lives in a home folder and only partially influences prompts. We will align storage and injection with Clawdbot: memory lives under the workspace (`<app>/Memory`), and the agent loads `MEMORY.md` plus **today’s** and **yesterday’s** daily logs on every request. This keeps persistent memory stable and predictable while keeping the context window bounded. Memory writes still go to daily logs by default, with `permanent=true` appending to `MEMORY.md`.

## Architecture
- **Storage Path:** Use `CHATDOCK_APP_PATH` (or `process.cwd()`) to resolve `Memory/` inside the repo. This mirrors Clawdbot’s “workspace memory” model.
- **Memory Context Assembly:** Add `MemoryManager.getClawdbotContext()` to read `Memory/MEMORY.md` + daily logs for today and yesterday. Missing files are created with minimal defaults.
- **Prompt Injection:** Orchestrator always injects the Clawdbot memory block into the system prompt for every request. Existing “relevant past context” continues to augment this from conversation search.
- **Tooling:** Export memory tools in `src/server/tools/index.js` and inject the orchestrator’s MemoryManager into the memory tool module so all writes go to the same memory directory.

## Error Handling
- If memory files are missing: create minimal files; continue.
- If daily logs can’t be read: skip that log; continue.
- If SQLite indexing fails: fallback to in-memory search (current behavior).

## Testing
- Validate `MemoryManager` uses workspace path and includes today + yesterday logs in context.
- Validate tool registry exposes memory tools.

## Success Criteria
- Memory files live in `/Users/mac/ChatDock/Memory` (or `<app>/Memory`).
- Every request includes Clawdbot memory block in the system prompt.
- Memory tools are available to the agent and use the same workspace memory directory.
