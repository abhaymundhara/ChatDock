/**
 * Tests for new shell tools (open_app and run_script)
 */

import test from "node:test";
import assert from "node:assert";
import { writeFileSync, unlinkSync } from "node:fs";
import { open_app, run_script } from "../src/server/tools/shell.js";

test.describe("Shell Tools", () => {
  test.describe("run_script", () => {
    test("should execute a bash script", async () => {
      // Create a temporary test script
      const scriptPath = "/tmp/test-script.sh";
      writeFileSync(scriptPath, '#!/bin/bash\necho "Hello from script"');

      try {
        const result = await run_script.run({ path: scriptPath });
        assert.ok(result.success);
        assert.ok(result.stdout.includes("Hello from script"));
        assert.strictEqual(result.exitCode, 0);
      } finally {
        unlinkSync(scriptPath);
      }
    });

    test("should execute a python script", async () => {
      const scriptPath = "/tmp/test-script.py";
      writeFileSync(scriptPath, 'print("Hello from Python")');

      try {
        const result = await run_script.run({ path: scriptPath });
        assert.ok(result.success);
        assert.ok(result.stdout.includes("Hello from Python"));
      } finally {
        unlinkSync(scriptPath);
      }
    });

    test("should execute a node script", async () => {
      const scriptPath = "/tmp/test-script.js";
      writeFileSync(scriptPath, 'console.log("Hello from Node")');

      try {
        const result = await run_script.run({ path: scriptPath });
        assert.ok(result.success);
        assert.ok(result.stdout.includes("Hello from Node"));
      } finally {
        unlinkSync(scriptPath);
      }
    });

    test("should pass arguments to script", async () => {
      const scriptPath = "/tmp/test-args.sh";
      writeFileSync(scriptPath, '#!/bin/bash\necho "Args: $1 $2"');

      try {
        const result = await run_script.run({
          path: scriptPath,
          args: ["foo", "bar"],
        });
        assert.ok(result.success);
        assert.ok(result.stdout.includes("Args: foo bar"));
      } finally {
        unlinkSync(scriptPath);
      }
    });

    test("should handle non-existent script", async () => {
      await assert.rejects(
        async () => run_script.run({ path: "/tmp/nonexistent-script.sh" }),
        /Script not found/,
      );
    });
  });

  test.describe("open_app", () => {
    test("should have correct structure", () => {
      assert.strictEqual(open_app.name, "open_app");
      assert.ok(open_app.description);
      assert.ok(open_app.parameters);
      assert.ok(open_app.keywords.includes("open"));
    });

    // Note: We can't fully test open_app without actually launching apps
    // which would be disruptive during testing
    test("should validate required parameters", () => {
      assert.ok(open_app.parameters.required.includes("name"));
    });
  });
});
