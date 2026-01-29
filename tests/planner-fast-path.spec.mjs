import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

process.env.CHATDOCK_APP_PATH = projectRoot;

const { Planner } = await import("../src/server/orchestrator/planner.js");

describe("Planner - no fast path", () => {
  let mockOllamaClient;
  let planner;

  beforeEach(() => {
    mockOllamaClient = {
      chatWithTools: mock.fn(async () => ({
        content: "ok",
        tool_calls: [],
        model: "test-model",
      })),
    };

    planner = new Planner({
      ollamaClient: mockOllamaClient,
      model: "test-model",
    });
  });

  it("does not synthesize tool calls for file-like requests", async () => {
    const history = [{ role: "user", content: "open willo.txt" }];
    const result = await planner.plan(history);

    assert.strictEqual(mockOllamaClient.chatWithTools.mock.calls.length, 1);
    assert.strictEqual(result.type, "conversation");
    assert.deepStrictEqual(result.tool_calls, []);
  });
});
