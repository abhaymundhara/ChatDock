/**
 * Orchestrator for ChatDock
 * Handles Planner's tool calls: ask_user_question, todo, and task (subagent spawning)
 * Routes FINAL output through Conversational Specialist
 * Based on Anthropic Cowork patterns
 */

const { TaskExecutor } = require("./task-executor");
const { SpecialistFactory } = require("./specialist-factory");
const logger = require("../utils/logger");

class Orchestrator {
  constructor(options = {}) {
    this.taskExecutor = options.taskExecutor || new TaskExecutor(options);
    this.specialistFactory = options.specialistFactory || new SpecialistFactory(options);
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
      
      finalResponse = await this.generateConversationalResponse("conversation", {
        plannerContent: content
      }, userMessage, options);

      logger.logResponse("conversation", { content_length: finalResponse.length });
      
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
        finalResponse = await this.generateConversationalResponse("clarification", {
          question: args.question,
          options: args.options
        }, userMessage, options);

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
    finalResponse = await this.generateConversationalResponse("error", {
      error: "I'm not sure how to handle that request type."
    }, userMessage, options);
    
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
          .filter(t => t.assigned_agent) // Only execute tasks with assigned agents
          .map(t => ({
              agent_type: t.assigned_agent,
              task_description: t.description || t.content,
              context: `Execute this task as part of the approved plan. Status: ${t.status}. Active form: ${t.activeForm || ''}`
          }));

      logger.logOrchestrator("EXECUTE_PLAN", {
          task_count: tasks.length,
          agents: tasks.map(t => t.agent_type)
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
          { id: `task_${Date.now()}_${i}`, title: task.task_description?.substring(0, 50), description: task.task_description },
          task.agent_type
        );
      });
      
      const parallelResult = await this.taskExecutor.executeParallel(tasks, options);
      results = parallelResult.results || parallelResult;

      // Log completion
      const successCount = results.filter((r) => r.success).length;
      results.forEach((result, i) => {
        logger.logTaskComplete(
          result.task_id || `task_${i}`,
          result.success,
          { agent_type: result.agent_type, duration_ms: result.duration_ms }
        );
      });

      // Generate conversational summary
      const finalResponse = await this.generateConversationalResponse("execution_results", {
        summary: `Executed ${results.length} tasks from approved plan.`,
        results,
        userMessage: options.userMessage
      }, options.userMessage || "", options);
      
      return { 
          results, 
          content: finalResponse,
          summary: `Executed ${results.length} tasks from approved plan.` 
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

    if (taskCalls.length === 0) {
      logger.logOrchestrator("COMPLETE", {
        tasks_executed: 0,
        todos_created: todos.length,
        reason: "No tasks to execute, only planning",
      });
      
      // Generate conversational confirmation of the plan/todos
      const finalResponse = await this.generateConversationalResponse("plan_approval", {
        plannerContent: content,
        todos
      }, userMessage, options);

      return {
        type: "task",
        content: finalResponse,
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

    // Generate conversational summary of execution
    const finalResponse = await this.generateConversationalResponse("execution_results", {
      summary,
      results,
      todos
    }, userMessage, options);

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
    };
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
      const result = await this.specialistFactory.spawnSpecialist("conversation", {
        id: `conv_${Date.now()}`,
        title: "Generate Response",
        description: taskDescription
      }, options);

      if (result.success && result.result?.content) {
        return result.result.content;
      }
      return "I processed your request, but had trouble generating a response.";
    } catch (error) {
      console.error("[orchestrator] Failed to generate conversational response:", error);
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
