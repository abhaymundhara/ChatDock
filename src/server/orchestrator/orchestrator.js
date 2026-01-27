/**
 * ChatDock Orchestrator
 * The master agentic loop that coordinates tools, skills, and LLM interaction
 */

const { OllamaClient } = require("./ollama-client");
const { ToolRegistry } = require("./tool-registry");
const { SkillLoader } = require("./skill-loader");
const { PromptBuilder } = require("./prompt-builder");
const { MemoryManager } = require("../utils/memory-manager");

/**
 * Orchestrator states
 */
const OrchestratorState = {
  IDLE: "idle",
  ANALYZING: "analyzing",
  PLANNING: "planning",
  EXECUTING: "executing",
  OBSERVING: "observing",
  THINKING: "thinking",
  RESPONDING: "responding",
  ERROR: "error",
};

/**
 * Agentic Loop Phases (following documentation)
 */
const AgenticPhase = {
  ANALYZE: "analyze", // Parse user intent, load skills, identify tools
  PLAN: "plan", // Generate structured task list
  EXECUTE: "execute", // Execute tools with parameters
  OBSERVE: "observe", // Validate output, check errors, update status
  RESPOND: "respond", // Summarize results, update memory
};

class Orchestrator {
  constructor(options = {}) {
    // Core components
    this.ollama =
      options.ollamaClient ||
      new OllamaClient({
        model: options.model || "nemotron-3-nano:30b",
      });
    this.tools = options.toolRegistry || new ToolRegistry();
    this.skills = options.skillLoader || new SkillLoader();
    this.promptBuilder = options.promptBuilder || new PromptBuilder();
    this.memory = options.memoryManager || new MemoryManager();

    // State
    this.state = OrchestratorState.IDLE;
    this.currentPhase = null;
    this.conversationHistory = [];
    this.currentPlan = null;
    this.maxIterations = options.maxIterations || 10;
    this.maxRetriesPerTool = options.maxRetriesPerTool || 2;

    // Agentic loop tracking
    this.loopIteration = 0;
    this.toolRetries = new Map(); // Track retries per tool call

    // Callbacks
    this.onStateChange = options.onStateChange || (() => {});
    this.onPhaseChange = options.onPhaseChange || (() => {});
    this.onToolCall = options.onToolCall || (() => {});
    this.onThinking = options.onThinking || (() => {});
    this.onChunk = options.onChunk || (() => {});
  }

  /**
   * Initialize the orchestrator
   */
  async initialize() {
    // Check Ollama health
    const health = await this.ollama.healthCheck();
    if (!health.ok) {
      throw new Error(`Ollama not available: ${health.error}`);
    }

    // Discover and load tools
    await this.tools.discover();

    // Load skills
    await this.skills.load();

    // Log session start
    this.memory.logSession(
      `Session started with ${this.tools.count()} tools, ${this.skills.count()} skills`,
    );

    return {
      ollamaVersion: health.version,
      toolCount: this.tools.count(),
      skillCount: this.skills.count(),
    };
  }

  /**
   * Extract URLs from text
   * @param {string} text
   * @returns {string[]}
   */
  extractUrls(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = text.match(urlRegex);
    return matches || [];
  }

  /**
   * Process a user message through the agentic loop
   * Implements the Plan-Act-Observe cycle from documentation
   * @param {string} userMessage
   * @param {Object} context - Additional context (files, etc.)
   * @returns {AsyncGenerator<{type: string, data: any}>}
   */
  async *process(userMessage, context = {}) {
    // Reset loop state
    this.loopIteration = 0;
    this.toolRetries.clear();
    this.currentPhase = AgenticPhase.ANALYZE;

    // Initialize with provided conversation history for context continuity
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      // Prepend provided history to maintain context across requests
      this.conversationHistory = [...context.conversationHistory];
      console.log(`[orchestrator] 📚 Loaded ${context.conversationHistory.length} messages from history`);
    }

    // Add user message to history
    this.conversationHistory.push({
      role: "user",
      content: userMessage,
    });

