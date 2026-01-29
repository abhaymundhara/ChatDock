/**
 * Planner Agent for ChatDock
 * Analyzes user intent and breaks down tasks into structured tool calls
 * Based on Anthropic Cowork patterns
 */

const fs = require("node:fs");
const path = require("node:path");
const { OllamaClient } = require("./ollama-client");

/**
 * Load the Planner system prompt from PLANNER.md
 * @returns {string}
 */
function loadPlannerPrompt() {
  try {
    const appPath =
      process.env.CHATDOCK_APP_PATH || path.join(__dirname, "../../..");
    const plannerPath = path.join(appPath, "brain", "agents", "PLANNER.md");

    if (!fs.existsSync(plannerPath)) {
      throw new Error("PLANNER.md not found at " + plannerPath);
    }

    return fs.readFileSync(plannerPath, "utf-8");
  } catch (error) {
    console.error("[planner] Failed to load PLANNER.md:", error.message);
    throw error;
  }
}

class Planner {
  constructor(options = {}) {
    this.ollamaClient = options.ollamaClient || new OllamaClient();
    this.systemPrompt = loadPlannerPrompt();
    this.model = options.model;
    this.tools = []; // Loaded async in plan()
    this.toolsLoaded = false;
  }

  /**
   * Ensure tools are loaded - only planner's 3 coordination tools
   */
  async ensureTools() {
    if (this.toolsLoaded) return;

    try {
      const registry = require("../tools/registry");
      // Planner only gets its 3 coordination tools: ask_user_question, todo, task
      // Tool awareness is described in PLANNER.md, not via actual tool definitions
      const rawTools = await registry.getToolsByCategory("planner");

      // Strip metadata fields that shouldn't be sent to Ollama
      this.tools = rawTools.map((tool) => ({
        type: tool.type,
        function: tool.function,
      }));

      this.toolsLoaded = true;
    } catch (error) {
      console.warn("[planner] Could not load tools:", error.message);
      this.tools = [];
      this.toolsLoaded = true;
    }
  }

  /**
   * Analyze user request and generate task plan
   * @param {Array<{role: string, content: string}>} conversationHistory - Full conversation history
   * @param {Object} options
   * @returns {Promise<{type: string, tool_calls: Array, content: string}>}
   */
  async plan(conversationHistory, options = {}) {
    const model = options.model || this.model;
    console.log("[planner] Starting plan analysis");
    console.log(`[planner] Model: ${model}`);
    console.log(
      `[planner] History length: ${conversationHistory?.length || 0}`,
    );

    if (!conversationHistory || conversationHistory.length === 0) {
      console.error("[planner] No conversation history provided");
      throw new Error("Conversation history is required");
    }

    const userText = getLatestUserText(conversationHistory);

    // Fast-path: if the latest user message clearly needs tools, synthesize tool calls
    if (needsToolUse(userText)) {
      const filename = extractFilename(userText);
      if (filename) {
        console.log(
          "[planner] Fast-path: synthesizing tool calls for file request",
        );
        return {
          type: "task",
          content: "",
          tool_calls: buildOpenFileToolCalls(filename),
        };
      }
    }

    // Ensure tools are loaded
    console.log("[planner] Loading tools...");
    await this.ensureTools();
    console.log(`[planner] Tools loaded: ${this.tools.length}`);

    // Add current date to system prompt for date awareness
    const currentDate = new Date().toISOString().split("T")[0];
    const systemPromptWithDate = `${this.systemPrompt}\n\n**Important:** Today's date is ${currentDate}.`;

    // Build messages for LLM call
    const messages = [
      { role: "system", content: systemPromptWithDate },
      ...conversationHistory,
    ];

    // Call LLM with tools
    console.log("[planner] Calling LLM with tool awareness...");
    console.log(
      `[planner] Available tools for awareness: ${this.tools.length}`,
    );

    // Debug: Log tools being sent
    console.log(
      "[planner] Tools being sent:",
      JSON.stringify(this.tools, null, 2).substring(0, 500),
    );

    let response;
    const llmStartTime = Date.now();
    try {
      response = await this.ollamaClient.chatWithTools(messages, this.tools, {
        model,
        temperature: 0.3, // Lower temperature for more consistent planning
      });
      console.log(
        `[planner] LLM response received in ${Date.now() - llmStartTime}ms`,
      );
    } catch (error) {
      console.error("[planner] LLM call failed:", error.message);
      console.error("[planner] Full error:", error);
      throw new Error(`Planner LLM call failed: ${error.message}`);
    }

    // Check if it's a pure conversation (no tool calls)
    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.log("[planner] Analysis: Pure conversation (no tool calls)");

      // Fallback: if user intent clearly needs tools, synthesize tool calls
      if (needsToolUse(userText)) {
        const filename = extractFilename(userText);
        if (filename) {
          console.log(
            "[planner] Fallback: synthesizing tool calls for file request",
          );
          const tool_calls = buildOpenFileToolCalls(filename);
          return {
            type: "task",
            content: "",
            tool_calls,
          };
        }

        // Ambiguous tool-needed request: ask a minimal clarification
        console.log(
          "[planner] Fallback: asking clarification for tool-needed request",
        );
        return {
          type: "clarification",
          content: "",
          tool_calls: [
            {
              type: "function",
              function: {
                name: "ask_user_question",
                arguments: JSON.stringify({
                  question:
                    "I need a bit more detail to proceed. What exactly should I do?",
                  options: [
                    {
                      label: "Search",
                      description: "Search for a file or text",
                      value: "search",
                    },
                    {
                      label: "Read file",
                      description: "Open and read a file",
                      value: "read_file",
                    },
                    {
                      label: "Other",
                      description: "Provide more details",
                      value: "other",
                    },
                  ],
                }),
              },
            },
          ],
        };
      }

      // Pure conversational response
      return {
        type: "conversation",
        content: response.content || "",
        tool_calls: [],
      };
    }

