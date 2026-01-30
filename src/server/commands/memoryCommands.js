const fs = require("node:fs");
const path = require("node:path");
const { getActiveMemoryDir, getScopeName } = require("./utils");

function handleMemoryCommands(userMsg, state) {
  const normalizedMsg = userMsg.trim().toLowerCase();
  const memoryDir = getActiveMemoryDir(state);
  const scope = getScopeName(state);

  // 1. Remember This
  if (normalizedMsg === "remember this" || normalizedMsg === "save to memory") {
    if (!state.lastAnswerContent) {
      return {
        handled: true,
        response: "I don't have anything recent to remember. Ask me something or have me generate a response first, then say 'remember this'."
      };
    }

    try {
      const id = new Date().toISOString().replace(/[:T.]/g, '-').slice(0, 19);
      const memoryObj = {
        id: id,
        createdAt: new Date().toISOString(),
        source: "assistant",
        text: state.lastAnswerContent
      };

      const filePath = path.join(memoryDir, `memory-${id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(memoryObj, null, 2), "utf-8");

      return {
        handled: true,
        response: `Got it. I've added this to your memory as entry ${id} in the ${scope}.`
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
