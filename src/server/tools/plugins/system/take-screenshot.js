const { exec } = require("child_process");
const util = require("util");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");

const execAsync = util.promisify(exec);

/**
 * take-screenshot.js
 * Cross-platform screenshot capture
 * macOS: screencapture, Windows: PowerShell, Linux: scrot/gnome-screenshot
 */

const definition = {
  type: "function",
  function: {
    name: "take_screenshot",
    description:
      "Take a screenshot and save to file. Works on macOS, Windows, and Linux. Returns file path.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description:
            "Where to save screenshot (e.g., ~/Desktop/screenshot.png). Defaults to ~/Desktop/screenshot_{timestamp}.png",
        },
        full_screen: {
          type: "boolean",
          description:
            "Capture entire screen (true) or selection (false). Default: true",
        },
      },
      required: [],
    },
  },
};

async function execute(args) {
  try {
    const platform = os.platform();
    const timestamp = Date.now();

    // Determine output path
    let outputPath = args.file_path;
    if (!outputPath) {
      const desktop = path.join(os.homedir(), "Desktop");
      outputPath = path.join(desktop, `screenshot_${timestamp}.png`);
    } else {
      // Expand ~ if present
      if (outputPath.startsWith("~/")) {
        outputPath = path.join(os.homedir(), outputPath.slice(2));
      }
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(outputPath);
    await fs.mkdir(parentDir, { recursive: true });

    const fullScreen = args.full_screen !== false; // Default true

    let command;

    if (platform === "darwin") {
      // macOS: screencapture
      if (fullScreen) {
        command = `screencapture "${outputPath}"`;
      } else {
        command = `screencapture -i "${outputPath}"`; // -i = interactive selection
      }
    } else if (platform === "win32") {
      // Windows: PowerShell Add-Type System.Windows.Forms
      const script = fullScreen
        ? `Add-Type -AssemblyName System.Windows.Forms; $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height); $graphics = [System.Drawing.Graphics]::FromImage($bitmap); $graphics.CopyFromScreen(0, 0, 0, 0, $bitmap.Size); $bitmap.Save('${outputPath}'); $graphics.Dispose(); $bitmap.Dispose()`
        : `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('%{PRTSC}')`;

      command = `powershell -Command "${script}"`;
    } else {
      // Linux: Try scrot, fallback to gnome-screenshot
      if (fullScreen) {
        command = `scrot "${outputPath}" 2>/dev/null || gnome-screenshot -f "${outputPath}"`;
      } else {
        command = `scrot -s "${outputPath}" 2>/dev/null || gnome-screenshot -a -f "${outputPath}"`;
      }
    }

    await execAsync(command, { timeout: 30000 });

    // Verify file was created
    try {
      const stats = await fs.stat(outputPath);

      return {
        success: true,
        file_path: outputPath,
        size: stats.size,
        platform,
        mode: fullScreen ? "full_screen" : "selection",
      };
    } catch (err) {
      return {
        success: false,
        error:
          "Screenshot command completed but file not found. May have been cancelled.",
        attempted_path: outputPath,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: `Screenshot failed: ${error.message}`,
      platform: os.platform(),
      suggestion:
        os.platform() === "linux"
          ? "Install scrot or gnome-screenshot"
          : "Check system permissions",
    };
  }
}

module.exports = { definition, execute };
