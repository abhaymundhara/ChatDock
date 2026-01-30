const fs = require("node:fs");
const path = require("node:path");
const { getActiveNotesDir, getScopeName } = require("./utils");

function handleNotesCommands(userMsg, state) {
  const normalizedMsg = userMsg.trim().toLowerCase();
  const notesDir = getActiveNotesDir(state);
  const scope = getScopeName(state);

  // 1. Save Note
  const saveCommands = ["save", "save it", "save this", "save note", "save that"];
  if (state.canSaveLastAnswer && saveCommands.includes(normalizedMsg)) {
    try {
      const now = new Date();
      const timestamp = now.toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
      const filename = `${timestamp}.md`;
      const filePath = path.join(notesDir, filename);

      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(notesDir))) {
        throw new Error("Sandbox violation");
      }

      fs.writeFileSync(filePath, state.lastAnswerContent, "utf-8");
      
      return {
        handled: true,
        response: `Saved. I've stored this as a note in the ${scope}. Anything else you'd like to do?`,
        newState: {
          ...state,
          canSaveLastAnswer: false,
          lastAnswerContent: "",
          awaitingConfirmation: false,
          pendingIntent: "",
          history: []
        }
      };
    } catch (err) {
      throw err;
    }
  }

  // 2. List Notes
  if (normalizedMsg === "list notes") {
    try {
      const files = fs.readdirSync(notesDir)
        .filter(f => f.endsWith(".md"))
        .map(f => {
          const stats = fs.statSync(path.join(notesDir, f));
          return { name: f, time: stats.birthtime };
        })
        .sort((a, b) => b.time - a.time);

      let response = "";
      if (files.length === 0) {
        response = `You don’t have any saved notes in the ${scope} yet.`;
      } else {
        response = `**Saved Notes (${scope}):**\n\n` + files.map(f => {
          const dateStr = f.time.toLocaleString();
          return `- \`${f.name}\` (Created: ${dateStr})`;
        }).join("\n");
      }
      return { handled: true, response };
    } catch (err) {
      throw err;
    }
  }

  // 3. Open Note
  if (normalizedMsg.startsWith("open note") || normalizedMsg.startsWith("open notes")) {
    const parts = userMsg.trim().split(/\s+/);
    let nameArg = parts.slice(2).join(" ").trim();

    if (!nameArg) {
      return {
        handled: true,
        response: `Please specify which note to open, e.g. 'open note 2026-01-30_21-34-12.md'. You can say 'list notes' to see available notes in the ${scope}.`
      };
    }

    try {
      let targetFile = nameArg;
      let filePath = path.join(notesDir, targetFile);
      if (!fs.existsSync(filePath)) {
        targetFile = nameArg + ".md";
        filePath = path.join(notesDir, targetFile);
      }

      if (!fs.existsSync(filePath)) {
        return { handled: true, response: `I couldn't find a note called '${nameArg}' in the ${scope} notes.` };
      }

      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(notesDir))) {
        throw new Error("Sandbox violation");
      }

      const content = fs.readFileSync(filePath, "utf-8");
      return { handled: true, response: `Here is the content of '${targetFile}' from the ${scope}:\n\n${content}` };
    } catch (err) {
      throw err;
    }
  }

  // 4. Delete Note
  if (normalizedMsg.startsWith("delete note") || normalizedMsg.startsWith("remove note")) {
    const parts = userMsg.trim().split(/\s+/);
    let nameArg = parts.slice(2).join(" ").trim();

    if (!nameArg) {
      return {
        handled: true,
        response: `Please specify which note to delete, e.g. 'delete note 2026-01-30_21-34-12.md'. You can say 'list notes' to see available notes in the ${scope}.`
      };
    }

    try {
      let targetFile = nameArg;
      let filePath = path.join(notesDir, targetFile);
      if (!fs.existsSync(filePath)) {
        targetFile = nameArg + ".md";
        filePath = path.join(notesDir, targetFile);
      }

      if (!fs.existsSync(filePath)) {
        return { handled: true, response: `I couldn't find a note called '${nameArg}' in the ${scope} notes.` };
      }

      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(notesDir))) {
        throw new Error("Sandbox violation");
      }

      fs.unlinkSync(filePath);
      return { handled: true, response: `I’ve deleted the note '${targetFile}' from the ${scope}.` };
    } catch (err) {
      throw err;
    }
  }

  // 5. Rename Note
  if (normalizedMsg.startsWith("rename note")) {
    const contentPart = userMsg.trim().slice("rename note".length).trim();
    const separatorRegex = /\s+(?:to|->)\s+/i;
    const parts = contentPart.split(separatorRegex);

    if (parts.length !== 2) {
      return {
        handled: true,
        response: "Please specify both the current and new note names, e.g. 'rename note 2026-01-30_21-34-12.md to meeting-notes.md'."
      };
    }

    let [oldName, newName] = parts.map(p => p.trim());

    try {
      let oldResolvedFile = oldName;
      let oldPath = path.join(notesDir, oldResolvedFile);
      if (!fs.existsSync(oldPath)) {
        oldResolvedFile = oldName + ".md";
        oldPath = path.join(notesDir, oldResolvedFile);
      }

      if (!fs.existsSync(oldPath)) {
        return { handled: true, response: `I couldn't find a note called '${oldName}' in the ${scope} notes.` };
      }

      let newResolvedFile = newName;
      if (!path.extname(newResolvedFile)) {
        newResolvedFile += ".md";
      }
      const newPath = path.join(notesDir, newResolvedFile);

      if (fs.existsSync(newPath)) {
        return { handled: true, response: `A note called '${newResolvedFile}' already exists in the ${scope} notes. Please choose a different name.` };
      }

      const resolvedOld = path.resolve(oldPath);
      const resolvedNew = path.resolve(newPath);
      const safeRoot = path.resolve(notesDir);
      if (!resolvedOld.startsWith(safeRoot) || !resolvedNew.startsWith(safeRoot)) {
        throw new Error("Sandbox violation");
      }

      fs.renameSync(oldPath, newPath);
      return { handled: true, response: `I’ve renamed the note '${oldResolvedFile}' to '${newResolvedFile}' in the ${scope}.` };
    } catch (err) {
      throw err;
    }
  }

  return { handled: false };
}

module.exports = { handleNotesCommands };
