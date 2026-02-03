/**
 * LLM Provider (Ollama)
 * Logic for connecting to Ollama and managing models
 */

const fs = require("fs");
const path = require("path");
class LLMProvider {
  constructor(config = {}) {
    // Standardize naming: ollamaBase is used in settings, baseUrl/ollamaUrl as fallbacks
    this.baseUrl = config.ollamaBase || config.baseUrl || config.ollamaUrl || process.env.OLLAMA_BASE || "http://127.0.0.1:11434";
    this.defaultModel = config.model || config.defaultModel || process.env.OLLAMA_MODEL || "ministral3:3b";
    this.userDataPath = config.userDataPath;
    this.lastModelPath = config.userDataPath ? path.join(config.userDataPath, "last_model.txt") : null;
  }

  loadLastModel() {
    if (!this.lastModelPath) return null;
    try {
      const v = fs.readFileSync(this.lastModelPath, "utf-8").trim();
      return v || null;
    } catch {
      return null;
    }
  }

  saveLastModel(name) {
    if (!this.lastModelPath) return;
    try {
      fs.writeFileSync(this.lastModelPath, String(name), "utf-8");
    } catch (e) {
      console.warn("[llm-provider] failed to persist last model:", e?.message || e);
    }
  }

  async fetchAvailableModels() {
    try {
      // Use global fetch (Node 18+)
      const upstream = await fetch(`${this.baseUrl}/api/tags`, { method: "GET" });
      if (!upstream.ok) {
        console.warn(`[llm-provider] failed to fetch models: ${upstream.status}`);
        return [];
      }
      const data = await upstream.json().catch(() => ({}));
      if (!data || !Array.isArray(data.models)) return [];
      return data.models.map((m) => m.name).filter(Boolean);
    } catch (err) {
      console.error("[llm-provider] fetchAvailableModels failed:", err.message);
      return [];
    }
  }

  async resolveModel(requested) {
    const available = await this.fetchAvailableModels();
    const last = this.loadLastModel();
    
    // Priority 1: Specifically requested and available
    if (requested && available.includes(requested)) return requested;
    
    // Priority 2: Last used and available
    if (last && available.includes(last)) return last;
    
    // Priority 3: Fallback to first available model from Ollama
    if (available.length > 0) {
      console.log(`[llm-provider] Fallback: using first available model: ${available[0]}`);
      return available[0];
    }
    
    // Priority 4: Hard fallback to default string
    return this.defaultModel;
  }

  async chat(messages, options = {}) {
    const model = await this.resolveModel(options.model);
    const temperature = options.temperature || 0.7;
    const stream = options.stream !== false; // Default true

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream,
          temperature,
          tools: options.tools, // Pass tools if supported/provided
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Ollama API error: ${response.status} ${text}`);
      }

      return response; // Return response object (for streaming)
    } catch (error) {
      console.error("[llm-provider] Chat error:", error);
      throw error;
    }
  }
}

module.exports = { LLMProvider };
