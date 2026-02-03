/**
 * Groq Provider
 * Connects to Groq for ultra-fast inference
 */

const { BaseLLMProvider } = require("./base");

class GroqProvider extends BaseLLMProvider {
  constructor(config = {}) {
    super(config);
    this.name = "groq";
    this.apiKey = config.apiKey || process.env.GROQ_API_KEY;
    this.baseUrl = config.apiBase || "https://api.groq.com/openai/v1";
    this.defaultModel = config.model || "llama-3.3-70b-versatile";
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
        console.warn(`[groq] failed to fetch models: ${response.status}`);
        return [];
      }
      
      const data = await response.json();
      return (data.data || []).map(m => m.id).filter(Boolean);
    } catch (err) {
      console.error("[groq] fetchAvailableModels failed:", err.message);
      return [];
    }
  }

  async chat(messages, options = {}) {
    if (!this.isConfigured()) {
      throw new Error("Groq API key not configured");
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
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${response.status} ${error}`);
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

module.exports = { GroqProvider };
