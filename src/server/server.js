// server.js - Simple Ollama Chat Server
const http = require("node:http");
const express = require("express");
const cors = require("cors");
const fs = require("node:fs");
const path = require("node:path");
const { chooseModel } = require("../shared/choose-model");
const { getServerConfig } = require("./utils/server-config");
const logger = require("./utils/logger");

// Multi-agent orchestration
const { Planner } = require("./orchestrator/planner");
const { Orchestrator } = require("./orchestrator/orchestrator");
const { SpecialistFactory } = require("./orchestrator/specialist-factory");

const {
  port: PORT,
  host: HOST,
  lastModelPath: LAST_MODEL_PATH,
} = getServerConfig();

const OLLAMA_BASE = process.env.OLLAMA_BASE || "http://127.0.0.1:11434";

// Memory management
const conversationHistory = new Map(); // sessionId -> messages array
const lastPlanBySession = new Map(); // sessionId -> last plan (for Phase 2 detection)

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

    // Log request
    logger.logRequest(userMsg, sessionId, chosenModel);

    // Step 1: Planner analyzes intent
    logger.logPlanner("ANALYZE", {
      message_length: userMsg.length,
      history_length: history.length,
    });
    const plan = await planner.plan(history, { model: chosenModel });
    logger.logPlanner("ROUTE", {
      type: plan.type,
      has_tool_calls: !!(plan.tool_calls && plan.tool_calls.length > 0),
      tool_count: plan.tool_calls?.length || 0,
    });

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

    // Log the request
    logger.logRequest(userMsg, sessionId, chosenModel);

    const planner = new Planner({ model: chosenModel });
    // Orchestrator needs shared specialist factory for consistency
    const specialistFactory = new SpecialistFactory({ model: chosenModel });
    const orchestrator = new Orchestrator({ 
      model: chosenModel, 
      specialistFactory 
    });

    // Get last plan for Phase 2 detection
    const lastPlan = lastPlanBySession.get(sessionId) || null;
    
    // --- Automatic Plan Execution (Workforce Model) ---
    // If we have a pending plan with assigned agents, and the user says "yes" or similar,
    // we bypass the Planner and execute directly.
    const isApproval = /^(yes|y|proceed|approve|ok|sure|go ahead)/i.test(userMsg.trim());
    if (lastPlan && isApproval) {
        // Extract todos from last plan
        const todoCall = lastPlan.tool_calls?.find(tc => tc.function.name === 'todo_write');
        if (todoCall) {
            const args = typeof todoCall.function.arguments === 'string' 
                ? JSON.parse(todoCall.function.arguments) 
                : todoCall.function.arguments;
                
            // Check if workforce model (has assigned_agent)
            if (args.todos && args.todos.some(t => t.assigned_agent)) {
                console.log("[server] Workforce plan approved. Executing directly.");
                logger.logSystem("WORKFORCE_EXECUTION", { todos: args.todos.length });
                
                const result = await orchestrator.executeApprovedPlan(args.todos, { 
                    model: chosenModel,
                    userMessage: userMsg 
                });
                
                // Process result same as below
                const taskDetails = result.results.map((r, i) => {
                  const status = r.success ? "✓ SUCCESS" : "✗ FAILED";
                  const content = r.result?.content || r.message || "";
                  const error = r.error ? `\nError: ${r.error}` : "";
                  return `**Task ${i + 1}** [${status}]\n${content}${error}`;
                }).join("\n\n");
                
                const responseText = `${taskDetails}`;
                lastPlanBySession.delete(sessionId);
                
                history.push({ role: "assistant", content: responseText });
                appendToTodayLog(userMsg, responseText);
                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                res.setHeader("Cache-Control", "no-cache");
                res.write(responseText);
                res.end();
                return;
            }
        }
    }
    // ------------------------------------------------

    // --- Speculative Execution Start ---
    const startSpeculation = Date.now();
    
    // 1. Start Planner Analysis
    logger.logPlanner("ANALYZE", {
      message_length: userMsg.length,
      history_length: history.length,
    });
    const plannerPromise = planner.plan(history, { model: chosenModel, lastPlan });

    // 2. Start Speculative Conversational Response
    // Only speculate if:
    // 1. No pending plan (Phase 2 always needs tools)
    // 2. Not a specialized command (startsWith /)
    // 3. Not obviously a tool request (file, create, search, etc.)
    let speculativePromise = null;
    const isToolRequest = /(file|folder|dir|desktop|create|make|write|read|delete|remove|search|find|run|exec)/i.test(userMsg);
    
    if (!lastPlan && !userMsg.toLowerCase().startsWith("/") && !isToolRequest) {
       console.log("[server] Starting speculative conversational response...");
       const taskDescription = `
User Message: "${userMsg}"

Context type: conversation
Data: { "plannerContent": "Speculative execution" }

Your Goal: Provide a friendly, natural response to the user. 
- If the user is asking for an action (file/web/shell), politely offer help but do NOT refuse.
- If it's a greeting or question, answer it.
`;
       speculativePromise = specialistFactory.spawnSpecialist("conversation", {
          id: `spec_conv_${Date.now()}`,
          title: "Speculative Response",
          description: taskDescription
       }, { model: chosenModel });
    }

    // Wait for Planner (primary decision maker)
    const plan = await plannerPromise;
    logger.logPlanner("ROUTE", {
      type: plan.type,
      has_tool_calls: !!(plan.tool_calls && plan.tool_calls.length > 0),
    });

    let result;

    // --- Decision Point ---
    if (plan.type === "conversation" && speculativePromise) {
      // Planner says it's just conversation - try to use speculative result
      try {
        const specResult = await speculativePromise;
        if (specResult.success && specResult.result?.content) {
          console.log(`[server] Speculative HIT! Saved ${Date.now() - startSpeculation}ms (approx)`);
          
          // Use the speculative content directly
          result = {
            type: "conversation",
            content: specResult.result.content
          };
          
          // Log it as fully processed
          logger.logOrchestrator("ROUTE", {
             decision: "CONVERSATION_SPECULATIVE",
             reason: "Planner confirmed conversation, using speculative result"
          });
        } else {
           // Speculation failed, fall back to normal processing
           console.log("[server] Speculative execution failed, falling back to orchestrator");
           result = await orchestrator.process(plan, { model: chosenModel, userMessage: userMsg });
        }
      } catch (e) {
         console.warn("[server] Speculative promise error:", e);
         result = await orchestrator.process(plan, { model: chosenModel, userMessage: userMsg });
      }
    } else {
      // Planner needs tools OR speculation wasn't started
      if (speculativePromise) {
        console.log("[server] Speculative DISCARD. Planner requires tools/actions.");
        // We just ignore the speculative promise, let it finish in background (or it gets GC'd)
      }
      result = await orchestrator.process(plan, { model: chosenModel, userMessage: userMsg });
    }
    // --- Speculative Execution End ---

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
    let responseText = result.content;

    // If there are todos (Phase 1 - waiting for approval), format them into the response
    if (result.todos && result.todos.length > 0) {
      const todoList = result.todos
        .map(
          (todo, i) =>
            `${i + 1}. ${todo.description || todo.content} [${todo.status}]`,
        )
        .join("\n");
      responseText = `**Todo List:**\n${todoList}\n\nPlease review and respond with 'yes' to proceed or 'no' to cancel.`;

      // Store plan for Phase 2 detection (separate from conversation history to avoid breaking Ollama)
      lastPlanBySession.set(sessionId, plan);
    }

    // If there are task results (Phase 2 - execution complete), include them
    if (result.results && result.results.length > 0) {
      if (result.content && result.content !== "Executing the approved plan...") {
         // Use the conversational synthesis provided by Orchestrator
         responseText = result.content;
      } else {
         // Fallback: detailed summary from specialist responses
         const taskDetails = result.results
           .map((r, i) => {
             const status = r.success ? "✓ SUCCESS" : "✗ FAILED";
             const content = r.result?.content || r.message || "";
             const error = r.error ? `\nError: ${r.error}` : "";
             return `**Task ${i + 1}** [${status}]\n${content}${error}`;
           })
           .join("\n\n");
         responseText = `${taskDetails}`;
      }

      // Clear last plan after execution
      lastPlanBySession.delete(sessionId);
    }

    // Save to history (DO NOT include tool_calls - it breaks Ollama JSON parsing)
    history.push({ role: "assistant", content: responseText });
    appendToTodayLog(userMsg, responseText);

    // Send as text for backward compatibility with UI
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.write(responseText);
    res.end();
  } catch (err) {
    console.error("[chat] Error:", err);
    res.status(500).end("Server error: " + (err?.message || String(err)));
  }
});

/* Start server */
(() => {
  // Initialize logging session
  logger.initSession();
  logger.logSystem("Server starting", { port: PORT, host: HOST });

  const server = http.createServer(app);

  server.on("error", (err) => {
    logger.logError("SERVER", "Failed to start server", err);
    console.error("[server] failed to start server:", err);
    process.exit(1);
  });

  // Handle shutdown gracefully
  process.on("SIGINT", () => {
    logger.logSystem("Server shutting down (SIGINT)");
    logger.endSession({ reason: "SIGINT" });
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    logger.logSystem("Server shutting down (SIGTERM)");
    logger.endSession({ reason: "SIGTERM" });
    process.exit(0);
  });

  server.listen(PORT, HOST, () => {
    process.env.CHAT_SERVER_PORT = String(PORT);
    process.env.CHAT_SERVER_HOST = HOST;
    console.log(`[server] listening on http://${HOST}:${PORT}`);
    logger.logSystem("Server started", { url: `http://${HOST}:${PORT}` });
    const last = loadLastModel();
    if (last) {
      console.log(`[server] last chosen model: ${last}`);
      logger.logSystem("Last model loaded", { model: last });
    } else {
      console.log(
        "[server] no last model chosen; requests must include a 'model' field",
      );
    }
  });
})();
