/**
 * ChatDock Server with Orchestrator Integration
 * Combines the original server with the new agentic orchestrator
 */

const http = require("node:http");
const express = require("express");
const cors = require("cors");
const fs = require("node:fs");
const path = require("node:path");
const { findAvailablePort } = require("../shared/port-allocator");
const { chooseModel } = require("../renderer/components/model-selection");
const { loadSettings } = require("./utils/settings-store");
const { createAuthMiddleware } = require("./utils/auth");
const { ConfirmationStore } = require("./utils/confirmation-store");
const { Orchestrator, OllamaClient, ToolRegistry, SkillLoader, PromptBuilder } = require("./orchestrator");

const PORT = Number(process.env.CHAT_SERVER_PORT || 3001);
const OLLAMA_BASE = process.env.OLLAMA_BASE || "http://127.0.0.1:11434";
const confirmationStore = new ConfirmationStore();

// ===== Model Persistence =====
const LAST_MODEL_PATH = path.join(__dirname, "../../config/last_model.txt");

function loadLastModel() {
  try {
    return fs.readFileSync(LAST_MODEL_PATH, "utf-8").trim() || null;
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

// ===== System Prompt =====
const PROMPT_PATH = path.join(__dirname, "../../assets/prompt.txt");
let SYSTEM_PROMPT = "";
try {
  SYSTEM_PROMPT = fs.readFileSync(PROMPT_PATH, "utf-8");
  if (SYSTEM_PROMPT.trim().length > 0) {
    console.log("[server] Loaded system prompt from prompt.txt");
  }
} catch {
  console.warn("[server] No prompt.txt found; using default prompt");
}

// ===== Initialize Orchestrator =====
const orchestrator = new Orchestrator({
  ollamaClient: new OllamaClient({ 
    baseUrl: OLLAMA_BASE,
    model: loadLastModel() || 'nemotron-3-nano:30b'
  }),
  onStateChange: ({ from, to }) => {
    console.log(`[orchestrator] ${from} -> ${to}`);
  },
  onToolCall: (toolCall) => {
    console.log(`[orchestrator] Tool: ${toolCall.function?.name || toolCall.name}`);
  }
});

// Initialize tools and skills
(async () => {
  try {
    const result = await orchestrator.initialize();
    console.log(`[orchestrator] Initialized: ${result.toolCount} tools, ${result.skillCount} skills`);
  } catch (e) {
    console.warn("[orchestrator] Failed to initialize:", e.message);
  }
})();

// ===== Express App =====
const app = express();
app.use(cors());
app.use(express.json());
app.use(
  createAuthMiddleware({
    apiKey: process.env.CHATDOCK_API_KEY,
    allowedIps: process.env.CHATDOCK_ALLOWED_IPS || "",
  }),
);

// ===== Health Endpoint =====
app.get("/health", async (_req, res) => {
  try {
    const health = await orchestrator.ollama.healthCheck();
    res.json({ 
      server: true, 
      ollama: health.ok,
      ollamaVersion: health.version,
      orchestrator: orchestrator.getState(),
      toolCount: orchestrator.tools.count()
    });
  } catch {
    res.json({ server: true, ollama: false });
  }
});

// ===== Models Endpoint =====
app.get("/models", async (_req, res) => {
  const lastModel = loadLastModel();
  try {
    const models = await orchestrator.ollama.listModels();
    res.json({ 
      models, 
      online: true, 
      lastModel,
      toolCount: orchestrator.tools.count()
    });
  } catch (err) {
    res.json({
      models: [],
      online: false,
      lastModel,
      error: err?.message || String(err)
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

// ===== Chat Endpoint (Streaming) =====
app.post("/chat", async (req, res) => {
  try {
    const userMsg = String(req.body?.message ?? "");
    const requestedModel = req.body?.model ? String(req.body.model) : "";
    const lastModel = loadLastModel();
    const useOrchestrator = req.body?.useOrchestrator !== false;
    
    // Choose model
    let availableModels = [];
    if (!requestedModel && !lastModel) {
      availableModels = await orchestrator.ollama.listModels();
    }
    
    const chosenModel = chooseModel({
      requested: requestedModel,
      last: lastModel,
      available: availableModels
    });

    if (!chosenModel) {
      return res.status(400).json({
        error: "No model available. Install a model with Ollama and try again."
      });
    }

    if (requestedModel && requestedModel !== lastModel) {
      saveLastModel(requestedModel);
    }

    // Get settings
    const settings = loadSettings(process.env.USER_DATA_PATH || __dirname);
    const systemPrompt = settings.systemPrompt || SYSTEM_PROMPT;
    const temperature = typeof settings.temperature === "number" ? settings.temperature : 0.7;

    // Use simple streaming for now (orchestrator integration can be added for tool calls)
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Accel-Buffering", "no");

    const messages = [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      { role: "user", content: userMsg }
    ];

    // Stream response
    for await (const chunk of orchestrator.ollama.chatStream(messages, { 
      model: chosenModel, 
      temperature 
    })) {
      res.write(chunk.content);
    }
    
    res.end();
    
  } catch (err) {
    console.error("[server] Chat error:", err);
    res.status(500).end("Server error: " + (err?.message || String(err)));
  }
});

// ===== Agentic Chat Endpoint (with tool calling) =====
app.post("/chat/agent", async (req, res) => {
  try {
    const userMsg = String(req.body?.message ?? "");
    const chosenModel = req.body?.model || loadLastModel() || "nemotron-3-nano:30b";
    
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    
    // Process through orchestrator
    for await (const event of orchestrator.process(userMsg, { 
      model: chosenModel,
      cwd: process.cwd()
    })) {
      res.write(JSON.stringify(event) + "\n");
    }
    
    res.end();
    
  } catch (err) {
    console.error("[server] Agent error:", err);
    res.json({ type: "error", data: { message: err?.message || String(err) } });
    res.end();
  }
});

// ===== Tools Endpoint =====
app.get("/tools", (_req, res) => {
  const tools = orchestrator.tools.getDefinitions();
  res.json({ count: tools.length, tools });
});

app.post("/tools/execute", async (req, res) => {
  try {
    const { name, params, confirmationId } = req.body;
    const tool = orchestrator.tools.get(name);

    if (!tool) {
      return res.status(404).json({ error: `Tool not found: ${name}` });
    }

    if (tool.requiresConfirmation) {
      if (!confirmationId) {
        const { id, expiresAt } = confirmationStore.issue(name, params);
        return res.json({
          requiresConfirmation: true,
          confirmationId: id,
          expiresAt,
          tool: name,
          params,
        });
      }
      const ok = confirmationStore.verify(confirmationId, name, params);
      if (!ok) {
        return res.status(403).json({ error: "Invalid or expired confirmation" });
      }
    }

    const result = await orchestrator.tools.execute(name, params);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// ===== Skills Endpoint =====
app.get("/skills", (_req, res) => {
  const skills = orchestrator.skills.getDefinitions();
  res.json({ count: skills.length, skills });
});

// ===== Start Server =====
(async () => {
  const port = await findAvailablePort(PORT);
  if (port !== PORT) {
    process.env.CHAT_SERVER_PORT = String(port);
  }
  
  const server = http.createServer(app);
  
  let attemptPort = port;
  const maxAttempts = 50;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (err) => {
          server.removeListener("listening", onListen);
          reject(err);
        };
        const onListen = () => {
          server.removeListener("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListen);
        server.listen(attemptPort);
      });
      
      process.env.CHAT_SERVER_PORT = String(attemptPort);
      console.log(`[server] listening on http://127.0.0.1:${attemptPort}`);
      console.log(`[server] Tools: ${orchestrator.tools.count()}`);
      console.log(`[server] Skills: ${orchestrator.skills.count()}`);
      
      const last = loadLastModel();
      if (last) {
        console.log(`[server] Last model: ${last}`);
      }
      break;
      
    } catch (err) {
      if (err && err.code === "EADDRINUSE") {
        console.warn(`[server] Port ${attemptPort} in use, trying ${attemptPort + 1}`);
        attemptPort += 1;
      } else {
        console.error("[server] Failed to start:", err);
        process.exit(1);
      }
    }
  }
})();