    // AUTO-FETCH URLs: If user provides URL, automatically fetch and summarize
    const urls = this.extractUrls(userMessage);
    if (urls.length > 0) {
      console.log(`[orchestrator] 🔗 URLs detected: ${urls.length}`);

      for (const url of urls) {
        console.log(`[orchestrator] 📥 Auto-fetching: ${url}`);

        yield {
          type: "phase",
          data: {
            phase: AgenticPhase.EXECUTE,
            message: `Fetching ${url}...`,
          },
        };

        try {
          // Execute fetch_url tool
          const result = await this.tools.execute("fetch_url", {
            url,
            maxLength: 15000,
          });

          yield {
            type: "tool_result",
            tool: "fetch_url",
            data: { url, success: true },
          };

          // Add tool result to conversation
          this.conversationHistory.push({
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: `fetch_${Date.now()}`,
                function: { name: "fetch_url", arguments: { url } },
              },
            ],
          });
          this.conversationHistory.push({
            role: "tool",
            content: JSON.stringify(result),
            tool_call_id: `fetch_${Date.now()}`,
          });

          console.log(
            `[orchestrator] ✅ Fetched ${result.contentLength} chars from ${url}`,
          );

          // Get LLM to summarize
          yield {
            type: "phase",
            data: {
              phase: AgenticPhase.RESPOND,
              message: "Generating summary...",
            },
          };

          // Build a focused summary prompt
          const summarySystemPrompt = this.buildAgenticPrompt(context);

          // Override conversation history with summary-focused instruction
          const summaryMessages = [
            {
              role: "system",
              content: `You are a document summarizer. When given webpage content, you MUST immediately provide a comprehensive summary. Never ask questions. Never request clarification. Just summarize what you receive.`,
            },
            {
              role: "user",
              content: `The following is content from ${url}. Provide a comprehensive summary with:\n- Main topic/purpose (1-2 sentences)\n- Key features or points (bullet points)\n- Important details\n- Technical information if relevant\n\nDo NOT ask questions. Do NOT request more information. Just summarize the content below.\n\nContent:\n${result.content}`,
            },
          ];

          const summaryResponse = await this.ollama.chat(summaryMessages, {
            temperature: 0.3, // Lower temperature for more focused output
          });

          if (summaryResponse.content) {
            this.conversationHistory.push({
              role: "assistant",
              content: summaryResponse.content,
            });

            yield {
              type: "response",
              data: { content: summaryResponse.content },
            };

            console.log(`[orchestrator] 📝 Summary generated for ${url}`);
          }
        } catch (error) {
          console.error(
            `[orchestrator] ❌ Failed to fetch ${url}:`,
            error.message,
          );
          yield {
            type: "error",
            data: { message: `Failed to fetch ${url}: ${error.message}` },
          };
        }
      }

      // Done - return early after summarizing all URLs
      return;
    }

    // PHASE 1: ANALYZE
    // Parse user intent, load relevant skills, identify required tools
    yield* this.analyzePhase(userMessage, context);

    // Workflow enforcement state
    let hasTaskPlan = false;
    let hasToolFinder = false;

    // Main agentic loop
    while (this.loopIteration < this.maxIterations) {
      this.loopIteration++;

      // Build the prompt with full context
      const systemPrompt = this.buildAgenticPrompt(context);

      try {
        // Get LLM response
        const response = await this.getLLMResponse(systemPrompt);

        // Check if response has tool calls
        if (response.tool_calls && response.tool_calls.length > 0) {
          const violation = this.getWorkflowViolation(
            response.tool_calls,
            { hasTaskPlan, hasToolFinder },
            userMessage, // Pass userMessage to check complexity
          );

          if (violation) {
            const firstTool = response.tool_calls[0].function.name;
            console.log(
              `[orchestrator] 🛑 WORKFLOW VIOLATION: ${violation.type} (from ${firstTool})`,
            );

            this.conversationHistory.push({
              role: "assistant",
              content: "",
              tool_calls: response.tool_calls,
            });
            this.conversationHistory.push({
              role: "tool",
              content: violation.message,
              tool_call_id: response.tool_calls[0].id || firstTool,
            });

            continue; // Force model to comply with workflow
          }

          const createdTasks = response.tool_calls.some(
            (tc) => tc.function.name === "task_write",
          );
          if (createdTasks) {
            hasTaskPlan = true;
            console.log(`[orchestrator] 📋 TASK PLAN CREATED`);
          }

          const usedToolFinder = response.tool_calls.some(
            (tc) => tc.function.name === "tool_finder",
          );
          if (usedToolFinder) {
            hasToolFinder = true;
            console.log(`[orchestrator] 🧭 TOOL FINDER CALLED`);
          }

          // PHASE 2 & 3: PLAN & EXECUTE
          // Execute tools and observe results
          const shouldContinue = yield* this.executePlanPhase(
            response.tool_calls,
          );

          if (!shouldContinue) {
            break;
          }

          // Continue loop to process tool results
          continue;
        }

        // No tool calls - check for structured response format
        const structuredResponse = this.parseStructuredResponse(
          response.content,
        );

        if (structuredResponse && structuredResponse.action) {
          // Execute the action from structured response
          const shouldContinue =
            yield* this.executeStructuredAction(structuredResponse);

          if (!shouldContinue) {
            break;
          }

          continue;
        }

        // PHASE 5: RESPOND
        // No more tool calls, final response
        if (response.content) {
          yield* this.respondPhase(response.content, context);
          break;
        }
      } catch (error) {
        this.setState(OrchestratorState.ERROR);
        yield { type: "error", data: { message: error.message } };
        break;
      }
    }

    if (this.loopIteration >= this.maxIterations) {
      yield {
        type: "error",
        data: {
          message:
            "Max iterations reached. Task may be too complex or unclear.",
        },
      };
    }

    this.setState(OrchestratorState.IDLE);
    this.currentPhase = null;
  }

  /**
   * Detect if a task is complex and requires planning (Claude Cowork-style)
   * @param {string} userMessage
   * @returns {boolean}
   */
  detectComplexTask(userMessage) {
    const msg = userMessage.toLowerCase();
    const matchesAny = (patterns) => patterns.some((p) => p.test(msg));

    // Simple queries: questions, info requests, greetings, URLs, math
    const simplePatterns = [
      /^(what|who|when|where|why|how)\s/i,
      /^(tell me|show me|explain|describe)\s/i,
      /^(list|display|view)\s/i,
      /\b(hello|hi|hey|thanks|thank you)\b/i,
      /^(add|subtract|multiply|divide|calculate)\s/i,
      /^\d+\s*[\+\-\*\/]/i,
    ];

    // Complex indicators: code work, debugging, features, analysis
    const complexPatterns = [
      /\b(create|build|implement|refactor|migrate)\b/i,
      /\b(fix|debug|solve|resolve)\b.{0,20}\b(bug|issue|error|problem)\b/i,
      /\b(add|remove|update|modify|change).{0,20}\b(feature|functionality|component)\b/i,
      /\b(test|analyze|research|investigate)\b/i,
      /\band\b.*\band\b/i,
      /\bthen\b/i,
      /\d+[\.\)]\s/,
    ];

    const wordCount = userMessage.trim().split(/\s+/).length;
    const isComplexByPattern = matchesAny(complexPatterns);

    // Very short messages are almost always simple follow-ups unless they match complex patterns
    if (wordCount <= 8 && !isComplexByPattern) {
      console.log(
        `[orchestrator] ✓ Short message (${wordCount} words) - treating as simple`,
      );
      return false;
    }

    if (
      matchesAny(simplePatterns) ||
      this.extractUrls(userMessage).length > 0
    ) {
      console.log(`[orchestrator] ✓ Simple query - skipping tasks`);
      return false;
    }

    const isComplex = isComplexByPattern || wordCount > 20;
    console.log(
      `[orchestrator] ✓ ${isComplex ? "Complex task - tasks required" : "Simple task - skipping tasks"}`,
    );
    return isComplex;
  }

  /**
   * Validate tool call order for enforced workflow (Claude Cowork-style).
   * Only enforces tasks for complex multi-step work.
   * @param {Array} toolCalls
   * @param {{ hasTaskPlan: boolean, hasToolFinder: boolean }} state
   * @param {string} userMessage - Original user message to check complexity
   * @returns {{ type: string, message: string } | null}
   */
  getWorkflowViolation(
    toolCalls,
    { hasTaskPlan, hasToolFinder },
    userMessage = "",
  ) {
    const planningTools = new Set(["task_write", "think", "ask_user"]);
    const toolNames = toolCalls.map((tc) => tc?.function?.name).filter(Boolean);

    const hasTaskWrite = toolNames.includes("task_write");
    const hasToolFinderCall = toolNames.includes("tool_finder");
    const hasNonPlanning = toolNames.some(
      (name) => !planningTools.has(name) && name !== "tool_finder",
    );

    // Check if this is actually a complex task that needs planning
    const needsTasks = this.detectComplexTask(userMessage);

    // COMPLEX TASKS: Enforce task_write first
    if (!hasTaskPlan && needsTasks) {
      if (!hasTaskWrite) {
        return {
          type: "task_write_required",
          message: `STOP: This is a complex task that requires planning.

REQUIRED ACTION: Call task_write({ tasks: [...] }) to create specific, actionable tasks.
Example: task_write({ title: "Fix Login Bug", tasks: [
  { id: "1", task: "Reproduce the bug in dev environment" },
  { id: "2", task: "Identify root cause in auth.js" },
  { id: "3", task: "Implement fix with proper error handling" }
]})

After tasks are created, call tool_finder if tools are needed.`,
        };
      }

      if (hasToolFinderCall || hasNonPlanning) {
        return {
          type: "task_write_only",
          message: `STOP: Task planning must be the only action right now.

REQUIRED ACTION: Call task_write({ tasks: [...] }) only. Do not use other tools yet.`,
        };
      }

      return null;
    }

    // BOTH SIMPLE & COMPLEX: Always enforce tool_finder before other tools
    if (!hasToolFinder && hasNonPlanning) {
      if (!hasToolFinderCall) {
        // Suggest a better query based on attempted tool
        const attemptedTool = toolNames.find(
          (name) => !planningTools.has(name) && name !== "tool_finder",
        );

        // Smart query suggestions based on tool category
        const querySuggestions = [
          { keywords: ["search", "web"], query: "search web news" },
          { keywords: ["file", "read", "write"], query: "file operations" },
          { keywords: ["command", "shell", "run"], query: "run commands" },
          { keywords: ["open", "app"], query: "open application" },
        ];

        const suggestion = querySuggestions.find((s) =>
          s.keywords.some((kw) => attemptedTool?.includes(kw)),
        );
        const suggestedQuery = suggestion?.query || "appropriate tools";

        return {
          type: "tool_finder_required",
          message: `STOP: You must call tool_finder before using "${attemptedTool || "tools"}".

REQUIRED ACTION: Call tool_finder({ query: "${suggestedQuery}" }) first to discover the right tool.

The user asked: "${userMessage.substring(0, 100)}..."
Find the appropriate tool for this request.`,
        };
      }

      if (hasToolFinderCall) {
        return {
          type: "tool_finder_only",
          message: `STOP: Tool discovery must happen before any execution.

REQUIRED ACTION: Call tool_finder({ query: "..." }) only. Do not execute other tools in the same response.`,
        };
      }
    }

    return null;
  }

  /**
   * PHASE 1: ANALYZE
   * Parse user intent, load relevant skills, identify required tools
   */
  async *analyzePhase(userMessage, context) {
    this.setState(OrchestratorState.ANALYZING);
    this.setPhase(AgenticPhase.ANALYZE);

    yield {
      type: "phase",
      data: {
        phase: AgenticPhase.ANALYZE,
        message: "Analyzing request and identifying required capabilities...",
      },
    };

    // Load relevant skills based on user message
    const relevantSkills = await this.skills.findRelevant(userMessage);

    // TODO: Could add tool discovery here if needed

    return { skills: relevantSkills };
  }

  /**
   * PHASE 2 & 3: PLAN & EXECUTE
   * Execute tool calls and observe results
   */
  async *executePlanPhase(toolCalls) {
    // Check if this is a planning tool (task_write, think, etc.)
    const isPlanningTool = toolCalls.some((tc) =>
      ["task_write", "think", "ask_user"].includes(tc.function.name),
    );

    if (isPlanningTool) {
      this.setState(OrchestratorState.PLANNING);
      this.setPhase(AgenticPhase.PLAN);
      yield {
        type: "phase",
        data: {
          phase: AgenticPhase.PLAN,
          message: "Creating execution plan...",
        },
      };
    } else {
      this.setState(OrchestratorState.EXECUTING);
      this.setPhase(AgenticPhase.EXECUTE);
      yield {
        type: "phase",
        data: {
          phase: AgenticPhase.EXECUTE,
          message: "Executing actions...",
        },
      };
    }

    // Execute all tool calls
    for (const toolCall of toolCalls) {
      yield* this.executeToolCall(toolCall);
    }

    // PHASE 4: OBSERVE
    // Validate outputs and decide next step
    yield* this.observePhase(toolCalls);

    return true; // Continue loop
  }

  /**
   * Execute a structured action from the documented format:
   * { "thought": "...", "action": { "tool": "...", "parameters": {...} } }
   */
  async *executeStructuredAction(structuredResponse) {
    // Show thinking if present
    if (structuredResponse.thought) {
      yield {
        type: "thinking",
        data: { thought: structuredResponse.thought },
      };
    }

    // Execute the action
    const action = structuredResponse.action;
    const toolCall = {
      id: `structured_${Date.now()}`,
      function: {
        name: action.tool,
        arguments: action.parameters,
      },
    };

    yield* this.executeToolCall(toolCall);

    return true; // Continue loop
  }

  /**
   * Execute a single tool call
   */
  async *executeToolCall(toolCall) {
    console.log(`[orchestrator] 🛠️ Tool Call: ${toolCall.function.name}`);
    console.log(`[orchestrator] 📦 Args:`, toolCall.function.arguments);

    yield {
      type: "tool_start",
      tool: toolCall.function.name,
      data: { name: toolCall.function.name, args: toolCall.function.arguments },
    };

    this.onToolCall(toolCall);

    try {
      const result = await this.tools.execute(
        toolCall.function.name,
        toolCall.function.arguments,
      );

      console.log(
        `[orchestrator] ✅ Result:`,
        typeof result === "string" ? result.substring(0, 100) + "..." : result,
      );

      yield {
        type: "tool_result",
        data: { name: toolCall.function.name, result },
      };

      // Enhanced task streaming (Claude Cowork-style)
      if (toolCall.function.name.startsWith("task_")) {
        const taskPayload = result?.plan || result;
        if (taskPayload && taskPayload.tasks) {
          // Find current in-progress task for visibility
          const inProgressTask = taskPayload.tasks.find(
            (t) => t.status === "in_progress",
          );
          const completedCount = taskPayload.tasks.filter(
            (t) => t.status === "completed",
          ).length;
          const totalCount = taskPayload.tasks.length;

          yield {
            type: "tasks",
            data: {
              ...taskPayload,
              currentTask: inProgressTask || null,
              progress: {
                completed: completedCount,
                total: totalCount,
                percentage: Math.round((completedCount / totalCount) * 100),
              },
            },
          };
        }

        // If this was a task_update, also emit a specific status change event
        if (toolCall.function.name === "task_update" && result?.updated) {
          yield {
            type: "task_status_change",
            data: {
              taskId: result.updated,
              oldStatus: result.oldStatus,
              newStatus: result.newStatus,
              timestamp: new Date().toISOString(),
            },
          };
        }
      }

      // Add tool result to conversation
      this.conversationHistory.push({
        role: "assistant",
        content: "",
        tool_calls: [toolCall],
      });
      this.conversationHistory.push({
        role: "tool",
        content: typeof result === "string" ? result : JSON.stringify(result),
        tool_call_id: toolCall.id || toolCall.function.name,
      });

      // Reset retry count on success
      this.toolRetries.delete(toolCall.function.name);
    } catch (toolError) {
      console.error(`[orchestrator] ❌ Error: ${toolError.message}`);

      // Track retries
      const retryCount =
        (this.toolRetries.get(toolCall.function.name) || 0) + 1;
      this.toolRetries.set(toolCall.function.name, retryCount);

      yield {
        type: "tool_error",
        data: {
          name: toolCall.function.name,
          error: toolError.message,
          retryCount,
          maxRetries: this.maxRetriesPerTool,
        },
      };

      // Add error to conversation with retry guidance
      const errorMessage =
        retryCount < this.maxRetriesPerTool
          ? `Error executing ${toolCall.function.name}: ${toolError.message}\n\nPlease analyze the error and try a different approach.`
          : `Error executing ${toolCall.function.name}: ${toolError.message}\n\nMax retries reached. Please ask the user for clarification or try a different solution.`;

      this.conversationHistory.push({
        role: "tool",
        content: errorMessage,
        tool_call_id: toolCall.id || toolCall.function.name,
      });
    }
  }

  /**
   * PHASE 4: OBSERVE
   * Validate tool output, check for errors, update task status
   */
  async *observePhase(toolCalls) {
    this.setState(OrchestratorState.OBSERVING);
    this.setPhase(AgenticPhase.OBSERVE);

    yield {
      type: "phase",
      data: {
        phase: AgenticPhase.OBSERVE,
        message: "Validating results...",
      },
    };

    // Check if any tools failed
    const failedTools = Array.from(this.toolRetries.entries()).filter(
      ([_, count]) => count >= this.maxRetriesPerTool,
    );

    if (failedTools.length > 0) {
      yield {
        type: "observation",
        data: {
          status: "warning",
          message: `Some tools failed after retries: ${failedTools.map(([name]) => name).join(", ")}`,
        },
      };
    }

    // TODO: Could add more sophisticated validation logic here
    // - Check if plan tasks are completed
    // - Validate expected outputs
    // - Determine if we should continue, retry, or ask user
  }

  /**
   * PHASE 5: RESPOND
   * Summarize results to user, update persistent memory if needed
   */
  async *respondPhase(content, context) {
    this.setState(OrchestratorState.RESPONDING);
    this.setPhase(AgenticPhase.RESPOND);

    yield {
      type: "phase",
      data: {
        phase: AgenticPhase.RESPOND,
        message: "Preparing response...",
      },
    };

    this.conversationHistory.push({
      role: "assistant",
      content,
    });

    yield { type: "response", content, data: { content } };

    // Update persistent memory
    try {
      this.memory.saveConversationLearnings(this.conversationHistory);
      console.log(`[orchestrator] 💾 Saved conversation learnings to memory`);
    } catch (error) {
      console.error(`[orchestrator] Failed to save memory:`, error.message);
    }
  }

  /**
   * Build the prompt for the agentic loop
   */
  buildAgenticPrompt(context) {
    // Include persistent memory in context
    const memoryContext = {
      ...context,
      memory: this.memory.getCombinedMemory(),
    };

    // Add relevant memories from semantic search (if available)
    if (context.relevantMemories && context.relevantMemories.length > 0) {
      const relevantSection = context.relevantMemories
        .map((m) => `- ${m.content}`)
        .join("\n");
      memoryContext.relevantContext = `\n## Relevant Past Context\n${relevantSection}`;
    }

    const basePrompt = this.promptBuilder.build({
      tools: this.tools.getDefinitions(),
      skills: this.skills.getActive(),
      context: memoryContext,
    });

    // Add agentic loop instructions
    const agenticInstructions = `

## Agentic Loop Protocol

You are operating in a structured Plan-Act-Observe cycle:

1. **ANALYZE**: Understand the user's request and identify required capabilities
2. **PLAN**: Create a structured task list before taking action
3. **EXECUTE**: Perform actions using available tools
4. **OBSERVE**: Validate results and check for errors
5. **RESPOND**: Provide a clear summary to the user

### When to Use Tools vs When to Respond

**Use a tool when:**
- You need information you don't have (files, web data, system info, etc.)
- You need to perform an action (create files, run commands, etc.)
- The user has asked you to do something specific

**Provide a direct response when:**
- You have just executed a tool and received results
- The tool results contain the information the user requested
- You can answer the user's question with the information available

### After Tool Execution

When you see a tool result in the conversation history:
1. **Read the tool result carefully**
2. **Use the information to answer the user's original question**
3. **Provide a clear, helpful response** - do NOT just say "hello" or ask "how can I help"
4. **Format the information appropriately** (lists, explanations, etc.)

Example:
- User asks: "List all tools"
- You call: tool_list
- Tool returns: List of 47 tools in categories
- You respond: "I have 47 tools available across several categories: [explain the categories and key tools]"

### Response Format

**When you need to use a tool:**
\`\`\`json
{
  "thought": "Your reasoning about the current step",
  "action": {
    "tool": "tool_name",
    "parameters": {
      "param1": "value1"
    }
  }
}
\`\`\`

**When providing a final answer:**
Just respond naturally with the information from the tool results or your knowledge.

### Planning Requirements

For complex tasks (multiple steps, file operations, system changes):
- First iteration: Use \`think\` or \`task_write\` to create a plan
- Do NOT jump directly to execution
- Break down the task into clear, sequential steps

### Error Handling

When a tool fails:
- Analyze the error message carefully
- Consider alternative approaches
- If unclear, use \`ask_user\` for clarification
- After ${this.maxRetriesPerTool} failures, ask for user guidance

`;

    return basePrompt + agenticInstructions;
  }

  /**
   * Get LLM response with tools
   */
  async getLLMResponse(systemPrompt) {
    this.setState(OrchestratorState.THINKING);

    // Use CORE tools for smaller models to avoid context overload
    const isSmallModel =
      this.ollama.defaultModel.includes("nano") ||
      this.ollama.defaultModel.includes(":7b") ||
      this.ollama.defaultModel.includes(":8b");

    const toolsToUse = isSmallModel
      ? this.tools.getCoreToolsFormat()
      : this.tools.getOllamaFormat();

    return await this.ollama.chatWithTools(
      [{ role: "system", content: systemPrompt }, ...this.conversationHistory],
      toolsToUse,
    );
  }

  /**
   * Parse structured response format from LLM content
   * Format: { "thought": "...", "action": { "tool": "...", "parameters": {...} } }
   */
  parseStructuredResponse(content) {
    if (!content) return null;

    try {
      // Try to extract JSON from content
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.action && parsed.action.tool) {
          return parsed;
        }
      }
    } catch (e) {
      // Not a structured response
    }

    return null;
  }

  /**
   * Set current agentic phase and notify listeners
   */
  setPhase(newPhase) {
    const oldPhase = this.currentPhase;
    this.currentPhase = newPhase;
    this.onPhaseChange({ from: oldPhase, to: newPhase });
  }

  /**
   * Process with streaming response
   * @param {string} userMessage
   * @param {Object} context
   * @returns {AsyncGenerator<string>}
   */
  async *processStream(userMessage, context = {}) {
    for await (const event of this.process(userMessage, context)) {
      if (event.type === "response") {
        // For streaming, we could stream the response here
        // For now, yield the full response
        yield event.data.content;
      } else if (event.type === "tool_start") {
        this.onToolCall(event.data);
      } else if (event.type === "thinking") {
        this.onThinking(event.data);
      }
    }
  }

  /**
   * Set orchestrator state and notify listeners
   * @param {string} newState
   */
  setState(newState) {
    const oldState = this.state;
    this.state = newState;
    this.onStateChange({ from: oldState, to: newState });
  }

  /**
   * Get current state
   * @returns {string}
   */
  getState() {
    return this.state;
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = [];
  }

  /**
   * Get conversation history
   * @returns {Array}
   */
  getHistory() {
    return [...this.conversationHistory];
  }
}

module.exports = { Orchestrator, OrchestratorState, AgenticPhase };
