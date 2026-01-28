// Shared utilities for tool plugins

const path = require("node:path");
const os = require("node:os");

/**
 * Resolve paths at OS level (supports absolute, ~home, and CWD-relative paths)
 * This function works at OS level, not workspace level
 *
 * @param {string} inputPath - The path to resolve
 * @param {object} options - Options for path resolution
 * @param {string} options.cwd - Base directory for relative paths (defaults to process.cwd())
 * @returns {string} Absolute path
 *
 * Examples:
 * - /abs/path → /abs/path (absolute)
 * - ~/file → /Users/username/file (home expansion)
 * - ./file → /current/working/dir/file (CWD relative)
 * - file.txt → /current/working/dir/file.txt (CWD relative)
 */
function resolvePath(inputPath, options = {}) {
  const { cwd = process.cwd() } = options;

  if (path.isAbsolute(inputPath)) {
    return inputPath; // Already absolute
  }

  if (inputPath.startsWith("~")) {
    // Expand ~ to home directory
    return path.join(os.homedir(), inputPath.slice(1));
  }

  // Relative path → resolve against CWD (OS-level operation)
  return path.resolve(cwd, inputPath);
}

/**
 * Get file type from stats object
 * @param {object} stats - fs.Stats object
 * @returns {string} File type
 */
function getFileType(stats) {
  if (stats.isDirectory()) return "directory";
  if (stats.isFile()) return "file";
  if (stats.isSymbolicLink()) return "symlink";
  if (stats.isSocket()) return "socket";
  if (stats.isBlockDevice()) return "block";
  if (stats.isCharacterDevice()) return "character";
  return "unknown";
}

module.exports = {
  resolvePath,
  getFileType,
};
