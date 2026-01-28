const { exec } = require("child_process");
const util = require("util");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");

const execAsync = util.promisify(exec);

/**
 * execute-code.js (Python only)
 * Sandboxed Python execution
 */

const definition = {
  type: "function",
  function: {
    name: "execute_python",
    description:
      "Execute Python code in a sandboxed environment with timeout limits. Best for data processing, calculations, or testing Python snippets.",
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "Python code to execute",
        },
        timeout: {
          type: "number",
          description: "Timeout in seconds (default: 10, max: 60)",
        },
      },
      required: ["code"],
    },
  },
};

async function execute(args) {
  try {
    const { code, timeout = 10 } = args;

    if (!code || code.trim().length === 0) {
      return {
        success: false,
        error: "Code cannot be empty",
      };
    }

    // Limit timeout
    const timeoutMs = Math.min(Math.max(1, timeout) * 1000, 60000);

    // Create temp file
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `chatdock_python_${Date.now()}.py`);

    await fs.writeFile(tempFile, code, "utf-8");

    try {
      // Execute with timeout
      const { stdout, stderr } = await execAsync(`python3 "${tempFile}"`, {
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024, // 1MB max output
      });

      return {
        success: true,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        timeout: timeout,
      };
    } finally {
      // Cleanup
      try {
        await fs.unlink(tempFile);
      } catch {}
    }
  } catch (error) {
    if (error.killed) {
      return {
        success: false,
        error: `Execution timed out after ${args.timeout || 10} seconds`,
        timeout: true,
      };
    }

    return {
      success: false,
      error: `Python execution failed: ${error.message}`,
      stderr: error.stderr || "",
    };
  }
}

module.exports = { definition, execute };
