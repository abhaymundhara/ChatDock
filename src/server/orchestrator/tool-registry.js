/**
 * Tool Registry
 * Manages discovery, registration, and execution of native tools
 */

const fs = require('node:fs');
const path = require('node:path');

class ToolRegistry {
  constructor(options = {}) {
    this.tools = new Map();
    this.toolsDir = options.toolsDir || path.join(__dirname, '../tools');
  }

  /**
   * Auto-discover and load all tools from the tools directory
   */
  async discover() {
    if (!fs.existsSync(this.toolsDir)) {
      fs.mkdirSync(this.toolsDir, { recursive: true });
      return;
    }

    const files = fs.readdirSync(this.toolsDir)
      .filter(f => f.endsWith('.js') && f !== 'index.js');

    for (const file of files) {
      try {
        const modulePath = path.join(this.toolsDir, file);
        // Clear require cache for hot reloading
        delete require.cache[require.resolve(modulePath)];
        const module = require(modulePath);
        
        // Each module can export multiple tools
        for (const [key, tool] of Object.entries(module)) {
          if (tool && tool.name && typeof tool.run === 'function') {
            this.register(tool);
          }
        }
      } catch (error) {
        console.error(`Failed to load tool from ${file}:`, error.message);
      }
    }
  }

  /**
   * Register a single tool
   * @param {Object} tool
   */
  register(tool) {
    if (!tool.name) {
      throw new Error('Tool must have a name');
    }
    if (typeof tool.run !== 'function') {
      throw new Error(`Tool ${tool.name} must have a run function`);
    }

    this.tools.set(tool.name, {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.parameters || { type: 'object', properties: {} },
      requiresConfirmation: tool.requiresConfirmation || false,
      keywords: tool.keywords || [],
      run: tool.run
    });
  }

  /**
   * Execute a tool by name
   * @param {string} name
   * @param {Object} params
   * @returns {Promise<any>}
   */
  async execute(name, params = {}) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    try {
      // Parse params if it's a string (from LLM)
      const parsedParams = typeof params === 'string' ? JSON.parse(params) : params;
      return await tool.run(parsedParams);
    } catch (error) {
      throw new Error(`Tool ${name} failed: ${error.message}`);
    }
  }

  /**
   * Get tool definitions for the system prompt
   * @returns {Array}
   */
  getDefinitions() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      requiresConfirmation: tool.requiresConfirmation
    }));
  }

  /**
   * Get tool definitions in Ollama format for native tool calling
   * @returns {Array}
   */
  getOllamaFormat() {
    return Array.from(this.tools.values()).map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }

  /**
   * Get CORE tools only - essential tools for smaller models
   * Reduces context overload by only sending 15 most common tools
   * @returns {Array}
   */
  getCoreToolsFormat() {
    const coreToolNames = [
      // File operations
      'read_file',
      'write_file',
      'find_files',
      
      // Shell/System
      'run_command',
      'get_environment',
      
      // Search
      'grep_search',
      'web_search',
      'fetch_url',
      
      // Tool discovery
      'tool_finder',
      'tool_list',
      'tool_info',
      
      // Planning
      'think',
      'add_todo',
      
      // User interaction
      'ask_user'
    ];
    
    const coreTools = [];
    for (const name of coreToolNames) {
      const tool = this.tools.get(name);
      if (tool) {
        coreTools.push({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
          }
        });
      }
    }
    
    return coreTools;
  }

  /**
   * Search tools by keyword for dynamic loading
   * @param {string} query
   * @param {number} limit
   * @returns {Array}
   */
  search(query, limit = 5) {
    const queryLower = query.toLowerCase();
    const tokens = queryLower.split(/\s+/);
    
    const scored = Array.from(this.tools.values()).map(tool => {
      let score = 0;
      
      // Name match
      if (tool.name.toLowerCase().includes(queryLower)) {
        score += 10;
      }
      
      // Description match
      const descLower = tool.description.toLowerCase();
      for (const token of tokens) {
        if (descLower.includes(token)) {
          score += 2;
        }
      }
      
      // Keyword match
      for (const keyword of tool.keywords) {
        if (tokens.includes(keyword.toLowerCase())) {
          score += 5;
        }
      }
      
      return { tool, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.tool);
  }

  /**
   * Get a specific tool by name
   * @param {string} name
   * @returns {Object|undefined}
   */
  get(name) {
    return this.tools.get(name);
  }

  /**
   * Get the number of registered tools
   * @returns {number}
   */
  count() {
    return this.tools.size;
  }

  /**
   * Check if a tool exists
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this.tools.has(name);
  }
}

module.exports = { ToolRegistry };
