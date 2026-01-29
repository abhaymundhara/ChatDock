import { describe, it, mock } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

process.env.CHATDOCK_APP_PATH = projectRoot;

const { Planner } = await import("../src/server/orchestrator/planner.js");

describe("Planner - tool requests bypass simple gate", () => {
  it("does not return conversation for file create even if classifier says no", async () => {
    const mockOllamaClient = {
      chat: mock.fn(async () => ({ content: "no" })),
      chatWithTools: mock.fn(async () => ({
        content: "ok",
        tool_calls: [],
        model: "test-model",
      })),
    };
    const planner = new Planner({ ollamaClient: mockOllamaClient, model: "test" });

    const result = await planner.plan([
      { role: "user", content: "create test.txt on desktop" },
    ]);

    assert.strictEqual(result.type, "task");
    assert.ok(result.tool_calls.find((tc) => tc.function?.name === "todo_write"));
  });
});
