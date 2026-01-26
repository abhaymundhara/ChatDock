/**
 * Shell & System Tools
 * Tools for running commands and getting system information
 */

const os = require("node:os");
const { spawn, execSync } = require("node:child_process");
const path = require("node:path");

/**
 * run_command - Execute a shell command
 */
const run_command = {
  name: "run_command",
  description:
    "Executes a shell command and returns the output. Use with caution.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command to execute",
      },
      cwd: {
        type: "string",
        description:
          "Working directory for the command (default: current directory)",
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default: 30000)",
        default: 30000,
      },
    },
    required: ["command"],
  },
  requiresConfirmation: true,
  keywords: ["run", "command", "shell", "bash", "execute", "terminal"],

  run: async ({ command, cwd, timeout = 30000 }) => {
    const workDir = cwd ? path.resolve(cwd) : process.cwd();

    // Block dangerous commands
    const dangerous = ["rm -rf /", "mkfs", "dd if=", ":(){", "chmod -R 777 /"];
    for (const d of dangerous) {
      if (command.includes(d)) {
        throw new Error(`Blocked dangerous command pattern: ${d}`);
      }
    }

    return new Promise((resolve, reject) => {
      const child = spawn("bash", ["-c", command], {
        cwd: workDir,
        timeout,
        maxBuffer: 5 * 1024 * 1024,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        resolve({
          command,
          cwd: workDir,
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          success: code === 0,
        });
      });

      child.on("error", (error) => {
        reject(new Error(`Command failed: ${error.message}`));
      });

      // Handle timeout
      setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);
    });
  },
};

/**
 * open_app - Open an application
 */
const open_app = {
  name: "open_app",
  description:
    "Opens an application by name. Works on macOS, Linux, and Windows.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description:
          'Application name (e.g., "Chrome", "Safari", "VSCode", "Terminal")',
      },
      args: {
        type: "array",
        items: { type: "string" },
        description: "Optional arguments to pass to the application",
      },
    },
    required: ["name"],
  },
  keywords: ["open", "app", "application", "launch", "start", "program"],

  run: async ({ name, args = [] }) => {
    const platform = os.platform();
    let command;

    // Build command based on platform
    if (platform === "darwin") {
      // macOS: use 'open' command
      const appArgs = args.length > 0 ? ` --args ${args.join(" ")}` : "";
      command = `open -a "${name}"${appArgs}`;
    } else if (platform === "win32") {
      // Windows: use 'start' command
      const appArgs = args.join(" ");
      command = `start "" "${name}" ${appArgs}`;
    } else {
      // Linux: try common approaches
      const appArgs = args.join(" ");
      // Try xdg-open first, then which to find the binary
      command = `command -v "${name}" >/dev/null 2>&1 && "${name}" ${appArgs} & || xdg-open "${name}" 2>/dev/null &`;
    }

    try {
      execSync(command, { timeout: 5000 });
      return {
        success: true,
        app: name,
        platform,
        message: `Launched ${name}`,
      };
    } catch (error) {
      throw new Error(`Failed to open ${name}: ${error.message}`);
    }
  },
};

/**
 * run_script - Execute a script file
 */
