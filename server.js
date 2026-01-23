// server.js (CommonJS)
const http = require("node:http");
const express = require("express");
const cors = require("cors");
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { findAvailablePort } = require("./port-allocator");

const PORT = Number(process.env.CHAT_SERVER_PORT || 3001);
const MODEL = process.env.OLLAMA_MODEL || null;

/* ===== Ollama model helpers ===== */
const PULLING_MODELS = new Set();
/* ================================= */

// Load system prompt from file (optional)
const PROMPT_PATH = path.join(__dirname, "prompt.txt");
let SYSTEM_PROMPT = "";
try {
  SYSTEM_PROMPT = fs.readFileSync(PROMPT_PATH, "utf-8");
  if (SYSTEM_PROMPT.trim().length === 0) {
    console.warn(
      "[server] prompt.txt is empty; continuing without a system prompt",
    );
  } else {
    console.log("[server] Loaded system prompt from prompt.txt");
  }
} catch {
  console.warn(
    "[server] No prompt.txt found; continuing without a system prompt",
  );
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
  try {
    const upstream = await fetch(`${OLLAMA_BASE}/api/tags`, { method: "GET" });
    if (!upstream.ok) {
      return res.json({
        models: [],
        online: false,
        pulling: [...PULLING_MODELS],
        error: `Upstream error: ${upstream.status} ${upstream.statusText}`,
      });
    }
    const data = await upstream.json().catch(() => ({}));
    const models = Array.isArray(data.models)
      ? data.models.map((m) => m.name).filter(Boolean)
      : [];
    res.json({ models, online: true, pulling: [...PULLING_MODELS] });
  } catch (err) {
    res.json({
      models: [],
      online: false,
      pulling: [...PULLING_MODELS],
      error: err?.message || String(err),
    });
  }
});

/* Chat (streaming) */
app.post("/chat", async (req, res) => {
  try {
    const userMsg = String(req.body?.message ?? "");
    const chosenModel = req.body?.model
      ? String(req.body.model)
      : MODEL
        ? String(MODEL)
        : null;
    if (!chosenModel) {
      try {
        const upstreamTags = await fetch(`${OLLAMA_BASE}/api/tags`, {
          method: "GET",
        });
        const data = upstreamTags.ok
          ? await upstreamTags.json().catch(() => ({}))
          : {};
        const models = Array.isArray(data.models)
          ? data.models.map((m) => m.name).filter(Boolean)
          : [];
        return res
          .status(400)
          .json({
            error:
              "No model specified. Provide `model` in the request body or set OLLAMA_MODEL.",
            availableModels: models,
          });
      } catch (e) {
        return res
          .status(400)
          .json({
            error:
              "No model specified and unable to fetch available models from Ollama.",
          });
      }
    }
    const upstream = await fetch(`${OLLAMA_BASE}/api/chat`, {
      body: JSON.stringify({
        model: chosenModel,
        stream: true,
        messages: [
          ...(SYSTEM_PROMPT
            ? [{ role: "system", content: SYSTEM_PROMPT }]
            : []),
          { role: "user", content: userMsg },
        ],
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

(async () => {
  const port = await findAvailablePort(PORT);
  if (port !== PORT) {
    process.env.CHAT_SERVER_PORT = String(port);
  }
  http.createServer(app).listen(port, () => {
    console.log(`[server] listening on http://127.0.0.1:${port}`);
    if (MODEL) {
      console.log(`[server] default model ${MODEL} at ${OLLAMA_BASE}`);
    } else {
      console.log(
        "[server] no default model configured; requests must include a `model` field or set OLLAMA_MODEL",
      );
    }
  });
})();
