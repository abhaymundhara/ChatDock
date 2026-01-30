// server.js - Intent Clarifier Mode with Workspace Sandboxed Save Note action
const http = require("node:http");
const express = require("express");
const cors = require("cors");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { chooseModel } = require("../shared/choose-model");
const { getServerConfig } = require("./utils/server-config");

const {
  port: PORT,
  host: HOST,
  lastModelPath: LAST_MODEL_PATH,
} = getServerConfig();

const OLLAMA_BASE = process.env.OLLAMA_BASE || "http://127.0.0.1:11434";

// Workspace Configuration - Default to Desktop
const WORKSPACE_ROOT = path.join(os.homedir(), "Desktop", "chatdock_workspace");
const NOTES_DIR = path.join(WORKSPACE_ROOT, "notes");
const DOCS_DIR = path.join(WORKSPACE_ROOT, "docs");

// Ensure workspace directories exist
if (!fs.existsSync(WORKSPACE_ROOT)) {
  fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });
}
if (!fs.existsSync(NOTES_DIR)) {
  fs.mkdirSync(NOTES_DIR, { recursive: true });
}
if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

// Load prompts from external MD files
const PROMPTS_DIR = path.join(__dirname, "../../prompts");
const INTENT_CLARIFIER_SYSTEM_PROMPT = fs.readFileSync(path.join(PROMPTS_DIR, "intent_clarifier.md"), "utf-8");
const ANSWER_MODE_SYSTEM_PROMPT = fs.readFileSync(path.join(PROMPTS_DIR, "answer_mode.md"), "utf-8");

// State management
const sessionState = new Map(); // sessionId -> { history: [], awaitingConfirmation: bool, canSaveLastAnswer: bool, pendingIntent: string, lastAnswerContent: string }

// Persist the last user-chosen model between runs
function loadLastModel() {
  try {
    const v = fs.readFileSync(LAST_MODEL_PATH, "utf-8").trim();
    return v || null;
  } catch {
    return null;
  }
}

function saveLastModel(name) {
  try {
    fs.writeFileSync(LAST_MODEL_PATH, String(name), "utf-8");
  } catch (e) {
    console.warn("[server] failed to persist last model:", e?.message || String(e));
  }
}

const app = express();
app.use(cors());
app.use(express.json());

