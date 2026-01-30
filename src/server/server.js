// server.js - Intent Clarifier Mode with Workspace Sandboxed Save Note action
const http = require("node:http");
const express = require("express");
const cors = require("cors");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { chooseModel } = require("../shared/choose-model");
const { getServerConfig } = require("./utils/server-config");
const { handleCommand } = require("./commands/commandRouter");

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
const PROJECTS_DIR = path.join(WORKSPACE_ROOT, "projects");
const MEMORY_DIR = path.join(WORKSPACE_ROOT, "memory");

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
if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}
if (!fs.existsSync(MEMORY_DIR)) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

// Load prompts from external MD files
const PROMPTS_DIR = path.join(__dirname, "../../prompts");
const INTENT_CLARIFIER_SYSTEM_PROMPT = fs.readFileSync(path.join(PROMPTS_DIR, "intent_clarifier.md"), "utf-8");
const ANSWER_MODE_SYSTEM_PROMPT = fs.readFileSync(path.join(PROMPTS_DIR, "answer_mode.md"), "utf-8");

// State management
const sessionState = new Map(); // sessionId -> { history: [], awaitingConfirmation: bool, canSaveLastAnswer: bool, pendingIntent: string, lastAnswerContent: string, currentProjectSlug: string | null, pendingProjectDeletionSlug: string | null }

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
        lastAnswerContent: "",
        currentProjectSlug: null,
        pendingProjectDeletionSlug: null
      });
    }
    const state = sessionState.get(sessionId);

    // --- COMMAND INTERCEPTION LAYER ---
    const cmdResult = await handleCommand(userMsg, {
      ...state,
      WORKSPACE_ROOT,
      NOTES_DIR,
      DOCS_DIR,
      PROJECTS_DIR,
      MEMORY_DIR
    });

    if (cmdResult.handled) {
      if (cmdResult.newState) {
        sessionState.set(sessionId, cmdResult.newState);
      }
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.write(cmdResult.response);
      res.end();
      return;
    }

    // Always reset save capability if any other message is sent (and not handled as a command)
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
