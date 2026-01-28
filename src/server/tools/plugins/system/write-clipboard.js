const { exec } = require("child_process");
const util = require("util");
const os = require("os");

const execAsync = util.promisify(exec);

/**
 * write-clipboard.js
 * Write text to system clipboard (cross-platform)
 */

const definition = {
  type: "function",
  function: {
    name: "write_clipboard",
    description:
      "Write text to system clipboard. Works on macOS, Windows, and Linux.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Text to copy to clipboard",
        },
      },
      required: ["text"],
    },
  },
};

async function writeClipboard(text) {
  const platform = os.platform();
  let command;

  if (platform === "darwin") {
    command = `echo ${JSON.stringify(text)} | pbcopy`;
  } else if (platform === "win32") {
    const escaped = text.replace(/"/g, '""');
    command = `powershell -Command "Set-Clipboard -Value '${escaped}'"`;
  } else {
    // Linux: try xclip first, fallback to xsel
    command = `echo ${JSON.stringify(text)} | xclip -selection clipboard 2>/dev/null || echo ${JSON.stringify(text)} | xsel --clipboard --input`;
  }

  await execAsync(command, { timeout: 5000 });
}

async function execute(args) {
  try {
    if (!args.text) {
      return {
        success: false,
        error: "text parameter is required",
      };
    }

    await writeClipboard(args.text);

    return {
      success: true,
      message: `Copied ${args.text.length} characters to clipboard`,
      platform: os.platform(),
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to write clipboard: ${error.message}`,
      platform: os.platform(),
      suggestion:
        os.platform() === "linux"
          ? "Install xclip or xsel"
          : "Check system permissions",
    };
  }
}

module.exports = { definition, execute };
