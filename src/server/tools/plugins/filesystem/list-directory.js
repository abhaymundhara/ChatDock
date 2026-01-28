const fs = require("node:fs");
const path = require("node:path");
const { resolvePath, getFileType } = require("../utils");

const definition = {
  type: "function",
  function: {
    name: "list_directory",
    description:
      'List files and folders in a directory. Returns summary with counts. For "list folders on desktop" use dir_path: "~/Desktop". For "show files in documents" use dir_path: "~/Documents". CRITICAL: Desktop is ~/Desktop NOT /Desktop. Returns: {summary: {total_items, files, directories}, entries: [...]}',
    parameters: {
      type: "object",
      properties: {
        dir_path: {
          type: "string",
          description:
            "Path to list. Examples: ~/Desktop (user Desktop), ~/Documents (user Documents), . (current dir), /absolute/path",
        },
        recursive: {
          type: "boolean",
          description: "List subdirectories recursively (default: false)",
        },
        include_hidden: {
          type: "boolean",
          description: "Include hidden files starting with . (default: false)",
        },
        max_items: {
          type: "number",
          description: "Maximum number of items to return (default: 100)",
        },
      },
      required: ["dir_path"],
    },
  },
};

async function execute(args) {
  try {
    // Auto-correct common mistakes before processing
    let correctedPath = args.dir_path;

    // Reject root directory unless explicitly needed for system operations
    if (args.dir_path === "/") {
      return {
        success: false,
        error:
          "Cannot list root directory. Use ~/Desktop for desktop, ~/Documents for documents, or ~ for user home.",
        hint: "User files are in ~ (home directory), not / (system root)",
      };
    }

    // Auto-correct common wrong paths
    if (args.dir_path === "/Desktop") correctedPath = "~/Desktop";
    if (args.dir_path === "/Documents") correctedPath = "~/Documents";
    if (args.dir_path === "/Downloads") correctedPath = "~/Downloads";

    const dirPath = resolvePath(correctedPath);
    const recursive = args.recursive || false;
    const includeHidden = args.include_hidden ?? false;
    const maxItems = args.max_items || 100;

    if (!fs.existsSync(dirPath)) {
      // Provide helpful suggestions for common mistakes
      let suggestion = "";
      if (args.dir_path === "/Desktop" || args.dir_path === "/Documents") {
        suggestion = ` Did you mean ~/Desktop or ~/Documents?`;
      } else if (
        args.dir_path.startsWith("/") &&
        !args.dir_path.startsWith("/Users/")
      ) {
        suggestion = ` Tip: User directories should start with ~ (e.g., ~/Desktop)`;
      }
      return {
        success: false,
        error: `Directory not found: ${dirPath}.${suggestion}`,
        hint: suggestion
          ? "Use ~/Desktop for user Desktop, ~/Documents folder"
          : undefined,
      };
    }

    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      return { success: false, error: `Path is not a directory: ${dirPath}` };
    }

    let itemCount = 0;
    const limitReached = { value: false };
    const counts = { files: 0, directories: 0 };

    function listRecursive(dir, basePath = "") {
      const entries = [];

      try {
        const items = fs.readdirSync(dir);

        for (const item of items) {
          // Check item limit
          if (itemCount >= maxItems) {
            limitReached.value = true;
            break;
          }

          // Skip hidden files if not included
          if (!includeHidden && item.startsWith(".")) {
            continue;
          }

          try {
            const fullPath = path.join(dir, item);
            const relativePath = basePath ? path.join(basePath, item) : item;

            const itemStats = fs.statSync(fullPath);
            const fileType = getFileType(itemStats);

            // Update counts
            if (fileType === "file") {
              counts.files++;
            } else if (fileType === "directory") {
              counts.directories++;
            }

            entries.push({
              name: relativePath,
              type: fileType,
              size: itemStats.size,
              modified: itemStats.mtime.toISOString(),
            });

            itemCount++;

            if (recursive && itemStats.isDirectory() && itemCount < maxItems) {
              const subEntries = listRecursive(fullPath, relativePath);
              entries.push(...subEntries);
            }
          } catch (itemError) {
            // Skip files we can't access (permission denied, etc.)
            continue;
          }
        }
      } catch (dirError) {
        // Can't read directory - return what we have so far
        return entries;
      }

      return entries;
    }

    const entries = listRecursive(dirPath);

    // Return summary FIRST so LLM sees it immediately
    const summary = {
      total_items: entries.length,
      files: counts.files,
      directories: counts.directories,
      limit_reached: limitReached.value,
    };

    // Simplify entries - just name and type, no size/timestamps (reduces response size by 70%)
    const simplifiedEntries = entries.slice(0, 20).map((entry) => ({
      name: entry.name,
      type: entry.type,
    }));

    return {
      success: true,
      path: dirPath,
      summary, // Summary FIRST - helps small models understand quickly
      entries: simplifiedEntries, // Simplified format - just name and type
      note:
        entries.length > 20
          ? `Showing first 20 of ${entries.length} items.`
          : undefined,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { definition, execute };
