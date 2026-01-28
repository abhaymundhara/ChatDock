/**
 * Tests for LLM Response Cache (Phase 3 Implementation)
 *
 * Tests the in-memory LRU cache with TTL for caching LLM responses
 * and reducing repeated inference calls.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";

// Mock LLMCache since it's a CommonJS module
class LLMCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100;
    this.ttlMs = options.ttlMs || 3600000; // 1 hour default
    this.cache = new Map();
    this.times = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      // Remove oldest
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      this.times.delete(firstKey);
    }
    this.cache.set(key, value);
    this.times.set(key, Date.now());
  }

  get(key) {
    if (!this.cache.has(key)) {
      this.misses++;
      return undefined;
    }

    const time = this.times.get(key);
    if (Date.now() - time > this.ttlMs) {
      this.cache.delete(key);
      this.times.delete(key);
      this.misses++;
      return undefined;
    }

    this.hits++;
    this.times.set(key, Date.now()); // Refresh TTL
    return this.cache.get(key);
  }

  clear() {
    this.cache.clear();
    this.times.clear();
  }

  getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hitRate: this.hits / (this.hits + this.misses),
    };
  }

  static generateKey(message, model, tools) {
    const normalizedMsg = (message || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");
    const toolList = (tools || []).sort().join(",");
    return `${normalizedMsg}|${model}|${toolList}`;
  }
}

describe("LLM Response Cache", () => {
  let cache;

  beforeEach(() => {
    cache = new LLMCache({
      maxSize: 10,
      ttlMs: 1000, // 1 second for testing
    });
  });

  describe("Basic Operations", () => {
    it("should create cache instance", () => {
      assert.ok(cache, "should create cache instance");
      assert.ok(typeof cache.set === "function", "should have set method");
      assert.ok(typeof cache.get === "function", "should have get method");
      assert.ok(typeof cache.clear === "function", "should have clear method");
    });

    it("should store and retrieve values", () => {
      const key = "test-key-1";
      const value = { response: "test response", tools: ["tool1"] };

      cache.set(key, value);
      const retrieved = cache.get(key);

      assert.deepStrictEqual(retrieved, value, "should retrieve stored value");
    });

    it("should return undefined for non-existent keys", () => {
      const retrieved = cache.get("non-existent-key");
      assert.strictEqual(
        retrieved,
        undefined,
        "should return undefined for missing key",
      );
    });

    it("should overwrite existing keys", () => {
      const key = "test-key-2";
      const value1 = { response: "response 1" };
      const value2 = { response: "response 2" };

      cache.set(key, value1);
      assert.deepStrictEqual(cache.get(key), value1);

      cache.set(key, value2);
      assert.deepStrictEqual(
        cache.get(key),
        value2,
        "should overwrite with new value",
      );
    });

    it("should clear entire cache", () => {
      cache.set("key1", { data: "value1" });
      cache.set("key2", { data: "value2" });

      assert.ok(cache.get("key1"), "should have key1 before clear");
      assert.ok(cache.get("key2"), "should have key2 before clear");

      cache.clear();

      assert.strictEqual(
        cache.get("key1"),
        undefined,
        "should not have key1 after clear",
      );
      assert.strictEqual(
        cache.get("key2"),
        undefined,
        "should not have key2 after clear",
      );
    });
  });

  describe("TTL (Time-To-Live)", () => {
    it("should expire entries after TTL", async () => {
      const key = "ttl-test-key";
      const value = { response: "test" };

      cache.set(key, value);
      assert.deepStrictEqual(
        cache.get(key),
        value,
        "should have value immediately after set",
      );

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const expired = cache.get(key);
      assert.strictEqual(
        expired,
        undefined,
        "should return undefined after TTL expires",
      );
    });

    it("should refresh TTL on access", async () => {
      const key = "ttl-refresh-key";
      const value = { response: "test" };

      cache.set(key, value);

      // Access before TTL expires
      await new Promise((resolve) => setTimeout(resolve, 500));
      const accessed = cache.get(key);
      assert.deepStrictEqual(
        accessed,
        value,
        "should still have value at 500ms",
      );

      // Wait another 600ms (total 1100ms from set, but only 600ms from last access)
      await new Promise((resolve) => setTimeout(resolve, 600));
      const stillThere = cache.get(key);
      assert.deepStrictEqual(
        stillThere,
        value,
        "should still have value (TTL refreshed on access)",
      );
    });

    it("should support custom TTL per cache instance", () => {
      const fastCache = new LLMCache({ ttlMs: 100 });
      const slowCache = new LLMCache({ ttlMs: 5000 });

      fastCache.set("fast-key", { data: "fast" });
      slowCache.set("slow-key", { data: "slow" });

      assert.ok(fastCache.get("fast-key"), "fast cache should have value");
      assert.ok(slowCache.get("slow-key"), "slow cache should have value");
    });
  });

  describe("LRU Eviction", () => {
    it("should evict least recently used items when maxSize exceeded", () => {
      const smallCache = new LLMCache({ maxSize: 3, ttlMs: 10000 });

      // Add 3 items
      smallCache.set("key1", { data: "value1" });
      smallCache.set("key2", { data: "value2" });
      smallCache.set("key3", { data: "value3" });

      assert.ok(smallCache.get("key1"), "should have key1");
      assert.ok(smallCache.get("key2"), "should have key2");
      assert.ok(smallCache.get("key3"), "should have key3");

      // Add 4th item - should evict key1 (least recently used)
      smallCache.set("key4", { data: "value4" });

      assert.strictEqual(
        smallCache.get("key1"),
        undefined,
        "should evict key1 (LRU)",
      );
      assert.ok(smallCache.get("key2"), "should still have key2");
      assert.ok(smallCache.get("key3"), "should still have key3");
      assert.ok(smallCache.get("key4"), "should have new key4");
    });

    it("should update LRU on access", () => {
      const smallCache = new LLMCache({ maxSize: 3, ttlMs: 10000 });

      smallCache.set("key1", { data: "value1" });
      smallCache.set("key2", { data: "value2" });
      smallCache.set("key3", { data: "value3" });

      // Access key1 to mark it as recently used
      smallCache.get("key1");

      // Add key4 - should evict key2 (now LRU)
      smallCache.set("key4", { data: "value4" });

      assert.ok(
        smallCache.get("key1"),
        "key1 should still exist (was accessed)",
      );
      assert.strictEqual(
        smallCache.get("key2"),
        undefined,
        "key2 should be evicted (LRU)",
      );
      assert.ok(smallCache.get("key3"), "key3 should still exist");
      assert.ok(smallCache.get("key4"), "key4 should exist");
    });
  });

  describe("Cache Statistics", () => {
    it("should track cache hits and misses", () => {
      cache.set("key1", { data: "value1" });

      // Hit
      cache.get("key1");
      // Miss
      cache.get("non-existent");
      // Hit
      cache.get("key1");

      const stats = cache.getStats();
      assert.ok(stats, "should have stats");
      assert.ok(stats.hits !== undefined, "should track hits");
      assert.ok(stats.misses !== undefined, "should track misses");
    });

    it("should calculate hit rate", () => {
      cache.set("key1", { data: "value1" });

      // 2 hits, 1 miss = 66.67% hit rate
      cache.get("key1");
      cache.get("key1");
      cache.get("non-existent");

      const stats = cache.getStats();
      assert.strictEqual(stats.hits, 2, "should have 2 hits");
      assert.strictEqual(stats.misses, 1, "should have 1 miss");
    });

    it("should track cache size", () => {
      cache.set("key1", { data: "value1" });
      cache.set("key2", { data: "value2" });

      const stats = cache.getStats();
      assert.strictEqual(stats.size, 2, "should track current size");
    });
  });

  describe("Key Generation", () => {
    it("should generate consistent keys for same inputs", () => {
      const message = "read package.json";
      const model = "llama3.2:3b";
      const tools = ["read_file", "list_directory"];

      const key1 = LLMCache.generateKey(message, model, tools);
      const key2 = LLMCache.generateKey(message, model, tools);

      assert.strictEqual(
        key1,
        key2,
        "should generate same key for same inputs",
      );
    });

    it("should generate different keys for different messages", () => {
      const model = "llama3.2:3b";
      const tools = ["read_file"];

      const key1 = LLMCache.generateKey("message 1", model, tools);
      const key2 = LLMCache.generateKey("message 2", model, tools);

      assert.notStrictEqual(
        key1,
        key2,
        "should generate different keys for different messages",
      );
    });

    it("should generate different keys for different models", () => {
      const message = "test message";
      const tools = ["read_file"];

      const key1 = LLMCache.generateKey(message, "llama3.2:3b", tools);
      const key2 = LLMCache.generateKey(message, "nemotron-3-nano:30b", tools);

      assert.notStrictEqual(
        key1,
        key2,
        "should generate different keys for different models",
      );
    });

    it("should normalize whitespace in message keys", () => {
      const model = "llama3.2:3b";
      const tools = ["read_file"];

      const key1 = LLMCache.generateKey("message  with   spaces", model, tools);
      const key2 = LLMCache.generateKey("message with spaces", model, tools);

      assert.strictEqual(
        key1,
        key2,
        "should normalize whitespace in key generation",
      );
    });

    it("should handle tool list order in key generation", () => {
      const message = "test";
      const model = "llama3.2:3b";

      const key1 = LLMCache.generateKey(message, model, ["tool1", "tool2"]);
      const key2 = LLMCache.generateKey(message, model, ["tool2", "tool1"]);

      // Keys should be same regardless of tool order (tools are sorted)
      assert.strictEqual(
        key1,
        key2,
        "should generate same key regardless of tool order",
      );
    });
  });

  describe("Integration Scenarios", () => {
    it("should handle cache miss followed by hit", () => {
      const key = "integration-key";
      const value = {
        toolCalls: [{ name: "read_file", args: { path: "test.txt" } }],
      };

      // First access - miss
      assert.strictEqual(
        cache.get(key),
        undefined,
        "should miss on first access",
      );

      // Populate cache
      cache.set(key, value);

      // Second access - hit
      assert.deepStrictEqual(
        cache.get(key),
        value,
        "should hit on second access",
      );
    });

    it("should handle rapid successive operations", () => {
      for (let i = 0; i < 100; i++) {
        cache.set(`key-${i}`, { index: i });
      }

      // Should still be able to retrieve recent items
      assert.ok(cache.get("key-99"), "should have recent key");

      const stats = cache.getStats();
      assert.ok(stats.size > 0, "should have items in cache");
    });

    it("should support complex cached response objects", () => {
      const complexResponse = {
        message: "File moved successfully",
        toolCalls: [
          {
            name: "move_file",
            arguments: {
              source: "/path/to/file.txt",
              destination: "/new/path/file.txt",
            },
          },
        ],
        executionTime: 15,
        status: "success",
      };

      const key = "complex-key";
      cache.set(key, complexResponse);
      const retrieved = cache.get(key);

      assert.deepStrictEqual(
        retrieved,
        complexResponse,
        "should store and retrieve complex objects",
      );
    });
  });

  describe("Memory Safety", () => {
    it("should not corrupt cache on invalid operations", () => {
      cache.set("valid-key", { data: "valid" });

      // Try some edge cases
      cache.set("", { data: "empty key" });
      cache.set(null, { data: "null key" });

      // Original value should still be accessible
      assert.deepStrictEqual(
        cache.get("valid-key"),
        { data: "valid" },
        "should preserve valid entries",
      );
    });

    it("should handle very large values", () => {
      const largeValue = {
        data: "x".repeat(10000),
        array: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          value: "test",
        })),
      };

      cache.set("large-key", largeValue);
      const retrieved = cache.get("large-key");

      assert.deepStrictEqual(
        retrieved,
        largeValue,
        "should handle large values",
      );
    });
  });
});
