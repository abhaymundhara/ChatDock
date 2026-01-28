// Tool Plugin Template
// Copy this file to create a new tool plugin

// Optional: Import shared utilities
// const { resolvePath, getFileType } = require("./utils");

/**
 * Tool definition following OpenAI/Ollama function schema
 */
const definition = {
  type: "function",
  function: {
    name: "tool_name_here", // Use snake_case, e.g., "my_tool"
    description:
      "Clear, concise description of what this tool does. This helps the LLM decide when to use it.",
    parameters: {
      type: "object",
      properties: {
        param_name: {
          type: "string", // or "number", "boolean", "object", "array"
          description: "Description of this parameter",
        },
        optional_param: {
          type: "boolean",
          description: "Optional parameters don't need to be in required array",
        },
      },
      required: ["param_name"], // List required parameters here
    },
  },
};

/**
 * Execute function - implements the tool's functionality
 * @param {object} args - Arguments passed from LLM (matches parameters schema)
 * @returns {Promise<object>} - Should return { success: boolean, ... }
 */
async function execute(args) {
  try {
    // Extract parameters
    const { param_name, optional_param } = args;

    // Validate inputs if needed
    if (!param_name) {
      return {
        success: false,
        error: "param_name is required",
      };
    }

    // TODO: Implement your tool logic here

    // Return success with results
    return {
      success: true,
      // Add your result data here
      data: "example result",
    };
  } catch (error) {
    // Always catch errors and return structured error response
    return {
      success: false,
      error: error.message,
    };
  }
}

// REQUIRED: Export both definition and execute
module.exports = { definition, execute };
