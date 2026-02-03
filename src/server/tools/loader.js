/**
 * Tools Loader
 * Loads built-in tools (always available)
 */

const fs = require("fs").promises;
const path = require("path");

class ToolsLoader {
  constructor() {
    this.tools = new Map(); // tool_name -> definition
    this.executors = new Map(); // tool_name -> function
    this.categories = new Map(); // category -> [tool names]
  }

  /**
   * Load all built-in tools
   */
  async loadTools() {
    try {
      const toolsDir = __dirname;
      const entries = await fs.readdir(toolsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const categoryName = entry.name;
          const toolPath = path.join(toolsDir, categoryName);

          try {
            await this.loadTool(categoryName, toolPath);
          } catch (error) {
            console.warn(
              `[tools-loader] Failed to load tool ${categoryName}:`,
              error.message
            );
          }
        }
      }

      console.log(
        `[tools-loader] Loaded ${this.categories.size} tool categories with ${this.tools.size} tools`
      );
    } catch (error) {
      console.error("[tools-loader] Failed to load tools:", error.message);
      throw error;
    }
  }

  /**
   * Load a single tool category
   */
  async loadTool(categoryName, toolPath) {
    const indexPath = path.join(toolPath, "index.js");

    try {
      await fs.access(indexPath);
    } catch {
      return; // Skip if no index.js
    }

    const tool = require(indexPath);

    if (!tool || typeof tool !== "object") {
      throw new Error(`Tool ${categoryName} must export an object`);
    }

    // Register tools
    const toolNames = [];
    if (tool.tools) {
      for (const toolDef of tool.tools) {
        if (!toolDef.function?.name) continue;

        const toolName = toolDef.function.name;

        // Enrich tool definition
        const enrichedTool = {
          ...toolDef,
          __category: categoryName,
          __type: "builtin",
        };

        this.tools.set(toolName, enrichedTool);
        toolNames.push(toolName);

        // Register executor
        if (tool.executors && tool.executors[toolName]) {
          this.executors.set(toolName, tool.executors[toolName]);
        }
      }
    }

    this.categories.set(categoryName, toolNames);
    console.log(`[tools-loader] Loaded tool '${categoryName}' with ${toolNames.length} functions`);
  }

  getAllTools() {
    return Array.from(this.tools.values());
  }

  getExecutor(name) {
    return this.executors.get(name);
  }

  async executeTool(name, args, context = {}) {
    const executor = this.getExecutor(name);
    if (!executor) {
      throw new Error(`No executor found for tool: ${name}`);
    }
    try {
      // Pass context as __context in args
      const argsWithContext = { ...args, __context: context };
      return await executor(argsWithContext);
    } catch (error) {
      console.error(`[tools-loader] Tool execution failed (${name}):`, error.message);
      throw error;
    }
  }
}

// Singleton
let instance = null;
function getToolsLoader() {
  if (!instance) instance = new ToolsLoader();
  return instance;
}

module.exports = { ToolsLoader, getToolsLoader };
