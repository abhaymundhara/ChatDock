/**
 * Planning Tools
 * Tools for task planning, user interaction, and thinking
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// In-memory plan storage (also persisted to file)
let currentTasks = null;
let currentTasksDir = null;

function getTasksDir() {
  return process.env.CHATDOCK_USER_DATA || path.join(os.homedir(), ".chatdock");
}

function getTasksFile() {
  return path.join(getTasksDir(), "current_tasks.json");
}

function getLegacyPlanFile() {
  return path.join(getTasksDir(), "current_plan.json");
}

function computeDependencies(tasks) {
  const deps = {};
  tasks.forEach((task) => {
    deps[task.id] = Array.isArray(task.dependsOn) ? task.dependsOn : [];
  });
  return deps;
}

function normalizeTask(input, index, existing = null) {
  const id = input.id || existing?.id || `task_${index + 1}`;
  const taskText = input.task ?? input.title ?? existing?.task ?? "";
  const status = input.status || existing?.status || "pending";
  const dependsOn = Array.isArray(input.dependsOn)
    ? input.dependsOn
    : existing?.dependsOn || [];
  const notes = input.notes ?? existing?.notes;

  return {
    id,
    task: taskText,
    status,
    dependsOn,
    ...(notes !== undefined ? { notes } : {}),
  };
}

function loadTasksFromDisk() {
  const tasksFile = getTasksFile();
  if (fs.existsSync(tasksFile)) {
    return JSON.parse(fs.readFileSync(tasksFile, "utf-8"));
  }
  const legacyFile = getLegacyPlanFile();
  if (fs.existsSync(legacyFile)) {
    const legacy = JSON.parse(fs.readFileSync(legacyFile, "utf-8"));
    const normalized = (legacy.tasks || []).map((taskInput, index) =>
      normalizeTask(taskInput, index),
    );
    const migrated = {
      title: legacy.title || "Current Plan",
      createdAt: legacy.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tasks: normalized,
      dependencies: computeDependencies(normalized),
    };
    const dir = path.dirname(tasksFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(tasksFile, JSON.stringify(migrated, null, 2));
    return migrated;
  }
  return null;
}

/**
 * task_write - Create or update a task plan
 */
const task_write = {
  name: "task_write",
  description:
    "Creates or updates a task list/plan for the current request. Helps organize complex multi-step tasks.",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Title of the plan",
      },
      mode: {
        type: "string",
        enum: ["replace", "append"],
        description: "Replace all tasks or append/merge by id",
        default: "replace",
      },
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            task: { type: "string" },
            title: { type: "string" },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed", "blocked"],
              default: "pending",
            },
            dependsOn: {
              type: "array",
              items: { type: "string" },
              description: "Task ids this task depends on",
            },
            notes: { type: "string" },
          },
        },
        description: "Array of tasks",
      },
    },
    required: ["tasks"],
  },
  keywords: ["task", "plan", "list", "organize"],

  run: async ({ title, tasks, mode = "replace" }) => {
    const tasksDir = getTasksDir();
    if (currentTasksDir && currentTasksDir !== tasksDir) {
      currentTasks = null;
    }

    if (mode === "append" && !currentTasks) {
      currentTasks = loadTasksFromDisk();
    }

    if (mode === "append" && currentTasks?.tasks?.length) {
      const existingById = new Map(
        currentTasks.tasks.map((task) => [task.id, task]),
      );
      let nextId = currentTasks.tasks.length + 1;
      tasks.forEach((taskInput, index) => {
        const inputWithId = taskInput.id
          ? taskInput
          : { ...taskInput, id: `task_${nextId++}` };
        const existing = inputWithId.id
          ? existingById.get(inputWithId.id)
          : null;
        if (existing) {
          const updated = normalizeTask(inputWithId, index, existing);
          existingById.set(existing.id, updated);
        } else {
          const created = normalizeTask(inputWithId, index, null);
          existingById.set(created.id, created);
        }
      });
      const mergedTasks = Array.from(existingById.values());
      currentTasks = {
        title: title || currentTasks.title || "Current Plan",
        createdAt: currentTasks.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tasks: mergedTasks,
        dependencies: computeDependencies(mergedTasks),
      };
      currentTasksDir = tasksDir;
    } else {
      const normalized = tasks.map((taskInput, index) =>
        normalizeTask(taskInput, index),
      );
      currentTasks = {
        title: title || "Current Plan",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tasks: normalized,
        dependencies: computeDependencies(normalized),
      };
      currentTasksDir = tasksDir;
    }

    // Persist to file
    try {
      const filePath = getTasksFile();
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(currentTasks, null, 2));
    } catch {}

    // Log the plan creation
    console.log(`[task_write] 📋 Plan created: "${currentTasks.title}"`);
    console.log(`[task_write] Tasks:`);
    currentTasks.tasks.forEach((task, i) => {
      console.log(`  ${i + 1}. [${task.status}] ${task.task}`);
    });

    return {
      success: true,
      title: currentTasks.title,
      taskCount: currentTasks.tasks.length,
      tasks: currentTasks.tasks,
      dependencies: currentTasks.dependencies,
      updatedAt: currentTasks.updatedAt,
    };
  },
};

