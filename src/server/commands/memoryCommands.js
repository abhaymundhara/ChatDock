const fs = require("node:fs");
const path = require("node:path");
const { getActiveMemoryDir, getScopeName } = require("./utils");
const {
  searchMemories,
  saveMemoryEntry,
  loadMemoryConfig,
  saveMemoryConfig,
  DEFAULT_MEMORY_CONFIG
} = require("../utils/memoryTool");

function handleMemoryCommands(userMsg, state) {
  const normalizedMsg = userMsg.trim().toLowerCase();
  const memoryDir = getActiveMemoryDir(state);
  const scope = getScopeName(state);

  // 0. Auto Memory Toggle / Status
  if (
    normalizedMsg === "auto memory on" ||
    normalizedMsg === "enable auto memory"
  ) {
    saveMemoryConfig(state, { autoRemember: true });
    return {
      handled: true,
      response: "Auto memory is now **enabled**.",
      newState: { ...state, autoMemoryEnabled: true }
    };
  }

  if (
    normalizedMsg === "auto memory off" ||
    normalizedMsg === "disable auto memory"
  ) {
    saveMemoryConfig(state, { autoRemember: false });
    return {
      handled: true,
      response: "Auto memory is now **disabled**.",
      newState: { ...state, autoMemoryEnabled: false }
    };
  }

  if (normalizedMsg === "memory status") {
    const status = state.autoMemoryEnabled === false ? "disabled" : "enabled";
    const config = loadMemoryConfig(state);
    return {
      handled: true,
      response: `Auto memory is currently **${status}** for this session.\nConfig autoRemember: **${config.autoRemember ? "on" : "off"}**`
    };
  }

  // 0b. Memory Config
  if (normalizedMsg === "memory config" || normalizedMsg === "show memory config") {
    const config = loadMemoryConfig(state);
    return {
      handled: true,
      response: `**Memory Config (${scope}):**\n\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``
    };
  }

  if (normalizedMsg.startsWith("set memory ")) {
    const parts = userMsg.trim().split(/\s+/);
    const key = (parts[2] || "").toLowerCase();
    const value = parts.slice(3).join(" ").trim();

    if (!key || !value) {
      return {
        handled: true,
        response:
          "Usage: set memory <auto|preference-patterns|explicit-save|min-length|max-entries|recall-limit|search-limit> <value>"
      };
    }

    let update = null;
    let autoMemoryOverride = null;
    const normalizedValue = value.toLowerCase();

    if (key === "auto") {
      const isOn = ["on", "true", "yes", "enable", "enabled"].includes(normalizedValue);
      const isOff = ["off", "false", "no", "disable", "disabled"].includes(normalizedValue);
      if (isOn || isOff) {
        update = { autoRemember: isOn };
        autoMemoryOverride = isOn;
      }
    } else if (key === "preference-patterns" || key === "preferences") {
      const enabled = ["on", "true", "yes", "enable", "enabled"].includes(normalizedValue);
      const disabled = ["off", "false", "no", "disable", "disabled"].includes(normalizedValue);
      if (enabled || disabled) {
        update = { enablePreferencePatterns: enabled };
      }
    } else if (key === "explicit-save" || key === "explicit-patterns") {
      const enabled = ["on", "true", "yes", "enable", "enabled"].includes(normalizedValue);
      const disabled = ["off", "false", "no", "disable", "disabled"].includes(normalizedValue);
      if (enabled || disabled) {
        update = { enableExplicitSavePatterns: enabled };
      }
    } else if (key === "min-length") {
      const num = parseInt(value, 10);
      if (Number.isFinite(num) && num >= 0) {
        update = { minPreferenceLength: num };
      }
    } else if (key === "max-entries") {
      const num = parseInt(value, 10);
      if (Number.isFinite(num) && num >= 1) {
        update = { maxAutoEntriesPerMessage: num };
      }
    } else if (key === "recall-limit") {
      const num = parseInt(value, 10);
      if (Number.isFinite(num) && num >= 1) {
        update = { recallLimit: num };
      }
    } else if (key === "search-limit") {
      const num = parseInt(value, 10);
      if (Number.isFinite(num) && num >= 1) {
        update = { searchLimit: num };
      }
    }

    if (!update) {
      return {
        handled: true,
        response:
          "Invalid value. Example: `set memory auto on`, `set memory min-length 14`."
      };
    }

    const config = saveMemoryConfig(state, update);
    const nextState =
      autoMemoryOverride === null
        ? state
        : { ...state, autoMemoryEnabled: autoMemoryOverride };

    return {
      handled: true,
      response: `Memory config updated.\n\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``,
      newState: nextState
    };
  }

  if (normalizedMsg === "reset memory config") {
    const config = saveMemoryConfig(state, DEFAULT_MEMORY_CONFIG);
    return {
      handled: true,
      response: `Memory config reset to defaults.\n\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``,
      newState: { ...state, autoMemoryEnabled: config.autoRemember }
    };
  }

  // 1. Remember This
  if (normalizedMsg === "remember this" || normalizedMsg === "save to memory") {
    if (!state.lastAnswerContent) {
      return {
        handled: true,
        response: "I don't have anything recent to remember. Ask me something or have me generate a response first, then say 'remember this'."
      };
    }

    try {
      const result = saveMemoryEntry(state, {
        source: "assistant",
        text: state.lastAnswerContent
      });

      return {
        handled: true,
        response: `Got it. I've added this to your memory as entry ${result?.id} in the ${scope}.`
      };
    } catch (err) {
      throw err;
    }
  }

  // 2. List Memories
  if (normalizedMsg === "list memories" || normalizedMsg === "show memories") {
    try {
      const files = fs.readdirSync(memoryDir).filter(f => f.startsWith("memory-") && f.endsWith(".json"));

      if (files.length === 0) {
        return {
          handled: true,
          response: `You don't have any saved memories in the ${scope} yet. You can say 'remember this' after a response to store it.`
        };
      }

      const memories = files.map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(memoryDir, f), "utf-8"));
        } catch (e) { return null; }
      }).filter(Boolean).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      let response = `**Saved Memories (${scope}):**\n\n`;
      response += memories.map(m => {
        const dateStr = m.createdAt.split('T')[0];
        const preview = m.text.replace(/\n/g, ' ').slice(0, 80) + (m.text.length > 80 ? "..." : "");
        return `- **[${m.id}]** (${dateStr}): ${preview}`;
      }).join("\n");

      return { handled: true, response };
    } catch (err) {
      throw err;
    }
  }

  // 2b. Search / Recall Memories
  if (
    normalizedMsg.startsWith("search memories") ||
    normalizedMsg.startsWith("find memories") ||
    normalizedMsg.startsWith("recall")
  ) {
    const query = userMsg.replace(/^(search memories|find memories|recall)\s*/i, "").trim();
    if (!query) {
      return {
        handled: true,
        response: "Please provide a search query, e.g. `search memories postgres`."
      };
    }

    const matches = searchMemories(query, state, { limit: 5 });
    if (!matches.length) {
      return {
        handled: true,
        response: `No memories matched \"${query}\" in the ${scope}.`
      };
    }

    let response = `**Memory matches (${scope}):**\n\n`;
    response += matches
      .map((m) => {
        const dateStr = (m.createdAt || "").split("T")[0] || "unknown";
        const preview = String(m.text || "").replace(/\n/g, " ").slice(0, 80);
        return `- **[${m.id}]** (${dateStr}): ${preview}${m.text && m.text.length > 80 ? "..." : ""}`;
      })
      .join("\n");

    return { handled: true, response };
  }

  // 3. Forget Memory
  if (normalizedMsg.startsWith("forget memory") || normalizedMsg.startsWith("delete memory")) {
    const prefix = normalizedMsg.startsWith("forget memory") ? "forget memory" : "delete memory";
    const idArg = userMsg.trim().slice(prefix.length).trim();

    if (!idArg) {
      return {
        handled: true,
        response: `Please specify which memory to forget, e.g. 'forget memory 2026-01-30-221003'.`
      };
    }

    try {
      const fileName = `memory-${idArg}.json`;
      const filePath = path.join(memoryDir, fileName);

      // Security check
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(memoryDir))) {
        throw new Error("Sandbox violation");
      }

      if (!fs.existsSync(filePath)) {
        return {
          handled: true,
          response: `I couldn't find a memory with id '${idArg}' in the ${scope}.`
        };
      }

      fs.unlinkSync(filePath);
      return {
        handled: true,
        response: `I've forgotten the memory with id '${idArg}' from the ${scope}.`
      };
    } catch (err) {
      throw err;
    }
  }

  // 4. Show Memory
  if (normalizedMsg.startsWith("show memory") || normalizedMsg.startsWith("view memory")) {
    const prefix = normalizedMsg.startsWith("show memory") ? "show memory" : "view memory";
    const idArg = userMsg.trim().slice(prefix.length).trim();

    if (!idArg) {
      return {
        handled: true,
        response: `Please specify which memory to show, e.g. 'show memory 2026-01-30-221003'. You can say 'list memories' to see available ids in the ${scope}.`
      };
    }

    try {
      const fileName = `memory-${idArg}.json`;
      const filePath = path.join(memoryDir, fileName);

      // Security check
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(memoryDir))) {
        throw new Error("Sandbox violation");
      }

      if (!fs.existsSync(filePath)) {
        return {
          handled: true,
          response: `I couldn't find a memory with id '${idArg}' in the ${scope}.`
        };
      }

      const m = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const response = `**Memory ${m.id}** (created ${m.createdAt} in ${scope}):\n\n${m.text}`;

      return { handled: true, response };
    } catch (err) {
      throw err;
    }
  }

  return { handled: false };
}

module.exports = { handleMemoryCommands };
