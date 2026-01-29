/**
 * Orchestrator for ChatDock
 * Handles Planner's tool calls: ask_user_question, todo, and task (subagent spawning)
 * Based on Anthropic Cowork patterns
 */

const { TaskExecutor } = require("./task-executor");
const logger = require("../utils/logger");

class Orchestrator {
  constructor(options = {}) {
    this.taskExecutor = options.taskExecutor || new TaskExecutor(options);
    this.model = options.model;
  }

  /**
   * Process Planner's tool calls and execute actions
   * @param {Object} plannerResult - { type, content, tool_calls }
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async process(plannerResult, options = {}) {
    const { type, content, tool_calls } = plannerResult;

    logger.logOrchestrator("PROCESS", {
      result_type: type,
      has_tool_calls: !!(tool_calls && tool_calls.length > 0),
      tool_call_count: tool_calls?.length || 0,
    });

    // Pure conversation - no tool calls
    if (type === "conversation") {
      logger.logOrchestrator("ROUTE", {
        decision: "CONVERSATION",
        reason: "No action required, responding directly",
      });
      logger.logResponse("conversation", { content_length: content?.length });
      return {
        type: "conversation",
        content: content || "I'm here to help! What would you like to do?",
      };
    }

    // Clarification needed
    if (type === "clarification") {
      const askCall = tool_calls?.find(
        (tc) => tc.function?.name === "ask_user_question",
      );
      if (askCall) {
        const args = this.parseArgs(askCall.function.arguments);
        logger.logOrchestrator("ROUTE", {
          decision: "CLARIFICATION",
          reason: "Need more information from user",
          question: args.question,
          options_count: args.options?.length || 0,
        });
        logger.logResponse("clarification", {
          question: args.question,
          options: args.options,
        });
        return {
          type: "clarification",
          content: content || "",
          question: args.question,
          options: args.options,
        };
      }
    }

    // Task execution with subagent spawning
    if (type === "task") {
      logger.logOrchestrator("ROUTE", {
        decision: "TASK_EXECUTION",
        reason: "Spawning specialists to handle tasks",
      });
      return await this.handleTasks(tool_calls, content, options);
    }

    // Fallback
    logger.logOrchestrator("ROUTE", {
      decision: "FALLBACK",
      reason: "Unknown result type",
      type,
    });
    logger.logResponse("conversation", { fallback: true });
    return {
      type: "conversation",
      content: content || "I'm not sure how to handle that request.",
    };
  }

  /**
   * Handle task tool calls (subagent spawning)
   * @param {Array} tool_calls
   * @param {string} content - Planner's explanation
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async handleTasks(tool_calls, content, options) {
    // Extract task calls and todo calls
    const taskCalls =
      tool_calls?.filter((tc) => tc.function?.name === "task") || [];
    const todoCalls =
      tool_calls?.filter((tc) => tc.function?.name === "todo") || [];

    // Log todo list if present
    const todos = this.extractTodos(todoCalls);
    if (todos.length > 0) {
      logger.logTodoList(todos);
    }

    if (taskCalls.length === 0) {
      logger.logOrchestrator("COMPLETE", {
        tasks_executed: 0,
        todos_created: todos.length,
        reason: "No tasks to execute, only planning",
      });
      return {
        type: "task",
        content: content || "Planning complete",
        todos,
        results: [],
      };
    }

    // Parse task calls
    const tasks = taskCalls.map((tc) => this.parseArgs(tc.function.arguments));

    logger.log("INFO", "ORCHESTRATOR", `Preparing to execute ${tasks.length} task(s)`, {
      task_count: tasks.length,
      agents: tasks.map(t => t.agent_type),
      parallel: tasks.length > 1,
    });

    // Execute tasks
    let results;
    if (tasks.length === 1) {
      // Single task
      logger.logTaskCreated(
        { id: `task_${Date.now()}`, title: tasks[0].task_description?.substring(0, 50), description: tasks[0].task_description },
        tasks[0].agent_type
      );
      results = [await this.taskExecutor.execute(tasks[0], options)];
    } else {
      // Multiple tasks - execute in parallel
      tasks.forEach((task, i) => {
        logger.logTaskCreated(
          { id: `task_${Date.now()}_${i}`, title: task.task_description?.substring(0, 50), description: task.task_description },
          task.agent_type
        );
      });
      const parallelResult = await this.taskExecutor.executeParallel(tasks, options);
      results = parallelResult.results || parallelResult;
    }

    // Build response
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    const summary = `Completed ${successCount}/${results.length} tasks`;

    // Log completion for each task
    results.forEach((result, i) => {
      logger.logTaskComplete(
        result.task_id || `task_${i}`,
        result.success,
        {
          agent_type: result.agent_type,
          duration_ms: result.duration_ms,
          error: result.error,
        }
      );
    });

    logger.logOrchestrator("AGGREGATE", {
      total_tasks: results.length,
      succeeded: successCount,
      failed: failCount,
      success_rate: `${Math.round((successCount / results.length) * 100)}%`,
    });

    logger.logOrchestrator("COMPLETE", {
      tasks_executed: results.length,
      tasks_succeeded: successCount,
      tasks_failed: failCount,
      todos_created: todos.length,
    });

    logger.logResponse("task", {
      success_count: successCount,
      fail_count: failCount,
      content_length: content?.length,
    });

    return {
      type: "task",
      content: content || summary,
      todos,
      results,
      summary,
    };
  }

  /**
   * Extract todos from todo tool calls
   * @param {Array} todoCalls
   * @returns {Array}
   */
  extractTodos(todoCalls) {
    if (!todoCalls || todoCalls.length === 0) {
      return [];
    }

    const lastTodoCall = todoCalls[todoCalls.length - 1];
    const args = this.parseArgs(lastTodoCall.function.arguments);
    return args.todos || [];
  }

  /**
   * Parse tool arguments (handle string or object)
   * @param {string|Object} args
   * @returns {Object}
   */
  parseArgs(args) {
    return typeof args === "string" ? JSON.parse(args) : args;
  }
}

module.exports = { Orchestrator };
