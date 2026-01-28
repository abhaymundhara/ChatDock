// Tool Registry for ChatDock
// Auto-loads tools from plugins directory

const fs = require("node:fs");
const path = require("node:path");

/**
 * Recursively scan a directory for tool plugin files
 * @param {string} dir - Directory to scan
 * @returns {string[]} Array of absolute file paths
 */
function scanPlugins(dir) {
  const files = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // Recursively scan subdirectories
      files.push(...scanPlugins(fullPath));
    } else if (
      item.endsWith(".js") &&
      !["utils.js", "TEMPLATE.js", "EXAMPLE.js"].includes(item)
    ) {
      // Only include .js files, excluding utility and example files
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Load all tool plugins from the plugins directory
 * @returns {object} Object with tools array and toolExecutors map
 */
function loadTools() {
  const pluginsDir = path.join(__dirname, "plugins");
  const pluginFiles = scanPlugins(pluginsDir);

  const tools = [];
  const toolExecutors = {};

  console.log(`[tools] Loading plugins from ${pluginsDir}`);

  for (const pluginFile of pluginFiles) {
    try {
      const plugin = require(pluginFile);

      // Validate plugin structure
      if (!plugin.definition || !plugin.execute) {
        console.warn(
          `[tools] Skipping ${path.basename(pluginFile)}: missing definition or execute`,
        );
        continue;
      }

      if (!plugin.definition.function || !plugin.definition.function.name) {
        console.warn(
          `[tools] Skipping ${path.basename(pluginFile)}: invalid definition structure`,
        );
        continue;
      }

      const toolName = plugin.definition.function.name;

      // Add to tools array and executors map
      tools.push(plugin.definition);
      toolExecutors[toolName] = plugin.execute;

      console.log(
        `[tools] ✓ Loaded: ${toolName} (${path.basename(pluginFile)})`,
      );
    } catch (error) {
      console.error(
        `[tools] Error loading ${path.basename(pluginFile)}:`,
        error.message,
      );
    }
  }

  console.log(`[tools] Successfully loaded ${tools.length} tools`);

  return { tools, toolExecutors };
}

// Load all tools at startup
const { tools, toolExecutors } = loadTools();

/**
 * Check if tool_search is available
 */
function isToolSearchAvailable() {
  return true; // Always available now
}

/**
 * Smart server-side tool filtering based on message content
 * Returns a subset of relevant tools to reduce LLM context and improve speed
 */
function filterToolsForMessage(message) {
  const lowerMessage = message.toLowerCase();
  const allTools = tools.filter((t) => t.function.name !== "tool_search");

  // Keywords for different tool categories
  const patterns = {
    // File reading
    read: /\b(read|show|display|view|open|cat|content|see)\b.*\b(file|text|document)\b/,

    // File writing
    write: /\b(write|create|save|make|new)\b.*\b(file|document|text)\b/,

    // Directory operations
    list: /\b(list|show|display|ls|contents?|what'?s in|files in)\b.*\b(directory|folder|dir)\b/,

    // File/directory creation
    create: /\b(create|make|mkdir|new)\b.*\b(directory|folder|dir)\b/,

    // File deletion
    delete: /\b(delete|remove|rm|erase|unlink)\b/,

    // File moving/renaming
    move: /\b(move|rename|mv|relocate|transfer)\b/,

    // File searching
    search: /\b(find|search|locate|look for|where is)\b/,

    // File info
    info: /\b(info|information|details|metadata|stat|properties)\b/,

    // Shell execution
    shell: /\b(run|execute|command|shell|bash|zsh)\b/,

    // Time
    time: /\b(time|date|now|today|clock)\b/,
  };

  const selectedTools = new Set();

  // Check for file/folder operations
  if (patterns.read.test(lowerMessage)) {
    selectedTools.add("read_file");
  }

  if (patterns.write.test(lowerMessage)) {
    selectedTools.add("write_file");
  }

  if (patterns.list.test(lowerMessage)) {
    selectedTools.add("list_directory");
  }

  if (patterns.create.test(lowerMessage)) {
    selectedTools.add("create_directory");
  }

  if (patterns.delete.test(lowerMessage)) {
    selectedTools.add("delete_file");
  }

  if (patterns.move.test(lowerMessage)) {
    selectedTools.add("move_file");
  }

  if (patterns.search.test(lowerMessage)) {
    selectedTools.add("search_files");
  }

  if (patterns.info.test(lowerMessage)) {
    selectedTools.add("get_file_info");
  }

  if (patterns.shell.test(lowerMessage)) {
    selectedTools.add("execute_shell");
  }

  if (patterns.time.test(lowerMessage)) {
    selectedTools.add("get_current_time");
  }

  // If path is missing or vague, add search_files
  const hasSpecificPath = /\/([\w\-\.]+\/)*[\w\-\.]+|\~\/[\w\-\.\/]+/.test(
    message,
  );
  const hasVaguePath =
    /\b(my|the|a|some)\s+(file|folder|directory|document)\b/.test(lowerMessage);

  if (!hasSpecificPath && hasVaguePath) {
    selectedTools.add("search_files");
  }

  // If listing contents without specific path, add search_files first
  if (patterns.list.test(lowerMessage) && !hasSpecificPath) {
    selectedTools.add("search_files");
  }

  // Convert to array of tool objects
  const filtered = allTools.filter((t) => selectedTools.has(t.function.name));

  // If no matches, return all tools (fallback to let LLM decide)
  if (filtered.length === 0) {
    console.log("[tools] No pattern match - returning all tools");
    return allTools;
  }

  console.log(
    `[tools] Filtered to ${filtered.length} tools: ${filtered.map((t) => t.function.name).join(", ")}`,
  );
  return filtered;
}

/**
 * Initialize tool system (no longer needs embedding computation)
 */
async function initializeToolEmbeddings() {
  console.log(`[tools] ${tools.length} tools ready with server-side filtering`);
}

module.exports = {
  tools,
  toolExecutors,
  initializeToolEmbeddings,
  isToolSearchAvailable,
  filterToolsForMessage,
};
