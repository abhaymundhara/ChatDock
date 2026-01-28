const fs = require("node:fs");
const { resolvePath } = require("../utils");

const definition = {
  type: "function",
  function: {
    name: "create_directory",
    description:
      "Create a directory at the specified path. Use ~/Desktop/myfolder for Desktop, NOT /Desktop/myfolder",
    parameters: {
      type: "object",
      properties: {
        dir_path: {
          type: "string",
          description:
            "Path where directory should be created. Examples: ~/Desktop/myfolder, ~/Documents/myfolder",
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
};

async function execute(args) {
  try {
    // Auto-correct common path mistakes
    let correctedPath = args.dir_path;
    if (correctedPath.startsWith("/Desktop/"))
      correctedPath = correctedPath.replace("/Desktop/", "~/Desktop/");
    if (correctedPath.startsWith("/Documents/"))
      correctedPath = correctedPath.replace("/Documents/", "~/Documents/");
    if (correctedPath.startsWith("/Downloads/"))
      correctedPath = correctedPath.replace("/Downloads/", "~/Downloads/");

    const { recursive = true } = args;
    const resolvedPath = resolvePath(correctedPath);

    if (fs.existsSync(resolvedPath)) {
      return {
        success: false,
        error: `Path already exists: ${resolvedPath}`,
      };
    }

    fs.mkdirSync(resolvedPath, { recursive });

    return {
      success: true,
      message: `Directory created at ${resolvedPath}`,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { definition, execute };
