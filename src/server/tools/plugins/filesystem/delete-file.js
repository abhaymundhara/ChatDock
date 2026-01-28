const fs = require("node:fs");
const { resolvePath } = require("../utils");

const definition = {
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
};

async function execute(args) {
  try {
    // Auto-correct common path mistakes
    let correctedPath = args.file_path;
    if (correctedPath.startsWith("/Desktop/"))
      correctedPath = correctedPath.replace("/Desktop/", "~/Desktop/");
    if (correctedPath.startsWith("/Documents/"))
      correctedPath = correctedPath.replace("/Documents/", "~/Documents/");
    if (correctedPath.startsWith("/Downloads/"))
      correctedPath = correctedPath.replace("/Downloads/", "~/Downloads/");

    // Safety: prevent deleting critical directories
    if (
      correctedPath === "~" ||
      correctedPath === "/" ||
      correctedPath === "~/Desktop" ||
      correctedPath === "~/Documents"
    ) {
      return {
        success: false,
        error:
          "Cannot delete critical user directories. Delete individual files/folders instead.",
      };
    }

    const { recursive = false } = args;
    const resolvedPath = resolvePath(correctedPath);

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
      message: `Deleted ${resolvedPath}`,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { definition, execute };
