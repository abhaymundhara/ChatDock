import { describe, it } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const registry = require("../src/server/tools/registry.js");

describe("Specialist tool access", () => {
  it("file specialist only gets fs tools", async () => {
    const tools = await registry.getToolsForSpecialist("file");
    const names = tools.map((tool) => tool.function?.name).filter(Boolean);

    assert.ok(names.includes("read_file"));
    assert.ok(names.includes("write_file"));
    assert.ok(!names.includes("create_memory"));
    assert.ok(!names.includes("list_memories"));
    assert.ok(!names.includes("search_memories"));
    assert.ok(!names.includes("recall"));
  });
});
