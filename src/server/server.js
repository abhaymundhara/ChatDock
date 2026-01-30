// server.js - Intent Clarifier Mode with Confirmation & Proceed Gate
const http = require("node:http");
const express = require("express");
const cors = require("cors");
const fs = require("node:fs");
const path = require("node:path");
const { chooseModel } = require("../shared/choose-model");
const { getServerConfig } = require("./utils/server-config");

const {
  port: PORT,
  host: HOST,
  lastModelPath: LAST_MODEL_PATH,
} = getServerConfig();

const OLLAMA_BASE = process.env.OLLAMA_BASE || "http://127.0.0.1:11434";

// Load prompts from external MD files
const PROMPTS_DIR = path.join(__dirname, "../../prompts");
const INTENT_CLARIFIER_SYSTEM_PROMPT = fs.readFileSync(path.join(PROMPTS_DIR, "intent_clarifier.md"), "utf-8");
const ANSWER_MODE_SYSTEM_PROMPT = fs.readFileSync(path.join(PROMPTS_DIR, "answer_mode.md"), "utf-8");

// State management
const sessionState = new Map(); // sessionId -> { history: [], awaitingConfirmation: bool, awaitingProceed: bool, pendingIntent: string }

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

/* Simple Chat endpoint - Refactored for Intent Clarifier mode with Confirmation & Proceed Gate */
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
        awaitingProceed: false,
        pendingIntent: ""
      });
    }
    const state = sessionState.get(sessionId);
    
    let activeSystemPrompt = INTENT_CLARIFIER_SYSTEM_PROMPT;
    let isProceedCall = false;

    // Check for confirmation or proceed command
    if (state.awaitingConfirmation) {
      const confirmationRegex = /^(yes|yeah|correct|that's right|yep|ok|sure|confirm)$/i;
      if (confirmationRegex.test(userMsg.trim().toLowerCase())) {
        console.log(`[server] Confirmation detected for session ${sessionId}. Now awaiting "proceed".`);
        state.awaitingConfirmation = false;
        state.awaitingProceed = true;
        
        // Respond immediately with the proceed gate message
        const responseText = "Understood. Ready when you are.";
        state.history.push({ role: "user", content: userMsg });
        state.history.push({ role: "assistant", content: responseText });
        
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.write(responseText);
        res.end();
        return;
      } else {
        // Any other message breaks the flow
        console.log(`[server] New intent detected, breaking flow for session ${sessionId}.`);
        state.awaitingConfirmation = false;
        state.awaitingProceed = false;
        state.pendingIntent = "";
      }
    } else if (state.awaitingProceed) {
      if (userMsg.trim().toLowerCase() === "proceed") {
        console.log(`[server] Proceed detected for session ${sessionId}. Switching to Answer Mode.`);
        isProceedCall = true;
        activeSystemPrompt = ANSWER_MODE_SYSTEM_PROMPT;
        // Use the stored pending intent instead of the word "proceed"
        userMsg = state.pendingIntent;
        // Reset state
        state.awaitingProceed = false;
        state.pendingIntent = "";
      } else {
        // Any other message breaks the flow
        console.log(`[server] New intent detected during proceed gate, breaking flow for session ${sessionId}.`);
        state.awaitingProceed = false;
        state.pendingIntent = "";
      }
    }

    // Update history
    state.history.push({ role: "user", content: userMsg });
    if (state.history.length > 5) {
      state.history.splice(0, state.history.length - 5);
    }

    // Build messages for Ollama
    const messages = [
      { role: "system", content: activeSystemPrompt },
      ...state.history
    ];

    // Prepare request to Ollama
    const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: chosenModel,
        messages: messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    // Set up streaming response to client
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
          } catch (e) {
            // Ignore parse errors for partial JSON chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Save assistant message to history
    state.history.push({ role: "assistant", content: assistantMsg });

    // If we were in Clarifier mode, prepare for confirmation
    if (activeSystemPrompt === INTENT_CLARIFIER_SYSTEM_PROMPT) {
      // Extract the first sentence/line as the pending intent
      const lines = assistantMsg.split(/\n/);
      const firstLine = lines[0].trim();
      if (firstLine) {
        state.pendingIntent = firstLine;
        state.awaitingConfirmation = true;
        console.log(`[server] Awaiting confirmation for intent: "${state.pendingIntent}"`);
      }
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
  console.log(`[server] Intent Clarifier (with Proceed Gate) listening on http://${HOST}:${PORT}`);
  const last = loadLastModel();
  if (last) console.log(`[server] last chosen model: ${last}`);
});
