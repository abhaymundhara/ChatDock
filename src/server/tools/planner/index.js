/**
 * Planner Tools Plugin
 * Provides coordination and clarification tools for the Planner agent
 */

// Tool definitions
const tools = [
  {
    type: "function",
    function: {
      name: "ask_user_question",
      description:
        "Ask the user a clarification question with predefined options",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The question to ask the user",
          },
          options: {
            type: "array",
            description: "Array of possible answer options",
            items: {
              type: "object",
              properties: {
                label: {
                  type: "string",
                  description: "Short label for this option",
                },
                description: {
                  type: "string",
                  description: "Detailed description of what this option means",
                },
                value: {
                  type: "string",
                  description: "Value to use if this option is selected",
                },
              },
              required: ["label", "description", "value"],
            },
          },
        },
        required: ["question", "options"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todo",
      description:
        "Create or update todo progress tracking (TodoWrite pattern) - for tracking your own work items",
      parameters: {
        type: "object",
        properties: {
          todos: {
            type: "array",
            description: "Array of todo items",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Unique todo identifier",
                },
                description: {
                  type: "string",
                  description: "Todo description",
                },
                status: {
                  type: "string",
                  description: "Todo status",
                  enum: ["pending", "in_progress", "completed", "failed"],
                },
              },
              required: ["id", "description", "status"],
            },
          },
        },
        required: ["todos"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "task",
      description:
        "Spawn a subagent to work on a task in parallel or with context-hiding. Use for: (1) Parallelization - when you have 2+ independent items to work on; (2) Context-hiding - when you want to accomplish a high-token-cost subtask without distraction from the main task.",
      parameters: {
        type: "object",
        properties: {
          agent_type: {
            type: "string",
            description: "Type of specialist agent to spawn",
            enum: ["file", "shell", "web", "code", "conversation"],
          },
          task_description: {
            type: "string",
            description:
              "Clear description of what the subagent should accomplish",
          },
          context: {
            type: "string",
            description: "Additional context the subagent needs (optional)",
          },
        },
        required: ["agent_type", "task_description"],
      },
    },
  },
];

// Tool executors
const executors = {
  async ask_user_question({ question, options }) {
    // Planner tool - return special marker for user interaction
    return {
      requires_user_input: true,
      question,
      options,
    };
  },

  async todo({ todos }) {
    // Validate exactly one in_progress todo (TodoWrite pattern)
    const inProgressTodos = todos.filter((t) => t.status === "in_progress");

    if (inProgressTodos.length !== 1) {
      return {
        success: false,
        error:
          "TodoWrite pattern violation: Must have exactly one todo in_progress",
        todos,
      };
    }

    // Return validated todos
    return {
      success: true,
      todos,
    };
  },

  async task({ agent_type, task_description, context, __context }) {
    const { subagentManager } = __context || {};
    if (!subagentManager) {
      return { error: "Subagent manager not available" };
    }

    const info = subagentManager.spawn({
      task: task_description,
      specialist: agent_type,
      name: agent_type ? `${agent_type} specialist` : null,
    });

    return {
      success: true,
      message: `Subagent spawned for task: ${task_description}. I will notify you when it's done.`,
      subagent: info,
    };
  },
};

// Plugin metadata
module.exports = {
  name: "Planner Tools",
  description: "Coordination, clarification, and subagent spawning tools",
  version: "1.0.0",
  category: "planner",
  tools,
  executors,
  metadata: {
    specialists: ["planner"], // Only planner uses these
    tags: ["planning", "coordination", "clarification", "subagents", "cowork"],
  },
};
