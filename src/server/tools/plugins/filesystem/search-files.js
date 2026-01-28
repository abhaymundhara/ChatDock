const fs = require("node:fs");
const path = require("node:path");
const { resolvePath, getFileType } = require("../utils");

// Default directories to ignore (inspired by ripgrep and .gitignore best practices)
const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  ".bzr",
  "bower_components",
  "vendor",
  ".cache",
  ".next",
  ".nuxt",
  "dist",
  "build",
  "out",
  "target",
  ".DS_Store",
  ".Trashes",
  ".Spotlight-V100",
  ".fseventsd",
  "System Volume Information",
  "$RECYCLE.BIN",
  "__pycache__",
  ".pytest_cache",
  ".tox",
  ".eggs",
  "*.egg-info",
  ".venv",
  "venv",
  "env",
]);

// Default file patterns to ignore
const DEFAULT_IGNORE_PATTERNS = [
  /^\..*/, // Hidden files (starting with .)
  /~$/, // Backup files
  /\.swp$/, // Vim swap files
  /\.pyc$/, // Python compiled files
  /\.pyo$/,
  /\.class$/, // Java compiled files
  /\.o$/, // Object files
  /\.so$/, // Shared objects
  /\.dylib$/,
  /\.dll$/,
  /\.exe$/,
  /\.min\.js$/, // Minified files
  /\.min\.css$/,
  /\.map$/, // Source maps
];

const definition = {
  type: "function",
  function: {
    name: "search_files",
    description:
      "Search, find, or locate files by name pattern (glob/wildcards supported) in a directory tree. Automatically ignores node_modules, .git. IMPORTANT: Use ~/Desktop NOT /Desktop",
    parameters: {
      type: "object",
      properties: {
        dir_path: {
          type: "string",
          description:
            "Directory to search. Use ~/Desktop for Desktop, ~/Documents for Documents, . for current directory",
        },
        pattern: {
          type: "string",
          description:
            "Filename pattern to search for (supports wildcards: * for any chars, ? for single char, ** for recursive)",
        },
        recursive: {
          type: "boolean",
          description: "Search recursively in subdirectories (default: true)",
        },
        respect_gitignore: {
          type: "boolean",
          description:
            "Respect .gitignore and auto-ignore common dirs like node_modules (default: true)",
        },
        max_results: {
          type: "number",
          description:
            "Maximum number of results to return (default: 1000, prevents memory issues)",
        },
        include_hidden: {
          type: "boolean",
          description:
            "Include hidden files/directories starting with . (default: false)",
        },
      },
      required: ["dir_path", "pattern"],
    },
  },
};

/**
 * Convert glob pattern to regex, supporting:
 * - * (any characters except /)
 * - ? (single character except /)
 * - ** (recursive directory match)
 */
function globToRegex(pattern) {
  // Handle ** first by temporarily replacing it
  let regexPattern = pattern.replace(/\*\*/g, "<!DOUBLESTAR!>");

  // Escape special regex characters EXCEPT dots (needed for extensions)
  regexPattern = regexPattern.replace(/[+^${}()|[\]\\]/g, "\\$&");

  // Now convert glob wildcards to regex
  regexPattern = regexPattern
    .replace(/\*/g, "[^/]*") // * matches any chars except /
    .replace(/\?/g, "[^/]") // ? matches single char except /
    .replace(/<!DOUBLESTAR!>/g, ".*"); // ** matches everything including /

  return new RegExp(`^${regexPattern}$`, "i");
}

/**
 * Check if path should be ignored based on gitignore-style rules
 */
function shouldIgnorePath(itemName, fullPath, respectGitignore, includeHidden) {
  // Skip hidden files unless explicitly included
  if (!includeHidden && itemName.startsWith(".")) {
    return true;
  }

  if (!respectGitignore) {
    return false;
  }

  // Check if directory is in default ignore list
  if (DEFAULT_IGNORE_DIRS.has(itemName)) {
    return true;
  }

  // Check if file matches ignore patterns
  for (const pattern of DEFAULT_IGNORE_PATTERNS) {
    if (pattern.test(itemName)) {
      return true;
    }
  }

  return false;
}

