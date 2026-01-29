/**
 * Specialist Factory for ChatDock
 * Loads specialist prompts and spawns specialists with fresh context
 * Uses dedicated classes for known specialists, falls back to generic for others
 * Based on Anthropic Cowork patterns
 */

const fs = require("node:fs");
const path = require("node:path");
const { OllamaClient } = require("./ollama-client");
const logger = require("../utils/logger");

// Import dedicated specialists
const { FileSpecialist } = require("./specialists/file-specialist");
const { ConversationSpecialist } = require("./specialists/conversation-specialist");

/**
 * Load specialist system prompt (Generic Fallback)
 * @param {string} specialistName - conversation, file, shell, web, code
 * @returns {string}
 */
function loadSpecialistPrompt(specialistName) {
  try {
    const appPath =
      process.env.CHATDOCK_APP_PATH || path.join(__dirname, "../../..");
    const specialistPath = path.join(
      appPath,
      "brain",
      "agents",
      `${specialistName.toUpperCase()}_SPECIALIST.md`,
    );

    if (!fs.existsSync(specialistPath)) {
      throw new Error(
        `${specialistName.toUpperCase()}_SPECIALIST.md not found at ${specialistPath}`,
      );
    }

    return fs.readFileSync(specialistPath, "utf-8");
  } catch (error) {
    console.error(
      `[specialist-factory] Failed to load ${specialistName} specialist prompt:`,
      error.message,
    );
    throw error;
  }
}

/**
 * Get tools for a specific specialist
 * Uses plugin-based registry for automatic tool categorization
 * @param {string} specialistName
 * @returns {Promise<Array>}
 */
async function getSpecialistTools(specialistName) {
  try {
    const registry = require("../tools/registry");
    return await registry.getToolsForSpecialist(specialistName);
  } catch (error) {
    console.warn(
      `[specialist-factory] Could not load tools for ${specialistName}:`,
      error.message,
    );
    return [];
  }
}

class SpecialistFactory {
  constructor(options = {}) {
    this.ollamaClient = options.ollamaClient || new OllamaClient();
    this.model = options.model;

    // Cache loaded prompts (for generic specialists)
    this.prompts = new Map();

    // Instantiate dedicated specialists (singleton-ish per factory)
    this.specialists = {
        file: new FileSpecialist(options),
        conversation: new ConversationSpecialist(options)
        // Add others as they are implemented
    };
  }

  /**
   * Get specialist prompt (cached)
   * @param {string} specialistName
   * @returns {string}
   */
  getPrompt(specialistName) {
    if (!this.prompts.has(specialistName)) {
      const prompt = loadSpecialistPrompt(specialistName);
      this.prompts.set(specialistName, prompt);
    }
    return this.prompts.get(specialistName);
  }

  /**
   * Spawn a specialist to execute a task
   * Fresh context only - no conversation history
   * @param {string} specialistName - conversation, file, shell, web, code
   * @param {Object} task - { id, title, description }
   * @param {Object} options
   * @returns {Promise<{success: boolean, result?: any, error?: string}>}
   */
  async spawnSpecialist(specialistName, task, options = {}) {
    const start = Date.now();
    
    // Check for dedicated specialist class
    if (this.specialists[specialistName]) {
        logger.log("INFO", "SPECIALIST_FACTORY", `Delegating to dedicated ${specialistName} specialist`);
        return await this.specialists[specialistName].execute(task, options);
    }

    // --- Fallback to Generic Logic ---
    
    const model = options.model || this.model;

    logger.logSpecialist(specialistName, task.id, "START", {
      title: task.title,
      description: task.description.substring(0, 200),
      model,
    });

    try {
      // Get specialist prompt
      const systemPrompt = this.getPrompt(specialistName);

      // Build fresh context message
      let taskMessage = `Task: ${task.title}\n\nDescription: ${task.description}`;

      // Inject feedback from previous attempt if available
      if (options.previousError) {
        taskMessage += `\n\n[PREVIOUS ATTEMPT FAILED]\nThe previous attempt to complete this task failed with the following error:\n"${options.previousError}"\n\nPlease analyze this error, adjust your approach (e.g., use a different tool, check file existence first, or fix syntax), and try again.`;
      }

      // Get specialist tools (async)
      const tools = await getSpecialistTools(specialistName);

      // Build messages - ONLY system prompt + task description (fresh context)
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: taskMessage },
      ];

      // Call LLM
      let response;
      if (tools.length > 0) {
        // Specialist has tools - use chatWithTools
        response = await this.ollamaClient.chatWithTools(messages, tools, {
          model,
          temperature: 0.5,
        });

        // Execute any tool calls (Generic Execution)
        if (response.tool_calls && response.tool_calls.length > 0) {
          const toolResults = await this.executeToolCalls(response.tool_calls);
          const duration = Date.now() - start;

          logger.logSpecialist(specialistName, task.id, "COMPLETE", {
            duration_ms: duration,
            tool_calls: response.tool_calls.length,
          });

          return {
            success: true,
            result: {
              content: response.content,
              tool_calls: response.tool_calls,
              tool_results: toolResults,
            },
          };
        }
      } else {
        // No tools
        response = await this.ollamaClient.chat(messages, {
          model,
          temperature: 0.7,
        });
      }

      const duration = Date.now() - start;
      logger.logSpecialist(specialistName, task.id, "COMPLETE", {
        duration_ms: duration,
        hasContent: !!response.content,
      });

      return {
        success: true,
        result: {
          content: response.content || "",
          model: response.model,
        },
      };
    } catch (error) {
      const duration = Date.now() - start;
      logger.logSpecialist(specialistName, task.id, "FAIL", {
        duration_ms: duration,
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute tool calls from specialist (Generic Fallback)
   * @param {Array} toolCalls
   * @returns {Promise<Array>}
   */
  async executeToolCalls(toolCalls) {
    const registry = require("../tools/registry");
    const results = [];
    const toolContext = { readFiles: new Set() }; // Generic context

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function?.name;
      const toolArgs = toolCall.function?.arguments;

      if (!toolName) {
        results.push({ error: "Tool call missing function name" });
        continue;
      }

      try {
        const args =
          typeof toolArgs === "string" ? JSON.parse(toolArgs) : toolArgs || {};

        const toolStartTime = Date.now();
        const result = await registry.executeTool(toolName, {
          ...args,
          __context: toolContext,
        });
        const toolDuration = Date.now() - toolStartTime;

        logger.logToolExecution(toolName, args, result, toolDuration);

        results.push(result);
      } catch (error) {
        results.push({ error: error.message });
      }
    }

    return results;
  }

  // ... (rest of class)
  
  /**
   * Determine which specialist should handle a task based on description
   * @param {string} description
   * @returns {string}
   */
  static determineSpecialist(description) {
     // ... (static method)
     const lower = description.toLowerCase();
     if (lower.includes("file") || lower.includes("read") || lower.includes("write")) return "file";
     if (lower.includes("shell") || lower.includes("command")) return "shell";
     if (lower.includes("web") || lower.includes("search")) return "web";
     if (lower.includes("code") || lower.includes("python")) return "code";
     return "conversation";
  }
}

module.exports = {
  SpecialistFactory,
  loadSpecialistPrompt,
  getSpecialistTools,
};
