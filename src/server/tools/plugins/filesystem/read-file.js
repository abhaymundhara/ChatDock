const fs = require("node:fs");
const { resolvePath } = require("../utils");

const definition = {
  type: "function",
  function: {
    name: "read_file",
    description:
      "Read and retrieve the contents of a text or binary file. Use ~/Desktop/file.txt for Desktop files, NOT /Desktop/file.txt",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description:
            "Path to file. Examples: ~/Desktop/file.txt, ~/Documents/file.txt, ./file.txt",
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

    const filePath = resolvePath(correctedPath);
    const encoding = args.encoding || "utf8";

    if (!fs.existsSync(filePath)) {
      let hint = "";
      if (
        args.file_path.startsWith("/Desktop") ||
        args.file_path.startsWith("/Documents")
      ) {
        hint = " Use ~/Desktop/ or ~/Documents/ for user files.";
      }
      return { success: false, error: `File not found: ${filePath}.${hint}` };
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
      };
    } else {
      const content = fs.readFileSync(filePath, "utf-8");
      return {
        success: true,
        content,
      };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { definition, execute };
