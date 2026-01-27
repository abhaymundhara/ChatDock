/**
 * Tests for Server-Side Tool Filtering (Phase 2 Implementation)
 *
 * These tests verify the rule-based tool filtering system that replaced
 * embedding-based tool selection for better performance.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { filterToolsForMessage } from "../src/server/tools/registry.js";

describe("Server-Side Tool Filtering", () => {
  describe("filterToolsForMessage", () => {
    it("should filter tools for read_file operations", () => {
      const message = "read the contents of package.json";
      const filtered = filterToolsForMessage(message);

      assert.ok(filtered.length > 0, "should find at least one tool");
      const toolNames = filtered.map((t) => t.function?.name);
      assert.ok(
        toolNames.includes("read_file") ||
          toolNames.some((n) => n?.includes("read")),
        "should include read tool",
      );
    });

    it("should filter tools for write_file operations", () => {
      const message = 'write "hello world" to test.txt';
      const filtered = filterToolsForMessage(message);

      assert.ok(filtered.length > 0, "should find at least one tool");
      const toolNames = filtered.map((t) => t.function?.name);
      assert.ok(
        toolNames.includes("write_file") ||
          toolNames.some((n) => n?.includes("write")),
        "should include write tool",
      );
    });

    it("should filter tools for directory listing", () => {
      const message = "list files in the current directory";
      const filtered = filterToolsForMessage(message);

      assert.ok(filtered.length > 0, "should find at least one tool");
      const toolNames = filtered.map((t) => t.function?.name);
      assert.ok(
        toolNames.includes("list_directory") ||
          toolNames.some((n) => n?.includes("list")),
        "should include list tool",
      );
    });

    it("should filter tools for delete operations", () => {
      const message = "delete the old backup file";
      const filtered = filterToolsForMessage(message);

      assert.ok(filtered.length > 0, "should find at least one tool");
      const toolNames = filtered.map((t) => t.function?.name);
      assert.ok(
        toolNames.some((n) => n?.includes("delete") || n?.includes("remove")),
        "should include delete tool",
      );
    });

    it("should filter tools for move/rename operations", () => {
      const message = "move file.txt to another folder";
      const filtered = filterToolsForMessage(message);

      assert.ok(filtered.length > 0, "should find at least one tool");
      const toolNames = filtered.map((t) => t.function?.name);
      assert.ok(
        toolNames.some((n) => n?.includes("move") || n?.includes("rename")),
        "should include move tool",
      );
    });

    it("should filter tools for file search operations", () => {
      const message = "search for files with pattern test in src directory";
      const filtered = filterToolsForMessage(message);

      assert.ok(filtered.length > 0, "should find at least one tool");
      const toolNames = filtered.map((t) => t.function?.name);
      assert.ok(
        toolNames.some((n) => n?.includes("search")),
        "should include search tool",
      );
    });

    it("should filter tools for file info operations", () => {
      const message = "what is the size and modification time of this file";
      const filtered = filterToolsForMessage(message);

      assert.ok(filtered.length > 0, "should find at least one tool");
      const toolNames = filtered.map((t) => t.function?.name);
      assert.ok(
        toolNames.some((n) => n?.includes("info") || n?.includes("stat")),
        "should include file info tool",
      );
    });

    it("should filter tools for directory creation", () => {
      const message = "create a new folder called my-project";
      const filtered = filterToolsForMessage(message);

      assert.ok(filtered.length > 0, "should find at least one tool");
      const toolNames = filtered.map((t) => t.function?.name);
      assert.ok(
        toolNames.some((n) => n?.includes("create") && n?.includes("dir")),
        "should include create_directory tool",
      );
    });

    it("should filter tools for shell commands", () => {
      const message = "run npm test to execute tests";
      const filtered = filterToolsForMessage(message);

      assert.ok(filtered.length > 0, "should find at least one tool");
      const toolNames = filtered.map((t) => t.function?.name);
      assert.ok(
        toolNames.some(
          (n) =>
            n?.includes("shell") || n?.includes("run") || n?.includes("exec"),
        ),
        "should include shell/run tool",
      );
    });

    it("should handle ambiguous messages", () => {
      const message = "what do you think about this thing";
      const filtered = filterToolsForMessage(message);

      // For vague messages, should return all or subset of tools
      assert.ok(Array.isArray(filtered), "should return array");
    });

    it("should return array of tool objects", () => {
      const message = "read package.json";
      const filtered = filterToolsForMessage(message);

      assert.ok(Array.isArray(filtered), "should return an array");
      filtered.forEach((tool) => {
        assert.ok(tool.function?.name, "each tool should have a name");
        assert.ok(
          tool.function?.description,
          "each tool should have a description",
        );
        assert.ok(
          tool.function?.parameters,
          "each tool should have parameters",
        );
      });
    });

    it("should handle case-insensitive matching", () => {
      const message = "READ the file";
      const filtered = filterToolsForMessage(message);

      assert.ok(filtered.length > 0, "should match case-insensitive keywords");
    });

    it("should filter tools efficiently", () => {
      const message = "tell me a joke";
      const filtered = filterToolsForMessage(message);

      // For a joke request, we should get results but filter accordingly
      assert.ok(Array.isArray(filtered), "should return array");
    });
  });

  describe("Tool Registry", () => {
    it("should export filterToolsForMessage function", () => {
      assert.ok(
        typeof filterToolsForMessage === "function",
        "filterToolsForMessage should be a function",
      );
    });

    it("should return an array from filtering", () => {
      const result = filterToolsForMessage("read file.txt");
      assert.ok(Array.isArray(result), "should return array");
    });

    it("should handle different tool categories", () => {
      const readTools = filterToolsForMessage("read the configuration file");
      const writeTools = filterToolsForMessage("write data to backup");
      const deleteTools = filterToolsForMessage("delete old files");

      assert.ok(readTools.length > 0, "should find read tools");
      assert.ok(writeTools.length > 0, "should find write tools");
      assert.ok(deleteTools.length > 0, "should find delete tools");
    });
  });

  describe("Performance Characteristics", () => {
    it("should filter tools quickly (under 10ms)", () => {
      const message = "read package.json and list all dependencies";
      const iterations = 100;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        filterToolsForMessage(message);
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      assert.ok(
        avgTime < 10,
        `filtering should be fast, was ${avgTime.toFixed(2)}ms per call`,
      );
    });

    it("should return consistent results for same input", () => {
      const message = "move file.txt to backup folder";
      const result1 = filterToolsForMessage(message);
      const result2 = filterToolsForMessage(message);

      assert.strictEqual(
        result1.length,
        result2.length,
        "should return same number of tools",
      );
    });

    it("should handle case-insensitive matching", () => {
      const lowerCase = filterToolsForMessage("read the file");
      const upperCase = filterToolsForMessage("READ THE FILE");

      assert.strictEqual(
        lowerCase.length,
        upperCase.length,
        "should match case-insensitive",
      );
    });
  });
});
