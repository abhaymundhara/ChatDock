const fs = require("node:fs");
const { resolvePath, getFileType } = require("../utils");

const definition = {
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

    const resolvedPath = resolvePath(correctedPath);

    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: `Path not found: ${resolvedPath}` };
    }

    const stats = fs.statSync(resolvedPath);

    const info = {
      success: true,
      type: getFileType(stats),
      size: stats.size,
      modified: stats.mtime.toISOString(),
    };

    if (stats.isDirectory()) {
      const contents = fs.readdirSync(resolvedPath);
      info.items = contents.length;
    }

    return info;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { definition, execute };
