/**
 * Tool Registry for ChatDock
 * Plugin-based tool management system
 */

const path = require("path");
const { getPluginManager } = require("./plugin-manager");

// Initialize plugin manager
let pluginManager = null;
let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await initialize();
  }
}

/**
 * Initialize the registry by loading all plugins
 */
async function initialize() {
  if (initialized) {
    return pluginManager;
  }

  pluginManager = getPluginManager();
  const pluginsDir = path.join(__dirname, "plugins");

  try {
    await pluginManager.loadPlugins(pluginsDir);
    initialized = true;
    console.log("[registry] Tool registry initialized with plugin system");
  } catch (error) {
    console.error("[registry] Failed to initialize plugins:", error.message);
    throw error;
  }

  return pluginManager;
}

/**
 * Get all available tools
 * @returns {Promise<Array>} All tool definitions
 */
async function getAllTools() {
  await ensureInitialized();
  return pluginManager.getAllTools();
}

/**
 * Get tools for a specific specialist
 * Maps specialist type to plugin categories
 * @param {string} specialistType - Type of specialist (file, shell, web, code, conversation, planner)
 * @returns {Promise<Array>} Tool definitions for that specialist
 */
async function getToolsForSpecialist(specialistType) {
  await ensureInitialized();

  const categoryMap = {
    file: ["fs"],
    shell: ["system"],
    web: ["web"],
    code: ["fs", "system"], // Code specialist can use fs and system
    conversation: [],
    planner: ["planner", "fs", "system", "web", "memory"], // Planner sees all for awareness
  };

  const categories = categoryMap[specialistType] || [];
  return pluginManager.getToolsByCategories(categories);
}

/**
 * Get tools by category
 * @param {string} category - Category name (fs, system, web, memory, planner)
 * @returns {Promise<Array>} Tool definitions
 */
async function getToolsByCategory(category) {
  await ensureInitialized();
  return pluginManager.getToolsByCategory(category);
}

/**
 * Get multiple categories
 * @param {Array<string>} categories - Category names
 * @returns {Promise<Array>} Tool definitions
 */
async function getToolsByCategories(categories) {
  await ensureInitialized();
  return pluginManager.getToolsByCategories(categories);
}

/**
 * Execute a tool
 * @param {string} toolName - Name of the tool
 * @param {Object} args - Tool arguments
 * @returns {Promise<any>} Tool execution result
 */
async function executeTool(toolName, args) {
  await ensureInitialized();
  return pluginManager.executeTool(toolName, args);
}

/**
 * Get tool definition
 * @param {string} toolName - Name of the tool
 * @returns {Promise<Object|null>} Tool definition
 */
async function getTool(toolName) {
  await ensureInitialized();
  return pluginManager.getTool(toolName);
}

/**
 * Get all available categories
 * @returns {Promise<Array<string>>} Category names
 */
async function getCategories() {
  await ensureInitialized();
  return pluginManager.getCategories();
}

/**
 * Get plugin information
 * @param {string} category - Category name
 * @returns {Promise<Object|null>} Plugin metadata
 */
async function getPlugin(category) {
  await ensureInitialized();
  return pluginManager.getPlugin(category);
}

/**
 * Get all plugins
 * @returns {Promise<Array>} All plugin metadata
 */
async function getAllPlugins() {
  await ensureInitialized();
  return pluginManager.getAllPlugins();
}

// Backward compatibility exports
module.exports = {
  // Main API
  initialize,
  getAllTools,
  getToolsForSpecialist,
  getToolsByCategory,
  getToolsByCategories,
  executeTool,
  getTool,

  // Plugin API
  getCategories,
  getPlugin,
  getAllPlugins,

  // Direct access to plugin manager (advanced usage)
  getPluginManager: () => pluginManager,
};
