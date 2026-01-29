import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

process.env.CHATDOCK_APP_PATH = projectRoot;

const { Planner } = await import("../src/server/orchestrator/planner.js");

describe("Planner - decompose + assign", () => {
  let planner;
  let mockOllamaClient;

  beforeEach(() => {
    let call = 0;
    mockOllamaClient = {
      chat: mock.fn(async () => {
        call += 1;
        if (call === 1) return { content: "yes" }; // classifier
        if (call === 2) {
          return {
            content:
              "<tasks><task>Find README.md in repo and summarize key sections in 5 bullets.</task><task>Check package.json and list dependencies.</task></tasks>",
          };
        }
        return {
          content: JSON.stringify({
            assignments: [
              { task_id: "task_1", assignee_id: "file", dependencies: [] },
              { task_id: "task_2", assignee_id: "file", dependencies: [] },
            ],
          }),
        };
      }),
      chatWithTools: mock.fn(async () => ({
        content: "ok",
        tool_calls: [],
        model: "test-model",
      })),
    };

    planner = new Planner({ ollamaClient: mockOllamaClient, model: "test" });
  });

  it("returns todo_write with assigned agents from LLM assignment", async () => {
    const result = await planner.plan([
      { role: "user", content: "Summarize this repo and list dependencies." },
    ]);

    assert.strictEqual(result.type, "task");
    const todoCall = result.tool_calls.find(
      (tc) => tc.function?.name === "todo_write",
    );
    const args = JSON.parse(todoCall.function.arguments);

    assert.strictEqual(args.todos.length, 2);
    assert.strictEqual(args.todos[0].assigned_agent, "file");
    assert.strictEqual(args.todos[1].assigned_agent, "file");
    assert.strictEqual(args.todos[0].status, "in_progress");
    assert.strictEqual(args.todos[1].status, "pending");
  });
});