/* Health + model endpoints */
app.get("/health", async (_req, res) => {
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/version`, { method: "GET" });
    res.json({ server: true, ollama: r.ok });
  } catch {
    res.json({ server: true, ollama: false });
  }
});

app.get("/models", async (_req, res) => {
  const lastModel = loadLastModel();
  try {
    const upstream = await fetch(`${OLLAMA_BASE}/api/tags`, { method: "GET" });
    if (!upstream.ok) {
      return res.json({
        models: [],
        online: false,
        lastModel,
        error: `Upstream error: ${upstream.status} ${upstream.statusText}`,
      });
    }
    const data = await upstream.json().catch(() => ({}));
    const models = Array.isArray(data.models)
      ? data.models.map((m) => m.name).filter(Boolean)
      : [];
    res.json({ models, online: true, lastModel });
  } catch (err) {
    res.json({
      models: [],
      online: false,
      lastModel,
      error: err?.message || String(err),
    });
  }
});

app.post("/models/selected", (req, res) => {
  const model = String(req.body?.model || "").trim();
  if (!model) {
    return res.status(400).json({ ok: false, error: "Model is required" });
  }
  saveLastModel(model);
  return res.json({ ok: true, model });
});

/* Chat (streaming) */
app.post("/chat", async (req, res) => {
  try {
    let userMsg = String(req.body?.message ?? "");
    const requestedModel = req.body?.model ? String(req.body.model) : "";
    const sessionId = req.body?.sessionId || "default";
    const lastModel = loadLastModel();

    const chosenModel = chooseModel({
      requested: requestedModel,
      last: lastModel,
      available: [],
    });

    if (!chosenModel) {
      return res.status(400).json({
        error: "No model available. Install a model with Ollama and try again.",
      });
    }

    if (requestedModel && requestedModel !== lastModel) {
      saveLastModel(requestedModel);
    }

    // Get or create session state
    if (!sessionState.has(sessionId)) {
      sessionState.set(sessionId, {
        history: [],
        awaitingConfirmation: false,
        canSaveLastAnswer: false,
        pendingIntent: "",
        lastAnswerContent: ""
      });
    }
    const state = sessionState.get(sessionId);

    // --- COMMAND INTERCEPTION LAYER ---
    const normalizedMsg = userMsg.trim().toLowerCase();
    const saveCommands = ["save", "save it", "save this", "save note", "save that"];
    const saveDocCommands = ["save to docs", "save doc", "save document"];
    const exitCommands = ["no thanks", "no thank you", "nothing else", "that's all", "stop", "exit"];

    // Handle Save Note Commands
    if (state.canSaveLastAnswer && saveCommands.includes(normalizedMsg)) {
      console.log(`[server] Command Interception: Save note triggered for session ${sessionId}.`);
      try {
        if (!fs.existsSync(NOTES_DIR)) {
          fs.mkdirSync(NOTES_DIR, { recursive: true });
        }
        
        const now = new Date();
        const timestamp = now.toISOString()
          .replace(/T/, '_')
          .replace(/:/g, '-')
          .split('.')[0];
          
        const filename = `${timestamp}.md`;
        const filePath = path.join(NOTES_DIR, filename);

        const resolvedPath = path.resolve(filePath);
        if (!resolvedPath.startsWith(path.resolve(NOTES_DIR))) {
          throw new Error("Sandbox violation: Attempted to write outside of notes directory.");
        }

        fs.writeFileSync(filePath, state.lastAnswerContent, "utf-8");

        const successResponse = "Saved. I've cleared the current context. Anything else you'd like to do?";
        
        // Reset states AND clear history to prevent context bleed
        state.canSaveLastAnswer = false;
        state.lastAnswerContent = "";
        state.awaitingConfirmation = false;
        state.pendingIntent = "";
        state.history = []; // Clear history after completion
        
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.write(successResponse);
        res.end();
        return;
      } catch (err) {
        console.error("[server] Error in command interception save:", err);
        return res.status(500).end("Server error saving note: " + err.message);
      }
    }

    // Handle Save Doc Commands
    if (state.canSaveLastAnswer && saveDocCommands.includes(normalizedMsg)) {
      console.log(`[server] Command Interception: Save document triggered for session ${sessionId}.`);
      try {
        if (!fs.existsSync(DOCS_DIR)) {
          fs.mkdirSync(DOCS_DIR, { recursive: true });
        }
        
        const now = new Date();
        const timestamp = now.toISOString()
          .replace(/T/, '_')
          .replace(/:/g, '-')
          .split('.')[0];
          
        const filename = `${timestamp}.md`;
        const filePath = path.join(DOCS_DIR, filename);

        const resolvedPath = path.resolve(filePath);
        if (!resolvedPath.startsWith(path.resolve(DOCS_DIR))) {
          throw new Error("Sandbox violation: Attempted to write outside of docs directory.");
        }

        fs.writeFileSync(filePath, state.lastAnswerContent, "utf-8");

        const successResponse = "Saved. I’ve stored this as a document in your workspace.";
        
        // Reset states
        state.canSaveLastAnswer = false;
        state.lastAnswerContent = "";
        state.awaitingConfirmation = false;
        state.pendingIntent = "";
        state.history = []; // Clear history after completion
        
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.write(successResponse);
        res.end();
        return;
      } catch (err) {
        console.error("[server] Error in command interception save doc:", err);
        return res.status(500).end("Server error saving document: " + err.message);
      }
    }

    // Handle Exit/No Thanks Commands
    if (exitCommands.includes(normalizedMsg)) {
      console.log(`[server] Command Interception: Exit triggered for session ${sessionId}.`);
      const exitResponse = "Understood. I've reset our conversation context. Let me know if you need anything else!";
      
      state.canSaveLastAnswer = false;
      state.lastAnswerContent = "";
      state.awaitingConfirmation = false;
      state.pendingIntent = "";
      state.history = []; // Clear history
      
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.write(exitResponse);
      res.end();
      return;
    }

    // Handle List Notes Command
    if (normalizedMsg === "list notes") {
      console.log(`[server] Command Interception: List notes triggered for session ${sessionId}.`);
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
          .sort((a, b) => b.time - a.time); // Newest first

        let responseMsg = "";
        if (files.length === 0) {
          responseMsg = "You don’t have any saved notes yet.";
        } else {
          responseMsg = "**Your Saved Notes:**\n\n" + files.map(f => {
            const dateStr = f.time.toLocaleString();
            return `- \`${f.name}\` (Created: ${dateStr})`;
          }).join("\n");
        }

        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.write(responseMsg);
        res.end();
        return;
      } catch (err) {
        console.error("[server] Error listing notes:", err);
        return res.status(500).end("Server error listing notes: " + err.message);
      }
    }

    // Handle List Docs Command
    const listDocCommands = ["list docs", "show docs", "list documents"];
    if (listDocCommands.includes(normalizedMsg)) {
      console.log(`[server] Command Interception: List documents triggered for session ${sessionId}.`);
      try {
        if (!fs.existsSync(DOCS_DIR)) {
          fs.mkdirSync(DOCS_DIR, { recursive: true });
        }

        const files = fs.readdirSync(DOCS_DIR)
          .filter(f => f.endsWith(".md"))
          .map(f => {
            const stats = fs.statSync(path.join(DOCS_DIR, f));
            return { name: f, time: stats.birthtime };
          })
          .sort((a, b) => b.time - a.time); // Newest first

        let responseMsg = "";
        if (files.length === 0) {
          responseMsg = "You don't have any saved documents yet.";
        } else {
          responseMsg = "**Your Saved Documents:**\n\n" + files.map(f => {
            const dateStr = f.time.toLocaleString();
            return `- \`${f.name}\` (Created: ${dateStr})`;
          }).join("\n");
        }

        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.write(responseMsg);
        res.end();
        return;
      } catch (err) {
        console.error("[server] Error listing documents:", err);
        return res.status(500).end("Server error listing documents: " + err.message);
      }
    }

    // Handle Open Note Command
    if (normalizedMsg.startsWith("open note") || normalizedMsg.startsWith("open notes")) {
      console.log(`[server] Command Interception: Open note triggered for session ${sessionId}.`);
      
      const parts = userMsg.trim().split(/\s+/);
      // "open", "note(s)", "<name>"
      let nameArg = parts.slice(2).join(" ").trim();

      if (!nameArg) {
        const fallbackMsg = "Please specify which note to open, e.g. 'open note 2026-01-30_21-34-12.md'. You can say 'list notes' to see available notes.";
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.write(fallbackMsg);
        res.end();
        return;
      }

      try {
        let targetFile = nameArg;
        let filePath = path.join(NOTES_DIR, targetFile);
        
        // Resolve logic: exact or add .md
        if (!fs.existsSync(filePath)) {
          targetFile = nameArg + ".md";
          filePath = path.join(NOTES_DIR, targetFile);
        }

        if (!fs.existsSync(filePath)) {
          const errorMsg = `I couldn't find a note called '${nameArg}' in your notes workspace.`;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.write(errorMsg);
          res.end();
          return;
        }

        // Security check
        const resolvedPath = path.resolve(filePath);
        if (!resolvedPath.startsWith(path.resolve(NOTES_DIR))) {
          throw new Error("Sandbox violation");
        }

        const content = fs.readFileSync(filePath, "utf-8");
        const responseMsg = `Here is the content of '${targetFile}':\n\n${content}`;

        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.write(responseMsg);
        res.end();
        return;
      } catch (err) {
        console.error("[server] Error opening note:", err);
        return res.status(500).end("Server error opening note.");
      }
    }

    // Handle Open Doc Command
    if (normalizedMsg.startsWith("open doc") || normalizedMsg.startsWith("open document")) {
      console.log(`[server] Command Interception: Open document triggered for session ${sessionId}.`);
      
      const parts = userMsg.trim().split(/\s+/);
      // "open", "doc(s)", "<name>"
      let nameArg = parts.slice(2).join(" ").trim();

      if (!nameArg) {
        const fallbackMsg = "Please specify which document to open, e.g. 'open doc 2026-01-30_22-10-03.md'. You can say 'list docs' to see available documents.";
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.write(fallbackMsg);
        res.end();
        return;
      }

      try {
        let targetFile = nameArg;
        let filePath = path.join(DOCS_DIR, targetFile);
        
        // Resolve logic: exact or add .md
        if (!fs.existsSync(filePath)) {
          targetFile = nameArg + ".md";
          filePath = path.join(DOCS_DIR, targetFile);
        }

        if (!fs.existsSync(filePath)) {
          const errorMsg = `I couldn't find a document called '${nameArg}' in your workspace.`;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.write(errorMsg);
          res.end();
          return;
        }

        // Security check
        const resolvedPath = path.resolve(filePath);
        if (!resolvedPath.startsWith(path.resolve(DOCS_DIR))) {
          throw new Error("Sandbox violation");
        }

        const content = fs.readFileSync(filePath, "utf-8");
        const responseMsg = `Here is the content of '${targetFile}':\n\n${content}`;

        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.write(responseMsg);
        res.end();
        return;
      } catch (err) {
        console.error("[server] Error opening document:", err);
        return res.status(500).end("Server error opening document.");
      }
    }

    // Handle Delete Note Command
    if (normalizedMsg.startsWith("delete note") || normalizedMsg.startsWith("remove note")) {
      console.log(`[server] Command Interception: Delete note triggered for session ${sessionId}.`);
      
      const parts = userMsg.trim().split(/\s+/);
      // "delete/remove", "note", "<name>"
      let nameArg = parts.slice(2).join(" ").trim();

      if (!nameArg) {
        const fallbackMsg = "Please specify which note to delete, e.g. 'delete note 2026-01-30_21-34-12.md'. You can say 'list notes' to see available notes.";
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.write(fallbackMsg);
        res.end();
        return;
      }

      try {
        let targetFile = nameArg;
        let filePath = path.join(NOTES_DIR, targetFile);
        
        // Resolve logic: exact or add .md
        if (!fs.existsSync(filePath)) {
          targetFile = nameArg + ".md";
          filePath = path.join(NOTES_DIR, targetFile);
        }

        if (!fs.existsSync(filePath)) {
          const errorMsg = `I couldn't find a note called '${nameArg}' in your notes workspace.`;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.write(errorMsg);
          res.end();
          return;
        }

        // Security check: ensure path is within NOTES_DIR
        const resolvedPath = path.resolve(filePath);
        if (!resolvedPath.startsWith(path.resolve(NOTES_DIR))) {
          throw new Error("Sandbox violation: Attempted to delete outside of notes directory.");
        }

        fs.unlinkSync(filePath);
        const successResponse = `I’ve deleted the note '${targetFile}' from your workspace.`;
        
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.write(successResponse);
        res.end();
        return;
      } catch (err) {
        console.error("[server] Error deleting note:", err);
        return res.status(500).end("Server error deleting note.");
      }
    }

    // Handle Rename Note Command
    if (normalizedMsg.startsWith("rename note")) {
      console.log(`[server] Command Interception: Rename note triggered for session ${sessionId}.`);
      
      const contentPart = userMsg.trim().slice("rename note".length).trim();
      const separatorRegex = /\s+(?:to|->)\s+/i;
      const parts = contentPart.split(separatorRegex);

      if (parts.length !== 2) {
        const errorMsg = "Please specify both the current and new note names, e.g. 'rename note 2026-01-30_21-34-12.md to meeting-notes.md'.";
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.write(errorMsg);
        res.end();
        return;
      }

      let [oldName, newName] = parts.map(p => p.trim());

      try {
        // Resolve Source
        let oldResolvedFile = oldName;
        let oldPath = path.join(NOTES_DIR, oldResolvedFile);
        if (!fs.existsSync(oldPath)) {
          oldResolvedFile = oldName + ".md";
          oldPath = path.join(NOTES_DIR, oldResolvedFile);
        }

        if (!fs.existsSync(oldPath)) {
          const errorMsg = `I couldn't find a note called '${oldName}' in your notes workspace.`;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.write(errorMsg);
          res.end();
          return;
        }

        // Resolve Destination
        let newResolvedFile = newName;
        if (!path.extname(newResolvedFile)) {
          newResolvedFile += ".md";
        }
        const newPath = path.join(NOTES_DIR, newResolvedFile);

        if (fs.existsSync(newPath)) {
          const errorMsg = `A note called '${newResolvedFile}' already exists in your notes workspace. Please choose a different name.`;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.write(errorMsg);
          res.end();
          return;
        }

        // Security check
        const resolvedOld = path.resolve(oldPath);
        const resolvedNew = path.resolve(newPath);
        const safeRoot = path.resolve(NOTES_DIR);
        if (!resolvedOld.startsWith(safeRoot) || !resolvedNew.startsWith(safeRoot)) {
          throw new Error("Sandbox violation");
        }

        fs.renameSync(oldPath, newPath);
        const successMsg = `I’ve renamed the note '${oldResolvedFile}' to '${newResolvedFile}' in your workspace.`;
        
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.write(successMsg);
        res.end();
        return;
      } catch (err) {
        console.error("[server] Error renaming note:", err);
        return res.status(500).end("Server error renaming note.");
      }
    }

    // Handle Delete Doc Command
    if (normalizedMsg.startsWith("delete doc") || normalizedMsg.startsWith("remove doc") || 
        normalizedMsg.startsWith("delete document") || normalizedMsg.startsWith("remove document")) {
      console.log(`[server] Command Interception: Delete document triggered for session ${sessionId}.`);
      
      const parts = userMsg.trim().split(/\s+/);
      // "delete/remove", "doc/document", "<name>"
      let nameArg = parts.slice(2).join(" ").trim();

      if (!nameArg) {
        const fallbackMsg = "Please specify which document to delete, e.g. 'delete doc 2026-01-30_22-10-03.md'. You can say 'list docs' to see available documents.";
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.write(fallbackMsg);
        res.end();
        return;
      }

      try {
        let targetFile = nameArg;
        let filePath = path.join(DOCS_DIR, targetFile);
        
        // Resolve logic: exact or add .md
        if (!fs.existsSync(filePath)) {
          targetFile = nameArg + ".md";
          filePath = path.join(DOCS_DIR, targetFile);
        }

        if (!fs.existsSync(filePath)) {
          const errorMsg = `I couldn't find a document called '${nameArg}' in your workspace.`;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.write(errorMsg);
          res.end();
          return;
        }

        // Security check: ensure path is within DOCS_DIR
        const resolvedPath = path.resolve(filePath);
        if (!resolvedPath.startsWith(path.resolve(DOCS_DIR))) {
          throw new Error("Sandbox violation: Attempted to delete outside of docs directory.");
        }

        fs.unlinkSync(filePath);
        const successResponse = `I’ve deleted the document '${targetFile}' from your workspace.`;
        
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.write(successResponse);
        res.end();
        return;
      } catch (err) {
        console.error("[server] Error deleting document:", err);
        return res.status(500).end("Server error deleting document.");
      }
    }

    // Handle Rename Doc Command
    if (normalizedMsg.startsWith("rename doc") || normalizedMsg.startsWith("rename document")) {
      console.log(`[server] Command Interception: Rename document triggered for session ${sessionId}.`);
      
      const prefix = normalizedMsg.startsWith("rename document") ? "rename document" : "rename doc";
      const contentPart = userMsg.trim().slice(prefix.length).trim();
      const separatorRegex = /\s+(?:to|->)\s+/i;
      const parts = contentPart.split(separatorRegex);

      if (parts.length !== 2) {
        const errorMsg = "Please specify both the current and new document names, e.g. 'rename doc 2026-01-30_22-10-03.md to summary.md'.";
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.write(errorMsg);
        res.end();
        return;
      }

      let [oldName, newName] = parts.map(p => p.trim());

      try {
        // Resolve Source
        let oldResolvedFile = oldName;
        let oldPath = path.join(DOCS_DIR, oldResolvedFile);
        if (!fs.existsSync(oldPath)) {
          oldResolvedFile = oldName + ".md";
          oldPath = path.join(DOCS_DIR, oldResolvedFile);
        }

        if (!fs.existsSync(oldPath)) {
          const errorMsg = `I couldn't find a document called '${oldName}' in your workspace.`;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.write(errorMsg);
          res.end();
          return;
        }

        // Resolve Destination
        let newResolvedFile = newName;
        if (!path.extname(newResolvedFile)) {
          newResolvedFile += ".md";
        }
        const newPath = path.join(DOCS_DIR, newResolvedFile);

        if (fs.existsSync(newPath)) {
          const errorMsg = `A document called '${newResolvedFile}' already exists in your workspace. Please choose a different name.`;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.write(errorMsg);
          res.end();
          return;
        }

        // Security check
        const resolvedOld = path.resolve(oldPath);
        const resolvedNew = path.resolve(newPath);
        const safeRoot = path.resolve(DOCS_DIR);
        if (!resolvedOld.startsWith(safeRoot) || !resolvedNew.startsWith(safeRoot)) {
          throw new Error("Sandbox violation");
        }

        fs.renameSync(oldPath, newPath);
        const successMsg = `I’ve renamed the document '${oldResolvedFile}' to '${newResolvedFile}' in your workspace.`;
        
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.write(successMsg);
        res.end();
        return;
      } catch (err) {
        console.error("[server] Error renaming document:", err);
        return res.status(500).end("Server error renaming document.");
      }
    }

    // Always reset save capability if any other message is sent
    state.canSaveLastAnswer = false;

    // --- EXISTING FLOWS (Clarify -> Confirm) ---
    let activeSystemPrompt = INTENT_CLARIFIER_SYSTEM_PROMPT;
    let isAnswerModeCall = false;

    // 1. Handle confirmation
    if (state.awaitingConfirmation) {
      const confirmationRegex = /^(yes|yeah|correct|that's right|yep|ok|sure|confirm)$/i;
      if (confirmationRegex.test(userMsg.trim().toLowerCase())) {
        console.log(`[server] Confirmation detected for session ${sessionId}. Switching to Answer Mode.`);
        isAnswerModeCall = true;
        activeSystemPrompt = ANSWER_MODE_SYSTEM_PROMPT;
        // Use the stored pending intent instead of the raw confirmation word
        userMsg = state.pendingIntent;
        // Reset confirmation state
        state.awaitingConfirmation = false;
        state.pendingIntent = "";
      } else {
        // Any other message breaks the confirmation flow and starts a new intent search
        console.log(`[server] New intent detected, breaking confirmation flow for session ${sessionId}.`);
        state.awaitingConfirmation = false;
        state.pendingIntent = "";
      }
    }

    // --- LLM INTERACTION ---

    // Update history
    state.history.push({ role: "user", content: userMsg });
    if (state.history.length > 5) {
      state.history.splice(0, state.history.length - 5);
    }

    const messages = [
      { role: "system", content: activeSystemPrompt },
      ...state.history
    ];

    const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: chosenModel,
        messages: messages,
        stream: true,
      }),
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantMsg = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              const content = data.message.content;
              assistantMsg += content;
              res.write(content);
            }
          } catch (e) {}
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Update history with raw assistant message
    state.history.push({ role: "assistant", content: assistantMsg });

    // --- POST-LLM LOGIC ---

    if (activeSystemPrompt === INTENT_CLARIFIER_SYSTEM_PROMPT) {
      const lines = assistantMsg.split(/\n/);
      const firstLine = lines[0].trim();
      if (firstLine) {
        state.pendingIntent = firstLine;
        state.awaitingConfirmation = true;
      }
    } else if (isAnswerModeCall) {
      // Answer Mode completed - Prepare for sandboxed save
      const saveInstruction = "\n\nIf you’d like, say 'save' to keep this as a note, or 'save doc' to store it as a document.";
      state.lastAnswerContent = assistantMsg;
      state.canSaveLastAnswer = true;
      
      // Send instructional line to client
      res.write(saveInstruction);
      
      // Append to history record so it matches UI
      state.history[state.history.length - 1].content += saveInstruction;
    }

    res.end();
  } catch (err) {
    console.error("[chat] Error:", err);
    res.status(500).end("Server error: " + (err?.message || String(err)));
  }
});

/* Start server */
const server = http.createServer(app);
server.listen(PORT, HOST, () => {
  console.log(`[server] Intent Clarifier (Workspace Enabled) listening on http://${HOST}:${PORT}`);
  console.log(`[server] Workspace root: ${WORKSPACE_ROOT}`);
});
