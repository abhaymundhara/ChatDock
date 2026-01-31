const { spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const { logAudit } = require("./auditLogger");
const osRunManager = require("./osRunManager");

const HOME = os.homedir();
const ALLOWED_PATHS = [
    path.join(HOME, "Desktop"),
    path.join(HOME, "Documents"),
    path.join(HOME, "Projects"),
    path.join(HOME, "Downloads"),
    // Also allow the workspace itself
    process.env.WORKSPACE_ROOT || path.join(HOME, "Desktop", "chatdock_workspace")
];

const DANGEROUS_PATTERNS = [
    /rm\s+-rf\s+\//i,
    /sudo\b/i,
    /\/(System|Library|etc|var|usr|bin|sbin)\b/i,
    />\s*\/dev\//i,
    /\|\s*sh\b/i,
    /mkfs/i,
    /diskutil/i,
    /dd\b/i
];

const NON_DESTRUCTIVE_COMMANDS = ["ls", "find", "cat", "pwd", "echo", "grep", "wc", "du", "df", "head", "tail", "open", "fd", "rg", "stat", "whoami", "id"];

/**
 * Checks if a command is safe to execute.
 * Returns { safe: boolean, autoApprove: boolean, reason?: string }
 */
function assessCommandSafety(cmd) {
    const trimmed = cmd.trim();
    const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
    
    // 1. Dangerous Patterns (Hard Block)
    if (DANGEROUS_PATTERNS.some(re => re.test(trimmed))) {
        return { 
            safe: false, 
            autoApprove: false, 
            reason: "Command contains dangerous patterns or targets system directories (e.g. sudo, /System, /usr)." 
        };
    }

    // 2. Destructive Verbs (Require Confirmation)
    const destructiveVerbs = ["rm", "mv", "chmod", "chown", "rmdir"];
    const isDestructive = destructiveVerbs.includes(firstWord);

    // 3. Path Validation
    // Extract potential absolute or home paths
    const pathMatches = trimmed.match(/(?:~|\/)[^"'\s]*/g) || [];
    let hitsExternal = false;
    
    for (const p of pathMatches) {
        // Skip common command flags or non-path matches
        if (p.startsWith("--") || p === "/" || p === "//") continue;
        
        let resolved = p;
        if (p.startsWith("~")) resolved = path.join(HOME, p.slice(1));
        resolved = path.resolve(resolved);

        const inAllowed = ALLOWED_PATHS.some(root => resolved.startsWith(root));
        
        if (!inAllowed) {
            hitsExternal = true;
        }
    }

    // 4. Decision Logic
    const isNonDestructive = NON_DESTRUCTIVE_COMMANDS.includes(firstWord);

    // SAFE: Non-destructive AND only touches allowed paths
    if (isNonDestructive && !hitsExternal) {
        return { safe: true, autoApprove: true };
    }

    // BLOCKED/CONFIRM: Destructive OR touches external
    if (isDestructive || hitsExternal) {
        const reason = isDestructive ? "Command is destructive." : "Command targets paths outside allowed directories.";
        return { 
            safe: true,     // It is "technically" safe to run if confirmed by user (not system destructive like rm -rf /)
            autoApprove: false, 
            reason
        };
    }

    // Default: Unknown commands require confirmation but aren't explicitly blocked
    return { safe: true, autoApprove: false, reason: "Command classification unknown." };
}

// Alias for backward compatibility if needed, else we can just export assessCommandSafety
const checkCommandSafety = assessCommandSafety;

function runShell(cmd, runId) {
    return new Promise((resolve) => {
        // Use shell: true to support pipes and shell built-ins
        const child = spawn(cmd, { shell: true });
        
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            const chunk = data.toString();
            stdout += chunk;
            osRunManager.appendOutput(runId, chunk, null);
        });

        child.stderr.on('data', (data) => {
            const chunk = data.toString();
            stderr += chunk;
            osRunManager.appendOutput(runId, null, chunk);
        });

        child.on('close', (code) => {
            const success = code === 0;
            osRunManager.finishRun(runId, success);

            if (code !== 0) {
                resolve({ 
                    success: false, 
                    error: `Command failed with exit code ${code}`, 
                    stdout, 
                    stderr 
                });
            } else {
                resolve({ success: true, stdout, stderr });
            }
        });

        child.on('error', (err) => {
            osRunManager.finishRun(runId, false);
            osRunManager.appendOutput(runId, null, err.message);
            resolve({ success: false, error: err.message, stdout, stderr });
        });
    });
}

/**
 * Executes a shell command and returns output.
 * @param {string} cmd 
 * @param {string} triggeredBy
 * @returns {Promise<{success: boolean, stdout: string, stderr: string, error?: string}>}
 */
async function executeShell(cmd, triggeredBy = 'direct') {
    logAudit("SHELL_EXECUTION", { command: cmd });
    const runId = osRunManager.startRun(cmd, triggeredBy);
    return runShell(cmd, runId);
}

/**
 * Executes a shell command with a pre-created run ID.
 */
async function executeShellWithRunId(cmd, runId) {
    return runShell(cmd, runId);
}

module.exports = { executeShell, executeShellWithRunId, checkCommandSafety, ALLOWED_PATHS, osRunManager };
