const { exec } = require("node:child_process");
const { promisify } = require("node:util");
const execAsync = promisify(exec);

const definition = {
  type: "function",
  function: {
    name: "execute_shell",
    description:
      "Execute a shell command and return the output. Use with caution.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute",
        },
      },
      required: ["command"],
    },
  },
};

async function execute(args) {
  try {
    const { stdout, stderr } = await execAsync(args.command, {
      timeout: 30000, // 30 second timeout
      maxBuffer: 1024 * 1024, // 1MB max output
    });
    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stdout: error.stdout || "",
      stderr: error.stderr || "",
    };
  }
}

module.exports = { definition, execute };
