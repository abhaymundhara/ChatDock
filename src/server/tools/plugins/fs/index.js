/**
 * Filesystem Tools Plugin
 * Provides file and directory operations using shell commands for performance
 */

const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);
const path = require("path");
const fs = require("fs");

function getReadSet(args) {
  return args?.__context?.readFiles instanceof Set
    ? args.__context.readFiles
    : null;
}

function normalizeTrackedPath(filePath) {
  return path.resolve(filePath);
}

function trackRead(args, filePath) {
  const readSet = getReadSet(args);
  if (readSet) {
    readSet.add(normalizeTrackedPath(filePath));
  }
}

function hasRead(args, filePath) {
  const readSet = getReadSet(args);
  return readSet ? readSet.has(normalizeTrackedPath(filePath)) : false;
}

function mustReadBeforeWrite(args, filePath) {
  const readSet = getReadSet(args);
  if (!readSet) return false;
  return fs.existsSync(filePath) && !readSet.has(normalizeTrackedPath(filePath));
}

// Tool definitions
const tools = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read contents of a file",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to read",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write contents to a file",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to write",
          },
          content: {
            type: "string",
            description: "Content to write to the file",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "List contents of a directory",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the directory to list",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_directory",
      description: "Create a new directory",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the directory to create",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to delete",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_file",
      description: "Move or rename a file",
      parameters: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "Source file path",
          },
          destination: {
            type: "string",
            description: "Destination file path",
          },
        },
        required: ["source", "destination"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Search for files by name or pattern",
      parameters: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description: "Directory to search in",
          },
          pattern: {
            type: "string",
            description: "File name pattern (glob)",
          },
        },
        required: ["directory", "pattern"],
      },
    },
  },
];

// Tool executors
const executors = {
  async read_file({ path: filePath }) {
    try {
      const { stdout } = await execAsync(`cat ${JSON.stringify(filePath)}`);
      trackRead(arguments[0], filePath);
      return { success: true, content: stdout };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async write_file({ path: filePath, content }) {
    try {
      if (mustReadBeforeWrite(arguments[0], filePath)) {
        return {
          success: false,
          error: "Must read file before modifying it",
        };
      }

      // Ensure directory exists
      const dir = path.dirname(filePath);
      await execAsync(`mkdir -p ${JSON.stringify(dir)}`);

      // Write file using printf for better escaping
      const escapedContent = content.replace(/'/g, "'\\''");
      await execAsync(
        `printf '%s' '${escapedContent}' > ${JSON.stringify(filePath)}`,
      );
      return { success: true, path: filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async list_directory({ path: dirPath }) {
    try {
      // Use ls -1A to list all files (including hidden) one per line
      const { stdout } = await execAsync(`ls -1A ${JSON.stringify(dirPath)}`);
      const entries = stdout.trim().split("\n").filter(Boolean);

      // Get file types using ls -l
      const { stdout: details } = await execAsync(
        `ls -lA ${JSON.stringify(dirPath)}`,
      );
      const lines = details.trim().split("\n").slice(1); // Skip total line

      const items = entries.map((name, i) => {
        const isDir = lines[i]?.startsWith("d");
        return {
          name,
          type: isDir ? "directory" : "file",
          path: path.join(dirPath, name),
        };
      });

      return { success: true, items };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async create_directory({ path: dirPath }) {
    try {
      await execAsync(`mkdir -p ${JSON.stringify(dirPath)}`);
      return { success: true, path: dirPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async delete_file({ path: filePath }) {
    try {
      await execAsync(`rm ${JSON.stringify(filePath)}`);
      return { success: true, path: filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async move_file({ source, destination }) {
    try {
      if (!fs.existsSync(source)) {
        return { success: false, error: "Source file does not exist" };
      }

      if (mustReadBeforeWrite(arguments[0], source)) {
        return {
          success: false,
          error: "Must read file before modifying it",
        };
      }

      if (fs.existsSync(destination)) {
        return { success: false, error: "Destination already exists" };
      }

      await execAsync(
        `mv ${JSON.stringify(source)} ${JSON.stringify(destination)}`,
      );

      const readSet = getReadSet(arguments[0]);
      if (readSet) {
        readSet.add(normalizeTrackedPath(destination));
      }

      return { success: true, source, destination };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async search_files({ directory, pattern }) {
    try {
      // Use find with name pattern
      const { stdout } = await execAsync(
        `find ${JSON.stringify(directory)} -name ${JSON.stringify(pattern)}`,
      );
      const files = stdout.trim().split("\n").filter(Boolean);
      return { success: true, files };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

// Plugin metadata
module.exports = {
  name: "Filesystem Tools",
  description: "File and directory operations using shell commands",
  version: "1.0.0",
  category: "fs",
  tools,
  executors,
  metadata: {
    specialists: ["file"], // Which specialists can use this plugin
    tags: ["filesystem", "files", "io"],
  },
};