const run_script = {
  name: "run_script",
  description:
    "Executes a script file (.sh, .py, .js, .rb, etc.). Automatically detects the interpreter.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the script file",
      },
      args: {
        type: "array",
        items: { type: "string" },
        description: "Arguments to pass to the script",
      },
      interpreter: {
        type: "string",
        description:
          "Force a specific interpreter (bash, python3, node, ruby, etc.)",
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default: 60000)",
        default: 60000,
      },
    },
    required: ["path"],
  },
  keywords: ["script", "run", "execute", "bash", "python", "node", "shell"],

  run: async ({
    path: scriptPath,
    args = [],
    interpreter,
    timeout = 60000,
  }) => {
    const fs = require("node:fs");
    const absPath = path.resolve(scriptPath);

    // Check if file exists
    if (!fs.existsSync(absPath)) {
      throw new Error(`Script not found: ${absPath}`);
    }

    // Determine interpreter
    let command;
    if (interpreter) {
      command = `${interpreter} "${absPath}" ${args.join(" ")}`;
    } else {
      const ext = path.extname(absPath).toLowerCase();

      // Auto-detect interpreter based on extension
      const interpreters = {
        ".sh": "bash",
        ".bash": "bash",
        ".zsh": "zsh",
        ".py": "python3",
        ".js": "node",
        ".mjs": "node",
        ".rb": "ruby",
        ".pl": "perl",
        ".php": "php",
      };

      const detected = interpreters[ext];
      if (!detected) {
        // Try to use shebang or make executable
        try {
          const content = fs.readFileSync(absPath, "utf-8");
          const shebang = content.split("\n")[0];
          if (shebang.startsWith("#!")) {
            // Has shebang, make executable and run directly
            execSync(`chmod +x "${absPath}"`);
            command = `"${absPath}" ${args.join(" ")}`;
          } else {
            throw new Error(
              `Cannot determine interpreter for ${ext}. Please specify the interpreter parameter.`,
            );
          }
        } catch (err) {
          throw new Error(
            `Cannot determine interpreter for ${ext}. Please specify the interpreter parameter.`,
          );
        }
      } else {
        command = `${detected} "${absPath}" ${args.join(" ")}`;
      }
    }

    return new Promise((resolve, reject) => {
      const child = spawn("bash", ["-c", command], {
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        resolve({
          script: absPath,
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          success: code === 0,
        });
      });

      child.on("error", (error) => {
        reject(new Error(`Script execution failed: ${error.message}`));
      });

      setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Script timed out after ${timeout}ms`));
      }, timeout);
    });
  },
};

/**
 * get_system_info - Get system information
 */
const get_system_info = {
  name: "get_system_info",
  description:
    "Returns information about the operating system, CPU, memory, and disk.",
  parameters: {
    type: "object",
    properties: {},
  },
  keywords: ["system", "info", "os", "cpu", "memory", "ram", "disk"],

  run: async () => {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    // Get disk info (macOS/Linux)
    let diskInfo = null;
    try {
      const df = execSync("df -h / 2>/dev/null", { encoding: "utf-8" });
      const lines = df.split("\n");
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        diskInfo = {
          total: parts[1],
          used: parts[2],
          available: parts[3],
          usedPercent: parts[4],
        };
      }
    } catch {}

    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      release: os.release(),
      uptime: formatUptime(os.uptime()),
      cpu: {
        model: cpus[0]?.model,
        cores: cpus.length,
        speed: `${cpus[0]?.speed} MHz`,
      },
      memory: {
        total: formatBytes(totalMem),
        free: formatBytes(freeMem),
        used: formatBytes(totalMem - freeMem),
        usedPercent: `${Math.round((1 - freeMem / totalMem) * 100)}%`,
      },
      disk: diskInfo,
      nodeVersion: process.version,
      pid: process.pid,
    };
  },
};

/**
 * get_process_list - List running processes
 */
const get_process_list = {
  name: "get_process_list",
  description: "Lists running processes on the system.",
  parameters: {
    type: "object",
    properties: {
      sortBy: {
        type: "string",
        description: "Sort by: cpu, mem, or name (default: cpu)",
        default: "cpu",
      },
      limit: {
        type: "number",
        description: "Maximum number of processes to return (default: 20)",
        default: 20,
      },
    },
  },
  keywords: ["process", "list", "ps", "running", "top"],

  run: async ({ sortBy = "cpu", limit = 20 }) => {
    try {
      // Use ps command
      const sortFlag =
        sortBy === "mem" ? "-m" : sortBy === "name" ? "-c" : "-r";
      const command = `ps aux ${sortFlag} | head -${limit + 1}`;
      const output = execSync(command, { encoding: "utf-8" });

      const lines = output.split("\n").filter(Boolean);
      const header = lines[0];
      const processes = lines.slice(1).map((line) => {
        const parts = line.split(/\s+/);
        return {
          user: parts[0],
          pid: parts[1],
          cpu: parts[2] + "%",
          mem: parts[3] + "%",
          command: parts.slice(10).join(" "),
        };
      });

      return {
        count: processes.length,
        sortedBy: sortBy,
        processes,
      };
    } catch (error) {
      throw new Error(`Failed to list processes: ${error.message}`);
    }
  },
};

/**
 * get_current_time - Get the current date and time
 */
const get_current_time = {
  name: "get_current_time",
  description: "Returns the current date and time in various formats.",
  parameters: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description:
          'Timezone (e.g., "America/New_York"). Default is system timezone.',
      },
    },
  },
  keywords: ["time", "date", "now", "today", "current"],

  run: async ({ timezone }) => {
    const now = new Date();

    return {
      iso: now.toISOString(),
      local: now.toLocaleString(),
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString(),
      unix: Math.floor(now.getTime() / 1000),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      day: now.toLocaleDateString("en-US", { weekday: "long" }),
    };
  },
};

/**
 * get_environment - Get environment variables
 */
const get_environment = {
  name: "get_environment",
  description: "Returns environment variables. Sensitive values are masked.",
  parameters: {
    type: "object",
    properties: {
      filter: {
        type: "string",
        description: "Only show variables containing this string",
      },
    },
  },
  keywords: ["env", "environment", "variable", "path"],

  run: async ({ filter }) => {
    const env = { ...process.env };

    // Mask sensitive values
    const sensitiveKeys = [
      "KEY",
      "SECRET",
      "PASSWORD",
      "TOKEN",
      "CREDENTIAL",
      "PRIVATE",
    ];
    for (const key of Object.keys(env)) {
      if (sensitiveKeys.some((s) => key.toUpperCase().includes(s))) {
        env[key] = "***MASKED***";
      }
    }

    // Filter if requested
    if (filter) {
      const filterLower = filter.toLowerCase();
      for (const key of Object.keys(env)) {
        if (!key.toLowerCase().includes(filterLower)) {
          delete env[key];
        }
      }
    }

    return env;
  },
};

// Helper functions
function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.join(" ") || "< 1m";
}

module.exports = {
  run_command,
  open_app,
  run_script,
  get_system_info,
  get_process_list,
  get_current_time,
  get_environment,
};
