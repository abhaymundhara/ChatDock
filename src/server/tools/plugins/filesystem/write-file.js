const fs = require("node:fs");
const path = require("node:path");
const { resolvePath } = require("../utils");

const definition = {
  type: "function",
  function: {
    name: "write_file",
    description:
      "Write, create, or save content to a file. Use ~/Desktop/file.txt for Desktop, NOT /Desktop/file.txt",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description:
            "Path where file should be written. Examples: ~/Desktop/file.txt, ~/Documents/file.txt, ./file.txt",
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

    const { content, create_dirs = true } = args;
    const resolvedPath = resolvePath(correctedPath);
    const dir = path.dirname(resolvedPath);

    if (create_dirs && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(resolvedPath, content, "utf-8");

    return {
      success: true,
      message: `File written to ${resolvedPath}`,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { definition, execute };
