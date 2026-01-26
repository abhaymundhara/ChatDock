/**
 * File System Tools - Write Operations
 * Native tools for creating and modifying files
 */

const fs = require("node:fs");
const path = require("node:path");

/**
 * write_file - Creates or overwrites a file
 */
const write_file = {
  name: "write_file",
  description:
    "Creates a new file or overwrites an existing file with the provided content. IMPORTANT: Always use absolute paths (e.g., /Users/username/Desktop/file.txt or ~/Desktop/file.txt). If user provides relative path, ask for confirmation of the full path first.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          'ABSOLUTE path where the file should be created (e.g., ~/Desktop/test.txt or /Users/username/file.txt). Never use relative paths like "test.txt" or "./test.txt".',
      },
      content: {
        type: "string",
        description: "Content to write to the file",
      },
      createDirs: {
        type: "boolean",
        description:
          "Create parent directories if they don't exist (default: true)",
        default: true,
      },
    },
    required: ["path", "content"],
  },
  requiresConfirmation: true,
  keywords: ["write", "create", "file", "save", "new"],

  run: async ({ path: filePath, content, createDirs = true }) => {
    const absolutePath = path.resolve(filePath);
    const dir = path.dirname(absolutePath);

    // Create directories if needed
    if (createDirs && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Check if file exists (for backup)
    const existed = fs.existsSync(absolutePath);

    // Create backup if file exists
    if (existed) {
      const backupPath = `${absolutePath}.bak.${Date.now()}`;
      fs.copyFileSync(absolutePath, backupPath);
    }

    // Write the file
    fs.writeFileSync(absolutePath, content, "utf-8");

    return {
      path: absolutePath,
      bytes: content.length,
      created: !existed,
      overwritten: existed,
      backupCreated: existed,
    };
  },
};

/**
 * edit_file - Applies surgical edits to a file
 */
const edit_file = {
  name: "edit_file",
  description:
    "Applies surgical edits to specific lines of a file. Each edit specifies a line range and replacement content.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file to edit",
      },
      edits: {
        type: "array",
        items: {
          type: "object",
          properties: {
            startLine: {
              type: "number",
              description: "Starting line number (1-indexed)",
            },
            endLine: {
              type: "number",
              description: "Ending line number (1-indexed, inclusive)",
            },
            content: {
              type: "string",
              description: "Replacement content for the specified lines",
            },
          },
          required: ["startLine", "endLine", "content"],
        },
        description: "Array of edit operations to apply",
      },
    },
    required: ["path", "edits"],
  },
  requiresConfirmation: true,
  keywords: ["edit", "modify", "change", "update", "patch", "fix"],

  run: async ({ path: filePath, edits }) => {
    const absolutePath = path.resolve(filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }

    // Create backup
    const backupPath = `${absolutePath}.bak.${Date.now()}`;
    fs.copyFileSync(absolutePath, backupPath);

    // Read file content
    const content = fs.readFileSync(absolutePath, "utf-8");
    const lines = content.split("\n");

    // Sort edits by startLine in reverse order to apply from bottom up
    // This prevents line number shifts from affecting subsequent edits
    const sortedEdits = [...edits].sort((a, b) => b.startLine - a.startLine);

    for (const edit of sortedEdits) {
      const { startLine, endLine, content: newContent } = edit;

      // Validate line numbers
      if (startLine < 1 || endLine < startLine) {
        throw new Error(`Invalid line range: ${startLine}-${endLine}`);
      }

      // Convert to 0-indexed
      const start = startLine - 1;
      const end = endLine;

      // Replace lines
      const newLines = newContent.split("\n");
      lines.splice(start, end - start, ...newLines);
    }

    // Write back
    const newContent = lines.join("\n");
    fs.writeFileSync(absolutePath, newContent, "utf-8");

    return {
      path: absolutePath,
      editsApplied: edits.length,
      originalLines: content.split("\n").length,
      newLines: lines.length,
      backupPath,
    };
  },
};

/**
 * append_file - Appends content to a file
 */
const append_file = {
  name: "append_file",
  description:
    "Appends content to the end of a file. Creates the file if it doesn't exist.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file",
      },
      content: {
        type: "string",
        description: "Content to append",
      },
      newline: {
        type: "boolean",
        description:
          "Add a newline before the content if file is not empty (default: true)",
        default: true,
      },
    },
    required: ["path", "content"],
  },
  requiresConfirmation: true,
  keywords: ["append", "add", "insert", "end"],

  run: async ({ path: filePath, content, newline = true }) => {
    const absolutePath = path.resolve(filePath);

    let prefix = "";
    if (newline && fs.existsSync(absolutePath)) {
      const existing = fs.readFileSync(absolutePath, "utf-8");
      if (existing.length > 0 && !existing.endsWith("\n")) {
        prefix = "\n";
      }
    }

    fs.appendFileSync(absolutePath, prefix + content, "utf-8");

    return {
      path: absolutePath,
      bytesAppended: prefix.length + content.length,
    };
  },
};

