# Tasks Workflow + UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace todo-based planning with task tools + dependencies and render a live, editable task strip in the ACE UI.

**Architecture:** Rename `todo_*` tools to `task_*`, persist tasks to `current_tasks.json` with dependency metadata, and emit `type: "tasks"` events from the orchestrator. The UI listens for `tasks` events and updates an inline task strip with status + title edits that write back via `task_write` (append mode).

**Tech Stack:** Node.js (server/tools), Electron renderer (HTML/CSS/JS), node:test, streaming NDJSON.

---

### Task 1: Task tools + storage (rename + dependencies + append)

**Files:**
- Modify: `src/server/tools/planning.js`
- Create: `tests/tasks.spec.mjs`

**Step 1: Write failing tests for task tools**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatdock-tasks-'));
process.env.CHATDOCK_USER_DATA = tempDir;

const { task_write, task_read, task_update } = await import('../src/server/tools/planning.js');

test('task_write replaces by default and computes dependencies', async () => {
  const result = await task_write.run({
    title: 'Plan',
    tasks: [
      { id: 'task_1', task: 'First', status: 'pending', dependsOn: [] },
      { id: 'task_2', task: 'Second', status: 'pending', dependsOn: ['task_1'] }
    ]
  });
  assert.equal(result.tasks.length, 2);
  assert.deepEqual(result.dependencies.task_2, ['task_1']);
});

test('task_write appends by id and task_update changes status', async () => {
  await task_write.run({ title: 'Plan', tasks: [{ id: 'task_1', task: 'First' }] });
  await task_write.run({ mode: 'append', tasks: [{ id: 'task_1', status: 'completed' }, { id: 'task_2', task: 'Second' }] });
  const read = await task_read.run();
  const t1 = read.tasks.find(t => t.id === 'task_1');
  assert.equal(t1.status, 'completed');
  await task_update.run({ taskId: 'task_2', status: 'in_progress' });
  const read2 = await task_read.run();
  assert.equal(read2.tasks.find(t => t.id === 'task_2').status, 'in_progress');
});

test('task_read migrates current_plan.json when tasks file is missing', async () => {
  const legacy = {
    title: 'Legacy',
    tasks: [{ id: 'task_1', task: 'Legacy Task', status: 'pending' }]
  };
  const legacyPath = path.join(tempDir, 'current_plan.json');
  fs.writeFileSync(legacyPath, JSON.stringify(legacy));
  const migrated = await task_read.run();
  assert.equal(migrated.title, 'Legacy');
  assert.equal(migrated.tasks.length, 1);
});
```

**Step 2: Run tests to verify failure**

Run: `node --test tests/tasks.spec.mjs`
Expected: FAIL (task_* exports missing / behavior not implemented).

**Step 3: Implement task tools + storage**

Update `src/server/tools/planning.js`:
- Rename exports: `task_write`, `task_read`, `task_update`.
- Add `mode` parameter to `task_write` (default `replace`).
- Compute `dependencies` map from `dependsOn` for each task.
- Use `CHATDOCK_USER_DATA` or `~/.chatdock` for storage.
- Migrate `current_plan.json` to `current_tasks.json` when needed.

Minimal implementation sketch:
```js
function getTasksDir() {
  return process.env.CHATDOCK_USER_DATA || path.join(os.homedir(), '.chatdock');
}
function getTasksFile() {
  return path.join(getTasksDir(), 'current_tasks.json');
}
function computeDependencies(tasks) {
  return Object.fromEntries(tasks.map(t => [t.id, t.dependsOn || []]));
}
```

**Step 4: Re-run tests**

Run: `node --test tests/tasks.spec.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/tools/planning.js tests/tasks.spec.mjs
git commit -m "feat: replace todo tools with task tools"
```

---

### Task 2: Orchestrator + prompt updates + tasks streaming event

**Files:**
- Modify: `src/server/orchestrator/orchestrator.js`
- Modify: `src/server/orchestrator/prompt-builder.js`
- Modify: `docs/PLANNING_ENFORCEMENT.md`
- Modify: `tests/orchestrator.spec.mjs`

**Step 1: Write failing test for prompt text update**

Add to `tests/orchestrator.spec.mjs`:
```js
it('prompt references task_write for planning', () => {
  const builder = new PromptBuilder();
  const prompt = builder.build();
  assert.ok(prompt.includes('task_write'));
  assert.ok(!prompt.includes('todo_write'));
});
```

**Step 2: Run test to verify failure**

Run: `node --test tests/orchestrator.spec.mjs`
Expected: FAIL (prompt still references todo_write)

**Step 3: Implement prompt + orchestrator updates**

- Update prompt text from `todo_write` → `task_write`.
- Update planning tool list in orchestrator to include `task_write` and remove `todo_write`.
- After `task_*` tool results, emit `type: "tasks"` event:
```js
if (toolCall.function.name.startsWith('task_')) {
  yield { type: 'tasks', data: result };
}
```
- Update `docs/PLANNING_ENFORCEMENT.md` terminology to tasks.

**Step 4: Re-run test**

Run: `node --test tests/orchestrator.spec.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/orchestrator/orchestrator.js src/server/orchestrator/prompt-builder.js tests/orchestrator.spec.mjs docs/PLANNING_ENFORCEMENT.md
git commit -m "refactor: rename planning tools to tasks and emit tasks events"
```

---

### Task 3: ACE task strip UI + inline edits

**Files:**
- Modify: `src/renderer/ace-interface.html`
- Modify: `src/renderer/styles/ace-ui.css`
- Create: `tests/tasks-ui.spec.mjs`

**Step 1: Write failing UI test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('src/renderer/ace-interface.html', 'utf-8');

test('ace interface includes task strip container', () => {
  assert.ok(html.includes('tasks-strip'));
  assert.ok(html.includes('tasks-list'));
});

test('ace interface handles tasks stream events', () => {
  assert.ok(html.includes('event.type === "tasks"'));
});
```

**Step 2: Run test to verify failure**

Run: `node --test tests/tasks-ui.spec.mjs`
Expected: FAIL (no task strip markup yet)

**Step 3: Implement UI + CSS**

- Add a `div.tasks-strip` above messages in `expanded-content`.
- Render tasks list items with status pill + editable title.
- Handle `type: "tasks"` events in stream parser and update DOM.
- Inline edit sends `/tools/execute` with `task_write` and `mode: "append"`.
- Add CSS for strip, rows, status pills, and mobile layout.

**Step 4: Re-run UI test**

Run: `node --test tests/tasks-ui.spec.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/ace-interface.html src/renderer/styles/ace-ui.css tests/tasks-ui.spec.mjs
git commit -m "feat: add task strip UI with inline edits"
```

---

### Task 4: Full verification

**Files:**
- None

**Step 1: Run full test suite**

Run: `npm test`
Expected: PASS (90+ tests)

**Step 2: Commit final verification (if needed)**

```bash
# Only if there are uncommitted changes
# Otherwise, skip
```

---

Plan complete and saved to `docs/plans/2026-01-26-tasks-workflow-implementation.md`. Two execution options:

1. Subagent-Driven (this session) — I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) — Open new session with executing-plans, batch execution with checkpoints

Which approach?
