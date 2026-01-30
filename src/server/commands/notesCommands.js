const fs = require("node:fs");
const path = require("node:path");

function handleNotesCommands(userMsg, state) {
  const normalizedMsg = userMsg.trim().toLowerCase();
  const { NOTES_DIR } = state;

  // 1. Save Note
  const saveCommands = ["save", "save it", "save this", "save note", "save that"];
  if (state.canSaveLastAnswer && saveCommands.includes(normalizedMsg)) {
    try {
      if (!fs.existsSync(NOTES_DIR)) {
        fs.mkdirSync(NOTES_DIR, { recursive: true });
      }
      const now = new Date();
      const timestamp = now.toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
      const filename = `${timestamp}.md`;
      const filePath = path.join(NOTES_DIR, filename);

      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(NOTES_DIR))) {
        throw new Error("Sandbox violation");
      }

      fs.writeFileSync(filePath, state.lastAnswerContent, "utf-8");
      
      return {
        handled: true,
        response: "Saved. I've cleared the current context. Anything else you'd like to do?",
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
      if (!fs.existsSync(NOTES_DIR)) {
        fs.mkdirSync(NOTES_DIR, { recursive: true });
      }
      const files = fs.readdirSync(NOTES_DIR)
        .filter(f => f.endsWith(".md"))
        .map(f => {
          const stats = fs.statSync(path.join(NOTES_DIR, f));
          return { name: f, time: stats.birthtime };
        })
        .sort((a, b) => b.time - a.time);

      let response = "";
      if (files.length === 0) {
        response = "You don’t have any saved notes yet.";
      } else {
        response = "**Your Saved Notes:**\n\n" + files.map(f => {
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
        response: "Please specify which note to open, e.g. 'open note 2026-01-30_21-34-12.md'. You can say 'list notes' to see available notes."
      };
    }

    try {
      let targetFile = nameArg;
      let filePath = path.join(NOTES_DIR, targetFile);
      if (!fs.existsSync(filePath)) {
        targetFile = nameArg + ".md";
        filePath = path.join(NOTES_DIR, targetFile);
      }

      if (!fs.existsSync(filePath)) {
        return { handled: true, response: `I couldn't find a note called '${nameArg}' in your notes workspace.` };
      }

      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(NOTES_DIR))) {
        throw new Error("Sandbox violation");
      }

      const content = fs.readFileSync(filePath, "utf-8");
      return { handled: true, response: `Here is the content of '${targetFile}':\n\n${content}` };
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
        response: "Please specify which note to delete, e.g. 'delete note 2026-01-30_21-34-12.md'. You can say 'list notes' to see available notes."
      };
    }

    try {
      let targetFile = nameArg;
      let filePath = path.join(NOTES_DIR, targetFile);
      if (!fs.existsSync(filePath)) {
        targetFile = nameArg + ".md";
        filePath = path.join(NOTES_DIR, targetFile);
      }

      if (!fs.existsSync(filePath)) {
        return { handled: true, response: `I couldn't find a note called '${nameArg}' in your notes workspace.` };
      }

      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(NOTES_DIR))) {
        throw new Error("Sandbox violation");
      }

      fs.unlinkSync(filePath);
      return { handled: true, response: `I’ve deleted the note '${targetFile}' from your workspace.` };
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
      let oldPath = path.join(NOTES_DIR, oldResolvedFile);
      if (!fs.existsSync(oldPath)) {
        oldResolvedFile = oldName + ".md";
        oldPath = path.join(NOTES_DIR, oldResolvedFile);
      }

      if (!fs.existsSync(oldPath)) {
        return { handled: true, response: `I couldn't find a note called '${oldName}' in your notes workspace.` };
      }

      let newResolvedFile = newName;
      if (!path.extname(newResolvedFile)) {
        newResolvedFile += ".md";
      }
      const newPath = path.join(NOTES_DIR, newResolvedFile);

      if (fs.existsSync(newPath)) {
        return { handled: true, response: `A note called '${newResolvedFile}' already exists in your notes workspace. Please choose a different name.` };
      }

      const resolvedOld = path.resolve(oldPath);
      const resolvedNew = path.resolve(newPath);
      const safeRoot = path.resolve(NOTES_DIR);
      if (!resolvedOld.startsWith(safeRoot) || !resolvedNew.startsWith(safeRoot)) {
        throw new Error("Sandbox violation");
      }

      fs.renameSync(oldPath, newPath);
      return { handled: true, response: `I’ve renamed the note '${oldResolvedFile}' to '${newResolvedFile}' in your workspace.` };
    } catch (err) {
      throw err;
    }
  }

  return { handled: false };
}

module.exports = { handleNotesCommands };
