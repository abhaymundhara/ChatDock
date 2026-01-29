/**
 * Orchestrator for ChatDock
 * Handles Planner's tool calls: ask_user_question, todo, and task (subagent spawning)
 * Routes FINAL output through Conversational Specialist
 * Based on Anthropic Cowork patterns
 */

const { TaskExecutor } = require("./task-executor");
const { SpecialistFactory } = require("./specialist-factory");
const logger = require("../utils/logger");
const taskTree = require("./task-tree");

class Orchestrator {
  constructor(options = {}) {
    this.taskExecutor = options.taskExecutor || new TaskExecutor(options);
    this.specialistFactory =
      options.specialistFactory || new SpecialistFactory(options);
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
    const userMessage = options.userMessage || "";

    logger.logOrchestrator("PROCESS", {
      result_type: type,
      has_tool_calls: !!(tool_calls && tool_calls.length > 0),
      tool_call_count: tool_calls?.length || 0,
    });

    let finalResponse;

    // Pure conversation - route to conversational specialist
    if (type === "conversation") {
      logger.logOrchestrator("ROUTE", {
        decision: "CONVERSATION",
        reason: "No action required, responding directly",
      });

      finalResponse = await this.generateConversationalResponse(
        "conversation",
        {
          plannerContent: content,
        },
        userMessage,
        options,
      );

      logger.logResponse("conversation", {
        content_length: finalResponse.length,
      });

      return {
        type: "conversation",
        content: finalResponse,
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

        // Generate friendly wrapper for the question
        finalResponse = await this.generateConversationalResponse(
          "clarification",
          {
            question: args.question,
            options: args.options,
          },
          userMessage,
          options,
        );

        logger.logResponse("clarification", {
          question: args.question,
          options: args.options,
        });

        return {
          type: "clarification",
          content: finalResponse,
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
      return await this.handleTasks(tool_calls, content, userMessage, options);
    }

    // Fallback
    logger.logOrchestrator("ROUTE", {
      decision: "FALLBACK",
      reason: "Unknown result type",
      type,
    });

    // Generate polite error message
    finalResponse = await this.generateConversationalResponse(
      "error",
      {
        error: "I'm not sure how to handle that request type.",
      },
      userMessage,
      options,
    );

    logger.logResponse("conversation", { fallback: true });
    return {
      type: "conversation",
      content: finalResponse,
    };
  }

  /**
   * Execute a pre-approved plan (todos) directly
   * Used by the Workforce model to bypass Phase 2 planning
   * @param {Array} todos
   * @param {Object} options
   */
  async executeApprovedPlan(todos, options) {
    const tasks = todos
      .filter((t) => t.assigned_agent) // Only execute tasks with assigned agents
      .map((t) => ({
        agent_type: t.assigned_agent,
        task_description: t.description || t.content,
        context: `Execute this task as part of the approved plan. Status: ${t.status}. Active form: ${t.activeForm || ""}`,
      }));

    logger.logOrchestrator("EXECUTE_PLAN", {
      task_count: tasks.length,
      agents: tasks.map((t) => t.agent_type),
    });

    // Execute in parallel (or sequential if dependencies added later)
    // For now, simple parallel execution using existing logic
    if (tasks.length === 0) {
      return { results: [], summary: "No executable tasks found in plan." };
    }

    // Re-use handleTasks logic partially, but we don't need to parse tool calls
    // Just execute directly
    let results;
    tasks.forEach((task, i) => {
      logger.logTaskCreated(
        {
          id: `task_${Date.now()}_${i}`,
          title: task.task_description?.substring(0, 50),
          description: task.task_description,
        },
        task.agent_type,
      );
    });

    const parallelResult = await this.taskExecutor.executeParallel(
      tasks,
      options,
    );
    results = parallelResult.results || parallelResult;

    // Log completion
    const successCount = results.filter((r) => r.success).length;
    results.forEach((result, i) => {
      logger.logTaskComplete(result.task_id || `task_${i}`, result.success, {
        agent_type: result.agent_type,
        duration_ms: result.duration_ms,
      });
    });

    // Generate conversational summary
    const finalResponse = await this.generateConversationalResponse(
      "execution_results",
      {
        summary: `Executed ${results.length} tasks from approved plan.`,
        results,
        userMessage: options.userMessage,
      },
      options.userMessage || "",
      options,
    );

    return {
      results,
      content: finalResponse,
      summary: `Executed ${results.length} tasks from approved plan.`,
    };
  }

  /**
   * Handle task tool calls (subagent spawning)
   * @param {Array} tool_calls
   * @param {string} content - Planner's explanation
   * @param {string} userMessage
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async handleTasks(tool_calls, content, userMessage, options) {
    // Extract task calls and todo calls
    const taskCalls =
      tool_calls?.filter((tc) => tc.function?.name === "task") || [];
    const todoCalls =
      tool_calls?.filter((tc) => tc.function?.name === "todo_write") || [];

    // Log todo list if present
    const todos = this.extractTodos(todoCalls);
    if (todos.length > 0) {
      logger.logTodoList(todos);
    }

    // Build task tree from either task calls OR todos
    let rootTask = null;

    if (taskCalls.length > 0) {
      // Phase 2: Build from task tool calls
      const tasks = taskCalls.map((tc) =>
        this.parseArgs(tc.function.arguments),
      );
      rootTask = taskTree.buildTaskTree(tasks);

      // Validate task dependencies
      if (!taskTree.validateTaskDependencies(rootTask)) {
        logger.log(
          "ERROR",
          "ORCHESTRATOR",
          "Task tree has circular dependencies",
        );
        return {
          type: "task",
          content: "Error: Task dependencies have circular references",
          todos,
          results: [],
        };
      }

      // Send task decomposition to frontend
      this.sendTaskTreeUpdate(rootTask, options);
    } else if (todos.length > 0) {
      // Phase 1: Build task tree from todos for visualization
      const todoTasks = todos.map((todo, index) => {
        // Handle both object and string todo formats
        const todoObj = typeof todo === "string" ? { content: todo } : todo;
        const content =
          todoObj.description ||
          todoObj.content ||
          todoObj.task ||
          String(todo);

        // Extract assigned agent with fallback logic
        let agent = todoObj.assigned_agent || todoObj.agent_type || "file";

        // Infer agent from content if not specified
        if (
          agent === "file" &&
          /\b(run|execute|install|command|npm|git)\b/i.test(content)
        ) {
          agent = "shell";
        } else if (
          agent === "file" &&
          /\b(search|web|fetch|url|online)\b/i.test(content)
        ) {
          agent = "web";
        } else if (
          agent === "file" &&
          /\b(parse|analyze|calculate|process|code)\b/i.test(content)
        ) {
          agent = "code";
        }

        return {
          task_description: content,
          agent_type: agent,
          depends_on: todoObj.depends_on || todoObj.dependencies || [],
        };
      });
      rootTask = taskTree.buildTaskTree(todoTasks);

      // Send initial task tree to frontend
      this.sendTaskTreeUpdate(rootTask, options, {
        is_planning: true,
        summary_task: content,
      });
    }

    if (taskCalls.length === 0) {
      logger.logOrchestrator("COMPLETE", {
        tasks_executed: 0,
        todos_created: todos.length,
        reason: "No tasks to execute, only planning",
      });

      // Generate conversational confirmation of the plan/todos
      const finalResponse = await this.generateConversationalResponse(
        "plan_approval",
        {
          plannerContent: content,
          todos,
        },
        userMessage,
        options,
      );

      return {
        type: "task",
        content: finalResponse,
        todos,
        results: [],
        taskTree: null,
      };
    }

    // Execute tasks respecting dependencies from task tree
    logger.log("INFO", "ORCHESTRATOR", `Preparing to execute task tree`, {
      total_tasks: taskTree.flattenTaskTree(rootTask).length,
      root_subtasks: rootTask.subtasks.length,
    });

    // Execute task tree with dependency management
    const results = await this.executeTaskTree(rootTask, options);

    // Build response
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    const summary = `Completed ${successCount}/${results.length} tasks`;

    // Log completion for each task
    results.forEach((result, i) => {
      logger.logTaskComplete(result.task_id || `task_${i}`, result.success, {
        agent_type: result.agent_type,
        duration_ms: result.duration_ms,
        error: result.error,
      });
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

    // Generate conversational summary of execution
    const finalResponse = await this.generateConversationalResponse(
      "execution_results",
      {
        summary,
        results,
        todos,
      },
      userMessage,
      options,
    );

    logger.logResponse("task", {
      success_count: successCount,
      fail_count: failCount,
      content_length: content?.length,
    });

    return {
      type: "task",
      content: finalResponse,
      todos,
      results,
      summary,
      taskTree: rootTask ? taskTree.treeSubTasks(rootTask) : null,
    };
  }

  /**
   * Execute task tree with dependency management
   * @param {Object} rootTask - Root task node
   * @param {Object} options - Execution options
   * @returns {Promise<Array>} Task results
   */
  async executeTaskTree(rootTask, options) {
    const allTasks = taskTree.flattenTaskTree(rootTask);
    const results = [];
    const completedTaskIds = new Set();

    logger.log("INFO", "ORCHESTRATOR", "Starting task tree execution", {
      total_tasks: allTasks.length,
    });

    // Execute tasks in dependency order
    while (
      completedTaskIds.size <
      allTasks.filter((t) => t.agent_type !== "coordinator").length
    ) {
      // Get tasks ready to execute
      const readyTasks = taskTree.getReadyTasks(rootTask);

      if (readyTasks.length === 0) {
        // Check if there are still pending tasks (would indicate stuck state)
        const pendingTasks = allTasks.filter(
          (t) => t.state === "pending" && t.agent_type !== "coordinator",
        );
        if (pendingTasks.length > 0) {
          logger.log(
            "ERROR",
            "ORCHESTRATOR",
            "No tasks ready but tasks still pending - possible deadlock",
          );
          break;
        }
        break; // All tasks completed
      }

      logger.log(
        "INFO",
        "ORCHESTRATOR",
        `Executing ${readyTasks.length} ready tasks`,
        {
          task_ids: readyTasks.map((t) => t.id),
        },
      );

      // Mark tasks as running
      readyTasks.forEach((task) => {
        taskTree.updateTaskState(rootTask, task.id, "running");
      });

      // Send update to frontend
      this.sendTaskTreeUpdate(rootTask, options);

      // Execute ready tasks in parallel
      const batchResults = await Promise.allSettled(
        readyTasks.map(async (task) => {
          logger.logTaskCreated(
            {
              id: task.id,
              title: task.content.substring(0, 50),
              description: task.content,
            },
            task.agent_type,
          );

          const taskCall = {
            agent_type: task.agent_type,
            task_description: task.content,
            context: task.context || "",
          };

          const result = await this.taskExecutor.execute(taskCall, options);
          result.task_id = task.id; // Ensure task ID is preserved
          return result;
        }),
      );

      // Process results and update task states
      batchResults.forEach((promiseResult, index) => {
        const task = readyTasks[index];

        if (promiseResult.status === "fulfilled") {
          const result = promiseResult.value;
          results.push(result);

          if (result.success) {
            taskTree.updateTaskState(rootTask, task.id, "completed", {
              result: result.result,
            });
            completedTaskIds.add(task.id);
            logger.logTaskComplete(task.id, true, {
              agent_type: task.agent_type,
            });
          } else {
            taskTree.updateTaskState(rootTask, task.id, "failed", {
              result: result.error,
              failure_count: (task.failure_count || 0) + 1,
            });
            logger.logTaskComplete(task.id, false, {
              agent_type: task.agent_type,
              error: result.error,
            });
          }
        } else {
          // Promise rejected
          taskTree.updateTaskState(rootTask, task.id, "failed", {
            result: promiseResult.reason?.message || "Task execution failed",
            failure_count: (task.failure_count || 0) + 1,
          });
          logger.logTaskComplete(task.id, false, {
            agent_type: task.agent_type,
            error: promiseResult.reason?.message,
          });
        }
      });

      // Send update to frontend after batch completion
      this.sendTaskTreeUpdate(rootTask, options);
    }

    return results;
  }

  /**
   * Send task tree update to frontend
   * @param {Object} rootTask - Root task node
   * @param {Object} options - Options with WebSocket/callback
   * @param {Object} metadata - Additional metadata to send
   */
  sendTaskTreeUpdate(rootTask, options, metadata = {}) {
    if (!rootTask) return;

    const serializedTree = taskTree.treeSubTasks(rootTask);
    const stats = taskTree.getTaskTreeStats(rootTask);

    logger.log("INFO", "ORCHESTRATOR", "Sending task tree update to frontend", {
      total_tasks: stats.total,
      completed: stats.completed,
      running: stats.running,
      failed: stats.failed,
      is_planning: metadata.is_planning || false,
      task_tree_preview:
        JSON.stringify(serializedTree).substring(0, 200) + "...",
    });

    // Send via callback if provided (for WebSocket/SSE)
    if (options.onTaskTreeUpdate) {
      options.onTaskTreeUpdate({
        task_tree: serializedTree,
        stats,
        ...metadata,
      });
    }
  }

  /**
   * Use Conversational Specialist to generate final output
   * @param {string} type - conversation, clarification, plan_approval, execution_results, error
   * @param {Object} data - context data for the response
   * @param {string} userMessage - original user message
   * @param {Object} options
   */
  async generateConversationalResponse(type, data, userMessage, options) {
    const taskDescription = `
User Message: "${userMessage}"

Context type: ${type}
Data: ${JSON.stringify(data, null, 2)}

Your Goal: Provide a friendly, natural response to the user based on this context. 
- If clarifying, present the question and options clearly.
- If reporting results, summarize what was done successfully and any errors.
- If planning, ask for approval on the todo list.
- Keep it concise and helpful.
`;

    try {
      const result = await this.specialistFactory.spawnSpecialist(
        "conversation",
        {
          id: `conv_${Date.now()}`,
          title: "Generate Response",
          description: taskDescription,
        },
        options,
      );

      if (result.success && result.result?.content) {
        return result.result.content;
      }
      return "I processed your request, but had trouble generating a response.";
    } catch (error) {
      console.error(
        "[orchestrator] Failed to generate conversational response:",
        error,
      );
      // Fallback if conversational agent fails
      if (type === "conversation") return data.plannerContent || "I'm here.";
      if (type === "clarification") return data.question;
      if (type === "execution_results") return data.summary;
      return "Something went wrong.";
    }
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
