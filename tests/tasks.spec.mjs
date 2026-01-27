import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "chatdock-tasks-"));
}

async function loadPlanningModule() {
  const moduleUrl = pathToFileURL(path.resolve("src/server/tools/planning.js"));
  return import(`${moduleUrl.href}?t=${Date.now()}`);
}

test("task_write replaces by default and computes dependencies", async () => {
  const tempDir = createTempDir();
  process.env.CHATDOCK_USER_DATA = tempDir;
  const { task_write } = await loadPlanningModule();
  const result = await task_write.run({
    title: "Plan",
    tasks: [
      { id: "task_1", task: "First", status: "pending", dependsOn: [] },
      {
        id: "task_2",
        task: "Second",
        status: "pending",
        dependsOn: ["task_1"],
      },
    ],
  });

  assert.equal(result.tasks.length, 2);
  assert.deepEqual(result.dependencies.task_2, ["task_1"]);
});

test("task_write appends by id and task_update changes status", async () => {
  const tempDir = createTempDir();
  process.env.CHATDOCK_USER_DATA = tempDir;
  const { task_write, task_read, task_update } = await loadPlanningModule();
  await task_write.run({
    title: "Plan",
    tasks: [{ id: "task_1", task: "First" }],
  });
  await task_write.run({
    mode: "append",
    tasks: [
      { id: "task_1", status: "completed" },
      { id: "task_2", task: "Second" },
    ],
  });

  const read = await task_read.run();
  const t1 = read.tasks.find((t) => t.id === "task_1");
  assert.equal(t1.status, "completed");

  await task_update.run({ taskId: "task_2", status: "in_progress" });
  const read2 = await task_read.run();
  assert.equal(
    read2.tasks.find((t) => t.id === "task_2").status,
    "in_progress",
  );
});

test("task_read migrates current_plan.json when tasks file is missing", async () => {
  const tempDir = createTempDir();
  process.env.CHATDOCK_USER_DATA = tempDir;
  const { task_read } = await loadPlanningModule();
  const legacy = {
    title: "Legacy",
    tasks: [{ id: "task_1", task: "Legacy Task", status: "pending" }],
  };
  const legacyPath = path.join(tempDir, "current_plan.json");
  fs.writeFileSync(legacyPath, JSON.stringify(legacy));

  const migrated = await task_read.run();
  assert.equal(migrated.title, "Legacy");
  assert.equal(migrated.tasks.length, 1);
});

test("task_write accepts JSON string tasks", async () => {
  const tempDir = createTempDir();
  process.env.CHATDOCK_USER_DATA = tempDir;
  const { task_write } = await loadPlanningModule();
  const result = await task_write.run({
    title: "Plan",
    tasks: '["First","Second"]',
  });

  assert.equal(result.tasks.length, 2);
  assert.equal(result.tasks[0].task, "First");
  assert.equal(result.tasks[1].task, "Second");
});

test("task_update returns old status for workflow tracking", async () => {
  const tempDir = createTempDir();
  process.env.CHATDOCK_USER_DATA = tempDir;
  const { task_write, task_update } = await loadPlanningModule();

  await task_write.run({
    title: "Plan",
    tasks: [{ id: "task_1", task: "First", status: "pending" }],
  });

  const result = await task_update.run({
    taskId: "task_1",
    status: "in_progress",
  });

  assert.equal(result.oldStatus, "pending");
  assert.equal(result.newStatus, "in_progress");
  assert.equal(result.updated, "task_1");
});

test("task_update warns when multiple tasks are in_progress (Claude Cowork-style)", async () => {
  const tempDir = createTempDir();
  process.env.CHATDOCK_USER_DATA = tempDir;
  const { task_write, task_update } = await loadPlanningModule();

  await task_write.run({
    title: "Plan",
    tasks: [
      { id: "task_1", task: "First", status: "pending" },
      { id: "task_2", task: "Second", status: "pending" },
    ],
  });

  // Mark first task as in_progress
  await task_update.run({ taskId: "task_1", status: "in_progress" });

  // This should warn but still allow marking second task as in_progress
  const result = await task_update.run({
    taskId: "task_2",
    status: "in_progress",
  });

  assert.equal(result.newStatus, "in_progress");
  // Both tasks should be in_progress (warning issued but not blocked)
  assert.ok(
    result.plan.tasks.find(
      (t) => t.id === "task_1" && t.status === "in_progress",
    ),
  );
  assert.ok(
    result.plan.tasks.find(
      (t) => t.id === "task_2" && t.status === "in_progress",
    ),
  );
});

test("task workflow: proper state transitions (pending → in_progress → completed)", async () => {
  const tempDir = createTempDir();
  process.env.CHATDOCK_USER_DATA = tempDir;
  const { task_write, task_update, task_read } = await loadPlanningModule();

  // Create task
  await task_write.run({
    title: "Workflow Test",
    tasks: [{ id: "task_1", task: "Test Task", status: "pending" }],
  });

  // Mark in-progress
  const r1 = await task_update.run({ taskId: "task_1", status: "in_progress" });
  assert.equal(r1.oldStatus, "pending");
  assert.equal(r1.newStatus, "in_progress");

  // Mark completed
  const r2 = await task_update.run({ taskId: "task_1", status: "completed" });
  assert.equal(r2.oldStatus, "in_progress");
  assert.equal(r2.newStatus, "completed");

  // Verify final state
  const final = await task_read.run();
  assert.equal(final.tasks[0].status, "completed");
});
