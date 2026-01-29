/**
 * Task Tree Management for ChatDock
 * Manages hierarchical task structures with dependencies
 * Inspired by Eigent AI's Workforce decomposition pattern
 */

/**
 * Create a task node in the tree
 * @param {Object} options - Task options
 * @returns {Object} Task node
 */
function createTask(options = {}) {
  const {
    id = null,
    content = "",
    agent_type = null,
    state = "pending",
    dependencies = [],
    subtasks = [],
    parent_id = null,
    assigned_worker = null,
    result = null,
    failure_count = 0,
  } = options;

  return {
    id: id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    content,
    agent_type,
    state, // pending, waiting, running, completed, failed
    dependencies, // array of task IDs this task depends on
    subtasks, // array of child task objects
    parent_id,
    assigned_worker, // specialist type that will handle this task
    result,
    failure_count,
  };
}

/**
 * Build a task tree from planner tool calls
 * @param {Array} taskCalls - Task tool calls from planner
 * @returns {Object} Root task with subtasks
 */
function buildTaskTree(taskCalls) {
  if (!taskCalls || taskCalls.length === 0) {
    return null;
  }

  // If single task, return it directly
  if (taskCalls.length === 1) {
    const task = taskCalls[0];
    return createTask({
      content: task.task_description,
      agent_type: task.agent_type,
      assigned_worker: task.agent_type,
      dependencies: task.depends_on || [],
    });
  }

  // For multiple tasks, create a root coordinator task
  const rootTask = createTask({
    content: "Coordinate multiple tasks",
    agent_type: "coordinator",
    assigned_worker: "coordinator",
    state: "pending",
  });

  // Add all tasks as subtasks
  const taskMap = new Map();

  taskCalls.forEach((taskCall) => {
    const task = createTask({
      content: taskCall.task_description,
      agent_type: taskCall.agent_type,
      assigned_worker: taskCall.agent_type,
      dependencies: taskCall.depends_on || [],
      parent_id: rootTask.id,
    });

    taskMap.set(task.id, task);
    rootTask.subtasks.push(task);
  });

  return rootTask;
}

/**
 * Flatten task tree into list (depth-first)
 * @param {Object} task - Root task
 * @param {Array} result - Accumulator
 * @returns {Array} Flat list of tasks
 */
function flattenTaskTree(task, result = []) {
  if (!task) return result;

  result.push(task);

  if (task.subtasks && task.subtasks.length > 0) {
    task.subtasks.forEach((subtask) => flattenTaskTree(subtask, result));
  }

  return result;
}

/**
 * Find task by ID in tree
 * @param {Object} rootTask - Root task
 * @param {string} taskId - Task ID to find
 * @returns {Object|null} Found task or null
 */
function findTaskById(rootTask, taskId) {
  if (!rootTask) return null;
  if (rootTask.id === taskId) return rootTask;

  if (rootTask.subtasks && rootTask.subtasks.length > 0) {
    for (const subtask of rootTask.subtasks) {
      const found = findTaskById(subtask, taskId);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Update task state in tree
 * @param {Object} rootTask - Root task
 * @param {string} taskId - Task ID to update
 * @param {string} state - New state
 * @param {Object} updates - Additional updates
 * @returns {boolean} True if task was found and updated
 */
function updateTaskState(rootTask, taskId, state, updates = {}) {
  const task = findTaskById(rootTask, taskId);
  if (!task) return false;

  task.state = state;
  Object.assign(task, updates);

  return true;
}

/**
 * Get tasks that are ready to execute (all dependencies met)
 * @param {Object} rootTask - Root task
 * @returns {Array} Tasks ready for execution
 */
function getReadyTasks(rootTask) {
  const allTasks = flattenTaskTree(rootTask);
  const completedTaskIds = new Set(
    allTasks.filter((t) => t.state === "completed").map((t) => t.id),
  );

  return allTasks.filter((task) => {
    // Skip if already running, completed, or failed
    if (["running", "completed", "failed"].includes(task.state)) {
      return false;
    }

    // Skip coordinator tasks
    if (task.agent_type === "coordinator") {
      return false;
    }

    // Check if all dependencies are completed
    if (task.dependencies && task.dependencies.length > 0) {
      return task.dependencies.every((depId) => completedTaskIds.has(depId));
    }

    return true;
  });
}

/**
 * Serialize task tree for frontend (similar to Eigent's tree_sub_tasks)
 * @param {Object|Array} tasks - Task or array of tasks
 * @param {number} depth - Current depth (for recursion limit)
 * @returns {Array} Serialized task tree
 */
function treeSubTasks(tasks, depth = 0) {
  // Limit depth to prevent infinite recursion
  if (depth > 5) {
    return [];
  }

  // Handle single task
  if (!Array.isArray(tasks)) {
    tasks = [tasks];
  }

  // Filter out empty tasks and map to frontend format
  return tasks
    .filter((task) => task && task.content && task.content.trim() !== "")
    .map((task) => ({
      id: task.id,
      content: task.content,
      state: task.state,
      agent_type: task.agent_type,
      assigned_worker: task.assigned_worker,
      dependencies: task.dependencies || [],
      result: task.result,
      failure_count: task.failure_count || 0,
      subtasks:
        task.subtasks && task.subtasks.length > 0
          ? treeSubTasks(task.subtasks, depth + 1)
          : [],
    }));
}

/**
 * Calculate task tree statistics
 * @param {Object} rootTask - Root task
 * @returns {Object} Statistics
 */
function getTaskTreeStats(rootTask) {
  const allTasks = flattenTaskTree(rootTask);

  return {
    total: allTasks.length,
    pending: allTasks.filter((t) => t.state === "pending").length,
    waiting: allTasks.filter((t) => t.state === "waiting").length,
    running: allTasks.filter((t) => t.state === "running").length,
    completed: allTasks.filter((t) => t.state === "completed").length,
    failed: allTasks.filter((t) => t.state === "failed").length,
  };
}

/**
 * Validate task dependencies (no cycles)
 * @param {Object} rootTask - Root task
 * @returns {boolean} True if valid (no cycles)
 */
function validateTaskDependencies(rootTask) {
  const allTasks = flattenTaskTree(rootTask);
  const taskMap = new Map(allTasks.map((t) => [t.id, t]));

  // Check for cycles using DFS
  const visited = new Set();
  const recursionStack = new Set();

  function hasCycle(taskId) {
    if (recursionStack.has(taskId)) {
      return true; // Cycle detected
    }
    if (visited.has(taskId)) {
      return false; // Already checked
    }

    visited.add(taskId);
    recursionStack.add(taskId);

    const task = taskMap.get(taskId);
    if (task && task.dependencies) {
      for (const depId of task.dependencies) {
        if (hasCycle(depId)) {
          return true;
        }
      }
    }

    recursionStack.delete(taskId);
    return false;
  }

  // Check all tasks
  for (const task of allTasks) {
    if (hasCycle(task.id)) {
      return false;
    }
  }

  return true;
}

module.exports = {
  createTask,
  buildTaskTree,
  flattenTaskTree,
  findTaskById,
  updateTaskState,
  getReadyTasks,
  treeSubTasks,
  getTaskTreeStats,
  validateTaskDependencies,
};
