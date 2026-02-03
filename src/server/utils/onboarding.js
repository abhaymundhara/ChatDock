/**
 * Onboarding Utility
 * Interactive setup for new users
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const os = require("os");

const WORKSPACE_PATH = path.join(os.homedir(), ".chatdock");

const DEFAULT_CONFIG = {
  systemPrompt: "You are ChatDock, a helpful AI assistant.",
  model: "llama3.2:3b",
  temperature: 0.7,
  defaultProvider: "ollama",
  providers: {
    ollama: {
      apiBase: "http://127.0.0.1:11434",
    },
    openrouter: {
      apiKey: "",
    },
    openai: {
      apiKey: "",
    },
    groq: {
      apiKey: "",
    },
  },
  telegram: {
    token: "",
    allowedUsers: [],
  },
  whatsapp: {
    enabled: false,
    allowFrom: [],
  },
  heartbeat: {
    enabled: false,
    intervalMs: 3600000,
  },
  agents: {
    maxToolIterations: 10,
  },
};

/**
 * Create readline interface
 */
function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Ask a question and get answer
 */
function ask(rl, question, defaultValue = "") {
  return new Promise((resolve) => {
    const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

/**
 * Run onboarding
 */
async function runOnboarding() {
  console.log("\n🚀 Welcome to ChatDock Onboarding!\n");
  console.log("This wizard will help you set up your AI assistant.\n");
  console.log(`Workspace: ${WORKSPACE_PATH}\n`);

  const rl = createPrompt();
  const config = { ...DEFAULT_CONFIG };

  try {
    // 1. Provider Selection
    console.log("📡 LLM Provider Setup\n");
    console.log("Available providers:");
    console.log("  1. ollama (local, free)");
    console.log("  2. openrouter (cloud, paid)");
    console.log("  3. openai (cloud, paid)");
    console.log("  4. groq (cloud, fast, free tier)\n");

    const providerChoice = await ask(rl, "Choose provider (1-4)", "1");
    const providerMap = { "1": "ollama", "2": "openrouter", "3": "openai", "4": "groq" };
    config.defaultProvider = providerMap[providerChoice] || "ollama";

    // Configure selected provider
    if (config.defaultProvider === "ollama") {
      const ollamaUrl = await ask(rl, "Ollama URL", "http://127.0.0.1:11434");
      config.providers.ollama.apiBase = ollamaUrl;
      console.log("\n✅ Ollama configured! Make sure Ollama is running.\n");
    } else if (config.defaultProvider === "openrouter") {
      console.log("\nGet your API key from: https://openrouter.ai/keys\n");
      const apiKey = await ask(rl, "OpenRouter API Key");
      config.providers.openrouter.apiKey = apiKey;
    } else if (config.defaultProvider === "openai") {
      console.log("\nGet your API key from: https://platform.openai.com/api-keys\n");
      const apiKey = await ask(rl, "OpenAI API Key");
      config.providers.openai.apiKey = apiKey;
    } else if (config.defaultProvider === "groq") {
      console.log("\nGet your API key from: https://console.groq.com/keys\n");
      const apiKey = await ask(rl, "Groq API Key");
      config.providers.groq.apiKey = apiKey;
    }

    // 2. Telegram Setup (Optional)
    console.log("\n📱 Telegram Integration (Optional)\n");
    const setupTelegram = await ask(rl, "Set up Telegram bot? (y/n)", "n");
    
    if (setupTelegram.toLowerCase() === "y") {
      console.log("\nTo create a Telegram bot:");
      console.log("  1. Open Telegram and search @BotFather");
      console.log("  2. Send /newbot and follow the prompts");
      console.log("  3. Copy the token you receive\n");
      
      const token = await ask(rl, "Telegram Bot Token");
      config.telegram.token = token;
      
      console.log("\nTo get your user ID, message @userinfobot on Telegram");
      const userId = await ask(rl, "Your Telegram User ID (for security)");
      if (userId) {
        config.telegram.allowedUsers = [userId];
      }
    }

    // 3. Model Selection
    console.log("\n🤖 Default Model\n");
    let defaultModel = "llama3.2:3b";
    
    if (config.defaultProvider === "ollama") {
      console.log("Run 'ollama list' to see available models.\n");
      defaultModel = await ask(rl, "Default model", "llama3.2:3b");
    } else if (config.defaultProvider === "openrouter") {
      console.log("Popular models: anthropic/claude-3-haiku, meta-llama/llama-3.1-8b-instruct\n");
      defaultModel = await ask(rl, "Default model", "anthropic/claude-3-haiku");
    } else if (config.defaultProvider === "openai") {
      console.log("Popular models: gpt-4o-mini, gpt-4o, gpt-3.5-turbo\n");
      defaultModel = await ask(rl, "Default model", "gpt-4o-mini");
    } else if (config.defaultProvider === "groq") {
      console.log("Popular models: llama-3.3-70b-versatile, mixtral-8x7b-32768\n");
      defaultModel = await ask(rl, "Default model", "llama-3.3-70b-versatile");
    }
    config.model = defaultModel;

    // 4. Personality (Optional)
    console.log("\n🎭 Assistant Personality\n");
    const customPrompt = await ask(
      rl, 
      "Custom system prompt (or press Enter for default)",
      ""
    );
    if (customPrompt) {
      config.systemPrompt = customPrompt;
    }

    // Save configuration
    console.log("\n💾 Saving configuration...\n");
    
    // Ensure workspace exists
    if (!fs.existsSync(WORKSPACE_PATH)) {
      fs.mkdirSync(WORKSPACE_PATH, { recursive: true });
    }

    // Save settings.json
    const settingsPath = path.join(WORKSPACE_PATH, "settings.json");
    fs.writeFileSync(settingsPath, JSON.stringify(config, null, 2), "utf-8");
    console.log(`✅ Saved: ${settingsPath}`);

    // Create soul files if they don't exist
    const { bootstrapWorkspace } = require("./bootstrap");
    bootstrapWorkspace();

    console.log("\n🎉 Onboarding complete!\n");
    console.log("To start ChatDock:");
    console.log("  npm run server     # Start the server");
    console.log("  npm start          # Start the Electron app\n");

    if (config.telegram.token) {
      console.log("Your Telegram bot is ready! Message it to start chatting.\n");
    }

  } catch (error) {
    console.error("\n❌ Onboarding error:", error.message);
  } finally {
    rl.close();
  }
}

/**
 * Check if already configured
 */
function isConfigured() {
  const settingsPath = path.join(WORKSPACE_PATH, "settings.json");
  return fs.existsSync(settingsPath);
}

/**
 * Get current configuration
 */
function getConfig() {
  const settingsPath = path.join(WORKSPACE_PATH, "settings.json");
  if (fs.existsSync(settingsPath)) {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Show current status
 */
function showStatus() {
  console.log("\n📊 ChatDock Status\n");
  console.log(`Workspace: ${WORKSPACE_PATH}`);
  console.log(`Configured: ${isConfigured() ? "Yes" : "No"}`);

  const config = getConfig();
  if (config) {
    console.log(`\nProvider: ${config.defaultProvider || "ollama"}`);
    console.log(`Model: ${config.model || "not set"}`);
    console.log(`Telegram: ${config.telegram?.token ? "Configured" : "Not configured"}`);
    console.log(`WhatsApp: ${config.whatsapp?.enabled ? "Enabled" : "Disabled"}`);
  }

  // Check Ollama
  console.log("\n🔍 Services:");
  checkOllama();
}

async function checkOllama() {
  try {
    const response = await fetch("http://127.0.0.1:11434/api/version");
    if (response.ok) {
      const data = await response.json();
      console.log(`  Ollama: ✅ Running (v${data.version || "unknown"})`);
    } else {
      console.log("  Ollama: ❌ Not responding");
    }
  } catch {
    console.log("  Ollama: ❌ Not running");
  }
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "status") {
    showStatus();
  } else if (command === "onboard" || command === "setup") {
    runOnboarding();
  } else {
    console.log("ChatDock Onboarding\n");
    console.log("Usage:");
    console.log("  node onboarding.js onboard   # Run setup wizard");
    console.log("  node onboarding.js status    # Show current status");
  }
}

module.exports = { runOnboarding, isConfigured, getConfig, showStatus };
