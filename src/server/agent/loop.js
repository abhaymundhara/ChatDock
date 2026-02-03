/**
 * Agent Loop
 * Main "brain" of the agent - matches nanobot architecture
 */

const { Memory } = require("./memory");
const { Context } = require("./context");
const { SubagentManager } = require("./subagent");
const { getToolsLoader } = require("../tools/loader");
const { getSkillsLoader } = require("../skills/loader");
const { getProvider } = require("../providers/provider-factory");
const { getServerConfig, loadSettings } = require("../config/settings");

const MAX_ITERATIONS = 20; // Prevent infinite loops

class Agent {
  constructor() {
    const config = getServerConfig();
    const settings = loadSettings(config.userDataPath);
    
    // Merge settings into config for providers
    this.config = { ...config, ...settings };
    
    // Use provider factory to get the appropriate LLM provider
    this.llm = getProvider(this.config);
    console.log(`[agent] Using LLM provider: ${this.llm.name}`);
    
    this.tools = getToolsLoader();
    this.skills = getSkillsLoader();
    this.memory = new Memory(config.userDataPath);
    this.context = new Context(this.tools, this.skills);
    this.scheduler = null; // Will be set by server
    this.subagentManager = new SubagentManager(this);
    
    // Initialize
    this.tools.loadTools().catch(e => console.error("Failed to load tools:", e));
    this.skills.loadSkills().catch(e => console.error("Failed to load skills:", e));
    this.memory.load();
  }

  setScheduler(scheduler) {
    this.scheduler = scheduler;
  }

  /**
   * Refresh config dynamically
   */
  _refreshConfig() {
    const config = getServerConfig();
    const settings = loadSettings(config.userDataPath);
    this.config = { ...config, ...settings };
    
    // Check if provider changed
    if (this.llm.name !== (settings.defaultProvider || "ollama")) {
      this.llm = getProvider(this.config);
      console.log(`[agent] Switched to provider: ${this.llm.name}`);
    }
    
    return settings;
  }

  /**
   * Build tool context for executors
   */
  _buildToolContext() {
    return {
      scheduler: this.scheduler,
      subagentManager: this.subagentManager,
      config: this.config,
    };
  }

