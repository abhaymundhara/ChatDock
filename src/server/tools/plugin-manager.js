/**
 * Tool Plugin Manager
 * Dynamically loads and manages tool plugins by category
 */

const fs = require("fs").promises;
const path = require("path");

class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.tools = new Map();
    this.executors = new Map();
    this.categories = new Map(); // category -> [tool names]
  }

  /**
   * Load all plugins from the plugins directory
   * @param {string} pluginsDir - Path to plugins directory
   */
  async loadPlugins(pluginsDir) {
    try {
      const entries = await fs.readdir(pluginsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const categoryName = entry.name;
          const pluginPath = path.join(pluginsDir, categoryName);

          try {
            await this.loadPlugin(categoryName, pluginPath);
          } catch (error) {
            console.warn(
              `[plugin-manager] Failed to load plugin ${categoryName}:`,
              error.message,
            );
          }
        }
      }

      console.log(
        `[plugin-manager] Loaded ${this.plugins.size} plugins with ${this.tools.size} tools`,
      );
    } catch (error) {
      console.error("[plugin-manager] Failed to load plugins:", error.message);
      throw error;
    }
  }

  /**
   * Load a single plugin
   * @param {string} categoryName - Plugin category name
   * @param {string} pluginPath - Path to plugin directory
   */
  async loadPlugin(categoryName, pluginPath) {
    const indexPath = path.join(pluginPath, "index.js");

    try {
      // Check if index.js exists
      await fs.access(indexPath);
    } catch {
      // Skip if no index.js
      return;
    }

    // Require the plugin
    const plugin = require(indexPath);

    if (!plugin || typeof plugin !== "object") {
      throw new Error(`Plugin ${categoryName} must export an object`);
    }

    // Validate plugin structure
    if (!plugin.tools || !Array.isArray(plugin.tools)) {
      throw new Error(`Plugin ${categoryName} must export a tools array`);
    }

    if (!plugin.executors || typeof plugin.executors !== "object") {
      throw new Error(`Plugin ${categoryName} must export an executors object`);
    }

    // Register plugin
    this.plugins.set(categoryName, {
      name: plugin.name || categoryName,
      description: plugin.description || "",
      version: plugin.version || "1.0.0",
      category: categoryName,
      tools: plugin.tools,
      executors: plugin.executors,
      metadata: plugin.metadata || {},
    });

    // Register tools
    const toolNames = [];
    for (const tool of plugin.tools) {
      if (!tool.function?.name) {
        console.warn(
          `[plugin-manager] Tool in ${categoryName} missing name, skipping`,
        );
        continue;
      }

      const toolName = tool.function.name;

      // Add category metadata to tool
      const enrichedTool = {
        ...tool,
        __category: categoryName,
        __plugin: plugin.name || categoryName,
      };

      this.tools.set(toolName, enrichedTool);
      toolNames.push(toolName);

      // Register executor
      if (plugin.executors[toolName]) {
        this.executors.set(toolName, plugin.executors[toolName]);
      }
    }

    // Track category -> tools mapping
    this.categories.set(categoryName, toolNames);

    console.log(
      `[plugin-manager] Loaded plugin '${categoryName}' with ${toolNames.length} tools`,
    );
  }

  /**
   * Get all tools
   * @returns {Array} All tool definitions
   */
  getAllTools() {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   * @param {string} category - Category name
   * @returns {Array} Tool definitions in that category
   */
  getToolsByCategory(category) {
    const toolNames = this.categories.get(category) || [];
    return toolNames.map((name) => this.tools.get(name)).filter(Boolean);
  }

  /**
   * Get tools for multiple categories
   * @param {Array<string>} categories - Category names
   * @returns {Array} Tool definitions
   */
  getToolsByCategories(categories) {
    const tools = [];
    for (const category of categories) {
      tools.push(...this.getToolsByCategory(category));
    }
    return tools;
  }

  /**
   * Get tool definition by name
   * @param {string} name - Tool name
   * @returns {Object|null} Tool definition
   */
  getTool(name) {
    return this.tools.get(name) || null;
  }

  /**
   * Get executor for a tool
   * @param {string} name - Tool name
   * @returns {Function|null} Executor function
   */
  getExecutor(name) {
    return this.executors.get(name) || null;
  }

  /**
   * Execute a tool
   * @param {string} name - Tool name
   * @param {Object} args - Tool arguments
   * @returns {Promise<any>} Tool result
   */
  async executeTool(name, args) {
    const executor = this.getExecutor(name);
    if (!executor) {
      throw new Error(`No executor found for tool: ${name}`);
    }

    try {
      return await executor(args);
    } catch (error) {
      console.error(
        `[plugin-manager] Tool execution failed (${name}):`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Get all categories
   * @returns {Array<string>} Category names
   */
  getCategories() {
    return Array.from(this.categories.keys());
  }

  /**
   * Get plugin info
   * @param {string} category - Category name
   * @returns {Object|null} Plugin metadata
   */
  getPlugin(category) {
    return this.plugins.get(category) || null;
  }

  /**
   * Get all plugins info
   * @returns {Array} Plugin metadata
   */
  getAllPlugins() {
    return Array.from(this.plugins.values());
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create plugin manager instance
 * @returns {PluginManager}
 */
function getPluginManager() {
  if (!instance) {
    instance = new PluginManager();
  }
  return instance;
}

module.exports = { PluginManager, getPluginManager };
