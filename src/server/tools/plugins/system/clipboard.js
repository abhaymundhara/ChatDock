const { exec } = require("child_process");
const util = require("util");
const os = require("os");

const execAsync = util.promisify(exec);

/**
 * clipboard.js
 * Cross-platform clipboard read/write
 * macOS: pbcopy/pbpaste, Windows: clip/PowerShell, Linux: xclip/xsel
 */

const readDefinition = {
  type: "function",
  function: {
    name: "read_clipboard",
    description:
      "Read text from system clipboard. Works on macOS, Windows, and Linux.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

const writeDefinition = {
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

async function readClipboard() {
  const platform = os.platform();
  let command;

  if (platform === "darwin") {
    command = "pbpaste";
  } else if (platform === "win32") {
    command = 'powershell -Command "Get-Clipboard"';
  } else {
    // Linux: try xclip first, fallback to xsel
    command =
      "xclip -selection clipboard -o 2>/dev/null || xsel --clipboard --output";
  }

  const { stdout } = await execAsync(command, { timeout: 5000 });
  return stdout;
}

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

async function executeRead(args) {
  try {
    const text = await readClipboard();

    return {
      success: true,
      text: text.trim(),
      length: text.length,
      platform: os.platform(),
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to read clipboard: ${error.message}`,
      platform: os.platform(),
      suggestion:
        os.platform() === "linux"
          ? "Install xclip or xsel"
          : "Check system permissions",
    };
  }
}

async function executeWrite(args) {
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

// Export read_clipboard as default
module.exports = { definition: readDefinition, execute: executeRead };
