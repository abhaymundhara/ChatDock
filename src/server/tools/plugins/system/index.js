/**
 * System Tools Plugin
 * Provides shell command execution and system operations
 */

const { exec } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const execAsync = promisify(exec);

// Get logs directory path
const getLogsDir = () => {
  const appPath = process.env.CHATDOCK_APP_PATH || path.join(__dirname, "../../../..");
  return path.join(appPath, "logs");
};

// Ensure logs directory exists
const ensureLogsDir = () => {
  const logsDir = getLogsDir();
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  return logsDir;
};

// Generate log filename with timestamp
const getLogFilename = () => {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return `command_${timestamp}.log`;
};

// Write command log to file
const logCommand = (command, cwd, result, duration) => {
  try {
    const logsDir = ensureLogsDir();
    const logFile = path.join(logsDir, getLogFilename());

    const logEntry = {
      timestamp: new Date().toISOString(),
      command,
      cwd: cwd || process.cwd(),
      duration_ms: duration,
      success: result.success,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      error: result.error || null,
      exit_code: result.code || (result.success ? 0 : 1),
    };

    const logContent = `# Command Execution Log
Timestamp: ${logEntry.timestamp}
Duration: ${logEntry.duration_ms}ms

## Command
\`\`\`
${logEntry.command}
\`\`\`

## Working Directory
${logEntry.cwd}

## Result
Success: ${logEntry.success}
Exit Code: ${logEntry.exit_code}

## STDOUT
\`\`\`
${logEntry.stdout || "(empty)"}
\`\`\`

## STDERR
\`\`\`
${logEntry.stderr || "(empty)"}
\`\`\`

${logEntry.error ? `## Error\n${logEntry.error}\n` : ""}
---
JSON: ${JSON.stringify(logEntry)}
`;

    fs.writeFileSync(logFile, logContent, "utf-8");
    console.log(`[system] Command logged to: ${logFile}`);

    return logFile;
  } catch (error) {
    console.warn("[system] Failed to write command log:", error.message);
    return null;
  }
};

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
    const startTime = Date.now();
    let result;

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: cwd || process.cwd(),
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB
      });

      result = {
        success: true,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };
    } catch (error) {
      result = {
        success: false,
        error: error.message,
        stdout: error.stdout?.trim() || "",
        stderr: error.stderr?.trim() || "",
        code: error.code,
      };
    }

    // Log the command execution
    const duration = Date.now() - startTime;
    const logFile = logCommand(command, cwd, result, duration);

    // Add log file path to result
    result.log_file = logFile;

    return result;
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
