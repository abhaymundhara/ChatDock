/**
 * Provider Factory
 * Creates the appropriate LLM provider based on configuration
 */

const { OllamaProvider } = require("./ollama");
const { OpenRouterProvider } = require("./openrouter");
const { OpenAIProvider } = require("./openai");
const { GroqProvider } = require("./groq");

const PROVIDERS = {
  ollama: OllamaProvider,
  openrouter: OpenRouterProvider,
  openai: OpenAIProvider,
  groq: GroqProvider,
};

/**
 * Create a provider instance based on config
 * @param {string} providerName - Name of the provider
 * @param {Object} config - Provider-specific configuration
 * @returns {BaseLLMProvider}
 */
function createProvider(providerName, config = {}) {
  const ProviderClass = PROVIDERS[providerName.toLowerCase()];
  if (!ProviderClass) {
    throw new Error(`Unknown provider: ${providerName}. Available: ${Object.keys(PROVIDERS).join(", ")}`);
  }
  return new ProviderClass(config);
}

/**
 * Get the best available provider from config
 * Priority: explicit selection > first configured provider > ollama
 * @param {Object} config - Full application config
 * @returns {BaseLLMProvider}
 */
function getProvider(config = {}) {
  const providers = config.providers || {};
  const defaultProvider = config.defaultProvider || config.provider;
  
  // 1. If explicitly set, use that
  if (defaultProvider && providers[defaultProvider]) {
    const providerConfig = {
      ...providers[defaultProvider],
      userDataPath: config.userDataPath,
      model: config.model,
    };
    return createProvider(defaultProvider, providerConfig);
  }
  
  // 2. Find first configured provider
  for (const [name, providerConfig] of Object.entries(providers)) {
    if (providerConfig && providerConfig.apiKey) {
      console.log(`[provider-factory] Using configured provider: ${name}`);
      return createProvider(name, {
        ...providerConfig,
        userDataPath: config.userDataPath,
        model: config.model,
      });
    }
  }
  
  // 3. Default to Ollama (no API key needed)
  console.log("[provider-factory] Defaulting to Ollama");
  return new OllamaProvider({
    ollamaBase: config.ollamaBase,
    userDataPath: config.userDataPath,
    model: config.model,
  });
}

/**
 * Get all configured providers
 * @param {Object} config - Full application config
 * @returns {Object<string, BaseLLMProvider>}
 */
function getAllProviders(config = {}) {
  const providers = config.providers || {};
  const result = {};
  
  for (const [name, providerConfig] of Object.entries(providers)) {
    try {
      result[name] = createProvider(name, {
        ...providerConfig,
        userDataPath: config.userDataPath,
      });
    } catch (e) {
      console.warn(`[provider-factory] Failed to create provider ${name}:`, e.message);
    }
  }
  
  // Always include Ollama as fallback
  if (!result.ollama) {
    result.ollama = new OllamaProvider({
      ollamaBase: config.ollamaBase,
      userDataPath: config.userDataPath,
    });
  }
  
  return result;
}

/**
 * List available provider names
 * @returns {string[]}
 */
function listProviderNames() {
  return Object.keys(PROVIDERS);
}

module.exports = { 
  createProvider, 
  getProvider, 
  getAllProviders, 
  listProviderNames,
  PROVIDERS,
};