/**
 * delete_file - Deletes a file
 */
const delete_file = {
  name: "delete_file",
  description:
    "Deletes a file from the filesystem. This action cannot be undone.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file to delete",
      },
      createBackup: {
        type: "boolean",
        description: "Create a backup before deleting (default: true)",
        default: true,
      },
    },
    required: ["path"],
  },
  requiresConfirmation: true,
  keywords: ["delete", "remove", "rm", "erase"],

  run: async ({ path: filePath, createBackup = true }) => {
    const absolutePath = path.resolve(filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }

    const stats = fs.statSync(absolutePath);
    if (stats.isDirectory()) {
      throw new Error("Use delete_directory for directories");
    }

    let backupPath = null;
    if (createBackup) {
      backupPath = `${absolutePath}.deleted.${Date.now()}`;
      fs.copyFileSync(absolutePath, backupPath);
    }

    fs.unlinkSync(absolutePath);

    return {
      deleted: absolutePath,
      backupPath,
    };
  },
};

/**
 * rename_file - Renames or moves a file
 */
const rename_file = {
  name: "rename_file",
  description: "Renames a file or moves it to a new location.",
  parameters: {
    type: "object",
    properties: {
      oldPath: {
        type: "string",
        description: "Current path of the file",
      },
      newPath: {
        type: "string",
        description: "New path for the file",
      },
    },
    required: ["oldPath", "newPath"],
  },
  requiresConfirmation: true,
  keywords: ["rename", "move", "mv"],

  run: async ({ oldPath, newPath }) => {
    const absoluteOld = path.resolve(oldPath);
    const absoluteNew = path.resolve(newPath);

    if (!fs.existsSync(absoluteOld)) {
      throw new Error(`File not found: ${absoluteOld}`);
    }

    if (fs.existsSync(absoluteNew)) {
      throw new Error(`Destination already exists: ${absoluteNew}`);
    }

    // Create destination directory if needed
    const destDir = path.dirname(absoluteNew);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.renameSync(absoluteOld, absoluteNew);

    return {
      oldPath: absoluteOld,
      newPath: absoluteNew,
    };
  },
};

/**
 * create_directory - Creates a directory
 */
const create_directory = {
  name: "create_directory",
  description:
    "Creates a new directory. Creates parent directories if they don't exist.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path of the directory to create",
      },
    },
    required: ["path"],
  },
  requiresConfirmation: true,
  keywords: ["create", "directory", "folder", "mkdir"],

  run: async ({ path: dirPath }) => {
    const absolutePath = path.resolve(dirPath);

    if (fs.existsSync(absolutePath)) {
      throw new Error(`Path already exists: ${absolutePath}`);
    }

    fs.mkdirSync(absolutePath, { recursive: true });

    return {
      created: absolutePath,
    };
  },
};

/**
 * undo_last_edit - Restores a file from its most recent backup
 */
const undo_last_edit = {
  name: "undo_last_edit",
  description: "Restores a file from its most recent backup (.bak file).",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file to restore",
      },
    },
    required: ["path"],
  },
  requiresConfirmation: true,
  keywords: ["undo", "restore", "revert", "backup"],

  run: async ({ path: filePath }) => {
    const absolutePath = path.resolve(filePath);
    const dir = path.dirname(absolutePath);
    const basename = path.basename(absolutePath);

    // Find backup files
    const files = fs.readdirSync(dir);
    const backups = files
      .filter((f) => f.startsWith(basename + ".bak."))
      .map((f) => ({
        name: f,
        path: path.join(dir, f),
        timestamp: parseInt(f.split(".bak.")[1], 10),
      }))
      .filter((b) => !isNaN(b.timestamp))
      .sort((a, b) => b.timestamp - a.timestamp);

    if (backups.length === 0) {
      throw new Error(`No backup found for: ${absolutePath}`);
    }

    const latestBackup = backups[0];

    // Restore from backup
    fs.copyFileSync(latestBackup.path, absolutePath);

    // Remove the used backup
    fs.unlinkSync(latestBackup.path);

    return {
      restored: absolutePath,
      fromBackup: latestBackup.path,
      backupDate: new Date(latestBackup.timestamp).toISOString(),
      remainingBackups: backups.length - 1,
    };
  },
};

module.exports = {
  write_file,
  edit_file,
  append_file,
  delete_file,
  rename_file,
  create_directory,
  undo_last_edit,
};
