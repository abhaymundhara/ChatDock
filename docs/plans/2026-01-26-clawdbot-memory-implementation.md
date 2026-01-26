# Clawdbot-Style Memory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make ChatDock memory behave like Clawdbot: workspace `Memory/`, daily logs + `MEMORY.md` injected every request, and memory tools fully wired.

**Architecture:** Update `MemoryManager` to default to `<app>/Memory`, add a Clawdbot-style context builder (MEMORY.md + today/yesterday logs), and ensure orchestrator prompt injection uses this context. Export memory tools in the registry and inject a single MemoryManager instance into memory tools.

**Tech Stack:** Node.js, node:test, filesystem-based memory.

---

### Task 1: MemoryManager workspace path + Clawdbot context builder

**Files:**
- Modify: `src/server/utils/memory-manager.js`
- Create: `tests/memory.spec.mjs`

**Step 1: Write the failing tests**

```js
// tests/memory.spec.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { MemoryManager } = require("../src/server/utils/memory-manager");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "chatdock-memory-"));
}

function dateString(d) {
  return d.toISOString().split("T")[0];
}

test("MemoryManager uses workspace Memory directory", () => {
  const appPath = tempDir();
  const manager = new MemoryManager({ appPath });
  assert.equal(manager.memoryDir, path.join(appPath, "Memory"));
});

test("Clawdbot context includes MEMORY.md and daily logs", () => {
  const appPath = tempDir();
  const memoryDir = path.join(appPath, "Memory");
  const dailyDir = path.join(memoryDir, "daily");
  fs.mkdirSync(dailyDir, { recursive: true });

  fs.writeFileSync(path.join(memoryDir, "MEMORY.md"), "LONG_TERM", "utf-8");

  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  fs.writeFileSync(path.join(dailyDir, `${dateString(today)}.md`), "TODAY_LOG", "utf-8");
  fs.writeFileSync(path.join(dailyDir, `${dateString(yesterday)}.md`), "YESTERDAY_LOG", "utf-8");

  const manager = new MemoryManager({ appPath });
  const context = manager.getClawdbotContext();
  assert.ok(context.includes("LONG_TERM"));
  assert.ok(context.includes("TODAY_LOG"));
  assert.ok(context.includes("YESTERDAY_LOG"));
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/memory.spec.mjs`
Expected: FAIL (memoryDir defaults to home, getClawdbotContext missing)

**Step 3: Implement minimal workspace path + context builder**

- Update `MemoryManager` to resolve `memoryDir` from `options.appPath`, `process.env.CHATDOCK_APP_PATH`, or `process.cwd()`.
- Add `getClawdbotContext()` that reads:
  - `Memory/MEMORY.md`
  - `Memory/daily/<today>.md`
  - `Memory/daily/<yesterday>.md`
- Update `getCombinedMemory()` to return the Clawdbot context block.

**Step 4: Run test to verify it passes**

Run: `node --test tests/memory.spec.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/utils/memory-manager.js tests/memory.spec.mjs
git commit -m "feat: add clawdbot-style memory context"
```

---

### Task 2: Wire memory tools + single MemoryManager instance

**Files:**
- Modify: `src/server/tools/index.js`
- Modify: `src/server/tools/memory.js`
- Modify: `src/server/server-orchestrator.js`
- Modify: `tests/tools.spec.mjs`

**Step 1: Write failing test**

Add to `tests/tools.spec.mjs`:

```js
import { ToolRegistry } from "../src/server/orchestrator/index.js";

it("tool registry exposes memory tools", async () => {
  const registry = new ToolRegistry();
  await registry.discover();
  const defs = registry.getDefinitions().map((d) => d.name);
  assert.ok(defs.includes("memory_save"));
  assert.ok(defs.includes("memory_search"));
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/tools.spec.mjs`
Expected: FAIL (memory tools not registered)

**Step 3: Implement wiring**

- Export memory tools in `src/server/tools/index.js`.
- Fix `src/server/tools/memory.js` to create MemoryManager with `appPath` (not `dataDir`).
- In `src/server/server-orchestrator.js` create a single `MemoryManager` using `appPath`, pass it into the `Orchestrator`, and call `setMemoryManager` so memory tools share the instance.

**Step 4: Run test to verify it passes**

Run: `node --test tests/tools.spec.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/tools/index.js src/server/tools/memory.js src/server/server-orchestrator.js tests/tools.spec.mjs
git commit -m "feat: wire memory tools to workspace memory"
```

---

### Task 3: Orchestrator prompt always includes Clawdbot memory

**Files:**
- Modify: `src/server/orchestrator/orchestrator.js`
- Modify: `tests/orchestrator.spec.mjs`

**Step 1: Write failing test**

Add to `tests/orchestrator.spec.mjs`:

```js
it("injects Clawdbot memory into prompt", () => {
  const mockMemory = {
    getCombinedMemory: () => "## Clawdbot Memory\nTEST_BLOCK"
  };
  const orch = new Orchestrator({ memoryManager: mockMemory });
  const prompt = orch.buildAgenticPrompt({});
  assert.ok(prompt.includes("TEST_BLOCK"));
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/orchestrator.spec.mjs`
Expected: FAIL if prompt doesn’t include memory block

**Step 3: Implement minimal change**

- Ensure `buildAgenticPrompt()` always injects `memory.getCombinedMemory()` (which now returns Clawdbot context) and that mocks are used during tests.

**Step 4: Run test to verify it passes**

Run: `node --test tests/orchestrator.spec.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/orchestrator/orchestrator.js tests/orchestrator.spec.mjs
git commit -m "feat: inject clawdbot memory in prompts"
```

---

### Task 4: Full verification

**Step 1: Run full test suite**

Run: `npm test`
Expected: PASS

**Step 2: Commit final verification (if needed)**

```bash
# only if there are uncommitted changes
```

---

Plan complete and saved to `docs/plans/2026-01-26-clawdbot-memory-implementation.md`. Two execution options:

1. Subagent-Driven (this session) — I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) — Open new session with executing-plans, batch execution with checkpoints

Which approach?
