/**
 * Security Validator
 * Provides security checks for file operations and command execution
 */

const path = require("path");
const os = require("os");

/**
 * Check if a path is safe (within workspace or common safe directories)
 */
function isPathSafe(targetPath, workspacePath) {
  try {
    const resolved = path.resolve(targetPath);
    const workspace = path.resolve(workspacePath);
    
    // Allow workspace
    if (resolved.startsWith(workspace)) {
      return { safe: true, reason: "within workspace" };
    }
    
    // Allow home directory (but warn)
    const home = os.homedir();
    if (resolved.startsWith(home)) {
      return { safe: true, reason: "within home directory", warning: true };
    }
    
    // Block system directories
    const dangerousPaths = ["/etc", "/bin", "/sbin", "/usr/bin", "/usr/sbin", "/System"];
    if (dangerousPaths.some(p => resolved.startsWith(p))) {
      return { safe: false, reason: "system directory access denied" };
    }
    
    // Allow other paths with warning
    return { safe: true, reason: "outside workspace", warning: true };
  } catch (e) {
    return { safe: false, reason: "invalid path" };
  }
}

/**
 * Check if a shell command is potentially dangerous
 */
function isDangerousCommand(command) {
  const dangerous = [
    'rm -rf /',
    'rm -rf ~',
    'dd if=',
    'mkfs',
    ':(){:|:&};:',  // fork bomb
    '> /dev/sda',
    'chmod -R 777 /',
    'chown -R',
    'format',
    'del /f /s /q',
  ];
  
  const cmd = command.toLowerCase().trim();
  
  for (const pattern of dangerous) {
    if (cmd.includes(pattern.toLowerCase())) {
      return { dangerous: true, reason: `contains dangerous pattern: ${pattern}` };
    }
  }
  
  // Check for suspicious redirects to system files
  if (cmd.match(/>\s*\/dev\//) || cmd.match(/>\s*\/etc\//)) {
    return { dangerous: true, reason: "suspicious redirect to system file" };
  }
  
  return { dangerous: false };
}

/**
 * Validate and sanitize a file path
 */
function validatePath(targetPath, workspacePath) {
  const safety = isPathSafe(targetPath, workspacePath);
  
  if (!safety.safe) {
    throw new Error(`Path validation failed: ${safety.reason}`);
  }
  
  if (safety.warning) {
    console.warn(`[security] Warning: ${safety.reason} - ${targetPath}`);
  }
  
  return path.resolve(targetPath);
}

/**
 * Validate a shell command before execution
 */
function validateCommand(command) {
  const check = isDangerousCommand(command);
  
  if (check.dangerous) {
    throw new Error(`Command blocked: ${check.reason}`);
  }
  
  return true;
}

module.exports = {
  isPathSafe,
  isDangerousCommand,
  validatePath,
  validateCommand
};
