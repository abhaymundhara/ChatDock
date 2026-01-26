/**
 * Planning Tools
 * Tools for task planning, user interaction, and thinking
 */

const fs = require("node:fs");
const path = require("node:path");

// In-memory plan storage (also persisted to file)
let currentPlan = null;
const PLAN_FILE = path.join(
  process.env.HOME || "",
  ".chatdock",
  "current_plan.json",
);

/**
 * todo_write - Create or update a task plan
 */
const todo_write = {
  name: "todo_write",
  description:
    "Creates or updates a task list/plan for the current request. Helps organize complex multi-step tasks.",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Title of the plan",
      },
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            task: { type: "string" },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed", "blocked"],
              default: "pending",
            },
          },
        },
        description: "Array of tasks",
      },
    },
    required: ["tasks"],
  },
  keywords: ["todo", "plan", "task", "list", "organize"],

  run: async ({ title, tasks }) => {
    currentPlan = {
      title: title || "Current Plan",
      createdAt: new Date().toISOString(),
      tasks: tasks.map((t, i) => ({
        id: t.id || `task_${i + 1}`,
        task: t.task,
        status: t.status || "pending",
      })),
    };

    // Persist to file
    try {
      const dir = path.dirname(PLAN_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(PLAN_FILE, JSON.stringify(currentPlan, null, 2));
    } catch {}

    // Log the plan creation
    console.log(`[todo_write] 📋 Plan created: "${currentPlan.title}"`);
    console.log(`[todo_write] Tasks:`);
    currentPlan.tasks.forEach((task, i) => {
      console.log(`  ${i + 1}. [${task.status}] ${task.task}`);
    });

    return {
      success: true,
      title: currentPlan.title,
      taskCount: currentPlan.tasks.length,
      tasks: currentPlan.tasks,
    };
  },
};

/**
 * todo_read - Read the current plan
 */
const todo_read = {
  name: "todo_read",
  description: "Reads the current task list/plan.",
  parameters: {
    type: "object",
    properties: {},
  },
  keywords: ["todo", "plan", "read", "list"],

  run: async () => {
    if (!currentPlan) {
      // Try to load from file
      try {
        if (fs.existsSync(PLAN_FILE)) {
          currentPlan = JSON.parse(fs.readFileSync(PLAN_FILE, "utf-8"));
        }
      } catch {}
    }

    if (!currentPlan) {
      return { hasPlan: false, message: "No active plan" };
    }

    return {
      hasPlan: true,
      ...currentPlan,
    };
  },
};

/**
 * todo_update - Update a task status
 */
const todo_update = {
  name: "todo_update",
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
  keywords: ["todo", "update", "status", "complete"],

  run: async ({ taskId, status }) => {
    if (!currentPlan) {
      throw new Error("No active plan");
    }

    const task = currentPlan.tasks.find((t) => t.id === taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.status = status;

    // Persist
    try {
      fs.writeFileSync(PLAN_FILE, JSON.stringify(currentPlan, null, 2));
    } catch {}

    return {
      updated: taskId,
      newStatus: status,
      plan: currentPlan,
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
  todo_write,
  todo_read,
  todo_update,
  ask_user,
  think,
  summarize_context,
};
