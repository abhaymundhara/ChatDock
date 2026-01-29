/**
 * Tests for Conversation Handler
 * Phase 1: Planner Implementation
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Set the app path for file loading
process.env.CHATDOCK_APP_PATH = projectRoot;

// Import after setting env
const { ConversationHandler, loadConversationPrompt, getRecentContext } =
  await import("../src/server/orchestrator/conversation-handler.js");

describe("ConversationHandler - Load System Prompt", () => {
  it("should load CONVERSATION.md successfully", () => {
    const prompt = loadConversationPrompt();
    assert.ok(prompt.length > 0, "Prompt should not be empty");
    assert.ok(
      prompt.includes("Conversation Specialist"),
      "Prompt should contain Conversation Specialist text",
    );
  });

  it("should throw if CONVERSATION.md not found", () => {
    const originalPath = process.env.CHATDOCK_APP_PATH;
    process.env.CHATDOCK_APP_PATH = "/nonexistent/path";

    assert.throws(
      () => loadConversationPrompt(),
      /CONVERSATION.md not found/,
      "Should throw when CONVERSATION.md is missing",
    );

    process.env.CHATDOCK_APP_PATH = originalPath;
  });
});

describe("ConversationHandler - Get Recent Context", () => {
  it("should get last 3 exchanges (6 messages)", () => {
    const history = [
      { role: "user", content: "Message 1" },
      { role: "assistant", content: "Response 1" },
      { role: "user", content: "Message 2" },
      { role: "assistant", content: "Response 2" },
      { role: "user", content: "Message 3" },
      { role: "assistant", content: "Response 3" },
      { role: "user", content: "Message 4" },
      { role: "assistant", content: "Response 4" },
    ];

    const recent = getRecentContext(history, 3);

    assert.strictEqual(recent.length, 6);
    assert.strictEqual(recent[0].content, "Message 2");
    assert.strictEqual(recent[5].content, "Response 4");
  });

  it("should return all messages if less than requested", () => {
    const history = [
      { role: "user", content: "Message 1" },
      { role: "assistant", content: "Response 1" },
    ];

    const recent = getRecentContext(history, 3);

    assert.strictEqual(recent.length, 2);
    assert.deepStrictEqual(recent, history);
  });

  it("should ensure context starts with user message", () => {
    const history = [
      { role: "assistant", content: "Stray response" },
      { role: "user", content: "Message 1" },
      { role: "assistant", content: "Response 1" },
      { role: "user", content: "Message 2" },
    ];

    const recent = getRecentContext(history, 3);

    assert.strictEqual(recent[0].role, "user");
    assert.strictEqual(recent[0].content, "Message 1");
  });

  it("should handle empty history", () => {
    const recent = getRecentContext([], 3);
    assert.strictEqual(recent.length, 0);
  });

  it("should handle single message", () => {
    const history = [{ role: "user", content: "Hello" }];

    const recent = getRecentContext(history, 3);

    assert.strictEqual(recent.length, 1);
    assert.strictEqual(recent[0].content, "Hello");
  });

  it("should support custom context size", () => {
    const history = [
      { role: "user", content: "M1" },
      { role: "assistant", content: "R1" },
      { role: "user", content: "M2" },
      { role: "assistant", content: "R2" },
      { role: "user", content: "M3" },
      { role: "assistant", content: "R3" },
    ];

    const recent = getRecentContext(history, 2);

    assert.strictEqual(recent.length, 4);
    assert.strictEqual(recent[0].content, "M2");
  });
});

describe("ConversationHandler - isConversational", () => {
  it("should detect greetings", () => {
    assert.strictEqual(ConversationHandler.isConversational("Hello"), true);
    assert.strictEqual(ConversationHandler.isConversational("Hi there"), true);
    assert.strictEqual(
      ConversationHandler.isConversational("Good morning"),
      true,
    );
    assert.strictEqual(ConversationHandler.isConversational("hey"), true);
  });

  it("should detect thank you messages", () => {
    assert.strictEqual(ConversationHandler.isConversational("Thanks"), true);
    assert.strictEqual(ConversationHandler.isConversational("Thank you"), true);
    assert.strictEqual(
      ConversationHandler.isConversational("Appreciate it"),
      true,
    );
  });

  it("should detect goodbyes", () => {
    assert.strictEqual(ConversationHandler.isConversational("Bye"), true);
    assert.strictEqual(ConversationHandler.isConversational("Goodbye"), true);
    assert.strictEqual(
      ConversationHandler.isConversational("See you later"),
      true,
    );
  });

  it("should detect questions about well-being", () => {
    assert.strictEqual(
      ConversationHandler.isConversational("How are you?"),
      true,
    );
    assert.strictEqual(
      ConversationHandler.isConversational("What's up?"),
      true,
    );
  });

  it("should detect opinion requests", () => {
    assert.strictEqual(
      ConversationHandler.isConversational("What do you think about X?"),
      true,
    );
    assert.strictEqual(
      ConversationHandler.isConversational("Your opinion on this?"),
      true,
    );
  });

  it("should detect explanations", () => {
    assert.strictEqual(
      ConversationHandler.isConversational("Explain recursion"),
      true,
    );
    assert.strictEqual(
      ConversationHandler.isConversational("What is async/await?"),
      true,
    );
    assert.strictEqual(
      ConversationHandler.isConversational("Tell me about React"),
      true,
    );
  });

  it("should not detect task-based requests", () => {
    assert.strictEqual(
      ConversationHandler.isConversational("Find config.json"),
      false,
    );
    assert.strictEqual(
      ConversationHandler.isConversational("Run npm install"),
      false,
    );
    assert.strictEqual(
      ConversationHandler.isConversational("Create a new file"),
      false,
    );
  });
});

describe("ConversationHandler - Integration", () => {
  let mockOllamaClient;
  let handler;

  beforeEach(() => {
    // Create mock Ollama client
    mockOllamaClient = {
      chat: mock.fn(async (messages, options) => ({
        content: "Hello! How can I help you today?",
        model: "test-model",
      })),
      chatStream: mock.fn(async function* (messages, options) {
        yield { content: "Hello! ", done: false };
        yield { content: "How can I ", done: false };
        yield { content: "help you?", done: true };
      }),
    };

    handler = new ConversationHandler({
      ollamaClient: mockOllamaClient,
      model: "test-model",
    });
  });

  it("should initialize with system prompt", () => {
    assert.ok(handler.systemPrompt.length > 0);
  });

  it("should use default context size of 3", () => {
    assert.strictEqual(handler.contextSize, 3);
  });

  it("should handle conversation with fresh context", async () => {
    const history = [
      { role: "user", content: "Message 1" },
      { role: "assistant", content: "Response 1" },
      { role: "user", content: "Message 2" },
      { role: "assistant", content: "Response 2" },
      { role: "user", content: "Hello" },
    ];

    const result = await handler.handleConversation(history);

    assert.strictEqual(result.content, "Hello! How can I help you today?");
    assert.strictEqual(result.model, "test-model");
  });

  it("should only send recent context to LLM", async () => {
    const history = [
      { role: "user", content: "Old message 1" },
      { role: "assistant", content: "Old response 1" },
      { role: "user", content: "Old message 2" },
      { role: "assistant", content: "Old response 2" },
      { role: "user", content: "Recent message 1" },
      { role: "assistant", content: "Recent response 1" },
      { role: "user", content: "Recent message 2" },
      { role: "assistant", content: "Recent response 2" },
      { role: "user", content: "Current message" },
    ];

    await handler.handleConversation(history);

    const callArgs = mockOllamaClient.chat.mock.calls[0].arguments;
    const messages = callArgs[0];
    const userMessages = messages.filter((m) => m.role === "user");

    // Should have system + 3 recent exchanges (6 messages)
    // But last message is current, so context should be 3 exchanges = 6 + current = 7 total
    assert.ok(messages.length <= 8); // system + 6 recent + current
    assert.ok(!userMessages.some((m) => m.content.includes("Old message")));
  });

  it("should use temperature 0.7 for natural conversation", async () => {
    const history = [{ role: "user", content: "Hello" }];

    await handler.handleConversation(history);

    const callArgs = mockOllamaClient.chat.mock.calls[0].arguments;
    const options = callArgs[1];

    assert.strictEqual(options.temperature, 0.7);
  });

  it("should throw on empty conversation history", async () => {
    await assert.rejects(
      async () => handler.handleConversation([]),
      /Conversation history is required/,
    );
  });

  it("should handle streaming conversation", async () => {
    const history = [{ role: "user", content: "Hello" }];

    const chunks = [];
    for await (const chunk of handler.handleConversationStream(history)) {
      chunks.push(chunk);
    }

    assert.strictEqual(chunks.length, 3);
    assert.strictEqual(chunks[0].content, "Hello! ");
    assert.strictEqual(chunks[2].done, true);
  });

  it("should throw on streaming with empty history", async () => {
    const generator = handler.handleConversationStream([]);

    await assert.rejects(async () => {
      for await (const chunk of generator) {
        // Should not reach here
      }
    }, /Conversation history is required/);
  });

  it("should use custom context size", async () => {
    const customHandler = new ConversationHandler({
      ollamaClient: mockOllamaClient,
      model: "test-model",
      contextSize: 2,
    });

    const history = [
      { role: "user", content: "M1" },
      { role: "assistant", content: "R1" },
      { role: "user", content: "M2" },
      { role: "assistant", content: "R2" },
      { role: "user", content: "M3" },
      { role: "assistant", content: "R3" },
      { role: "user", content: "Current" },
    ];

    await customHandler.handleConversation(history);

    const callArgs = mockOllamaClient.chat.mock.calls[0].arguments;
    const messages = callArgs[0];
    const userMessages = messages.filter((m) => m.role === "user");

    // With context size 2, should only keep last 2 exchanges + current
    assert.ok(!userMessages.some((m) => m.content === "M1"));
  });

  it("should handle LLM errors gracefully", async () => {
    mockOllamaClient.chat = mock.fn(async () => {
      throw new Error("Connection failed");
    });

    const history = [{ role: "user", content: "Hello" }];

    await assert.rejects(
      async () => handler.handleConversation(history),
      /Conversation handler failed/,
    );
  });

  it("should handle streaming errors gracefully", async () => {
    mockOllamaClient.chatStream = mock.fn(async function* () {
      throw new Error("Stream failed");
    });

    const history = [{ role: "user", content: "Hello" }];

    await assert.rejects(async () => {
      for await (const chunk of handler.handleConversationStream(history)) {
        // Should not reach here
      }
    }, /Conversation streaming failed/);
  });
});
