const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { getActiveMemoryDir, getScopeName } = require("../commands/utils");

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "if",
  "then",
  "so",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "at",
  "by",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "this",
  "that",
  "these",
  "those",
  "it",
  "as",
  "i",
  "you",
  "we",
  "they",
  "me",
  "my",
  "your",
  "our",
  "their",
  "about"
]);

const PREFERENCE_PATTERNS = [
  /\b(i prefer|i like|i don't like|i dislike|i hate|i love)\b/i,
  /\b(always|never|only)\b.*\b(use|do|follow|apply)\b/i,
  /\bfrom now on\b/i,
  /\buse (.+) instead\b/i,
  /\bmy (name|email|timezone|role|company|team)\b/i
];

const DEFAULT_MEMORY_CONFIG = {
  autoRemember: true,
  enablePreferencePatterns: true,
  enableExplicitSavePatterns: true,
  minPreferenceLength: 12,
  maxAutoEntriesPerMessage: 2,
  recallLimit: 3,
  searchLimit: 5
};

function getConfigPath(state) {
  const root = state?.WORKSPACE_ROOT || process.cwd();
  return path.join(root, "config", "memory.json");
}

function loadMemoryConfig(state) {
  if (!state) return { ...DEFAULT_MEMORY_CONFIG };
  const configPath = getConfigPath(state);
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_MEMORY_CONFIG };
  }
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_MEMORY_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_MEMORY_CONFIG };
  }
}

function saveMemoryConfig(state, updates) {
  if (!state) return null;
  const configPath = getConfigPath(state);
  const merged = { ...loadMemoryConfig(state), ...updates };
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  const normalized = normalize(text);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token && !STOPWORDS.has(token) && token.length > 2);
}

function generateMemoryId() {
  const base = new Date().toISOString().replace(/[:T.]/g, "-").slice(0, 19);
  const suffix = crypto.randomBytes(2).toString("hex");
  return `${base}-${suffix}`;
}

function loadMemoryEntries(state) {
  const memoryDir = getActiveMemoryDir(state);
  const files = fs
    .readdirSync(memoryDir)
    .filter((f) => f.startsWith("memory-") && f.endsWith(".json"));

  const entries = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(memoryDir, file), "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && parsed.text) {
        entries.push(parsed);
      }
    } catch {
      continue;
    }
  }
  return entries;
}

function scoreEntry(entry, tokens) {
  const haystack = normalize(entry.text || "");
  if (!haystack || tokens.length === 0) return 0;
  let score = 0;
  for (const token of tokens) {
    if (!token) continue;
    if (haystack.includes(token)) {
      score += 1;
    }
  }
  return score;
}

function searchMemories(query, state, options = {}) {
  const config = loadMemoryConfig(state);
  const limit = options.limit || config.searchLimit || 5;
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const entries = loadMemoryEntries(state);
  const scored = entries
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, tokens)
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.entry.createdAt || 0) - new Date(a.entry.createdAt || 0);
    })
    .slice(0, limit)
    .map((row) => row.entry);

  return scored;
}

function buildMemoryContext(query, state, options = {}) {
  const config = loadMemoryConfig(state);
  const limit = options.limit || config.recallLimit || 3;
  const matches = searchMemories(query, state, { limit });
  if (!matches.length) return "";

  const lines = matches.map((m) => {
    const dateStr = (m.createdAt || "").split("T")[0] || "unknown";
    const preview = String(m.text || "")
      .replace(/\s+/g, " ")
      .slice(0, 200);
    return `- [${m.id || "memory"} | ${dateStr}] ${preview}${m.text && m.text.length > 200 ? "..." : ""}`;
  });

  return lines.join("\n");
}

function saveMemoryEntry(state, payload) {
  const memoryDir = getActiveMemoryDir(state);
  const id = payload.id || generateMemoryId();
  const entry = {
    id,
    createdAt: payload.createdAt || new Date().toISOString(),
    source: payload.source || "auto",
    text: payload.text || "",
    tags: payload.tags || [],
    auto: payload.auto === true
  };

  if (!entry.text) return null;
  const filePath = path.join(memoryDir, `memory-${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), "utf-8");

  return { id, path: filePath, scope: getScopeName(state) };
}

function detectMemoryCandidates(userMsg, assistantMsg, config) {
  const candidates = [];
  if (
    config.enablePreferencePatterns &&
    PREFERENCE_PATTERNS.some((pattern) => pattern.test(userMsg)) &&
    userMsg.trim().length >= config.minPreferenceLength
  ) {
    candidates.push({
      text: userMsg.trim(),
      source: "user",
      tags: ["preference", "instruction"],
      auto: true
    });
  }

  if (
    config.enableExplicitSavePatterns &&
    /\b(remember|save this|important|keep this)\b/i.test(userMsg)
  ) {
    const trimmed = assistantMsg.trim();
    if (trimmed) {
      candidates.push({
        text: trimmed,
        source: "assistant",
        tags: ["requested"],
        auto: true
      });
    }
  }

  return candidates;
}

function autoRememberFromMessage(state, userMsg, assistantMsg) {
  const config = loadMemoryConfig(state);
  if (!state || state.autoMemoryEnabled === false || config.autoRemember === false) return [];
  const candidates = detectMemoryCandidates(userMsg, assistantMsg, config);
  const saved = [];
  const limit = config.maxAutoEntriesPerMessage || candidates.length;
  for (const candidate of candidates.slice(0, limit)) {
    const result = saveMemoryEntry(state, candidate);
    if (result) saved.push(result);
  }
  return saved;
}

module.exports = {
  searchMemories,
  buildMemoryContext,
  saveMemoryEntry,
  autoRememberFromMessage,
  loadMemoryConfig,
  saveMemoryConfig,
  DEFAULT_MEMORY_CONFIG
};
