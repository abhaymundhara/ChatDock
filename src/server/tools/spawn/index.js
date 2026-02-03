/**
 * Spawn Tool
 * Allows the agent to spawn subagents for background tasks
 */

// Tool definitions
const tools = [
  {
    type: "function",
    function: {
      name: "spawn_subagent",
      description: "Spawn a background subagent to handle a long-running or complex task. The subagent will work independently and return results when complete.",
      parameters: {
        type: "object",
        properties: {
          task: {
            type: "string",
            description: "Detailed task description for the subagent. Be specific about what to accomplish.",
          },
          name: {
            type: "string",
            description: "Optional human-readable name for this subagent (e.g., 'ResearchAgent', 'CodeReviewer')",
          },
        },
        required: ["task"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_subagents",
      description: "List all spawned subagents and their current status",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["running", "completed", "failed", "cancelled"],
            description: "Filter by status (optional)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_subagent_status",
      description: "Get the status and result of a specific subagent",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Subagent ID",
          },
        },
        required: ["id"],
      },
    },
  },
];

// Tool executors
const executors = {
  spawn_subagent({ task, name, __context }) {
    const subagentManager = __context?.subagentManager;
    if (!subagentManager) {
      return { success: false, error: "Subagent manager not available" };
    }
    
    try {
      const result = subagentManager.spawn({ task, name });
      return {
        success: true,
        message: `Subagent "${result.name}" spawned successfully. It will work on: ${task}`,
        subagent: result,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  list_subagents({ status, __context }) {
    const subagentManager = __context?.subagentManager;
    if (!subagentManager) {
      return { success: false, error: "Subagent manager not available" };
    }
    
    const subagents = subagentManager.list({ status });
    return {
      success: true,
      count: subagents.length,
      subagents,
    };
  },

  get_subagent_status({ id, __context }) {
    const subagentManager = __context?.subagentManager;
    if (!subagentManager) {
      return { success: false, error: "Subagent manager not available" };
    }
    
    const status = subagentManager.getStatus(id);
    if (!status) {
      return { success: false, error: `Subagent ${id} not found` };
    }
    
    return { success: true, ...status };
  },
};

// Plugin metadata
module.exports = {
  name: "Spawn",
  description: "Spawn and manage background subagents",
  version: "1.0.0",
  category: "spawn",
  tools,
  executors,
  metadata: {
    tags: ["subagent", "background", "async", "parallel"],
    note: "Subagents run in background and can handle long-running tasks",
  },
};
