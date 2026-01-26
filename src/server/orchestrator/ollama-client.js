/**
 * Ollama Client for ChatDock
 * Handles all communication with the Ollama API
 */

const OLLAMA_BASE = process.env.OLLAMA_BASE || 'http://127.0.0.1:11434';

class OllamaClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || OLLAMA_BASE;
    this.defaultModel = options.model || 'nemotron-3-nano:30b';
    this.timeout = options.timeout || 120000; // 2 minutes default
  }

  /**
   * Health check - verify Ollama is running
   * @returns {Promise<{ok: boolean, version?: string, error?: string}>}
   */
  async healthCheck() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${this.baseUrl}/api/version`, {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}` };
      }
      
      const data = await response.json();
      return { ok: true, version: data.version };
    } catch (error) {
      if (error.name === 'AbortError') {
        return { ok: false, error: 'Connection timeout' };
      }
      return { ok: false, error: error.message || 'Connection failed' };
    }
  }

  /**
   * List available models
   * @returns {Promise<string[]>}
   */
  async listModels() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET'
      });
      
      if (!response.ok) {
        return [];
      }
      
      const data = await response.json();
      return Array.isArray(data.models) 
        ? data.models.map(m => m.name).filter(Boolean) 
        : [];
    } catch {
      return [];
    }
  }

  /**
   * Chat with the model (non-streaming)
   * @param {Array<{role: string, content: string}>} messages
   * @param {Object} options
   * @returns {Promise<{content: string, model: string}>}
   */
  async chat(messages, options = {}) {
    const model = options.model || this.defaultModel;
    const temperature = options.temperature ?? 0.7;
    
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { temperature },
        ...(options.format && { format: options.format })
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.message?.content || '',
      model: data.model
    };
  }

  /**
   * Chat with the model (streaming)
   * @param {Array<{role: string, content: string}>} messages
   * @param {Object} options
   * @returns {AsyncGenerator<{content: string, done: boolean}>}
   */
  async *chatStream(messages, options = {}) {
    const model = options.model || this.defaultModel;
    const temperature = options.temperature ?? 0.7;
    
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options: { temperature }
      })
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      
      if (done) {
        // Process any remaining buffer
        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer);
            if (json.message?.content) {
              yield { content: json.message.content, done: json.done || false };
            }
          } catch {}
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.message?.content) {
            yield { content: json.message.content, done: json.done || false };
          }
        } catch {}
      }
    }
  }

  /**
   * Chat with tool calling support
   * @param {Array<{role: string, content: string}>} messages
   * @param {Array<Object>} tools - Tool definitions
   * @param {Object} options
   * @returns {Promise<{content?: string, tool_calls?: Array}>}
   */
  async chatWithTools(messages, tools, options = {}) {
    const model = options.model || this.defaultModel;
    const temperature = options.temperature ?? 0.7;
    
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        tools,
        options: { temperature }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      content: data.message?.content || '',
      tool_calls: data.message?.tool_calls || [],
      model: data.model
    };
  }
}

module.exports = { OllamaClient };
