/**
 * OpenAI Provider
 * Connects to OpenAI API (also works with Azure OpenAI and compatible APIs)
 */

const { BaseLLMProvider } = require("./base");

class OpenAIProvider extends BaseLLMProvider {
  constructor(config = {}) {
    super(config);
    this.name = "openai";
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.baseUrl = config.apiBase || "https://api.openai.com/v1";
    this.defaultModel = config.model || "gpt-4o-mini";
    this.organization = config.organization || process.env.OPENAI_ORG;
  }

  isConfigured() {
    return !!this.apiKey;
  }

  async fetchAvailableModels() {
    if (!this.isConfigured()) return [];
    
    try {
      const headers = {
        "Authorization": `Bearer ${this.apiKey}`,
      };
      if (this.organization) {
        headers["OpenAI-Organization"] = this.organization;
      }

      const response = await fetch(`${this.baseUrl}/models`, { headers });
      
      if (!response.ok) {
        console.warn(`[openai] failed to fetch models: ${response.status}`);
        return [];
      }
      
      const data = await response.json();
      return (data.data || [])
        .filter(m => m.id.includes("gpt") || m.id.includes("o1") || m.id.includes("o3"))
        .map(m => m.id);
    } catch (err) {
      console.error("[openai] fetchAvailableModels failed:", err.message);
      return [];
    }
  }

  async chat(messages, options = {}) {
    if (!this.isConfigured()) {
      throw new Error("OpenAI API key not configured");
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

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.apiKey}`,
    };
    if (this.organization) {
      headers["OpenAI-Organization"] = this.organization;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
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

module.exports = { OpenAIProvider };
