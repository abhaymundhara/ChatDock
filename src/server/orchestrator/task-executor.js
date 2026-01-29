/**
 * Task Executor for Cowork Pattern
 * Handles spawning subagents when the Planner uses the task tool
 * Supports parallel execution, retry logic, and failure handling
 */

const { SpecialistFactory } = require("./specialist-factory");

// Default configuration
const DEFAULT_CONFIG = {
  maxRetries: 2,
  retryDelayMs: 500,
  maxConcurrent: 3, // Limit concurrent specialists to avoid overwhelming the system
  continueOnFailure: true, // Graceful degradation
};

class TaskExecutor {
  constructor(options = {}) {
    this.specialistFactory =
      options.specialistFactory || new SpecialistFactory(options);
    this.model = options.model;
    this.config = { ...DEFAULT_CONFIG, ...options.config };
  }

  /**
   * Execute task tool call - spawn a subagent with retry logic
   * @param {Object} taskCall - { agent_type, task_description, context }
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async execute(taskCall, options = {}) {
    const { agent_type, task_description, context } = taskCall;
    const model = options.model || this.model;
    const maxRetries = options.maxRetries ?? this.config.maxRetries;

    console.log(`[task-executor] Spawning ${agent_type} subagent`);

    const startTime = Date.now();
    let lastError = null;
    let attempts = 0;

    // Retry loop
    while (attempts <= maxRetries) {
      attempts++;

      if (attempts > 1) {
        console.log(
          `[task-executor] Retry attempt ${attempts - 1}/${maxRetries} for ${agent_type}`,
        );
        // Wait before retry
        await this.delay(this.config.retryDelayMs * attempts);
      }

      try {
        // Create task object for specialist
        const task = {
          id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          title: task_description.split("\n")[0].substring(0, 100),
          description:
            task_description + (context ? `\n\nContext: ${context}` : ""),
        };

        // Spawn specialist
        const result = await this.specialistFactory.spawnSpecialist(
          agent_type,
          task,
          { model },
        );

        const duration = Date.now() - startTime;

        if (result.success) {
          console.log(
            `[task-executor] ${agent_type} completed in ${duration}ms`,
          );
          return {
            success: true,
            agent_type,
            task_id: task.id,
            result: result.result,
            duration_ms: duration,
            attempts,
          };
        }

        // Task failed but didn't throw - treat as retriable
        lastError = result.error || "Unknown error";
        console.warn(`[task-executor] ${agent_type} failed: ${lastError}`);
      } catch (error) {
        lastError = error.message;
        console.error(
          `[task-executor] ${agent_type} threw error: ${error.message}`,
        );
      }
    }

    // All retries exhausted
    const duration = Date.now() - startTime;
    console.error(
      `[task-executor] ${agent_type} failed after ${attempts} attempts`,
    );

    return {
      success: false,
      agent_type,
      error: lastError,
      duration_ms: duration,
      attempts,
      retriesExhausted: true,
    };
  }

  /**
   * Execute multiple tasks in parallel with concurrency control
   * @param {Array} taskCalls - Array of task tool calls
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async executeParallel(taskCalls, options = {}) {
    const maxConcurrent = options.maxConcurrent ?? this.config.maxConcurrent;
    const continueOnFailure =
      options.continueOnFailure ?? this.config.continueOnFailure;

    console.log(
      `[task-executor] Executing ${taskCalls.length} tasks (max concurrent: ${maxConcurrent})`,
    );

    const startTime = Date.now();
    const results = [];
    const errors = [];

    // Process in batches if we have more tasks than concurrency limit
    for (let i = 0; i < taskCalls.length; i += maxConcurrent) {
      const batch = taskCalls.slice(i, i + maxConcurrent);

      console.log(
        `[task-executor] Processing batch ${Math.floor(i / maxConcurrent) + 1} (${batch.length} tasks)`,
      );

      const batchResults = await Promise.allSettled(
        batch.map((taskCall) => this.execute(taskCall, options)),
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);
          if (!result.value.success) {
            errors.push({
              agent_type: result.value.agent_type,
              error: result.value.error,
            });
          }
        } else {
          // Promise rejected - unexpected error
          const error = {
            success: false,
            error: result.reason?.message || "Promise rejected",
          };
          results.push(error);
          errors.push(error);
        }
      }

      // Check if we should stop on failure
      if (!continueOnFailure && errors.length > 0) {
        console.warn(
          `[task-executor] Stopping due to failure (continueOnFailure=false)`,
        );
        break;
      }
    }

    const duration = Date.now() - startTime;
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    console.log(
      `[task-executor] Parallel execution completed: ${successCount} succeeded, ${failureCount} failed in ${duration}ms`,
    );

    return {
      results,
      summary: {
        total: results.length,
        succeeded: successCount,
        failed: failureCount,
        duration_ms: duration,
        errors: errors.length > 0 ? errors : undefined,
      },
    };
  }

  /**
   * Helper: delay for retry backoff
   * @param {number} ms
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = { TaskExecutor, DEFAULT_CONFIG };
