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
  const moduleUrl = pathToFileURL(
    path.resolve("src/server/tools/planning.js"),
  );
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
  await task_write.run({ title: "Plan", tasks: [{ id: "task_1", task: "First" }] });
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
  assert.equal(read2.tasks.find((t) => t.id === "task_2").status, "in_progress");
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
