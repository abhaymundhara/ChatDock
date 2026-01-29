import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

process.env.CHATDOCK_APP_PATH = projectRoot;

const { Planner } = await import("../src/server/orchestrator/planner.js");

describe("Planner - LLM simple gate", () => {
  let mockOllamaClient;
  let planner;

  beforeEach(() => {
    let call = 0;
    mockOllamaClient = {
      chat: mock.fn(async () => {
        call += 1;
        return call === 1
          ? { content: "no", model: "test-model" }
          : { content: "Hello!", model: "test-model" };
      }),
      chatWithTools: mock.fn(async () => ({
        content: "tool-response",
        tool_calls: [],
        model: "test-model",
      })),
    };

    planner = new Planner({
      ollamaClient: mockOllamaClient,
      model: "test-model",
    });
  });

  it("returns conversation response for simple questions without tool calls", async () => {
    const history = [{ role: "user", content: "what is ai?" }];
    const result = await planner.plan(history);

    assert.strictEqual(result.type, "conversation");
    assert.strictEqual(result.content, "Hello!");
    assert.deepStrictEqual(result.tool_calls, []);
    assert.strictEqual(mockOllamaClient.chat.mock.calls.length, 2);
    assert.strictEqual(mockOllamaClient.chatWithTools.mock.calls.length, 0);
    assert.strictEqual(planner.toolsLoaded, false);
  });
});
