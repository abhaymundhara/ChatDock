/**
 * Tests for Task Tree Management
 * Testing hierarchical task decomposition with dependencies
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const {
  createTask,
  buildTaskTree,
  flattenTaskTree,
  findTaskById,
  updateTaskState,
  getReadyTasks,
  treeSubTasks,
  getTaskTreeStats,
  validateTaskDependencies,
} = await import("../src/server/orchestrator/task-tree.js");

describe("Task Tree - Basic Operations", () => {
  it("should create a task with default values", () => {
    const task = createTask({ content: "Test task" });

    assert.ok(task.id, "Task should have an ID");
    assert.equal(task.content, "Test task");
    assert.equal(task.state, "pending");
    assert.deepEqual(task.dependencies, []);
    assert.deepEqual(task.subtasks, []);
  });

  it("should create a task with dependencies", () => {
    const task = createTask({
      content: "Task 2",
      dependencies: ["task_1"],
    });

    assert.deepEqual(task.dependencies, ["task_1"]);
  });

  it("should build a task tree from single task", () => {
    const taskCalls = [
      {
        task_description: "Read file",
        agent_type: "file",
        depends_on: [],
      },
    ];

    const tree = buildTaskTree(taskCalls);

    assert.ok(tree, "Should create a tree");
    assert.equal(tree.content, "Read file");
    assert.equal(tree.agent_type, "file");
  });

  it("should build a task tree from multiple tasks with coordinator", () => {
    const taskCalls = [
      {
        task_description: "Task 1",
        agent_type: "file",
        depends_on: [],
      },
      {
        task_description: "Task 2",
        agent_type: "shell",
        depends_on: ["task_1"],
      },
    ];

    const tree = buildTaskTree(taskCalls);

    assert.ok(tree, "Should create a tree");
    assert.equal(tree.agent_type, "coordinator");
    assert.equal(tree.subtasks.length, 2);
  });
});

describe("Task Tree - Dependency Management", () => {
  it("should flatten a task tree", () => {
    const root = createTask({ content: "Root", agent_type: "coordinator" });
    root.subtasks = [
      createTask({ content: "Task 1", parent_id: root.id }),
      createTask({ content: "Task 2", parent_id: root.id }),
    ];

    const flat = flattenTaskTree(root);

    assert.equal(flat.length, 3, "Should have 3 tasks (root + 2 subtasks)");
  });

  it("should find task by ID", () => {
    const root = createTask({ content: "Root" });
    const child = createTask({ content: "Child", parent_id: root.id });
    root.subtasks = [child];

    const found = findTaskById(root, child.id);

    assert.ok(found, "Should find the task");
    assert.equal(found.content, "Child");
  });

  it("should update task state", () => {
    const task = createTask({ content: "Test" });
    const updated = updateTaskState(task, task.id, "completed", {
      result: "Success",
    });

    assert.ok(updated, "Should update successfully");
    assert.equal(task.state, "completed");
    assert.equal(task.result, "Success");
  });

  it("should get tasks ready to execute (no dependencies)", () => {
    const root = createTask({ content: "Root", agent_type: "coordinator" });
    root.subtasks = [
      createTask({ content: "Task 1", agent_type: "file", parent_id: root.id }),
      createTask({
        content: "Task 2",
        agent_type: "shell",
        parent_id: root.id,
      }),
    ];

    const ready = getReadyTasks(root);

    assert.equal(ready.length, 2, "Both tasks should be ready");
  });

  it("should get tasks ready to execute (with dependencies)", () => {
    const root = createTask({ content: "Root", agent_type: "coordinator" });
    const task1 = createTask({
      id: "task_1",
      content: "Task 1",
      agent_type: "file",
      parent_id: root.id,
    });
    const task2 = createTask({
      id: "task_2",
      content: "Task 2",
      agent_type: "shell",
      dependencies: ["task_1"],
      parent_id: root.id,
    });
    root.subtasks = [task1, task2];

    let ready = getReadyTasks(root);
    assert.equal(ready.length, 1, "Only task 1 should be ready");
    assert.equal(ready[0].id, "task_1");

    // Complete task 1
    updateTaskState(root, "task_1", "completed");

    ready = getReadyTasks(root);
    assert.equal(ready.length, 1, "Now task 2 should be ready");
    assert.equal(ready[0].id, "task_2");
  });

  it("should validate task dependencies (no cycles)", () => {
    const root = createTask({ content: "Root", agent_type: "coordinator" });
    root.subtasks = [
      createTask({
        id: "task_1",
        content: "Task 1",
        agent_type: "file",
        parent_id: root.id,
      }),
      createTask({
        id: "task_2",
        content: "Task 2",
        agent_type: "shell",
        dependencies: ["task_1"],
        parent_id: root.id,
      }),
    ];

    const valid = validateTaskDependencies(root);
    assert.ok(valid, "Should be valid (no cycles)");
  });

  it("should detect circular dependencies", () => {
    const root = createTask({ content: "Root", agent_type: "coordinator" });
    const task1 = createTask({
      id: "task_1",
      content: "Task 1",
      agent_type: "file",
      dependencies: ["task_2"],
      parent_id: root.id,
    });
    const task2 = createTask({
      id: "task_2",
      content: "Task 2",
      agent_type: "shell",
      dependencies: ["task_1"],
      parent_id: root.id,
    });
    root.subtasks = [task1, task2];

    const valid = validateTaskDependencies(root);
    assert.ok(!valid, "Should be invalid (circular dependency)");
  });
});

describe("Task Tree - Serialization", () => {
  it("should serialize task tree for frontend", () => {
    const root = createTask({ content: "Root", agent_type: "coordinator" });
    root.subtasks = [
      createTask({
        content: "Task 1",
        agent_type: "file",
        state: "completed",
        parent_id: root.id,
      }),
      createTask({
        content: "Task 2",
        agent_type: "shell",
        state: "pending",
        parent_id: root.id,
      }),
    ];

    const serialized = treeSubTasks(root);

    assert.ok(Array.isArray(serialized), "Should return an array");
    assert.equal(serialized.length, 1, "Should have root task");
    assert.equal(
      serialized[0].subtasks.length,
      2,
      "Root should have 2 subtasks",
    );
    assert.equal(serialized[0].subtasks[0].state, "completed");
    assert.equal(serialized[0].subtasks[1].state, "pending");
  });

  it("should filter out empty tasks in serialization", () => {
    const tasks = [
      createTask({ content: "Valid task", agent_type: "file" }),
      createTask({ content: "", agent_type: "shell" }),
      createTask({ content: "Another valid task", agent_type: "web" }),
    ];

    const serialized = treeSubTasks(tasks);

    assert.equal(serialized.length, 2, "Should filter out empty task");
  });

  it("should calculate task tree statistics", () => {
    const root = createTask({ content: "Root", agent_type: "coordinator" });
    root.subtasks = [
      createTask({ content: "Task 1", state: "completed" }),
      createTask({ content: "Task 2", state: "pending" }),
      createTask({ content: "Task 3", state: "running" }),
      createTask({ content: "Task 4", state: "failed" }),
    ];

    const stats = getTaskTreeStats(root);

    assert.equal(stats.total, 5, "Should count all tasks");
    assert.equal(stats.completed, 1);
    assert.equal(stats.pending, 1);
    assert.equal(stats.running, 1);
    assert.equal(stats.failed, 1);
  });
});
