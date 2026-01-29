/**
 * Tests for Planner Agent
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
const {
  Planner,
  loadPlannerPrompt,
  validateTaskStructure,
  extractJSON,
  validateDependencies,
} = await import("../src/server/orchestrator/planner.js");

describe("Planner - Load System Prompt", () => {
  it("should load PLANNER.md successfully", () => {
    const prompt = loadPlannerPrompt();
    assert.ok(prompt.length > 0, "Prompt should not be empty");
    assert.ok(
      prompt.includes("Planner Agent"),
      "Prompt should contain Planner Agent text",
    );
  });

  it("should throw if PLANNER.md not found", () => {
    const originalPath = process.env.CHATDOCK_APP_PATH;
    process.env.CHATDOCK_APP_PATH = "/nonexistent/path";

    assert.throws(
      () => loadPlannerPrompt(),
      /PLANNER.md not found/,
      "Should throw when PLANNER.md is missing",
    );

    process.env.CHATDOCK_APP_PATH = originalPath;
  });
});

describe("Planner - Extract JSON", () => {
  it("should extract direct JSON", () => {
    const json = '{"type": "conversation", "message": "Hello"}';
    const result = extractJSON(json);
    assert.deepStrictEqual(result, { type: "conversation", message: "Hello" });
  });

  it("should extract JSON from markdown code blocks", () => {
    const markdown = '```json\n{"type": "task", "tasks": []}\n```';
    const result = extractJSON(markdown);
    assert.deepStrictEqual(result, { type: "task", tasks: [] });
  });

  it("should extract JSON without language identifier", () => {
    const markdown = '```\n{"type": "conversation"}\n```';
    const result = extractJSON(markdown);
    assert.deepStrictEqual(result, { type: "conversation" });
  });

  it("should extract JSON from text with surrounding content", () => {
    const text =
      'Here is the plan:\n{"type": "task", "tasks": []}\nEnd of plan';
    const result = extractJSON(text);
    assert.deepStrictEqual(result, { type: "task", tasks: [] });
  });

  it("should return null for invalid JSON", () => {
    const invalid = "This is not JSON";
    const result = extractJSON(invalid);
    assert.strictEqual(result, null);
  });

  it("should return null for empty input", () => {
    assert.strictEqual(extractJSON(""), null);
    assert.strictEqual(extractJSON(null), null);
  });
});

describe("Planner - Validate Task Structure", () => {
  it("should validate conversation type", () => {
    const output = {
      type: "conversation",
      specialist: "conversation",
      message: "Hello there!",
    };
    const result = validateTaskStructure(output);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  it("should reject conversation without specialist", () => {
    const output = {
      type: "conversation",
      message: "Hello",
    };
    const result = validateTaskStructure(output);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("specialist")));
  });

  it("should reject conversation without message", () => {
    const output = {
      type: "conversation",
      specialist: "conversation",
    };
    const result = validateTaskStructure(output);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("message")));
  });

  it("should validate simple task structure", () => {
    const output = {
      type: "task",
      tasks: [
        {
          id: "task_1",
          specialist: "file",
          description: "Search for config.json",
          context: "User needs config",
          depends_on: [],
        },
      ],
      execution_mode: "sequential",
    };
    const result = validateTaskStructure(output);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  it("should validate parallel task structure", () => {
    const output = {
      type: "task",
      tasks: [
        {
          id: "task_1",
          specialist: "web",
          description: "Search React docs",
          context: "",
          depends_on: [],
        },
        {
          id: "task_2",
          specialist: "file",
          description: "Find package.json",
          context: "",
          depends_on: [],
        },
      ],
      execution_mode: "parallel",
    };
    const result = validateTaskStructure(output);
    assert.strictEqual(result.valid, true);
  });

  it("should reject invalid type", () => {
    const output = { type: "invalid" };
    const result = validateTaskStructure(output);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("type must be")));
  });

  it("should reject task without tasks array", () => {
    const output = {
      type: "task",
      execution_mode: "parallel",
    };
    const result = validateTaskStructure(output);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("tasks array")));
  });

  it("should reject task with invalid specialist", () => {
    const output = {
      type: "task",
      tasks: [
        {
          id: "task_1",
          specialist: "invalid_specialist",
          description: "Do something",
          depends_on: [],
        },
      ],
      execution_mode: "sequential",
    };
    const result = validateTaskStructure(output);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("invalid specialist")));
  });

  it("should reject task without id", () => {
    const output = {
      type: "task",
      tasks: [
        {
          specialist: "file",
          description: "Do something",
          depends_on: [],
        },
      ],
      execution_mode: "sequential",
    };
    const result = validateTaskStructure(output);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("missing id")));
  });

  it("should reject task without description", () => {
    const output = {
      type: "task",
      tasks: [
        {
          id: "task_1",
          specialist: "file",
          depends_on: [],
        },
      ],
      execution_mode: "sequential",
    };
    const result = validateTaskStructure(output);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("missing description")));
  });

  it("should reject task without depends_on array", () => {
    const output = {
      type: "task",
      tasks: [
        {
          id: "task_1",
          specialist: "file",
          description: "Do something",
        },
      ],
      execution_mode: "sequential",
    };
    const result = validateTaskStructure(output);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("missing depends_on")));
  });

  it("should reject invalid execution_mode", () => {
    const output = {
      type: "task",
      tasks: [
        {
          id: "task_1",
          specialist: "file",
          description: "Do something",
          depends_on: [],
        },
      ],
      execution_mode: "invalid",
    };
    const result = validateTaskStructure(output);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("execution_mode")));
  });

  it("should reject non-object input", () => {
    const result = validateTaskStructure("not an object");
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("valid JSON object")));
  });
});

describe("Planner - Validate Dependencies", () => {
  it("should validate tasks with no dependencies", () => {
    const tasks = [
      { id: "task_1", depends_on: [] },
      { id: "task_2", depends_on: [] },
    ];
    const result = validateDependencies(tasks);
    assert.strictEqual(result.valid, true);
  });

  it("should validate linear dependency chain", () => {
    const tasks = [
      { id: "task_1", depends_on: [] },
      { id: "task_2", depends_on: ["task_1"] },
      { id: "task_3", depends_on: ["task_2"] },
    ];
    const result = validateDependencies(tasks);
    assert.strictEqual(result.valid, true);
  });

  it("should validate tasks with multiple dependencies", () => {
    const tasks = [
      { id: "task_1", depends_on: [] },
      { id: "task_2", depends_on: [] },
      { id: "task_3", depends_on: ["task_1", "task_2"] },
    ];
    const result = validateDependencies(tasks);
    assert.strictEqual(result.valid, true);
  });

  it("should reject dependency on non-existent task", () => {
    const tasks = [
      { id: "task_1", depends_on: [] },
      { id: "task_2", depends_on: ["task_999"] },
    ];
    const result = validateDependencies(tasks);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("non-existent"));
  });

  it("should detect circular dependency (direct)", () => {
    const tasks = [
      { id: "task_1", depends_on: ["task_2"] },
      { id: "task_2", depends_on: ["task_1"] },
    ];
    const result = validateDependencies(tasks);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("Circular dependency"));
  });

  it("should detect circular dependency (indirect)", () => {
    const tasks = [
      { id: "task_1", depends_on: ["task_3"] },
      { id: "task_2", depends_on: ["task_1"] },
      { id: "task_3", depends_on: ["task_2"] },
    ];
    const result = validateDependencies(tasks);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("Circular dependency"));
  });

  it("should handle self-dependency as circular", () => {
    const tasks = [{ id: "task_1", depends_on: ["task_1"] }];
    const result = validateDependencies(tasks);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("Circular dependency"));
  });
});

describe("Planner - Integration", () => {
  let mockOllamaClient;
  let planner;

  beforeEach(() => {
    // Create mock Ollama client
    mockOllamaClient = {
      chat: mock.fn(async (messages, options) => {
        // Default mock response
        return {
          content: JSON.stringify({
            type: "conversation",
            specialist: "conversation",
            message: "Hello! How can I help you?",
          }),
          model: "test-model",
        };
      }),
    };

    planner = new Planner({
      ollamaClient: mockOllamaClient,
      model: "test-model",
    });
  });

  it("should initialize with system prompt", () => {
    assert.ok(planner.systemPrompt.length > 0);
  });

  it("should detect conversational request", async () => {
    const history = [{ role: "user", content: "Hello there!" }];

    const result = await planner.plan(history);

    assert.strictEqual(result.type, "conversation");
    assert.ok(result.output.message);
  });

  it("should detect task-based request", async () => {
    // Mock response for task-based request
    mockOllamaClient.chat = mock.fn(async () => ({
      content: JSON.stringify({
        type: "task",
        tasks: [
          {
            id: "task_1",
            specialist: "file",
            description: "Search for config.json",
            context: "User needs config",
            depends_on: [],
          },
        ],
        execution_mode: "sequential",
      }),
      model: "test-model",
    }));

    const history = [{ role: "user", content: "Find config.json" }];

    const result = await planner.plan(history);

    assert.strictEqual(result.type, "task");
    assert.ok(Array.isArray(result.output.tasks));
    assert.strictEqual(result.output.tasks.length, 1);
  });

  it("should include current date in prompt", async () => {
    const history = [{ role: "user", content: "Test message" }];

    await planner.plan(history);

    const callArgs = mockOllamaClient.chat.mock.calls[0].arguments;
    const messages = callArgs[0];
    const systemMessage = messages.find((m) => m.role === "system");

    assert.ok(systemMessage.content.includes("Today's date is"));
  });

  it("should use lower temperature for JSON output", async () => {
    const history = [{ role: "user", content: "Test" }];

    await planner.plan(history);

    const callArgs = mockOllamaClient.chat.mock.calls[0].arguments;
    const options = callArgs[1];

    assert.strictEqual(options.temperature, 0.3);
    assert.strictEqual(options.format, "json");
  });

  it("should throw on empty conversation history", async () => {
    await assert.rejects(
      async () => planner.plan([]),
      /Conversation history is required/,
    );
  });

  it("should throw on invalid JSON response", async () => {
    mockOllamaClient.chat = mock.fn(async () => ({
      content: "This is not JSON",
      model: "test-model",
    }));

    const history = [{ role: "user", content: "Test" }];

    await assert.rejects(
      async () => planner.plan(history),
      /failed to produce valid JSON/,
    );
  });

  it("should throw on invalid task structure", async () => {
    mockOllamaClient.chat = mock.fn(async () => ({
      content: JSON.stringify({
        type: "invalid_type",
      }),
      model: "test-model",
    }));

    const history = [{ role: "user", content: "Test" }];

    await assert.rejects(
      async () => planner.plan(history),
      /Invalid task structure/,
    );
  });

  it("should throw on circular dependencies", async () => {
    mockOllamaClient.chat = mock.fn(async () => ({
      content: JSON.stringify({
        type: "task",
        tasks: [
          {
            id: "task_1",
            specialist: "file",
            description: "Task 1",
            depends_on: ["task_2"],
          },
          {
            id: "task_2",
            specialist: "file",
            description: "Task 2",
            depends_on: ["task_1"],
          },
        ],
        execution_mode: "sequential",
      }),
      model: "test-model",
    }));

    const history = [{ role: "user", content: "Test" }];

    await assert.rejects(
      async () => planner.plan(history),
      /Circular dependency/,
    );
  });

  it("should handle complex multi-task plan", async () => {
    mockOllamaClient.chat = mock.fn(async () => ({
      content: JSON.stringify({
        type: "task",
        tasks: [
          {
            id: "task_1",
            specialist: "file",
            description: "Find package.json",
            context: "",
            depends_on: [],
          },
          {
            id: "task_2",
            specialist: "file",
            description: "Read package.json",
            context: "",
            depends_on: ["task_1"],
          },
          {
            id: "task_3",
            specialist: "shell",
            description: "Run npm outdated",
            context: "",
            depends_on: ["task_2"],
          },
        ],
        execution_mode: "sequential",
      }),
      model: "test-model",
    }));

    const history = [{ role: "user", content: "Check for outdated packages" }];

    const result = await planner.plan(history);

    assert.strictEqual(result.type, "task");
    assert.strictEqual(result.output.tasks.length, 3);
    assert.strictEqual(result.output.execution_mode, "sequential");
  });
});
