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
      // Planner only gets its 3 coordination tools: ask_user_question, todo_write, task
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
   * Check if text contains action keywords that need tools
   */
  needsToolUse(text) {
    const actionKeywords =
      /\b(open|read|create|write|search|find|list|run|execute|install|make|build|test|debug|fix|update|delete|remove|move|copy|rename|show|display|get|fetch|load|save|export|import|download|upload|clone|pull|push|commit|checkout|branch|merge|deploy|start|stop|restart|kill)\b/i;
    return actionKeywords.test(text);
  }

  /**
   * Extract filename from common patterns
   */
  extractFilename(text) {
    // Match: "open X", "read X", "show X", etc.
    const actionMatch = text.match(
      /\b(?:open|read|show|display|get|cat|view)\s+([a-zA-Z0-9_\-./]+\.?[a-zA-Z0-9]+)/i,
    );
    if (actionMatch) return actionMatch[1];

    // Match file extensions
    const extMatch = text.match(/([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/);
    if (extMatch) return extMatch[1];

    return null;
  }

  /**
   * Lightweight LLM gate to classify if a request needs tools
   * @param {string} userText
   * @param {Array<{role: string, content: string}>} conversationHistory
   * @param {string} model
   * @returns {Promise<boolean>} true if complex (needs tools)
   */
  async isComplexQuestion(userText, conversationHistory, model) {
    if (!userText || !userText.trim()) return true;

    const recentTurns = conversationHistory.slice(-3);
    const context = recentTurns
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const prompt = `${context}\n\nUser Query: ${userText}\n\nDetermine if this user query is a complex task or a simple question.\n\n**Complex task** (answer \"yes\"): Requires tools, code execution, file operations, multi-step planning, or creating/modifying content\n**Simple question** (answer \"no\"): Can be answered directly with knowledge or conversation history, no action needed\n\nAnswer only \"yes\" or \"no\".`;

    try {
      const resp = await this.ollamaClient.chat(
        [
          {
            role: "system",
            content: "You are a strict classifier. Reply only yes or no.",
          },
          { role: "user", content: prompt },
        ],
        { model, temperature: 0.0 },
      );

      const normalized = (resp?.content || "").trim().toLowerCase();
      if (normalized.includes("yes")) return true;
      if (normalized.includes("no")) return false;
      return true;
    } catch {
      return true;
    }
  }
  /**
   * Check if user approved the todo plan in their last message
   * @param {string} userText - The user's latest message
   * @param {Object} lastPlan - The previous plan object (if any)
   */
  hasUserApproval(userText, lastPlan) {
    if (!lastPlan || !lastPlan.tool_calls) return false;

    // Check if last plan had a todo (without task) - indicating Phase 1
    const hadTodo = lastPlan.tool_calls.some(
      (tc) => tc.function?.name === "todo_write",
    );
    const hadTask = lastPlan.tool_calls.some(
      (tc) => tc.function?.name === "task",
    );

    if (!hadTodo || hadTask) return false; // Not Phase 1

    // Check if user's message is approval
    const approvalKeywords =
      /\b(yes|ok|okay|sure|proceed|go ahead|approved?|confirm|looks? good|correct|right|do it|execute|run it|start)\b/i;
    return approvalKeywords.test(userText);
  }

  /**
   * Extract todo details from last plan
   * @param {Object} lastPlan - The previous plan object
   */
  getPreviousTodo(lastPlan) {
    if (!lastPlan || !lastPlan.tool_calls) return null;

    const todoCall = lastPlan.tool_calls.find(
      (tc) => tc.function?.name === "todo_write",
    );
    if (!todoCall) return null;

    try {
      const args = JSON.parse(todoCall.function.arguments);
      return args.todos;
    } catch (e) {
      return null;
    }
  }
  /**
   * Detect what kind of action is being requested
   */
  detectActionType(text) {
    const lowerText = text.toLowerCase();

    // File operations
    if (/\b(open|read|show|display|cat|view)\s+\S+/i.test(lowerText)) {
      return { type: "file_read", filename: this.extractFilename(text) };
    }
    if (/\b(create|make|write|touch)\b/i.test(lowerText)) {
      const filename =
        text.match(
          /(?:called|named)\s+([a-zA-Z0-9_\-.]+(?:\.[a-zA-Z0-9]+)?)/i,
        )?.[1] || this.extractFilename(text);
      const hasFileKeyword = /\bfile\b/i.test(lowerText);
      if (filename || hasFileKeyword) {
        const location = lowerText.match(/(?:on|in|at)\s+(\w+)/i)?.[1];
        return { type: "file_create", filename, location };
      }
    }
    if (/\b(delete|remove|rm)\s+\S+/i.test(lowerText)) {
      return { type: "file_delete", filename: this.extractFilename(text) };
    }

    // Shell operations
    if (/\b(run|execute|launch|start)\s+\S+/i.test(lowerText)) {
      return {
        type: "shell_execute",
        command: text.match(/(?:run|execute|launch|start)\s+(.+)/i)?.[1],
      };
    }
    if (/\b(install|npm|pip|brew|apt)\b/i.test(lowerText)) {
      return { type: "shell_install", command: text };
    }

    // Search operations
    if (/\b(search|find|look for|locate)\s+\S+/i.test(lowerText)) {
      return {
        type: "search",
        query: text.match(/(?:search|find|look for|locate)\s+(.+)/i)?.[1],
      };
    }

    return { type: "unknown" };
  }

  /**
   * Synthesize tool calls for common actions (bypasses LLM)
   * Phase 1: Creates todo only
   */
  synthesizeToolCalls(action) {
    const toolCalls = [];
    const formatLocation = (location) => {
      if (!location) return "in the current working directory";
      const normalized = location.toLowerCase();
      if (normalized === "desktop") return "on the Desktop";
      if (normalized === "documents") return "in Documents";
      if (normalized === "downloads") return "in Downloads";
      return `in the ${location}`;
    };

    switch (action.type) {
      case "file_read":
        if (!action.filename) break;
        toolCalls.push({
          id: "planner_todo_1",
          type: "function",
          function: {
            name: "todo_write",
            arguments: JSON.stringify({
              todos: [
                {
                  id: 1,
                  description: `Find and read ${action.filename} using a file read operation`,
                  status: "in_progress",
                  assigned_agent: "file",
                },
              ],
            }),
          },
        });
        // Phase 2 will add task after user approval
        break;

      case "file_create":
        if (!action.filename) {
          toolCalls.push({
            id: "planner_clarify_1",
            type: "function",
            function: {
              name: "ask_user_question",
              arguments: JSON.stringify({
                question: "What would you like to name the file?",
                options: [
                  {
                    label: "Specify filename",
                    description: "Enter the filename with extension",
                    value: "specify",
                  },
                ],
              }),
            },
          });
        } else {
          const locationText = formatLocation(action.location);
          toolCalls.push({
            id: "planner_todo_1",
            type: "function",
            function: {
              name: "todo_write",
              arguments: JSON.stringify({
                todos: [
                  {
                    id: 1,
                    description: `Create an empty file named ${action.filename} ${locationText} using a shell command or write operation`,
                    status: "in_progress",
                    assigned_agent: "file",
                  },
                ],
              }),
            },
          });
        }
        break;

      case "shell_execute":
        if (!action.command) break;
        toolCalls.push({
          id: "planner_todo_1",
          type: "function",
          function: {
            name: "todo_write",
            arguments: JSON.stringify({
              todos: [
                {
                  id: 1,
                  description: `Execute: ${action.command}`,
                  status: "in_progress",
                  assigned_agent: "shell",
                },
              ],
            }),
          },
        });
        break;

      case "search":
        if (!action.query) break;
        toolCalls.push({
          id: "planner_todo_1",
          type: "function",
          function: {
            name: "todo_write",
            arguments: JSON.stringify({
              todos: [
                {
                  id: 1,
                  description: `Search for: ${action.query}`,
                  status: "in_progress",
                  assigned_agent: "web",
                },
              ],
            }),
          },
        });
        break;
    }

    return toolCalls;
  }

  /**
   * Build task tree from tool calls with dependencies
   * @param {Array} taskCalls - Task tool calls
   * @returns {Object|null} Task tree structure
   */
  buildTaskTreeFromCalls(taskCalls) {
    if (!taskCalls || taskCalls.length === 0) {
      return null;
    }

    const taskTree = require("./task-tree");

    // Parse each tool call to extract task info
    const tasks = taskCalls.map((tc, index) => {
      const args = this.parseArgs(tc.function.arguments);
      return {
        id: `task_${index + 1}`,
        task_description: args.task_description,
        agent_type: args.agent_type,
        context: args.context,
        depends_on: args.depends_on || [],
      };
    });

    // Build and return the task tree
    return taskTree.buildTaskTree(tasks);
  }

  /**
   * Parse tool arguments (handle string or object)
   * @param {string|Object} args
   * @returns {Object}
   */
  parseArgs(args) {
    return typeof args === "string" ? JSON.parse(args) : args;
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

    // Get lastPlan from options (passed from server)
    const lastPlan = options.lastPlan || null;

    // **FAST-PATH: Pre-process common actions before LLM**
    // Small models struggle with tool calling, so detect and synthesize for common patterns
    const latestUserMsg = conversationHistory
      .slice()
      .reverse()
      .find((m) => m.role === "user");
    const userText = latestUserMsg?.content || "";

    // **PHASE 2: Check if user approved a previous todo plan**
    if (this.hasUserApproval(userText, lastPlan)) {
      console.log("[planner] Phase 2: User approved todo, synthesizing task");
      const todos = this.getPreviousTodo(lastPlan);

      if (todos && todos.length > 0) {
        const firstTodo = todos[0];
        const description = firstTodo.description || "";

        // Infer agent type and task from todo description
        let agent_type = "file";
        let context = "";

        if (/\b(find|search|read|open|display)\b/i.test(description)) {
          agent_type = "file";
          const filename = description.match(
            /(?:read|open|find)\s+([a-zA-Z0-9_\-.]+(?:\.[a-zA-Z0-9]+)?)/i,
          )?.[1];
          context = filename
            ? `Use search_files to locate ${filename} if needed, then read_file to display contents.`
            : "Use search_files to locate the file if needed, then read_file to display contents.";
        } else if (/\b(create|write|make)\b/i.test(description)) {
          agent_type = "file";
          // Extract filename and location from description like "Create file abhay.txt in desktop"
          // Try multiple patterns: "create file X", "create X.txt", "file X"
          let filename =
            description.match(
              /(?:file|create)\s+(?:file\s+)?([a-zA-Z0-9_\-.]+\.[a-zA-Z0-9]+)/i,
            )?.[1] ||
            description.match(/\b([a-zA-Z0-9_\-.]+\.[a-zA-Z0-9]+)\b/i)?.[1];
          const location = description.match(/(?:in|at|on)\s+(\w+)/i)?.[1];

          if (!filename) filename = "newfile.txt";

          let filePath = filename;
          if (location) {
            // Get actual home directory (don't use ~ as it won't be expanded)
            const homeDir =
              process.env.HOME || process.env.USERPROFILE || "/tmp";

            // Map common locations to absolute paths
            const locationMap = {
              desktop: `${homeDir}/Desktop/`,
              documents: `${homeDir}/Documents/`,
              downloads: `${homeDir}/Downloads/`,
              home: `${homeDir}/`,
            };
            const basePath =
              locationMap[location.toLowerCase()] || `${homeDir}/${location}/`;
            filePath = basePath + filename;
          }

          context = `Your task: Create the file ${filePath} with content.\n\nIMPORTANT: Use ONLY write_file tool. Do NOT use create_directory. The write_file tool will automatically create parent directories if needed.\n\nCall write_file with:\n- path: "${filePath}"\n- content: "File created by ChatDock\\n"\n\nDo this in ONE step. Do not create directories separately.`;
        } else if (/\b(execute|run|install|command)\b/i.test(description)) {
          agent_type = "shell";
          context = "Execute the shell command safely and return output.";
        } else if (/\b(search|web|fetch|url)\b/i.test(description)) {
          agent_type = "web";
          context = "Perform web search or fetch URL content.";
        }

        return {
          type: "task",
          content: "Executing the approved plan...",
          tool_calls: [
            {
              id: "planner_task_approved",
              type: "function",
              function: {
                name: "task",
                arguments: JSON.stringify({
                  agent_type,
                  task_description: description,
                  context,
                }),
              },
            },
          ],
        };
      }
    }

    const isToolRequest = this.needsToolUse(userText);
    const isComplex = isToolRequest
      ? true
      : await this.isComplexQuestion(userText, conversationHistory, model);

    if (!isComplex) {
      const response = await this.ollamaClient.chat(
        [
          { role: "system", content: "You are a helpful assistant." },
          ...conversationHistory,
        ],
        { model, temperature: 0.7 },
      );

      return {
        type: "conversation",
        content: response.content || "",
        tool_calls: [],
      };
    }

    // Ensure tools are loaded
    console.log("[planner] Loading tools...");
    await this.ensureTools();
    console.log(`[planner] Tools loaded: ${this.tools.length}`);

    // **PHASE 1: Detect and synthesize todo (without task)**
    if (this.needsToolUse(userText)) {
      const action = this.detectActionType(userText);
      console.log(`[planner] Detected action type: ${action.type}`);

      const synthesizedCalls = this.synthesizeToolCalls(action);
      if (synthesizedCalls.length > 0) {
        console.log(
          `[planner] Phase 1: synthesized ${synthesizedCalls.length} tool calls (todo only)`,
        );
        return {
          type:
            synthesizedCalls[0].function.name === "ask_user_question"
              ? "clarification"
              : "task",
          content: "Here's the plan. Please review and approve:",
          tool_calls: synthesizedCalls,
        };
      } else {
        console.log("[planner] No synthesis possible, falling back to LLM");
      }
    }

    // Add current date to system prompt for date awareness
    const currentDate = new Date().toISOString().split("T")[0];
    const systemPromptWithDate = `${this.systemPrompt}\n\n**Important:** Today's date is ${currentDate}.`;

    // Build messages for LLM call
    const messages = [
      { role: "system", content: systemPromptWithDate },
      ...conversationHistory,
    ];

    // INJECT SYSTEM HINT for tool-heavy requests (Force 3B model compliance)
    if (this.needsToolUse(userText)) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === "user") {
        lastMsg.content +=
          "\n\n[SYSTEM HINT]: Your request implies a file, shell, or search operation. You MUST use the `todo_write` tool. Do NOT respond with pure conversation.";
        console.log("[planner] Injected system hint to force tool usage");
      }
    }

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
        (tc) => tc.function?.name === "todo_write",
      ).length;
      const taskCount = response.tool_calls.filter(
        (tc) => tc.function?.name === "task",
      ).length;
      console.log(`[planner]   - Todo calls: ${todoCount}`);
      console.log(`[planner]   - Task (subagent) calls: ${taskCount}`);

      // Parse task dependencies from tool calls
      const taskCalls = response.tool_calls.filter(
        (tc) => tc.function?.name === "task",
      );
      const taskTree = this.buildTaskTreeFromCalls(taskCalls);

      return {
        type: "task",
        content: response.content || "",
        tool_calls: response.tool_calls,
        taskTree, // Include task tree structure
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

module.exports = { Planner, loadPlannerPrompt };
