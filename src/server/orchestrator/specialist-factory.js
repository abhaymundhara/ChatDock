/**
 * Specialist Factory for ChatDock
 * Loads specialist prompts and spawns specialists with fresh context
 * Based on Anthropic Cowork patterns
 */

const fs = require("node:fs");
const path = require("node:path");
const { OllamaClient } = require("./ollama-client");
const logger = require("../utils/logger");

/**
 * Load specialist system prompt
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

    // Use plugin-based tool filtering
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

    // Cache loaded prompts
    this.prompts = new Map();
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
    const model = options.model || this.model;
    const startTime = Date.now();

    logger.logSpecialist(specialistName, task.id, "START", {
      title: task.title,
      description: task.description.substring(0, 200),
      model,
    });

    try {
      // Get specialist prompt
      const systemPrompt = this.getPrompt(specialistName);

      // Build fresh context message
      const taskMessage = `Task: ${task.title}\n\nDescription: ${task.description}`;

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

        // Execute any tool calls
        if (response.tool_calls && response.tool_calls.length > 0) {
          const toolResults = await this.executeToolCalls(response.tool_calls);
          const duration = Date.now() - startTime;

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
        // Conversation specialist - no tools
        response = await this.ollamaClient.chat(messages, {
          model,
          temperature: 0.7,
        });
      }

      const duration = Date.now() - startTime;
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
      const duration = Date.now() - startTime;
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
   * Execute tool calls from specialist
   * @param {Array} toolCalls
   * @returns {Promise<Array>}
   */
  async executeToolCalls(toolCalls) {
    const registry = require("../tools/registry");
    const results = [];
    const toolContext = { readFiles: new Set() };

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function?.name;
      const toolArgs = toolCall.function?.arguments;

      if (!toolName) {
        results.push({ error: "Tool call missing function name" });
        continue;
      }

      try {
        // Parse arguments if they're a string
        const args =
          typeof toolArgs === "string" ? JSON.parse(toolArgs) : toolArgs || {};

        // Log tool call start with arguments
        const cleanArgs = { ...args };
        delete cleanArgs.__context;
        logger.logTool(toolName, "CALL", {
          arguments: cleanArgs,
          arg_keys: Object.keys(cleanArgs),
        });

        const toolStartTime = Date.now();
        const result = await registry.executeTool(toolName, {
          ...args,
          __context: toolContext,
        });
        const toolDuration = Date.now() - toolStartTime;

        // Log detailed tool execution
        logger.logToolExecution(toolName, args, result, toolDuration);

        results.push(result);
      } catch (error) {
        logger.logTool(toolName, "FAIL", {
          error: error.message,
          stack: error.stack?.split("\n").slice(0, 3).join("\n"),
        });
        results.push({ error: error.message });
      }
    }

    return results;
  }

  /**
   * Determine which specialist should handle a task based on description
   * This is a fallback - normally the Planner determines this
   * @param {string} description
   * @returns {string}
   */
  static determineSpecialist(description) {
    const lower = description.toLowerCase();

    if (
      lower.includes("file") ||
      lower.includes("read") ||
      lower.includes("write") ||
      lower.includes("search")
    ) {
      return "file";
    }

    if (
      lower.includes("shell") ||
      lower.includes("command") ||
      lower.includes("npm") ||
      lower.includes("git")
    ) {
      return "shell";
    }

    if (
      lower.includes("web") ||
      lower.includes("search") ||
      lower.includes("fetch") ||
      lower.includes("url")
    ) {
      return "web";
    }

    if (
      lower.includes("python") ||
      lower.includes("javascript") ||
      lower.includes("execute") ||
      lower.includes("code")
    ) {
      return "code";
    }

    return "conversation";
  }
}

module.exports = {
  SpecialistFactory,
  loadSpecialistPrompt,
  getSpecialistTools,
};
