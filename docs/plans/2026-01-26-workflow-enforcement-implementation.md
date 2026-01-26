# Workflow Enforcement + ToolFinder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enforce a strict workflow (Tasks → ToolFinder → ToolCall) for every request, remove “standard query” bypasses, rename `tool_search` to `tool_finder`, and show workflow progress in the UI.

**Architecture:** Update the tool catalog and orchestrator to require `task_write` as the first tool call, enforce `tool_finder` before any non-planning tool, and emit a workflow status event. Strengthen prompts/brain docs to reflect the workflow. Add a compact workflow indicator in the ACE bar that updates from streamed events.

**Tech Stack:** Node.js (orchestrator/tools), Electron renderer (HTML/CSS/JS), node:test, NDJSON stream.

---

### Task 1: Rename tool_search → tool_finder and update tests

**Files:**
- Modify: `src/server/tools/tool-search.js`
- Modify: `src/server/tools/index.js`
- Modify: `tests/tools.spec.mjs`

**Step 1: Write failing test**

Add/adjust a test to assert the tool registry exposes `tool_finder` and does not expose `tool_search`.

```js
// tests/tools.spec.mjs
const tools = toolRegistry.getDefinitions().map(t => t.name);
assert.ok(tools.includes('tool_finder'));
assert.ok(!tools.includes('tool_search'));
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/tools.spec.mjs`
Expected: FAIL (tool_search still present)

**Step 3: Implement minimal rename**

- In `src/server/tools/tool-search.js`:
  - Rename the tool object to `tool_finder`.
  - Set `name: 'tool_finder'` and update description text.
- In `src/server/tools/index.js`:
  - Ensure the exported key is `tool_finder`.
- Update any hard-coded references to `tool_search` to `tool_finder`.

**Step 4: Re-run test**

Run: `node --test tests/tools.spec.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/tools/tool-search.js src/server/tools/index.js tests/tools.spec.mjs
git commit -m "refactor: rename tool_search to tool_finder"
```

---

### Task 2: Enforce workflow in orchestrator (tasks first, tool_finder gate)

**Files:**
- Modify: `src/server/orchestrator/orchestrator.js`
- Modify: `tests/orchestrator.spec.mjs`

**Step 1: Write failing test**

Add a test ensuring the prompt and/or logs no longer mention “standard query optional planning,” and that the orchestrator treats `task_write` as required.

```js
// tests/orchestrator.spec.mjs
const prompt = new PromptBuilder().build();
assert.ok(!prompt.includes('standard query'));
```

(If needed, add a small orchestrator unit test to validate enforcement flags or injected instruction messaging.)

**Step 2: Run test to verify it fails**

Run: `node --test tests/orchestrator.spec.mjs`
Expected: FAIL

**Step 3: Implement enforcement**

- Remove “standard query optional planning” behavior and logs from `detectComplexTask`.
- Add per-iteration flags:
  - `hasTaskPlan`, `hasToolFinder`.
- Enforce:
  - First tool call must be `task_write` (otherwise inject instruction + loop).
  - Any tool call that is not planning (`task_write`, `think`, `ask_user`) must be preceded by `tool_finder` in the current iteration.
- If violation, inject a system instruction message and continue loop.

**Step 4: Re-run tests**

Run: `node --test tests/orchestrator.spec.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/orchestrator/orchestrator.js tests/orchestrator.spec.mjs
git commit -m "feat: enforce tasks-first and tool_finder workflow"
```

---

### Task 3: Strengthen prompts + brain instructions

**Files:**
- Modify: `src/server/orchestrator/prompt-builder.js`
- Modify: `brain/AGENTS.md`

**Step 1: Write failing test**

Add a test asserting prompts reference `task_write` and `tool_finder` in the required workflow order.

```js
const prompt = new PromptBuilder().build();
assert.ok(prompt.includes('task_write'));
assert.ok(prompt.includes('tool_finder'));
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/orchestrator.spec.mjs`
Expected: FAIL (prompt still references tool_search or lacks strict order)

**Step 3: Implement prompt updates**

- Update prompt sections to explicitly require:
  - `task_write` FIRST for every request.
  - `tool_finder` BEFORE any tool usage.
- Update `brain/AGENTS.md` to match the same workflow instructions.

**Step 4: Re-run test**

Run: `node --test tests/orchestrator.spec.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/orchestrator/prompt-builder.js brain/AGENTS.md tests/orchestrator.spec.mjs
git commit -m "docs: require task_write then tool_finder in prompts"
```

---

### Task 4: Workflow indicator UI

**Files:**
- Modify: `src/renderer/ace-interface.html`
- Modify: `src/renderer/styles/ace-ui.css`
- Create: `tests/workflow-ui.spec.mjs`

**Step 1: Write failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('src/renderer/ace-interface.html', 'utf-8');

test('ace interface includes workflow strip container', () => {
  assert.ok(html.includes('workflow-strip'));
  assert.ok(html.includes('workflow-steps'));
});

test('ace interface handles workflow stream events', () => {
  assert.ok(html.includes('event.type === "workflow"'));
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/workflow-ui.spec.mjs`
Expected: FAIL

**Step 3: Implement UI**

- Add a `workflow-strip` above tasks/messages.
- Add three steps: Tasks → ToolFinder → ToolCall.
- Update stream parser to handle `event.type === "workflow"` and update step states.
- Minimal CSS: small pills, active/complete styling, mobile-friendly sizes.

**Step 4: Re-run test**

Run: `node --test tests/workflow-ui.spec.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/ace-interface.html src/renderer/styles/ace-ui.css tests/workflow-ui.spec.mjs
git commit -m "feat: add workflow indicator strip"
```

---

### Task 5: Full verification

**Files:**
- None

**Step 1: Run full test suite**

Run: `npm test`
Expected: PASS

**Step 2: Commit final verification (if needed)**

```bash
# only if there are uncommitted changes
```

---

Plan complete and saved to `docs/plans/2026-01-26-workflow-enforcement-implementation.md`. Two execution options:

1. Subagent-Driven (this session) — I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) — Open new session with executing-plans, batch execution with checkpoints

Which approach?
