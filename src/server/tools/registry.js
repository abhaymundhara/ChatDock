// Tool Registry for ChatDock
// Defines available tools in OpenAI/Ollama format

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { exec } = require("node:child_process");
const { promisify } = require("node:util");
const execAsync = promisify(exec);

// Resolve paths relative to user's home directory
function resolvePath(inputPath) {
  if (path.isAbsolute(inputPath)) {
    return inputPath; // Already absolute
  }
  if (inputPath.startsWith("~")) {
    return path.join(os.homedir(), inputPath.slice(1)); // Expand ~
  }
  // Relative path → resolve against home directory
  return path.join(os.homedir(), inputPath);
}

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

// Tool definitions
const tools = [
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read and retrieve the contents of a text or binary file from the filesystem",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "The absolute or relative path to the file to read",
          },
          encoding: {
            type: "string",
            description:
              "File encoding: 'utf8' for text files, 'base64' for binary files (default: utf8)",
          },
        },
        required: ["file_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Write, create, or save content to a file at the specified path",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "The path where the file should be written",
          },
          content: {
            type: "string",
            description: "The content to write to the file",
          },
          create_dirs: {
            type: "boolean",
            description:
              "Create parent directories if they don't exist (default: true)",
          },
        },
        required: ["file_path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description:
        "List, show, or display files and directories in a given path with details",
      parameters: {
        type: "object",
        properties: {
          dir_path: {
            type: "string",
            description: "The directory path to list contents from",
          },
          recursive: {
            type: "boolean",
            description: "List subdirectories recursively (default: false)",
          },
        },
        required: ["dir_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_shell",
      description:
        "Execute a shell command and return the output. Use with caution.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "Get the current date and time",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_directory",
      description: "Create a directory at the specified path",
      parameters: {
        type: "object",
        properties: {
          dir_path: {
            type: "string",
            description: "The directory path to create",
          },
          recursive: {
            type: "boolean",
            description:
              "Create parent directories if they don't exist (default: true)",
          },
        },
        required: ["dir_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description:
        "Delete, remove, or erase a file or directory from the filesystem",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "The path to the file or directory to delete",
          },
          recursive: {
            type: "boolean",
            description:
              "Allow deletion of non-empty directories (default: false)",
          },
        },
        required: ["file_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_file",
      description:
        "Move, rename, or relocate a file or directory from one path to another",
      parameters: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "The source path",
          },
          destination: {
            type: "string",
            description: "The destination path",
          },
        },
        required: ["source", "destination"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_file_info",
      description:
        "Get detailed metadata about a file or directory (size, type, permissions, timestamps)",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "The path to the file or directory",
          },
        },
        required: ["file_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description:
        "Search, find, or locate files by name pattern (wildcards supported) in a directory tree",
      parameters: {
        type: "object",
        properties: {
          dir_path: {
            type: "string",
            description: "Directory to search in",
          },
          pattern: {
            type: "string",
            description: "Filename pattern to search for (supports wildcards)",
          },
          recursive: {
            type: "boolean",
            description: "Search recursively in subdirectories (default: true)",
          },
        },
        required: ["dir_path", "pattern"],
      },
    },
  },
];

