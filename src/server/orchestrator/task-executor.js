/**
 * Task Executor for Cowork Pattern
 * Handles spawning subagents when the Planner uses the task tool
 * Supports parallel execution, retry logic, and failure handling
 */

const { SpecialistFactory } = require("./specialist-factory");
const logger = require("../utils/logger");

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

    logger.log("INFO", "TASK_EXECUTOR", `Spawning ${agent_type} subagent`, {
      agent_type,
      max_retries: maxRetries,
      model,
      description_preview: task_description?.substring(0, 100),
    });

    const startTime = Date.now();
    let lastError = null;
    let attempts = 0;

    // Retry loop
    while (attempts <= maxRetries) {
      attempts++;

      if (attempts > 1) {
        logger.log("WARN", "TASK_EXECUTOR", `Retry attempt ${attempts - 1}/${maxRetries} for ${agent_type}`, {
          agent_type,
          attempt: attempts,
          max_retries: maxRetries,
          last_error: lastError,
          delay_ms: this.config.retryDelayMs * attempts,
        });
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
          logger.log("INFO", "TASK_EXECUTOR", `${agent_type} specialist completed successfully`, {
            agent_type,
            task_id: task.id,
            duration_ms: duration,
            attempts,
            status: "SUCCESS",
            has_content: !!result.result?.content,
            tool_calls_count: result.result?.tool_calls?.length || 0,
          });
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
        logger.log("WARN", "TASK_EXECUTOR", `${agent_type} specialist returned failure`, {
          agent_type,
          attempt: attempts,
          error: lastError,
          will_retry: attempts <= maxRetries,
        });
      } catch (error) {
        lastError = error.message;
        logger.logError("TASK_EXECUTOR", `${agent_type} specialist threw error`, {
          agent_type,
          attempt: attempts,
          error: error.message,
          will_retry: attempts <= maxRetries,
        });
      }
    }

    // All retries exhausted
    const duration = Date.now() - startTime;
    logger.log("ERROR", "TASK_EXECUTOR", `${agent_type} specialist FAILED after all retries`, {
      agent_type,
      duration_ms: duration,
      attempts,
      retries_exhausted: true,
      final_error: lastError,
      status: "FAILED",
    });

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

    logger.log("INFO", "TASK_EXECUTOR", `Starting parallel execution`, {
      total_tasks: taskCalls.length,
      max_concurrent: maxConcurrent,
      continue_on_failure: continueOnFailure,
      agents: taskCalls.map(t => t.agent_type),
    });

    const startTime = Date.now();
    const results = [];
    const errors = [];

    // Process in batches if we have more tasks than concurrency limit
    const totalBatches = Math.ceil(taskCalls.length / maxConcurrent);

    for (let i = 0; i < taskCalls.length; i += maxConcurrent) {
      const batch = taskCalls.slice(i, i + maxConcurrent);
      const batchNum = Math.floor(i / maxConcurrent) + 1;

      logger.log("INFO", "TASK_EXECUTOR", `Processing batch ${batchNum}/${totalBatches}`, {
        batch_number: batchNum,
        total_batches: totalBatches,
        batch_size: batch.length,
        agents_in_batch: batch.map(t => t.agent_type),
      });

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

      // Log batch completion
      const batchSuccess = batchResults.filter(r => r.status === "fulfilled" && r.value.success).length;
      const batchFailed = batch.length - batchSuccess;

      logger.log("INFO", "TASK_EXECUTOR", `Batch ${batchNum} completed`, {
        batch_number: batchNum,
        succeeded: batchSuccess,
        failed: batchFailed,
        cumulative_results: results.length,
      });

      // Check if we should stop on failure
      if (!continueOnFailure && errors.length > 0) {
        logger.log("WARN", "TASK_EXECUTOR", `Stopping parallel execution due to failure`, {
          continue_on_failure: false,
          errors_count: errors.length,
          remaining_batches: totalBatches - batchNum,
        });
        break;
      }
    }

    const duration = Date.now() - startTime;
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    logger.log("INFO", "TASK_EXECUTOR", `Parallel execution completed`, {
      total_tasks: results.length,
      succeeded: successCount,
      failed: failureCount,
      success_rate: `${Math.round((successCount / results.length) * 100)}%`,
      duration_ms: duration,
      errors: errors.length > 0 ? errors : undefined,
    });

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
