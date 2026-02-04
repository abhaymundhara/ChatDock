// server.js - ChatDock Backend (Nanobot Architecture)
const express = require("express");
const cors = require("cors");
const { Agent } = require("./agent/loop");
const { getServerConfig } = require("./config/settings");
const { bootstrapWorkspace } = require("./utils/bootstrap");
const { TelegramChannel } = require("./channels/telegram");
const { WhatsAppChannel } = require("./channels/whatsapp");
const { CronScheduler } = require("./cron/scheduler");

// 1. Bootstrap Workspace
bootstrapWorkspace();

const config = getServerConfig();
const agent = new Agent();

// 2. Initialize Cron Scheduler
const scheduler = new CronScheduler(config, agent);
scheduler.start();

// Pass scheduler to agent for tool access
agent.setScheduler(scheduler);

// 3. Start Channels & Message Bus
const { getMessageBus } = require("./bus/queue");
const bus = getMessageBus();

const telegram = new TelegramChannel(config);
telegram.initOutbound(); // Initialize outbound listener
telegram.start().catch(err => console.error("[telegram] Failed to start:", err));

const whatsapp = new WhatsAppChannel(config);
whatsapp.initOutbound(); // Initialize outbound listener
whatsapp.start().catch(err => console.error("[whatsapp] Failed to start:", err));

// 4. Start Agent Listen Loop (Nanobot Architecture)
agent.listen(bus).catch(err => console.error("[agent] Listen error:", err));

const app = express();
app.use(cors());
app.use(express.json());

// Health Check
app.get("/health", async (_req, res) => {
  try {
    const r = await fetch(`${config.ollamaBase}/api/version`);
    res.json({ server: true, ollama: r.ok });
  } catch {
    res.json({ server: true, ollama: false });
  }
});

// Models
app.get("/models", async (_req, res) => {
  try {
    const models = await agent.llm.fetchAvailableModels();
    const lastModel = agent.llm.loadLastModel ? agent.llm.loadLastModel() : null;
    const providerInfo = agent.llm.getInfo();
    res.json({ 
      models, 
      online: models.length > 0, 
      lastModel,
      provider: providerInfo.name,
    });
  } catch (err) {
    res.json({ models: [], online: false, error: err.message });
  }
});

// Providers
app.get("/providers", async (_req, res) => {
  const { listProviderNames, getAllProviders } = require("./providers/provider-factory");
  const providers = getAllProviders(config);
  const result = {};
  
  for (const [name, provider] of Object.entries(providers)) {
    result[name] = provider.getInfo();
  }
  
  res.json({ 
    available: listProviderNames(),
    configured: result,
    active: agent.llm.name,
  });
});

app.post("/models/selected", (req, res) => {
  const model = String(req.body?.model || "").trim();
  if (model) {
    if (agent.llm.saveLastModel) {
      agent.llm.saveLastModel(model);
    }
    res.json({ ok: true, model, provider: agent.llm.name });
  } else {
    res.status(400).json({ ok: false, error: "Model required" });
  }
});

// Chat (Delegates to Agent)
app.post("/chat", async (req, res) => {
  const userMsg = String(req.body?.message || "").trim();
  if (!userMsg) return res.status(400).send("Message required");

  // Set headers for streaming
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");

  // Run Agent
  // Note: Agent.run writes directly to res
  await agent.run(userMsg, res, { model: req.body?.model });
});

// Cron API Endpoints
app.get("/cron/list", (req, res) => {
  const jobs = scheduler.listJobs();
  res.json({ success: true, jobs });
});

app.post("/cron/add", (req, res) => {
  try {
    const job = scheduler.addJob(req.body);
    res.json({ success: true, job });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.delete("/cron/remove/:id", (req, res) => {
  const removed = scheduler.removeJob(req.params.id);
  res.json({ success: removed });
});

app.get("/cron/get/:id", (req, res) => {
  const job = scheduler.getJob(req.params.id);
  if (job) {
    res.json({ success: true, job });
  } else {
    res.status(404).json({ success: false, error: "Job not found" });
  }
});

app.listen(config.port, config.host, () => {
  console.log(`[server] listening on http://${config.host}:${config.port}`);
  console.log(`[server] provider: ${agent.llm.name}`);
  console.log(`[server] mode: agentic`);
  console.log(`[server] bootstrap: executed`);
});
