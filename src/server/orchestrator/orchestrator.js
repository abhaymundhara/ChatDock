/**
 * Orchestrator for ChatDock
 * Handles Planner's tool calls: ask_user_question, todo, and task (subagent spawning)
 * Based on Anthropic Cowork patterns
 */

const { TaskExecutor } = require("./task-executor");

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

    // Pure conversation - no tool calls
    if (type === "conversation") {
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
      return await this.handleTasks(tool_calls, content, options);
    }

    // Fallback
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

    if (taskCalls.length === 0) {
      return {
        type: "task",
        content: content || "Planning complete",
        todos: this.extractTodos(todoCalls),
        results: [],
      };
    }

    // Parse task calls
    const tasks = taskCalls.map((tc) => this.parseArgs(tc.function.arguments));

    // Execute tasks
    let results;
    if (tasks.length === 1) {
      // Single task
      results = [await this.taskExecutor.execute(tasks[0], options)];
    } else {
      // Multiple tasks - execute in parallel
      results = await this.taskExecutor.executeParallel(tasks, options);
    }

    // Build response
    const successCount = results.filter((r) => r.success).length;
    const summary = `Completed ${successCount}/${results.length} tasks`;

    return {
      type: "task",
      content: content || summary,
      todos: this.extractTodos(todoCalls),
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