  /**
   * Run the agent loop with streaming response
   * Matches nanobot's architecture with proper tool call iteration
   */
  async run(userMessage, res, options = {}) {
    try {
      // Add user message to memory
      this.memory.add("user", userMessage);
      
      const settings = this._refreshConfig();
      const systemPrompt = this.context.buildSystemPrompt();
      const tools = this.tools.getAllTools();

      // Build initial messages
      let messages = [
        { role: "system", content: systemPrompt },
        ...this.memory.getRecentMessages(15),
      ];

      let iteration = 0;
      let finalContent = "";

      // Agent loop - keep iterating while there are tool calls
      while (iteration < MAX_ITERATIONS) {
        iteration++;

        const response = await this.llm.chat(messages, {
          tools,
          stream: iteration === 1, // Only stream first response
          model: options.model || settings.model,
        });

        let content = "";
        let toolCalls = [];

        if (iteration === 1 && response.body && response.body.getReader) {
          // Streaming mode for first iteration
          const reader = response.body.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n").filter(Boolean);

            for (const line of lines) {
              try {
                const json = JSON.parse(line);
                if (json.message?.content) {
                  res.write(json.message.content);
                  content += json.message.content;
                }
                if (json.message?.tool_calls) {
                  toolCalls.push(...json.message.tool_calls);
                }
              } catch (e) {
                // ignore partial json
              }
            }
          }
        } else {
          // Non-streaming mode for subsequent iterations
          const data = await response.json();
          content = data.message?.content || "";
          toolCalls = data.message?.tool_calls || [];
        }

        // Handle tool calls
        if (toolCalls.length > 0) {
          // Add assistant message with tool calls to messages
          messages.push({
            role: "assistant",
            content: content || "",
            tool_calls: toolCalls.map(tc => ({
              id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              type: "function",
              function: {
                name: tc.function.name,
                arguments: typeof tc.function.arguments === "string" 
                  ? tc.function.arguments 
                  : JSON.stringify(tc.function.arguments),
              },
            })),
          });

          // Execute each tool and add results
          for (const tc of toolCalls) {
            const toolName = tc.function.name;
            const args = tc.function.arguments;
            const toolId = tc.id || `call_${Date.now()}`;

            try {
              const toolContext = this._buildToolContext();
              const result = await this.tools.executeTool(toolName, args, toolContext);
              const resultStr = typeof result === "string" ? result : JSON.stringify(result);

              // Notify user of tool execution
              res.write(`\n[${toolName}] ${resultStr.substring(0, 200)}${resultStr.length > 200 ? "..." : ""}\n`);

              // Add tool result to messages (for next LLM call)
              messages.push({
                role: "tool",
                tool_call_id: toolId,
                name: toolName,
                content: resultStr,
              });
            } catch (err) {
              res.write(`\n[${toolName}] Error: ${err.message}\n`);
              messages.push({
                role: "tool",
                tool_call_id: toolId,
                name: toolName,
                content: `Error: ${err.message}`,
              });
            }
          }

          // Continue loop to let LLM process tool results
          continue;
        }

        // No tool calls - we're done
        finalContent = content;
        break;
      }

      if (iteration >= MAX_ITERATIONS) {
        res.write("\n\n[Max iterations reached]\n");
      }

      // Save final response to memory
      if (finalContent) {
        this.memory.add("assistant", finalContent);
      }

      res.end();
    } catch (err) {
      console.error("Agent Loop Error:", err);
      if (!res.headersSent) {
        res.status(500).send(err.message);
      } else {
        res.write(`\n\n[Error: ${err.message}]\n`);
        res.end();
      }
    }
  }

  /**
   * Process a message directly (for Telegram/CLI) returning a string
   * Matches nanobot's process_direct with proper iteration
   */
  async processDirect(userMessage, context = {}) {
    // Don't pollute memory with cron tasks
    if (!context.isHeartbeat && !context.isCron) {
      this.memory.add("user", userMessage, context.userId);
    }

    const settings = this._refreshConfig();

    try {
      const systemPrompt = this.context.buildSystemPrompt();
      const tools = this.tools.getAllTools();

      let messages = [
        { role: "system", content: systemPrompt },
        ...this.memory.getRecentMessages(10),
      ];

      let iteration = 0;
      let finalContent = "";

      while (iteration < MAX_ITERATIONS) {
        iteration++;

        const response = await this.llm.chat(messages, {
          tools,
          stream: false,
          model: settings.model,
        });

        const data = await response.json();
        const content = data.message?.content || "";
        const toolCalls = data.message?.tool_calls || [];

        if (toolCalls.length > 0) {
          // Add assistant message with tool calls
          messages.push({
            role: "assistant",
            content: content || "",
            tool_calls: toolCalls.map(tc => ({
              id: tc.id || `call_${Date.now()}`,
              type: "function",
              function: {
                name: tc.function.name,
                arguments: typeof tc.function.arguments === "string"
                  ? tc.function.arguments
                  : JSON.stringify(tc.function.arguments),
              },
            })),
          });

          // Execute tools
          for (const tc of toolCalls) {
            const toolName = tc.function.name;
            const args = tc.function.arguments;
            const toolId = tc.id || `call_${Date.now()}`;

            try {
              const toolContext = this._buildToolContext();
              const result = await this.tools.executeTool(toolName, args, toolContext);
              const resultStr = typeof result === "string" ? result : JSON.stringify(result);

              messages.push({
                role: "tool",
                tool_call_id: toolId,
                name: toolName,
                content: resultStr,
              });
            } catch (err) {
              messages.push({
                role: "tool",
                tool_call_id: toolId,
                name: toolName,
                content: `Error: ${err.message}`,
              });
            }
          }

          continue;
        }

        finalContent = content;
        break;
      }

      if (!finalContent && iteration >= MAX_ITERATIONS) {
        finalContent = "I've processed the request but reached the iteration limit.";
      }

      // Save to memory (skip for heartbeat/cron)
      if (finalContent && !context.isHeartbeat && !context.isCron) {
        this.memory.add("assistant", finalContent);
      }

      return finalContent;
    } catch (e) {
      console.error("Agent Direct Error:", e);
      return `Sorry, I encountered an error: ${e.message}`;
    }
  }
}

module.exports = { Agent };
