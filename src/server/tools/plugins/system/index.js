/**
 * System Tools Plugin
 * Provides shell command execution and system operations
 */

const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

// Tool definitions
const tools = [
  {
    type: "function",
    function: {
      name: "execute_command",
      description: "Execute a shell command",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Shell command to execute",
          },
          cwd: {
            type: "string",
            description: "Working directory for command execution",
          },
          timeout: {
            type: "number",
            description: "Command timeout in milliseconds (default: 30000)",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_environment",
      description: "Get environment variables",
      parameters: {
        type: "object",
        properties: {
          variable: {
            type: "string",
            description: "Specific environment variable to get (optional)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_system_info",
      description: "Get system information (OS, platform, architecture)",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

// Tool executors
const executors = {
  async execute_command({ command, cwd, timeout = 30000 }) {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: cwd || process.cwd(),
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB
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
        stdout: error.stdout?.trim() || "",
        stderr: error.stderr?.trim() || "",
        code: error.code,
      };
    }
  },

  async get_environment({ variable }) {
    if (variable) {
      return {
        success: true,
        variable,
        value: process.env[variable] || null,
      };
    }

    // Return all environment variables (filtered for security)
    const safeVars = Object.entries(process.env)
      .filter(([key]) => !key.match(/SECRET|PASSWORD|TOKEN|KEY|AUTH/i))
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});

    return {
      success: true,
      variables: safeVars,
    };
  },

  async get_system_info() {
    const os = require("os");

    return {
      success: true,
      platform: process.platform,
      arch: process.arch,
      os: os.type(),
      release: os.release(),
      hostname: os.hostname(),
      cpus: os.cpus().length,
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
      },
      uptime: os.uptime(),
    };
  },
};

// Plugin metadata
module.exports = {
  name: "System Tools",
  description: "Shell command execution and system operations",
  version: "1.0.0",
  category: "system",
  tools,
  executors,
  metadata: {
    specialists: ["shell"], // Which specialists can use this plugin
    tags: ["shell", "system", "command", "exec"],
  },
};