/**
 * Read .gitignore file if it exists and parse patterns
 */
function loadGitignore(dirPath) {
  const gitignorePath = path.join(dirPath, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(gitignorePath, "utf-8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")) // Remove comments and empty lines
      .map((pattern) => {
        // Convert gitignore pattern to regex
        if (pattern.endsWith("/")) {
          // Directory pattern
          return new RegExp(`^${pattern.slice(0, -1)}(/.*)?$`);
        }
        return globToRegex(pattern);
      });
  } catch (error) {
    return [];
  }
}

async function execute(args) {
  try {
    const {
      dir_path,
      pattern,
      recursive = true,
      respect_gitignore = true,
      max_results = 1000,
      include_hidden = false,
    } = args;

    // Use OS-level path resolution (CWD-relative, not home-relative)
    const resolvedDir = resolvePath(dir_path);

    if (!fs.existsSync(resolvedDir)) {
      let suggestion = "";
      if (dir_path === "/Desktop" || dir_path === "/Documents") {
        suggestion = ` Did you mean ~/Desktop or ~/Documents?`;
      }
      return {
        success: false,
        error: `Directory not found: ${resolvedDir}.${suggestion}`,
        hint: suggestion
          ? "Use ~/Desktop or ~/Documents for user folders"
          : undefined,
      };
    }

    const stats = fs.statSync(resolvedDir);
    if (!stats.isDirectory()) {
      return {
        success: false,
        error: `Path is not a directory: ${resolvedDir}`,
      };
    }

    const regex = globToRegex(pattern);
    let resultCount = 0;
    const limitReached = { value: false };

    // Load gitignore patterns from the root search directory
    const gitignorePatterns = respect_gitignore
      ? loadGitignore(resolvedDir)
      : [];

    function searchRecursive(dir, basePath = "", depth = 0) {
      const results = [];

      // Safety limit: prevent infinite recursion
      if (depth > 50) {
        return results;
      }

      // Early termination if we've hit the limit
      if (limitReached.value) {
        return results;
      }

      try {
        const items = fs.readdirSync(dir);

        for (const item of items) {
          // Check limit before processing each item
          if (resultCount >= max_results) {
            limitReached.value = true;
            return results;
          }

          try {
            const fullPath = path.join(dir, item);
            const relativePath = basePath ? path.join(basePath, item) : item;

            // Check if should ignore
            if (
              shouldIgnorePath(
                item,
                fullPath,
                respect_gitignore,
                include_hidden,
              )
            ) {
              continue;
            }

            // Check against gitignore patterns
            if (respect_gitignore && gitignorePatterns.length > 0) {
              const shouldIgnore = gitignorePatterns.some((pattern) =>
                pattern.test(relativePath),
              );
              if (shouldIgnore) {
                continue;
              }
            }

            const stats = fs.statSync(fullPath);

            // Check if filename matches pattern
            if (regex.test(item)) {
              results.push({
                path: relativePath,
                type: getFileType(stats),
                size: stats.size,
              });
              resultCount++;

              if (resultCount >= max_results) {
                limitReached.value = true;
                return results;
              }
            }

            // Recurse into directories
            if (recursive && stats.isDirectory()) {
              const subResults = searchRecursive(
                fullPath,
                relativePath,
                depth + 1,
              );
              results.push(...subResults);
            }
          } catch (itemError) {
            // Skip files/directories we can't access (permissions, etc.)
            continue;
          }
        }
      } catch (dirError) {
        // Can't read this directory - skip it
        return results;
      }

      return results;
    }

    const matches = searchRecursive(resolvedDir);
    return {
      success: true,
      search_path: resolvedDir,
      pattern,
      matches,
      count: matches.length,
      limit_reached: limitReached.value,
      ...(limitReached.value && {
        message: `Search stopped at ${max_results} results. Use max_results parameter to see more.`,
      }),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { definition, execute };
