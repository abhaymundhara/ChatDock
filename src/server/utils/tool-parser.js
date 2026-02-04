/**
 * Tool Parser Utility
 * Extracts tool calls from LLM responses (native and text-based)
 */

class ToolParser {
  /**
   * Extract tool calls from response text
   * Supports common formats used by smaller models
   */
  static parse(text) {
    if (!text || typeof text !== "string") return [];

    const toolCalls = [];

    // 1. Look for <tool_call> tags (common in some model fine-tunes)
    const xmlMatches = text.matchAll(/<tool_call>([\s\S]*?)<\/tool_call>/g);
    for (const match of xmlMatches) {
      try {
        const json = JSON.parse(match[1].trim());
        if (json.name) {
          toolCalls.push({
            id: `call_${Math.random().toString(36).slice(2, 11)}`,
            type: "function",
            function: {
              name: json.name,
              arguments: typeof json.arguments === "string" ? json.arguments : JSON.stringify(json.arguments || {}),
            }
          });
        }
      } catch (e) { /* ignore invalid json */ }
    }

    // 2. Look for markdown blocks that look like tool calls
    const mdMatches = text.matchAll(/```(?:json)?\n?\{\s*"name":\s*"([^"]+)"[\s\S]*?\}\n?```/g);
    for (const match of mdMatches) {
      try {
        const json = JSON.parse(match[0].replace(/```(?:json)?/g, "").replace(/```/g, "").trim());
        if (json.name) {
          toolCalls.push({
            id: `call_${Math.random().toString(36).slice(2, 11)}`,
            type: "function",
            function: {
              name: json.name,
              arguments: typeof json.arguments === "string" ? json.arguments : JSON.stringify(json.arguments || {}),
            }
          });
        }
      } catch (e) { /* ignore */ }
    }

    // 3. Look for "Tool: name" "Args: {...}" pattern
    const lineMatches = text.matchAll(/Tool:\s*([a-zA-Z0-9_-]+)\s*\nArgs:\s*(\{[\s\S]*?\})/g);
    for (const match of lineMatches) {
      try {
        const name = match[1].trim();
        const argsStr = match[2].trim();
        // Validate args is JSON
        JSON.parse(argsStr);
        toolCalls.push({
          id: `call_${Math.random().toString(36).slice(2, 11)}`,
          type: "function",
          function: {
            name,
            arguments: argsStr,
          }
        });
      } catch (e) { /* ignore */ }
    }

    return toolCalls;
  }
}

module.exports = { ToolParser };
