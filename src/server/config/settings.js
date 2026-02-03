/**
 * Server Configuration
 * Loads settings and environment variables
 * Updated with Telegram and Agentic defaults
 */

const path = require("path");
const os = require("os");
const fs = require("fs");

const DEFAULT_SETTINGS = {
  systemPrompt: "You are ChatDock, a helpful AI assistant.",
  model: "ministral-3:3b",
  temperature: 0.7,
  defaultProvider: "ollama", // ollama, openrouter, openai, groq
  providers: {
    ollama: {
      apiBase: "http://127.0.0.1:11434",
    },
    openrouter: {
      apiKey: "", // Set your OpenRouter API key
      // model: "anthropic/claude-3-haiku"
    },
    openai: {
      apiKey: "", // Set your OpenAI API key
      // model: "gpt-4o-mini"
    },
    groq: {
      apiKey: "", // Set your Groq API key
      // model: "llama-3.3-70b-versatile"
    },
  },
  telegram: {
    token: "", // User must provide this
    allowedUsers: [] // Empty = allow all (risky) or none? Logic handles this.
  },
  whatsapp: {
    enabled: false,
    allowFrom: [],
  },
  agents: {
    maxToolIterations: 10
  }
};

function getServerConfig() {
  // Electron passes CHAT_SERVER_PORT and CHAT_SERVER_HOST
  const port = process.env.CHAT_SERVER_PORT || process.env.PORT || 3001;
  const host = process.env.CHAT_SERVER_HOST || process.env.HOST || "0.0.0.0"; // Listen on all interfaces by default
  
  // Use .chatdock in home dir for user data
  const userDataPath = path.join(os.homedir(), ".chatdock");
  
  // Ensure user data dir exists
  try {
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
  } catch (e) {
    console.error("Failed to create user data directory:", e);
  }

  const settings = loadSettings(userDataPath);

  return {
    port,
    host,
    userDataPath,
    ollamaBase: process.env.OLLAMA_BASE || settings.ollamaUrl || settings.ollamaBase || "http://127.0.0.1:11434",
    ...settings
  };
}

function loadSettings(userDataPath) {
  try {
    const settingsPath = path.join(userDataPath, "settings.json");
    if (fs.existsSync(settingsPath)) {
      const existing = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      return { ...DEFAULT_SETTINGS, ...existing };
    }
  } catch (e) {
    console.warn("Failed to load settings:", e);
  }
  return DEFAULT_SETTINGS;
}

module.exports = { getServerConfig, loadSettings };
