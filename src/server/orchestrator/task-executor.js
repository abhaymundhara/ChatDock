/**
 * Task Executor for Cowork Pattern
 * Handles spawning subagents when the Planner uses the task tool
 */

const { SpecialistFactory } = require("./specialist-factory");

class TaskExecutor {
  constructor(options = {}) {
    this.specialistFactory =
      options.specialistFactory || new SpecialistFactory(options);
    this.model = options.model;
  }

  /**
   * Execute task tool call - spawn a subagent
   * @param {Object} taskCall - { agent_type, task_description, context }
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async execute(taskCall, options = {}) {
    const { agent_type, task_description, context } = taskCall;
    const model = options.model || this.model;

    console.log(`[task-executor] Spawning ${agent_type} subagent`);

    try {
      // Create task object for specialist
      const task = {
        id: `task_${Date.now()}`,
        title: task_description.split("\n")[0].substring(0, 100), // First line as title
        description:
          task_description + (context ? `\n\nContext: ${context}` : ""),
      };

      // Spawn specialist
      const result = await this.specialistFactory.spawnSpecialist(
        agent_type,
        task,
        { model },
      );

      return {
        success: result.success,
        agent_type,
        task_id: task.id,
        result: result.result,
        error: result.error,
      };
    } catch (error) {
      console.error("[task-executor] Failed to spawn subagent:", error.message);
      return {
        success: false,
        agent_type,
        error: error.message,
      };
    }
  }

  /**
   * Execute multiple tasks in parallel
   * @param {Array} taskCalls - Array of task tool calls
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  async executeParallel(taskCalls, options = {}) {
    console.log(
      `[task-executor] Spawning ${taskCalls.length} subagents in parallel`,
    );

    return Promise.all(
      taskCalls.map((taskCall) => this.execute(taskCall, options)),
    );
  }
}

module.exports = { TaskExecutor };