// Tool execution functions
const toolExecutors = {
  async read_file(args) {
    try {
      const filePath = resolvePath(args.file_path);
      const encoding = args.encoding || "utf8";

      if (!fs.existsSync(filePath)) {
        return { success: false, error: `File not found: ${filePath}` };
      }

      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        return { success: false, error: `Path is a directory: ${filePath}` };
      }

      if (encoding === "base64") {
        const buffer = fs.readFileSync(filePath);
        return {
          success: true,
          content: buffer.toString("base64"),
          encoding: "base64",
          size: stats.size,
        };
      } else {
        const content = fs.readFileSync(filePath, "utf-8");
        return {
          success: true,
          content,
          encoding: "utf8",
          size: stats.size,
        };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async write_file(args) {
    try {
      const { file_path, content, create_dirs = true } = args;
      const resolvedPath = resolvePath(file_path);
      const dir = path.dirname(resolvedPath);

      if (create_dirs && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(resolvedPath, content, "utf-8");
      const stats = fs.statSync(resolvedPath);

      return {
        success: true,
        path: resolvedPath,
        size: stats.size,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async list_directory(args) {
    try {
      const dirPath = resolvePath(args.dir_path);
      const recursive = args.recursive || false;

      if (!fs.existsSync(dirPath)) {
        return { success: false, error: `Directory not found: ${dirPath}` };
      }

      const stats = fs.statSync(dirPath);
      if (!stats.isDirectory()) {
        return { success: false, error: `Path is not a directory: ${dirPath}` };
      }

      function getFileType(stats) {
        if (stats.isDirectory()) return "directory";
        if (stats.isFile()) return "file";
        if (stats.isSymbolicLink()) return "symlink";
        if (stats.isSocket()) return "socket";
        return "unknown";
      }

      function listRecursive(dir, basePath = "") {
        const entries = [];
        const items = fs.readdirSync(dir);

        for (const item of items) {
          const fullPath = path.join(dir, item);
          const relativePath = basePath ? path.join(basePath, item) : item;
          const stats = fs.statSync(fullPath);

          entries.push({
            name: relativePath,
            type: getFileType(stats),
            size: stats.size,
            modified: stats.mtime.toISOString(),
          });

          if (recursive && stats.isDirectory()) {
            entries.push(...listRecursive(fullPath, relativePath));
          }
        }

        return entries;
      }

      const entries = listRecursive(dirPath);
      return { success: true, path: dirPath, entries };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async execute_shell(args) {
    try {
      const { stdout, stderr } = await execAsync(args.command, {
        timeout: 30000, // 30 second timeout
        maxBuffer: 1024 * 1024, // 1MB max output
      });
      return {
        success: true,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stdout: error.stdout || "",
        stderr: error.stderr || "",
      };
    }
  },

  async get_current_time() {
    const now = new Date();
    return {
      success: true,
      timestamp: now.toISOString(),
      formatted: now.toLocaleString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  },

  async search_files(args) {
    try {
      const { dir_path, pattern, recursive = true } = args;
      const resolvedDir = resolvePath(dir_path);

      if (!fs.existsSync(resolvedDir)) {
        return { success: false, error: `Directory not found: ${resolvedDir}` };
      }

      const stats = fs.statSync(resolvedDir);
      if (!stats.isDirectory()) {
        return {
          success: false,
          error: `Path is not a directory: ${resolvedDir}`,
        };
      }

      const regex = new RegExp(
        pattern.replace(/\*/g, ".*").replace(/\?/g, "."),
        "i",
      );

      function getFileType(stats) {
        if (stats.isDirectory()) return "directory";
        if (stats.isFile()) return "file";
        if (stats.isSymbolicLink()) return "symlink";
        return "unknown";
      }

      function searchRecursive(dir, basePath = "") {
        const results = [];
        const items = fs.readdirSync(dir);

        for (const item of items) {
          const fullPath = path.join(dir, item);
          const relativePath = basePath ? path.join(basePath, item) : item;
          const stats = fs.statSync(fullPath);

          if (regex.test(item)) {
            results.push({
              path: relativePath,
              type: getFileType(stats),
              size: stats.size,
            });
          }

          if (recursive && stats.isDirectory()) {
            results.push(...searchRecursive(fullPath, relativePath));
          }
        }

        return results;
      }

      const matches = searchRecursive(resolvedDir);
      return {
        success: true,
        search_path: resolvedDir,
        pattern,
        matches,
        count: matches.length,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async create_directory(args) {
    try {
      const { dir_path, recursive = true } = args;
      const resolvedPath = resolvePath(dir_path);

      if (fs.existsSync(resolvedPath)) {
        return {
          success: false,
          error: `Path already exists: ${resolvedPath}`,
        };
      }

      fs.mkdirSync(resolvedPath, { recursive });

      return {
        success: true,
        path: resolvedPath,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async delete_file(args) {
    try {
      const { file_path, recursive = false } = args;
      const resolvedPath = resolvePath(file_path);

      if (!fs.existsSync(resolvedPath)) {
        return { success: false, error: `Path not found: ${resolvedPath}` };
      }

      const stats = fs.statSync(resolvedPath);

      // If it's a directory and not recursive, check if it's empty
      if (stats.isDirectory() && !recursive) {
        const contents = fs.readdirSync(resolvedPath);
        if (contents.length > 0) {
          return {
            success: false,
            error:
              "Directory is not empty. Use recursive: true to delete non-empty directories.",
          };
        }
      }

      if (stats.isDirectory()) {
        fs.rmSync(resolvedPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(resolvedPath);
      }

      return {
        success: true,
        path: resolvedPath,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async move_file(args) {
    try {
      const { source, destination } = args;
      const sourcePath = resolvePath(source);
      const destPath = resolvePath(destination);

      if (!fs.existsSync(sourcePath)) {
        return { success: false, error: `Source not found: ${sourcePath}` };
      }

      fs.renameSync(sourcePath, destPath);

      return {
        success: true,
        source: sourcePath,
        destination: destPath,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async get_file_info(args) {
    try {
      const { file_path } = args;
      const resolvedPath = resolvePath(file_path);

      if (!fs.existsSync(resolvedPath)) {
        return { success: false, error: `Path not found: ${resolvedPath}` };
      }

      const stats = fs.statSync(resolvedPath);

      function getFileType(stats) {
        if (stats.isDirectory()) return "directory";
        if (stats.isFile()) return "file";
        if (stats.isSymbolicLink()) return "symlink";
        if (stats.isSocket()) return "socket";
        if (stats.isBlockDevice()) return "block";
        if (stats.isCharacterDevice()) return "character";
        return "unknown";
      }

      const info = {
        success: true,
        path: resolvedPath,
        type: getFileType(stats),
        size: stats.size,
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        accessed: stats.atime.toISOString(),
        permissions: (stats.mode & parseInt("777", 8)).toString(8),
        readable: true, // Node.js doesn't provide direct check
        writable: true,
        executable: !!(stats.mode & parseInt("111", 8)),
      };

      if (stats.isDirectory()) {
        const contents = fs.readdirSync(resolvedPath);
        info.item_count = contents.length;
      }

      return info;
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

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
