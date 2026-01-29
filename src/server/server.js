// server.js - Simple Ollama Chat Server
const http = require("node:http");
const express = require("express");
const cors = require("cors");
const fs = require("node:fs");
const path = require("node:path");
const { chooseModel } = require("../shared/choose-model");
const { getServerConfig } = require("./utils/server-config");

// Multi-agent orchestration
const { Planner } = require("./orchestrator/planner");
const { Orchestrator } = require("./orchestrator/orchestrator");

const {
  port: PORT,
  host: HOST,
  lastModelPath: LAST_MODEL_PATH,
} = getServerConfig();

const OLLAMA_BASE = process.env.OLLAMA_BASE || "http://127.0.0.1:11434";

// Memory management
const conversationHistory = new Map(); // sessionId -> messages array

function getMemoryPath() {
  const appPath =
    process.env.CHATDOCK_APP_PATH || path.join(__dirname, "../..");
  return path.join(appPath, "memory", "daily");
}

function getTodayLogPath() {
  const memoryPath = getMemoryPath();
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  return path.join(memoryPath, `${today}.md`);
}

function getYesterdayLogPath() {
  const memoryPath = getMemoryPath();
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  return path.join(memoryPath, `${yesterday}.md`);
}

function loadDailyLogs() {
  const logs = [];

  // Load yesterday's log
  const yesterdayPath = getYesterdayLogPath();
  if (fs.existsSync(yesterdayPath)) {
    const content = fs.readFileSync(yesterdayPath, "utf-8");
    logs.push(`# Yesterday's Log\n\n${content}`);
  }

  // Load today's log
  const todayPath = getTodayLogPath();
  if (fs.existsSync(todayPath)) {
    const content = fs.readFileSync(todayPath, "utf-8");
    logs.push(`# Today's Log\n\n${content}`);
  }

  return logs.length > 0 ? logs.join("\n\n---\n\n") : "";
}

function appendToTodayLog(userMsg, assistantMsg) {
  try {
    const memoryPath = getMemoryPath();
    if (!fs.existsSync(memoryPath)) {
      fs.mkdirSync(memoryPath, { recursive: true });
    }

    const todayPath = getTodayLogPath();
    const timestamp = new Date().toISOString();
    const entry = `\n## ${timestamp}\n\n**User:** ${userMsg}\n\n**Assistant:** ${assistantMsg}\n`;

    fs.appendFileSync(todayPath, entry, "utf-8");
  } catch (e) {
    console.warn("[server] Failed to write to daily log:", e.message);
  }
}

// Load brain files as context (moltbot-style)
function loadBrainContext() {
  try {
    const appPath =
      process.env.CHATDOCK_APP_PATH || path.join(__dirname, "../..");
    const brainPath = path.join(appPath, "brain");

    const files = ["SOUL.md"];
    const context = [];

    for (const file of files) {
      const filePath = path.join(brainPath, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        context.push(`# ${file}\n\n${content}`);
      }
    }

    return context.join("\n\n---\n\n");
  } catch (e) {
    console.warn("[server] Could not load brain context:", e.message);
    return "You are ChatDock, a helpful AI assistant.";
  }
}

const BRAIN_CONTEXT = loadBrainContext();
console.log("[server] Loaded brain context (SOUL.md)");

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
    console.warn(
      "[server] failed to persist last model:",
      e?.message || String(e),
    );
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

/* Tools endpoint */
app.get("/tools", (_req, res) => {
  res.json({
    tools: tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
    })),
  });
});

/* Multi-agent chat endpoint (Phase 1-2 testing) */
app.post("/chat/agent", async (req, res) => {
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

    // Get or create conversation history
    if (!conversationHistory.has(sessionId)) {
      conversationHistory.set(sessionId, []);
    }
    const history = conversationHistory.get(sessionId);

    // Add user message
    history.push({ role: "user", content: userMsg });

    // Create planner and orchestrator
    const planner = new Planner({ model: chosenModel });
    const orchestrator = new Orchestrator({ model: chosenModel });

    // Step 1: Planner analyzes intent
    console.log("[agent] Planner analyzing request...");
    const plan = await planner.plan(history, { model: chosenModel });
    console.log("[agent] Planner result:", plan.type);

    // Step 2: Orchestrator processes plan (handles conversation, clarification, and task spawning)
    const result = await orchestrator.process(plan, { model: chosenModel });

    // Add assistant response to history
    history.push({ role: "assistant", content: result.content });

    // Keep only last 20 messages
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    // Append to daily log
    appendToTodayLog(userMsg, result.content);

    // Return result
    return res.json({
      response: result.content,
      type: result.type,
      model: chosenModel,
      ...(result.todos && { todos: result.todos }),
      ...(result.results && { results: result.results }),
      ...(result.summary && { summary: result.summary }),
      ...(result.question && { question: result.question }),
      ...(result.options && { options: result.options }),
    });
  } catch (error) {
    console.error("[agent] Error:", error);
    return res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

/* Chat (streaming) - Now uses multi-agent architecture */
app.post("/chat", async (req, res) => {
  try {
    const userMsg = String(req.body?.message ?? "");
    console.log("[chat] Received message:", userMsg);
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
    history.push({ role: "user", content: userMsg });

    // Keep only last 20 messages
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    // Use multi-agent architecture
    console.log("[chat] Using multi-agent: Planner → Orchestrator");
    const planner = new Planner({ model: chosenModel });
    const orchestrator = new Orchestrator({ model: chosenModel });

    const plan = await planner.plan(history, { model: chosenModel });
    const result = await orchestrator.process(plan, { model: chosenModel });

    // Handle clarification responses
    if (result.type === "clarification") {
      const questionText = `${result.question}\n\nOptions:\n${result.options?.map((opt, i) => `${i + 1}. ${opt.label}: ${opt.description}`).join("\n") || "No options provided"}`;

      history.push({ role: "assistant", content: questionText });
      appendToTodayLog(userMsg, questionText);

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.write(questionText);
      res.end();
      return;
    }

    // Handle normal responses
    history.push({ role: "assistant", content: result.content });
    appendToTodayLog(userMsg, result.content);

    // Send as text for backward compatibility with UI
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.write(result.content);
    res.end();
  } catch (err) {
    console.error("[chat] Error:", err);
    res.status(500).end("Server error: " + (err?.message || String(err)));
  }
});

/* Start server */
(() => {
  const server = http.createServer(app);

  server.on("error", (err) => {
    console.error("[server] failed to start server:", err);
    process.exit(1);
  });

  server.listen(PORT, HOST, () => {
    process.env.CHAT_SERVER_PORT = String(PORT);
    process.env.CHAT_SERVER_HOST = HOST;
    console.log(`[server] listening on http://${HOST}:${PORT}`);
    const last = loadLastModel();
    if (last) {
      console.log(`[server] last chosen model: ${last}`);
    } else {
      console.log(
        "[server] no last model chosen; requests must include a 'model' field",
      );
    }
  });
})();
