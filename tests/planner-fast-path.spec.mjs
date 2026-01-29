import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

process.env.CHATDOCK_APP_PATH = projectRoot;

const { Planner } = await import("../src/server/orchestrator/planner.js");

describe("Planner - fast path rewrite", () => {
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

  it("enhances file create todos with WHAT/WHERE/HOW and assigned_agent", async () => {
    const history = [{ role: "user", content: "create test.txt on desktop" }];
    const result = await planner.plan(history);

    assert.strictEqual(result.type, "task");
    const todoCall = result.tool_calls.find(
      (tc) => tc.function?.name === "todo_write",
    );
    const args = JSON.parse(todoCall.function.arguments);
    const [todo] = args.todos;

    assert.match(
      todo.description,
      /Create an empty file named test\.txt on the Desktop using a shell command or write operation/i,
    );
    assert.strictEqual(todo.assigned_agent, "file");
    assert.strictEqual(todo.status, "in_progress");
  });
});
