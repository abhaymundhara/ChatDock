/**
 * Ollama Provider
 * Connects to local Ollama server
 */

const fs = require("fs");
const path = require("path");
const { BaseLLMProvider } = require("./base");

class OllamaProvider extends BaseLLMProvider {
  constructor(config = {}) {
    super(config);
    this.name = "ollama";
    this.baseUrl = config.apiBase || config.ollamaBase || process.env.OLLAMA_BASE || "http://127.0.0.1:11434";
    this.defaultModel = config.model || process.env.OLLAMA_MODEL || "llama3.2:3b";
    this.userDataPath = config.userDataPath;
    this.lastModelPath = config.userDataPath ? path.join(config.userDataPath, "last_model.txt") : null;
  }

  isConfigured() {
    // Ollama is always "configured" if baseUrl is set
    return !!this.baseUrl;
  }

  loadLastModel() {
    if (!this.lastModelPath) return null;
    try {
      if (fs.existsSync(this.lastModelPath)) {
        return fs.readFileSync(this.lastModelPath, "utf-8").trim();
      }
    } catch { /* ignore */ }
    return null;
  }

  saveLastModel(model) {
    if (!this.lastModelPath) return;
    try {
      fs.writeFileSync(this.lastModelPath, model, "utf-8");
    } catch { /* ignore */ }
  }

  async fetchAvailableModels() {
    try {
      const upstream = await fetch(`${this.baseUrl}/api/tags`, { method: "GET" });
      if (!upstream.ok) {
        console.warn(`[ollama] failed to fetch models: ${upstream.status}`);
        return [];
      }
      const data = await upstream.json().catch(() => ({}));
      if (!data || !Array.isArray(data.models)) return [];
      return data.models.map((m) => m.name).filter(Boolean);
    } catch (err) {
      console.error("[ollama] fetchAvailableModels failed:", err.message);
      return [];
    }
  }

  async resolveModel(requested) {
    const available = await this.fetchAvailableModels();
    const last = this.loadLastModel();
    
    if (requested && available.includes(requested)) return requested;
    if (last && available.includes(last)) return last;
    if (available.length > 0) {
      console.log(`[ollama] Fallback: using first available model: ${available[0]}`);
      return available[0];
    }
    return this.defaultModel;
  }

  async chat(messages, options = {}) {
    const model = await this.resolveModel(options.model);
    this.saveLastModel(model);

    const body = {
      model,
      messages,
      stream: options.stream !== false,
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} ${error}`);
    }

    return response;
  }

  getInfo() {
    return {
      name: this.name,
      configured: this.isConfigured(),
      baseUrl: this.baseUrl,
      defaultModel: this.defaultModel,
    };
  }
}

module.exports = { OllamaProvider };
