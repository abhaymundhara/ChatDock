/**
 * Read-before-write enforcement for file specialist tools.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { SpecialistFactory } = require("../src/server/orchestrator/specialist-factory");

function makeCall(name, args) {
  return {
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}

describe("File specialist read-before-write", () => {
  let testDir;
  let existingFile;

  before(() => {
    testDir = path.join(os.tmpdir(), `chatdock-rbw-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    existingFile = path.join(testDir, "existing.txt");
    fs.writeFileSync(existingFile, "original");
  });

  after(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("blocks write_file on existing file without prior read", async () => {
    const factory = new SpecialistFactory();
    const results = await factory.executeToolCalls([
      makeCall("write_file", { path: existingFile, content: "new content" }),
    ]);

    assert.strictEqual(results[0].success, false);
    assert.match(results[0].error, /read/i);
  });

  it("allows write_file on existing file after read_file", async () => {
    const factory = new SpecialistFactory();
    const results = await factory.executeToolCalls([
      makeCall("read_file", { path: existingFile }),
      makeCall("write_file", { path: existingFile, content: "updated" }),
    ]);

    assert.strictEqual(results[0].success, true);
    assert.strictEqual(results[1].success, true);
    assert.strictEqual(fs.readFileSync(existingFile, "utf-8"), "updated");
  });

  it("allows write_file on new file without read", async () => {
    const factory = new SpecialistFactory();
    const newFile = path.join(testDir, "new.txt");
    const results = await factory.executeToolCalls([
      makeCall("write_file", { path: newFile, content: "fresh" }),
    ]);

    assert.strictEqual(results[0].success, true);
    assert.strictEqual(fs.readFileSync(newFile, "utf-8"), "fresh");
  });

  it("blocks move_file on existing file without prior read", async () => {
    const factory = new SpecialistFactory();
    const dest = path.join(testDir, "moved.txt");
    const results = await factory.executeToolCalls([
      makeCall("move_file", { source: existingFile, destination: dest }),
    ]);

    assert.strictEqual(results[0].success, false);
    assert.match(results[0].error, /read/i);
  });

  it("allows move_file after read_file", async () => {
    const factory = new SpecialistFactory();
    const source = path.join(testDir, "move-after-read.txt");
    const dest = path.join(testDir, "move-after-read-dest.txt");
    fs.writeFileSync(source, "to move");

    const results = await factory.executeToolCalls([
      makeCall("read_file", { path: source }),
      makeCall("move_file", { source, destination: dest }),
    ]);

    assert.strictEqual(results[0].success, true);
    assert.strictEqual(results[1].success, true);
    assert.ok(!fs.existsSync(source));
    assert.strictEqual(fs.readFileSync(dest, "utf-8"), "to move");
  });

  it("resets read tracking between tool batches", async () => {
    const factory = new SpecialistFactory();
    const results1 = await factory.executeToolCalls([
      makeCall("read_file", { path: existingFile }),
    ]);

    assert.strictEqual(results1[0].success, true);

    const results2 = await factory.executeToolCalls([
      makeCall("write_file", { path: existingFile, content: "blocked" }),
    ]);

    assert.strictEqual(results2[0].success, false);
    assert.match(results2[0].error, /read/i);
  });
});