/**
 * task_read - Read the current plan
 */
const task_read = {
  name: "task_read",
  description: "Reads the current task list/plan.",
  parameters: {
    type: "object",
    properties: {},
  },
  keywords: ["task", "plan", "read", "list"],

  run: async () => {
    const tasksDir = getTasksDir();
    if (currentTasksDir && currentTasksDir !== tasksDir) {
      currentTasks = null;
    }

    if (!currentTasks) {
      // Try to load from file
      try {
        currentTasks = loadTasksFromDisk();
        currentTasksDir = currentTasks ? tasksDir : null;
      } catch {}
    }

    if (!currentTasks) {
      return { hasPlan: false, message: "No active plan" };
    }

    return {
      hasPlan: true,
      ...currentTasks,
    };
  },
};

/**
 * task_update - Update a task status
 */
const task_update = {
  name: "task_update",
  description: "Updates the status of a specific task in the current plan.",
  parameters: {
    type: "object",
    properties: {
      taskId: {
        type: "string",
        description: "ID of the task to update",
      },
      status: {
        type: "string",
        enum: ["pending", "in_progress", "completed", "blocked"],
        description: "New status for the task",
      },
    },
    required: ["taskId", "status"],
  },
  keywords: ["task", "update", "status", "complete"],

  run: async ({ taskId, status }) => {
    if (!currentTasks) {
      throw new Error("No active plan");
    }

    const task = currentTasks.tasks.find((t) => t.id === taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.status = status;
    currentTasks.updatedAt = new Date().toISOString();
    currentTasks.dependencies = computeDependencies(currentTasks.tasks);

    // Persist
    try {
      fs.writeFileSync(getTasksFile(), JSON.stringify(currentTasks, null, 2));
    } catch {}

    return {
      updated: taskId,
      newStatus: status,
      plan: currentTasks,
    };
  },
};

/**
 * ask_user - Ask the user for clarification
 */
const ask_user = {
  name: "ask_user",
  description:
    "Pauses execution to ask the user a clarifying question. Use when you need more information to proceed.",
  parameters: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "The question to ask the user",
      },
      options: {
        type: "array",
        items: { type: "string" },
        description: "Optional list of choices for the user",
      },
    },
    required: ["question"],
  },
  keywords: ["ask", "question", "clarify", "user", "input"],

  run: async ({ question, options }) => {
    // This tool returns a special response that the orchestrator handles
    return {
      type: "user_input_required",
      question,
      options: options || null,
      awaiting: true,
    };
  },
};

/**
 * think - Extended thinking/reasoning
 */
const think = {
  name: "think",
  description:
    "Triggers extended thinking mode for complex reasoning. Use for multi-step analysis, debugging, or when you need to reason through a problem carefully.",
  parameters: {
    type: "object",
    properties: {
      problem: {
        type: "string",
        description: "The problem or question to think through",
      },
      depth: {
        type: "string",
        enum: ["quick", "balanced", "deep"],
        description: "Thinking depth (default: balanced)",
        default: "balanced",
      },
    },
    required: ["problem"],
  },
  keywords: ["think", "reason", "analyze", "consider", "plan"],

  run: async ({ problem, depth = "balanced" }) => {
    // This tool returns a directive for the orchestrator to engage CoT
    return {
      type: "thinking_required",
      problem,
      depth,
      instruction: getThinkingPrompt(depth, problem),
    };
  },
};

function getThinkingPrompt(depth, problem) {
  if (depth === "deep") {
    return `
Think through this problem step by step:

Problem: ${problem}

Consider:
1. What information do I have?
2. What information do I need?
3. What are the possible approaches?
4. What are the trade-offs of each approach?
5. What could go wrong?
6. What's the best path forward?

Use your tools to EXECUTE this plan immediately. Do not stop to chatter.
`;
  }

  if (depth === "quick") {
    return `Quick analysis: ${problem}`;
  }

  // balanced
  return `
Let me think through this:

Problem: ${problem}

Key considerations:
1. Main goal
2. Available tools/resources
3. Best approach

Next step: Execute the optimal tool immediately.
`;
}

/**
 * summarize_context - Summarize conversation context
 */
const summarize_context = {
  name: "summarize_context",
  description:
    "Creates a summary of the current conversation context to save tokens.",
  parameters: {
    type: "object",
    properties: {
      keepRecent: {
        type: "number",
        description: "Number of recent messages to keep in full (default: 5)",
        default: 5,
      },
    },
  },
  keywords: ["summarize", "context", "compress", "tokens"],

  run: async ({ keepRecent = 5 }) => {
    // This returns a directive for the orchestrator to compress context
    return {
      type: "context_compression",
      keepRecent,
      instruction:
        "Summarize the earlier conversation and keep only the last N messages in full.",
    };
  },
};

module.exports = {
  task_write,
  task_read,
  task_update,
  ask_user,
  think,
  summarize_context,
};
