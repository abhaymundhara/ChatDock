/**
 * ChatDock Orchestrator
 * The master agentic loop that coordinates tools, skills, and LLM interaction
 */

const { OllamaClient } = require('./ollama-client');
const { ToolRegistry } = require('./tool-registry');
const { SkillLoader } = require('./skill-loader');
const { PromptBuilder } = require('./prompt-builder');

/**
 * Orchestrator states
 */
const OrchestratorState = {
  IDLE: 'idle',
  ANALYZING: 'analyzing',
  PLANNING: 'planning',
  EXECUTING: 'executing',
  THINKING: 'thinking',
  RESPONDING: 'responding',
  ERROR: 'error'
};

class Orchestrator {
  constructor(options = {}) {
    // Core components
    this.ollama = options.ollamaClient || new OllamaClient({
      model: options.model || 'nemotron-3-nano:30b'
    });
    this.tools = options.toolRegistry || new ToolRegistry();
    this.skills = options.skillLoader || new SkillLoader();
    this.promptBuilder = options.promptBuilder || new PromptBuilder();
    
    // State
    this.state = OrchestratorState.IDLE;
    this.conversationHistory = [];
    this.currentPlan = null;
    this.maxIterations = options.maxIterations || 10;
    
    // Callbacks
    this.onStateChange = options.onStateChange || (() => {});
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
    
    return {
      ollamaVersion: health.version,
      toolCount: this.tools.count(),
      skillCount: this.skills.count()
    };
  }

