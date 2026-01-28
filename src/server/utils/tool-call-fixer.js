/**
 * Tool Call Parser & Fixer
 * Handles malformed tool calls from models like Qwen that don't follow
 * the OpenAI tool calling format exactly
 */

/**
 * Parse and fix tool call arguments that might be strings or malformed JSON
 * @param {any} args - The arguments field from a tool call
 * @returns {object} - Parsed arguments object
 */
function parseToolArguments(args) {
  // Already an object? Return as-is
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args;
  }

  // String? Try to parse it
  if (typeof args === "string") {
    // Empty string
    if (!args.trim()) {
      return {};
    }

    try {
      const parsed = JSON.parse(args);
      return typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      console.warn("[tool-fixer] Failed to parse arguments string:", args);
      return {};
    }
  }

  // Fallback: empty object
  return {};
}

/**
 * Fix a single tool call object to ensure proper format
 * @param {object} toolCall - Raw tool call from LLM
 * @returns {object|null} - Fixed tool call or null if invalid
 */
function fixToolCall(toolCall) {
  if (!toolCall || typeof toolCall !== "object") {
    return null;
  }

  // Handle OpenAI format: { function: { name, arguments } }
  if (toolCall.function) {
    const name = toolCall.function.name;
    const args = toolCall.function.arguments;

    if (!name || typeof name !== "string") {
      console.warn("[tool-fixer] Tool call missing valid name:", toolCall);
      return null;
    }

    return {
      function: {
        name: name.trim(),
        arguments: parseToolArguments(args),
      },
    };
  }

  // Handle alternative format: { name, arguments } or { name, parameters }
  const name = toolCall.name;
  const args = toolCall.arguments || toolCall.parameters || toolCall.args;

  if (!name || typeof name !== "string") {
    console.warn("[tool-fixer] Tool call missing valid name:", toolCall);
    return null;
  }

  return {
    function: {
      name: name.trim(),
      arguments: parseToolArguments(args),
    },
  };
}

/**
 * Fix tool calls array from LLM response
 * @param {any} toolCalls - Raw tool_calls field from LLM
 * @returns {Array} - Fixed and validated tool calls
 */
function fixToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) {
    return [];
  }

  const fixed = [];

  for (const toolCall of toolCalls) {
    const fixedCall = fixToolCall(toolCall);
    if (fixedCall) {
      fixed.push(fixedCall);
    }
  }

  return fixed;
}

/**
 * Extract tool calls from message content when model outputs them as text
 * Some models (especially Qwen) output tool calls in the content field
 *
 * Patterns to look for:
 * - {"name": "tool_name", "arguments": {...}}
 * - {"function": {"name": "tool_name", "arguments": {...}}}
 * - <tool_call>{"name": "...", ...}</tool_call>
 * - json\n{"name": "...", ...}  (code blocks)
 */
function extractToolCallsFromContent(content) {
  if (!content || typeof content !== "string") {
    return [];
  }

  const toolCalls = [];

  // Remove markdown code blocks
  let cleanContent = content.replace(/```(?:json)?\s*\n([\s\S]*?)\n```/g, "$1");
  cleanContent = cleanContent.replace(/`([^`]+)`/g, "$1");

  // Pattern 1: Find JSON objects with "name" and "arguments" fields
  // This handles both {"name": "...", "arguments": {...}}
  // and nested structures
  const lines = cleanContent.split("\n");
  let buffer = "";
  let braceCount = 0;
  let inObject = false;

  for (const line of lines) {
    for (const char of line) {
      if (char === "{") {
        if (!inObject) {
          inObject = true;
          buffer = "";
        }
        braceCount++;
        buffer += char;
      } else if (char === "}") {
        buffer += char;
        braceCount--;
        if (braceCount === 0 && inObject) {
          inObject = false;
          // Try to parse this complete JSON object
          try {
            const parsed = JSON.parse(buffer);
            // Check if it looks like a tool call
            if (
              (parsed.name || parsed.function?.name) &&
              (parsed.arguments ||
                parsed.parameters ||
                parsed.function?.arguments)
            ) {
              const fixed = fixToolCall(parsed);
              if (fixed) {
                toolCalls.push(fixed);
                console.log(
                  "[tool-fixer] Extracted tool call from content:",
                  fixed.function.name,
                );
              }
            }
          } catch (e) {
            // Not valid JSON or doesn't match pattern
          }
          buffer = "";
        }
      } else if (inObject) {
        buffer += char;
      }
    }
  }

  return toolCalls;
}

/**
 * Process LLM message and ensure tool calls are properly formatted
 * @param {object} message - Raw message from LLM
 * @returns {object} - Fixed message with validated tool_calls
 */
function processLLMMessage(message) {
  if (!message || typeof message !== "object") {
    return { content: "", tool_calls: [] };
  }

  let toolCalls = [];
  let content = message.content || "";

  // First, check for tool_calls field
  if (message.tool_calls) {
    toolCalls = fixToolCalls(message.tool_calls);
  }

  // If no tool calls found, try extracting from content
  if (toolCalls.length === 0 && content) {
    const extracted = extractToolCallsFromContent(content);
    if (extracted.length > 0) {
      console.log(
        `[tool-fixer] Extracted ${extracted.length} tool call(s) from content`,
      );
      toolCalls = extracted;

      // Clean content by removing JSON objects that were tool calls
      // This is a bit aggressive but prevents duplicate output
      content = content
        .replace(/```(?:json)?\s*\n[\s\S]*?\n```/g, "")
        .replace(/\{[^}]*?"name"\s*:\s*"[^"]+?"[\s\S]*?\}/g, "")
        .trim();
    }
  }

  return {
    content: content,
    tool_calls: toolCalls,
  };
}

module.exports = {
  parseToolArguments,
  fixToolCall,
  fixToolCalls,
  extractToolCallsFromContent,
  processLLMMessage,
};
