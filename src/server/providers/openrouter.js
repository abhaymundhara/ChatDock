/**
 * OpenRouter Provider
 * Connects to OpenRouter.ai for multi-model access
 */

const { BaseLLMProvider } = require("./base");

class OpenRouterProvider extends BaseLLMProvider {
  constructor(config = {}) {
    super(config);
    this.name = "openrouter";
    this.apiKey = config.apiKey || process.env.OPENROUTER_API_KEY;
    this.baseUrl = config.apiBase || "https://openrouter.ai/api/v1";
    this.defaultModel = config.model || "anthropic/claude-3-haiku";
    this.siteUrl = config.siteUrl || "https://chatdock.local";
    this.siteName = config.siteName || "ChatDock";
  }

  isConfigured() {
    return !!this.apiKey;
  }

  async fetchAvailableModels() {
    if (!this.isConfigured()) return [];
    
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
        },
      });
      
      if (!response.ok) {
        console.warn(`[openrouter] failed to fetch models: ${response.status}`);
        return [];
      }
      
      const data = await response.json();
      return (data.data || []).map(m => m.id).filter(Boolean);
    } catch (err) {
      console.error("[openrouter] fetchAvailableModels failed:", err.message);
      return [];
    }
  }

  async chat(messages, options = {}) {
    if (!this.isConfigured()) {
      throw new Error("OpenRouter API key not configured");
    }

    const model = options.model || this.defaultModel;

    const body = {
      model,
      messages,
      stream: options.stream !== false,
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
        "HTTP-Referer": this.siteUrl,
        "X-Title": this.siteName,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} ${error}`);
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

module.exports = { OpenRouterProvider };
