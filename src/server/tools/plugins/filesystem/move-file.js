const fs = require("node:fs");
const { resolvePath } = require("../utils");

const definition = {
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
};

async function execute(args) {
  try {
    // Auto-correct common path mistakes
    let correctedSource = args.source;
    let correctedDest = args.destination;
    if (correctedSource.startsWith("/Desktop/"))
      correctedSource = correctedSource.replace("/Desktop/", "~/Desktop/");
    if (correctedSource.startsWith("/Documents/"))
      correctedSource = correctedSource.replace("/Documents/", "~/Documents/");
    if (correctedDest.startsWith("/Desktop/"))
      correctedDest = correctedDest.replace("/Desktop/", "~/Desktop/");
    if (correctedDest.startsWith("/Documents/"))
      correctedDest = correctedDest.replace("/Documents/", "~/Documents/");

    const sourcePath = resolvePath(correctedSource);
    const destPath = resolvePath(correctedDest);

    if (!fs.existsSync(sourcePath)) {
      return { success: false, error: `Source not found: ${sourcePath}` };
    }

    fs.renameSync(sourcePath, destPath);

    return {
      success: true,
      message: `Moved ${sourcePath} to ${destPath}`,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { definition, execute };
