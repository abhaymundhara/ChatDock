// LLM Response Cache
// Caches LLM responses to avoid expensive re-inference for similar queries

const crypto = require("node:crypto");

class LLMCache {
  constructor(maxSize = 100, ttlMs = 1000 * 60 * 60) {
    // 1 hour TTL
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Generate cache key from user message and model
   */
  generateKey(message, model, tools) {
    const normalizedMsg = message.toLowerCase().trim();
    const toolNames = tools
      .map((t) => t.function.name)
      .sort()
      .join(",");
    const key = `${model}:${toolNames}:${normalizedMsg}`;
    return crypto.createHash("md5").update(key).digest("hex");
  }

  /**
   * Get cached response if available and not expired
   */
  get(message, model, tools) {
    const key = this.generateKey(message, model, tools);
    const cached = this.cache.get(key);

    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    console.log(`[cache] HIT for: "${message.substring(0, 50)}..."`);
    return cached.response;
  }

  /**
   * Store response in cache
   */
  set(message, model, tools, response) {
    const key = this.generateKey(message, model, tools);

    // LRU eviction if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      response,
      timestamp: Date.now(),
    });

    console.log(`[cache] STORED for: "${message.substring(0, 50)}..."`);
  }

  /**
   * Clear all cached responses
   */
  clear() {
    this.cache.clear();
    console.log("[cache] Cleared all entries");
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
    };
  }
}

module.exports = new LLMCache();
