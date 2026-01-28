// server.js - Simple Ollama Chat Server
const http = require("node:http");
const express = require("express");
const cors = require("cors");
const fs = require("node:fs");
const path = require("node:path");
const { chooseModel } = require("../shared/choose-model");
const { getServerConfig } = require("./utils/server-config");
const { loadSettings } = require("./utils/settings-store");
const {
  tools,
  toolExecutors,
  initializeToolEmbeddings,
  filterToolsForMessage,
} = require("./tools/registry");

const {
  port: PORT,
  host: HOST,
  userDataPath: USER_DATA,
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
console.log(`[server] Loaded ${tools.length} tools`);

// Initialize tool embeddings at startup
(async () => {
  await initializeToolEmbeddings();
})();

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

/* Chat (streaming) */
app.post("/chat", async (req, res) => {
  try {
    const userMsg = String(req.body?.message ?? "");
    const requestedModel = req.body?.model ? String(req.body.model) : "";
    const sessionId = req.body?.sessionId || "default"; // Support session IDs
    const lastModel = loadLastModel();
    let availableModels = [];

    if (!requestedModel && !lastModel) {
      try {
        const upstreamTags = await fetch(`${OLLAMA_BASE}/api/tags`, {
          method: "GET",
        });
        const data = upstreamTags.ok
          ? await upstreamTags.json().catch(() => ({}))
          : {};
        availableModels = Array.isArray(data.models)
          ? data.models.map((m) => m.name).filter(Boolean)
          : [];
      } catch {
        availableModels = [];
      }
    }

    const chosenModel = chooseModel({
      requested: requestedModel,
      last: lastModel,
      available: availableModels,
    });

    if (!chosenModel) {
      return res.status(400).json({
        error: "No model available. Install a model with Ollama and try again.",
        availableModels,
      });
    }

    if (requestedModel && requestedModel !== lastModel) {
      saveLastModel(requestedModel);
    } else if (!lastModel && chosenModel) {
      saveLastModel(chosenModel);
    }

    const settings = loadSettings(process.env.USER_DATA_PATH || __dirname);

    // Build system prompt with brain context and daily logs
    const dailyLogs = loadDailyLogs();
    let systemPrompt = BRAIN_CONTEXT;
    if (dailyLogs) {
      systemPrompt += `\n\n---\n\n# Memory Context\n\n${dailyLogs}`;
    }
    if (settings.systemPrompt) {
      systemPrompt += `\n\n## Additional Instructions\n${settings.systemPrompt}`;
    }

    const temperature =
      typeof settings.temperature === "number" ? settings.temperature : 0.7;

    // Get or create conversation history for this session
    if (!conversationHistory.has(sessionId)) {
      conversationHistory.set(sessionId, []);
    }
    const history = conversationHistory.get(sessionId);

    // Add user message to history
    history.push({ role: "user", content: userMsg });

    // Keep only last 20 messages to avoid context overflow
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    // Tool calling loop - keep calling until we get a final response
    let finalResponse = "";
    let toolCallCount = 0;
    const maxToolCalls = 10; // Prevent infinite loops

    // Server-side tool filtering for efficiency
    // Support both formats: { message: "..." } from Electron and { messages: [...] } from API
    const userMessage =
      userMsg ||
      req.body.messages?.[req.body.messages.length - 1]?.content ||
      "";
    const startTime = Date.now();
    const availableTools = filterToolsForMessage(userMessage);
    console.log(`[server] Tool filtering took ${Date.now() - startTime}ms`);

    while (toolCallCount < maxToolCalls) {
      const llmStartTime = Date.now();
      const upstream = await fetch(`${OLLAMA_BASE}/api/chat`, {
        body: JSON.stringify({
          model: chosenModel,
          stream: false, // Use non-streaming for tool calling
          messages: [{ role: "system", content: systemPrompt }, ...history],
          tools: availableTools, // Filtered tools based on user message
          options: { temperature },
        }),
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!upstream.ok) {
        res
          .status(502)
          .end(`Upstream error: ${upstream.status} ${upstream.statusText}`);
        return;
      }

      const data = await upstream.json();
      const message = data?.message;
      console.log(`[server] LLM inference took ${Date.now() - llmStartTime}ms`);

      if (!message) {
        res.status(502).end("Invalid response from Ollama");
        return;
      }

      // Check if model wants to use tools
      if (message.tool_calls && message.tool_calls.length > 0) {
        toolCallCount++;
        console.log(
          `[server] Processing ${message.tool_calls.length} tool call(s)`,
        );

        // Add assistant's tool call to history
        history.push({
          role: "assistant",
          content: message.content || "",
          tool_calls: message.tool_calls,
        });

        // Execute each tool
        for (const toolCall of message.tool_calls) {
          const toolName = toolCall.function?.name;
          const toolArgs = toolCall.function?.arguments || {};

          const toolStartTime = Date.now();
          console.log(`[server] Executing tool: ${toolName}`, toolArgs);

          let result;
          if (toolExecutors[toolName]) {
            try {
              result = await toolExecutors[toolName](toolArgs);
              console.log(
                `[server] Tool ${toolName} executed in ${Date.now() - toolStartTime}ms`,
              );
            } catch (error) {
              result = { success: false, error: error.message };
            }
          } else {
            result = { success: false, error: `Unknown tool: ${toolName}` };
          }

          // Add tool result to history
          history.push({
            role: "tool",
            content: JSON.stringify(result),
            tool_name: toolName,
          });
        }

        // Continue loop to get final response
        continue;
      }

      // No tool calls - we have the final response
      finalResponse = message.content || "";
      history.push({ role: "assistant", content: finalResponse });
      break;
    }

    // Send response to client
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.write(finalResponse);
    res.end();

    // Save to daily log
    appendToTodayLog(userMsg, finalResponse);
  } catch (err) {
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
