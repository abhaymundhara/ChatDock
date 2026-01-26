// server.js (CommonJS)
const http = require("node:http");
const express = require("express");
const cors = require("cors");
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { chooseModel } = require("../shared/choose-model");
const { getServerConfig } = require("./utils/server-config");
const { loadSettings } = require("./utils/settings-store");

const { port: PORT, host: HOST, userDataPath: USER_DATA, lastModelPath: LAST_MODEL_PATH } =
  getServerConfig();

const OLLAMA_BASE = process.env.OLLAMA_BASE || "http://127.0.0.1:11434";

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

// The detectLatestLocalModel function has been removed as per the patch request.

/* ===== Ollama model helpers ===== */
const PULLING_MODELS = new Set();
/* ================================= */

// Load system prompt from Brain via PromptBuilder
const { PromptBuilder } = require("./orchestrator/prompt-builder");
const promptBuilder = new PromptBuilder();
const SYSTEM_PROMPT = promptBuilder.build();
console.log("[server] Loaded system prompt from Brain");

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
        pulling: [...PULLING_MODELS],
        lastModel,
        error: `Upstream error: ${upstream.status} ${upstream.statusText}`,
      });
    }
    const data = await upstream.json().catch(() => ({}));
    const models = Array.isArray(data.models)
      ? data.models.map((m) => m.name).filter(Boolean)
      : [];
    res.json({ models, online: true, pulling: [...PULLING_MODELS], lastModel });
  } catch (err) {
    res.json({
      models: [],
      online: false,
      pulling: [...PULLING_MODELS],
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
    const userMsg = String(req.body?.message ?? "");
    const requestedModel = req.body?.model ? String(req.body.model) : "";
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
        error:
          "No model available. Install a model with Ollama and try again.",
        availableModels,
      });
    }

    if (requestedModel && requestedModel !== lastModel) {
      saveLastModel(requestedModel);
    } else if (!lastModel && chosenModel) {
      saveLastModel(chosenModel);
    }
    const settings = loadSettings(process.env.USER_DATA_PATH || __dirname);
    const systemPrompt = settings.systemPrompt || SYSTEM_PROMPT;
    const temperature = typeof settings.temperature === "number" ? settings.temperature : 0.7;
    const upstream = await fetch(`${OLLAMA_BASE}/api/chat`, {
      body: JSON.stringify({
        model: chosenModel,
        stream: true,
        messages: [
          ...(systemPrompt
            ? [{ role: "system", content: systemPrompt }]
            : []),
          { role: "user", content: userMsg },
        ],
        options: { temperature },
      }),
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!upstream.ok || !upstream.body) {
      res
        .status(502)
        .end(`Upstream error: ${upstream.status} ${upstream.statusText}`);
      return;
    }
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let leftover = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const combined = leftover + chunk;
      const lines = combined.split(/\r?\n/);
      leftover = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line);
          if (evt?.message?.content) res.write(evt.message.content);
        } catch {}
      }
    }
    if (leftover.trim()) {
      try {
        const evt = JSON.parse(leftover);
        if (evt?.message?.content) res.write(evt.message.content);
      } catch {}
    }
    res.end();
  } catch (err) {
    res.status(500).end("Server error: " + (err?.message || String(err)));
  }
});

(() => {
  // No auto-default model: we persist last user choice and use it when a request omits `model`.
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
        "[server] no last model chosen; requests must include a `model` field",
      );
    }
  });
})();
