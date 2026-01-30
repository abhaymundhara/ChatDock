// server.js - Intent Clarifier Mode
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

const INTENT_CLARIFIER_SYSTEM_PROMPT = `You are a minimal, reliable Intent Clarifier.

Your ONLY job is to:
1. Read the user’s message.
2. Rephrase what the user said in one simple, literal sentence,
   or say explicitly that their message is just a greeting if it contains no clear request.
3. Ask a single clarifying or confirming question about what they want you to help with.
4. STOP.

Rules:
- Do NOT execute actions.
- Do NOT suggest or mention tools.
- Do NOT plan multiple steps.
- Do NOT reference memory, files, or prior context.
- Do NOT infer extra intentions. Stay close to the exact words used.
- If the message is just a greeting (e.g. "hi", "hey", "hello"),
  respond like: "You greeted me. How can I help you today?"
- If the request is unclear, ask for clarification instead of guessing.
- Even if the request seems clear, still confirm.

Output format:
- One sentence restating the user's message or greeting,
- One clear, specific question about what they want you to do.`;

// Memory management
const conversationHistory = new Map(); // sessionId -> messages array

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

/* Simple Chat endpoint - Refactored for Intent Clarifier mode */
app.post("/chat", async (req, res) => {
  try {
    const userMsg = String(req.body?.message ?? "");
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

    // Get or create conversation history
    if (!conversationHistory.has(sessionId)) {
      conversationHistory.set(sessionId, []);
    }
    const history = conversationHistory.get(sessionId);
    
    // Add user message
    history.push({ role: "user", content: userMsg });

    // Keep only a short recent history (latest 5 messages)
    if (history.length > 5) {
      history.splice(0, history.length - 5);
    }

    // Build messages for Ollama with the Intent Clarifier System Prompt
    const messages = [
      { role: "system", content: INTENT_CLARIFIER_SYSTEM_PROMPT },
      ...history
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
    history.push({ role: "assistant", content: assistantMsg });
    res.end();
  } catch (err) {
    console.error("[chat] Error:", err);
    res.status(500).end("Server error: " + (err?.message || String(err)));
  }
});

/* Start server */
const server = http.createServer(app);
server.listen(PORT, HOST, () => {
  console.log(`[server] Intent Clarifier mode listening on http://${HOST}:${PORT}`);
  const last = loadLastModel();
  if (last) console.log(`[server] last chosen model: ${last}`);
});
