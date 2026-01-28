// Example Tool Plugin - Shows best practices
// This is a working example of a well-structured tool

const fs = require("node:fs");
const path = require("node:path");
const { resolvePath } = require("./utils");

/**
 * Tool definition following OpenAI/Ollama function schema
 * This is what the LLM sees to decide when to use this tool
 */
const definition = {
  type: "function",
  function: {
    name: "count_lines",
    description: "Count the number of lines in a text file",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Path to the file to count lines in",
        },
        include_empty: {
          type: "boolean",
          description:
            "Whether to include empty lines in the count (default: true)",
        },
      },
      required: ["file_path"],
    },
  },
};

/**
 * Execute function - implements the tool's functionality
 * @param {object} args - Arguments from LLM matching the parameters schema
 * @returns {Promise<object>} - Always returns { success: boolean, ... }
 */
async function execute(args) {
  try {
    // 1. Extract and validate parameters
    const { file_path, include_empty = true } = args;

    if (!file_path) {
      return {
        success: false,
        error: "file_path is required",
      };
    }

    // 2. Use shared utilities
    const fullPath = resolvePath(file_path);

    // 3. Validate file existence
    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        error: `File not found: ${fullPath}`,
      };
    }

    // 4. Check if it's actually a file
    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
      return {
        success: false,
        error: `Path is not a file: ${fullPath}`,
      };
    }

    // 5. Implement the core logic
    const content = fs.readFileSync(fullPath, "utf-8");
    const lines = content.split("\n");

    let totalLines = lines.length;
    let nonEmptyLines = lines.filter((line) => line.trim().length > 0).length;

    // 6. Return structured success response with all relevant data
    return {
      success: true,
      path: fullPath,
      total_lines: totalLines,
      non_empty_lines: nonEmptyLines,
      empty_lines: totalLines - nonEmptyLines,
      count: include_empty ? totalLines : nonEmptyLines,
    };
  } catch (error) {
    // 7. Always catch errors and return structured response
    return {
      success: false,
      error: error.message,
      // Optionally include stack trace in development
      // stack: error.stack,
    };
  }
}

// 8. REQUIRED: Export both definition and execute
module.exports = { definition, execute };

// ============================================================================
// BEST PRACTICES DEMONSTRATED:
// ============================================================================
//
// ✅ Clear, descriptive tool name (count_lines)
// ✅ Detailed description for LLM
// ✅ Well-documented parameters with types and descriptions
// ✅ Distinguish required vs optional parameters
// ✅ Use destructuring with defaults for optional params
// ✅ Validate inputs early
// ✅ Use shared utilities (resolvePath)
// ✅ Comprehensive error checking
// ✅ Return consistent { success: boolean } response format
// ✅ Include all relevant data in success response
// ✅ Catch and handle all errors gracefully
// ✅ Add comments explaining the logic
// ✅ Export both definition and execute
//
// ============================================================================
