const fs = require("node:fs");
const path = require("node:path");
const { getActiveDocsDir, getScopeName } = require("./utils");

function handleDocsCommands(userMsg, state) {
  const normalizedMsg = userMsg.trim().toLowerCase();
  const docsDir = getActiveDocsDir(state);
  const scope = getScopeName(state);

  // 1. Save Document
  const saveDocCommands = ["save to docs", "save doc", "save document"];
  if (state.canSaveLastAnswer && saveDocCommands.includes(normalizedMsg)) {
    try {
      const now = new Date();
      const timestamp = now.toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
      const filename = `${timestamp}.md`;
      const filePath = path.join(docsDir, filename);

      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(docsDir))) {
        throw new Error("Sandbox violation");
      }

      fs.writeFileSync(filePath, state.lastAnswerContent, "utf-8");
      
      return {
        handled: true,
        response: `Saved. I’ve stored this as a document in the ${scope}.`,
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

  // 2. List Docs
  const listDocCommands = ["list docs", "show docs", "list documents"];
  if (listDocCommands.includes(normalizedMsg)) {
    try {
      const files = fs.readdirSync(docsDir)
        .filter(f => f.endsWith(".md"))
        .map(f => {
          const stats = fs.statSync(path.join(docsDir, f));
          return { name: f, time: stats.birthtime };
        })
        .sort((a, b) => b.time - a.time);

      let response = "";
      if (files.length === 0) {
        response = `You don't have any saved documents in the ${scope} yet.`;
      } else {
        response = `**Saved Documents (${scope}):**\n\n` + files.map(f => {
          const dateStr = f.time.toLocaleString();
          return `- \`${f.name}\` (Created: ${dateStr})`;
        }).join("\n");
      }
      return { handled: true, response };
    } catch (err) {
      throw err;
    }
  }

  // 3. Open Doc
  if (normalizedMsg.startsWith("open doc") || normalizedMsg.startsWith("open document")) {
    const parts = userMsg.trim().split(/\s+/);
    let nameArg = parts.slice(2).join(" ").trim();

    if (!nameArg) {
      return {
        handled: true,
        response: `Please specify which document to open, e.g. 'open doc 2026-01-30_22-10-03.md'. You can say 'list docs' to see available documents in the ${scope}.`
      };
    }

    try {
      let targetFile = nameArg;
      let filePath = path.join(docsDir, targetFile);
      if (!fs.existsSync(filePath)) {
        targetFile = nameArg + ".md";
        filePath = path.join(docsDir, targetFile);
      }

      if (!fs.existsSync(filePath)) {
        return { handled: true, response: `I couldn't find a document called '${nameArg}' in the ${scope}.` };
      }

      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(docsDir))) {
        throw new Error("Sandbox violation");
      }

      const content = fs.readFileSync(filePath, "utf-8");
      return { handled: true, response: `Here is the content of '${targetFile}' from the ${scope}:\n\n${content}` };
    } catch (err) {
      throw err;
    }
  }

  // 4. Delete Doc
  if (normalizedMsg.startsWith("delete doc") || normalizedMsg.startsWith("remove doc") || 
      normalizedMsg.startsWith("delete document") || normalizedMsg.startsWith("remove document")) {
    const parts = userMsg.trim().split(/\s+/);
    let nameArg = parts.slice(2).join(" ").trim();

    if (!nameArg) {
      return {
        handled: true,
        response: `Please specify which document to delete, e.g. 'delete doc 2026-01-30_22-10-03.md'. You can say 'list docs' to see available documents in the ${scope}.`
      };
    }

    try {
      let targetFile = nameArg;
      let filePath = path.join(docsDir, targetFile);
      if (!fs.existsSync(filePath)) {
        targetFile = nameArg + ".md";
        filePath = path.join(docsDir, targetFile);
      }

      if (!fs.existsSync(filePath)) {
        return { handled: true, response: `I couldn't find a document called '${nameArg}' in the ${scope}.` };
      }

      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(docsDir))) {
        throw new Error("Sandbox violation");
      }

      fs.unlinkSync(filePath);
      return { handled: true, response: `I’ve deleted the document '${targetFile}' from the ${scope}.` };
    } catch (err) {
      throw err;
    }
  }

  // 5. Rename Doc
  if (normalizedMsg.startsWith("rename doc") || normalizedMsg.startsWith("rename document")) {
    const prefix = normalizedMsg.startsWith("rename document") ? "rename document" : "rename doc";
    const contentPart = userMsg.trim().slice(prefix.length).trim();
    const separatorRegex = /\s+(?:to|->)\s+/i;
    const parts = contentPart.split(separatorRegex);

    if (parts.length !== 2) {
      return {
        handled: true,
        response: "Please specify both the current and new document names, e.g. 'rename doc 2026-01-30_22-10-03.md to summary.md'."
      };
    }

    let [oldName, newName] = parts.map(p => p.trim());

    try {
      let oldResolvedFile = oldName;
      let oldPath = path.join(docsDir, oldResolvedFile);
      if (!fs.existsSync(oldPath)) {
        oldResolvedFile = oldName + ".md";
        oldPath = path.join(docsDir, oldResolvedFile);
      }

      if (!fs.existsSync(oldPath)) {
        return { handled: true, response: `I couldn't find a document called '${oldName}' in the ${scope}.` };
      }

      let newResolvedFile = newName;
      if (!path.extname(newResolvedFile)) {
        newResolvedFile += ".md";
      }
      const newPath = path.join(docsDir, newResolvedFile);

      if (fs.existsSync(newPath)) {
        return { handled: true, response: `A document called '${newResolvedFile}' already exists in the ${scope}. Please choose a different name.` };
      }

      const resolvedOld = path.resolve(oldPath);
      const resolvedNew = path.resolve(newPath);
      const safeRoot = path.resolve(docsDir);
      if (!resolvedOld.startsWith(safeRoot) || !resolvedNew.startsWith(safeRoot)) {
        throw new Error("Sandbox violation");
      }

      fs.renameSync(oldPath, newPath);
      return { handled: true, response: `I’ve renamed the document '${oldResolvedFile}' to '${newResolvedFile}' in the ${scope}.` };
    } catch (err) {
      throw err;
    }
  }

  return { handled: false };
}

module.exports = { handleDocsCommands };
