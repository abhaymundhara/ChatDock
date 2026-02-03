/**
 * Base LLM Provider
 * Abstract class for all LLM providers
 */

class BaseLLMProvider {
  constructor(config = {}) {
    this.name = "base";
    this.config = config;
  }

  /**
   * Get available models from this provider
   * @returns {Promise<string[]>}
   */
  async fetchAvailableModels() {
    throw new Error("fetchAvailableModels not implemented");
  }

  /**
   * Send a chat request
   * @param {Array} messages - Chat messages
   * @param {Object} options - Options (model, tools, stream, etc.)
   * @returns {Promise<Response>}
   */
  async chat(messages, options = {}) {
    throw new Error("chat not implemented");
  }

  /**
   * Validate that the provider is properly configured
   * @returns {boolean}
   */
  isConfigured() {
    return false;
  }

  /**
   * Get provider info for display
   * @returns {Object}
   */
  getInfo() {
    return {
      name: this.name,
      configured: this.isConfigured(),
    };
  }
}

module.exports = { BaseLLMProvider };