  /**
   * Process a user message through the agentic loop
   * @param {string} userMessage
   * @param {Object} context - Additional context (files, etc.)
   * @returns {AsyncGenerator<{type: string, data: any}>}
   */
  async *process(userMessage, context = {}) {
    this.setState(OrchestratorState.ANALYZING);
    
    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    let iterations = 0;
    
    while (iterations < this.maxIterations) {
      iterations++;
      
      // Build the prompt with system context
      const systemPrompt = this.promptBuilder.build({
        tools: this.tools.getDefinitions(),
        skills: this.skills.getActive(),
        context,
        history: this.conversationHistory
      });

      // Get LLM response with tool calling
      this.setState(OrchestratorState.THINKING);
      
      try {
        // Use CORE tools for smaller models to avoid context overload
        // Use FULL tools for larger models (>= 10b parameters)
        const isSmallModel = this.ollama.defaultModel.includes('nano') || 
                             this.ollama.defaultModel.includes(':7b') || 
                             this.ollama.defaultModel.includes(':8b');
                             
        const toolsToUse = isSmallModel 
          ? this.tools.getCoreToolsFormat() 
          : this.tools.getOllamaFormat();

        const response = await this.ollama.chatWithTools(
          [
            { role: 'system', content: systemPrompt },
            ...this.conversationHistory
          ],
          toolsToUse
        );

        // Check if there are tool calls in the structured format
        if (response.tool_calls && response.tool_calls.length > 0) {
          
          // ENFORCE WORKFLOW: First step must be PLANNING or DISCOVERY for new tasks
          if (iterations === 1) {
            const firstTool = response.tool_calls[0].function.name;
            const allowedFirstTools = ['think', 'todo_write', 'tool_search', 'ask_user', 'tool_list'];
            
            if (!allowedFirstTools.includes(firstTool)) {
              console.log(`[orchestrator] 🛑 Intercepting execution: Model tried ${firstTool} without planning.`);
              
              // Get original user intent from history
              const lastUserMessage = this.conversationHistory
                .slice().reverse()
                .find(m => m.role === 'user')?.content || "Unknown request";

              // Inject a system correction instead of executing
              this.setState(OrchestratorState.PLANNING);
              this.conversationHistory.push({
                role: 'assistant',
                content: '',
                tool_calls: response.tool_calls
              });
              this.conversationHistory.push({
                role: 'tool',
                content: `STOP: You are violating the prompt protocol. You MUST plan or discover tools first for the user request: "${lastUserMessage.substring(0, 50)}..."\n\nAppropriate first actions:\n- think({ problem: "Plan how to ${lastUserMessage.substring(0, 30)}...", depth: "balanced" })\n- tool_search({ query: "tools to ${lastUserMessage.substring(0, 30)}..." })\n- todo_write({ title: "Plan for ${lastUserMessage.substring(0, 20)}..." })\n\nDO NOT ask the user "How can I help". START PLANNING immediately based on their request.`,
                tool_call_id: response.tool_calls[0].id
              });
              continue;
            }
          }

          this.setState(OrchestratorState.EXECUTING);
          
          for (const toolCall of response.tool_calls) {
            console.log(`[orchestrator] 🛠️ Tool Call: ${toolCall.function.name}`);
            console.log(`[orchestrator] 📦 Args: ${typeof toolCall.function.arguments === 'string' ? toolCall.function.arguments : JSON.stringify(toolCall.function.arguments)}`);
            
            yield { type: 'tool_start', tool: toolCall.function.name, data: { name: toolCall.function.name, args: toolCall.function.arguments } };
            this.onToolCall(toolCall);
            
            try {
              const result = await this.tools.execute(
                toolCall.function.name,
                toolCall.function.arguments
              );
              
              console.log(`[orchestrator] ✅ Result: ${typeof result === 'string' ? result.substring(0, 100) + '...' : JSON.stringify(result).substring(0, 100) + '...'}`);
              
              yield { type: 'tool_result', data: { name: toolCall.function.name, result } };
              
              // Add tool result to conversation
              this.conversationHistory.push({
                role: 'assistant',
                content: '',
                tool_calls: [toolCall]
              });
              this.conversationHistory.push({
                role: 'tool',
                content: typeof result === 'string' ? result : JSON.stringify(result),
                tool_call_id: toolCall.id || toolCall.function.name
              });
              
            } catch (toolError) {
              console.error(`[orchestrator] ❌ Error: ${toolError.message}`);
              yield { type: 'tool_error', data: { name: toolCall.function.name, error: toolError.message } };
              
              this.conversationHistory.push({
                role: 'tool',
                content: `Error: ${toolError.message}`,
                tool_call_id: toolCall.id || toolCall.function.name
              });
            }
          }
          
          // Continue loop to process tool results
          continue;
        }
        
        // FALLBACK: Check if tool call is in the text content (for models that don't support structured tool calling)
        if (response.content) {
          const toolCallMatch = response.content.match(/\{"name":\s*"([^"]+)",\s*"arguments":\s*(\{[^}]*\})\}/);
          if (toolCallMatch) {
            this.setState(OrchestratorState.EXECUTING);
            
            const toolName = toolCallMatch[1];
            let toolArgs = {};
            try {
              toolArgs = JSON.parse(toolCallMatch[2]);
            } catch {
              toolArgs = {};
            }
            
            console.log(`[orchestrator] 🛠️ Tool Call (Fallback): ${toolName}`);
            console.log(`[orchestrator] 📦 Args: ${JSON.stringify(toolArgs)}`);
            
            yield { type: 'tool_start', tool: toolName, data: { name: toolName, args: toolArgs } };
            
            try {
              const result = await this.tools.execute(toolName, toolArgs);
              console.log(`[orchestrator] ✅ Result: ${typeof result === 'string' ? result.substring(0, 100) + '...' : JSON.stringify(result).substring(0, 100) + '...'}`);
              
              yield { type: 'tool_result', data: { name: toolName, result } };
              
              // Add to conversation
              this.conversationHistory.push({
                role: 'assistant',
                content: `Using tool: ${toolName}`
              });
              this.conversationHistory.push({
                role: 'user',
                content: `Tool result: ${typeof result === 'string' ? result : JSON.stringify(result)}`
              });
              
              // Continue loop
              continue;
            } catch (toolError) {
              console.error(`[orchestrator] ❌ Error: ${toolError.message}`);
              yield { type: 'tool_error', data: { name: toolName, error: toolError.message } };
              
              this.conversationHistory.push({
                role: 'user',
                content: `Tool error: ${toolError.message}`
              });
              
              continue;
            }
          }
        }

        // No tool calls - this is the final response
        if (response.content) {
          this.setState(OrchestratorState.RESPONDING);
          
          this.conversationHistory.push({
            role: 'assistant',
            content: response.content
          });
          
          yield { type: 'response', content: response.content, data: { content: response.content } };
          break;
        }

      } catch (error) {
        this.setState(OrchestratorState.ERROR);
        yield { type: 'error', data: { message: error.message } };
        break;
      }
    }

    if (iterations >= this.maxIterations) {
      yield { type: 'error', data: { message: 'Max iterations reached' } };
    }
    
    this.setState(OrchestratorState.IDLE);
  }

  /**
   * Process with streaming response
   * @param {string} userMessage
   * @param {Object} context
   * @returns {AsyncGenerator<string>}
   */
  async *processStream(userMessage, context = {}) {
    for await (const event of this.process(userMessage, context)) {
      if (event.type === 'response') {
        // For streaming, we could stream the response here
        // For now, yield the full response
        yield event.data.content;
      } else if (event.type === 'tool_start') {
        this.onToolCall(event.data);
      } else if (event.type === 'thinking') {
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

module.exports = { Orchestrator, OrchestratorState };