    console.log(`[planner] Tool calls detected: ${response.tool_calls.length}`);
    response.tool_calls.forEach((tc, i) => {
      console.log(`[planner]   ${i + 1}. ${tc.function?.name}`);
    });

    // Has tool calls - determine the type
    const hasAskQuestion = response.tool_calls.some(
      (tc) => tc.function?.name === "ask_user_question",
    );
    const hasTaskTracking = response.tool_calls.some(
      (tc) => tc.function?.name === "task",
    );

    if (hasAskQuestion) {
      console.log("[planner] Result: CLARIFICATION needed");
      return {
        type: "clarification",
        content: response.content || "",
        tool_calls: response.tool_calls,
      };
    }

    if (hasTaskTracking) {
      console.log("[planner] Result: TASK execution");
      const todoCount = response.tool_calls.filter(
        (tc) => tc.function?.name === "todo",
      ).length;
      const taskCount = response.tool_calls.filter(
        (tc) => tc.function?.name === "task",
      ).length;
      console.log(`[planner]   - Todo calls: ${todoCount}`);
      console.log(`[planner]   - Task (subagent) calls: ${taskCount}`);
      return {
        type: "task",
        content: response.content || "",
        tool_calls: response.tool_calls,
      };
    }

    // Shouldn't happen, but handle gracefully
    return {
      type: "task",
      content: response.content || "",
      tool_calls: response.tool_calls,
    };
  }

  /**
   * Ask clarifying questions when needed
   * @param {Array<{role: string, content: string}>} conversationHistory
   * @param {Object} options
   * @returns {Promise<{type: 'clarification', questions: Array}>}
   */
  async askClarification(conversationHistory, options = {}) {
    // This will be implemented in Phase 6
    // For now, the Planner will handle clarifications in its normal flow
    throw new Error("Clarification flow not yet implemented");
  }
}

function needsToolUse(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    /\b(open|read|write|search|find|list|delete|move|rename|create)\b/.test(
      lower,
    ) || /\.(txt|md|json|js|ts|py|csv|log)\b/.test(lower)
  );
}

function extractFilename(text) {
  if (!text) return "";
  const match = text.match(/\b(?:open|read)\s+([^\s]+)\b/i);
  if (match && match[1]) return match[1];
  const extMatch = text.match(/\b[^\s]+\.(txt|md|json|js|ts|py|csv|log)\b/i);
  return extMatch ? extMatch[0] : "";
}

function getLatestUserText(conversationHistory) {
  const latestUser = conversationHistory
    ?.slice()
    .reverse()
    .find((m) => m.role === "user");
  return latestUser?.content || "";
}

function buildOpenFileToolCalls(filename) {
  return [
    {
      type: "function",
      function: {
        name: "todo",
        arguments: JSON.stringify({
          todos: [
            {
              id: "1",
              description: `Find ${filename} location`,
              status: "in_progress",
            },
            {
              id: "2",
              description: "Read and display file contents",
              status: "pending",
            },
          ],
        }),
      },
    },
    {
      type: "function",
      function: {
        name: "task",
        arguments: JSON.stringify({
          agent_type: "file",
          task_description: `Find and read ${filename}`,
          context: `Use search_files to locate ${filename} in the workspace, then use read_file to read and display its contents`,
        }),
      },
    },
  ];
}

module.exports = { Planner, loadPlannerPrompt };
