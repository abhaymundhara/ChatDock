import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "chatdock-memory-"));
}

function dateString(d) {
  return d.toISOString().split("T")[0];
}

test("MemoryManager uses workspace Memory directory", () => {
  const appPath = tempDir();
  return loadMemoryModule().then(({ MemoryManager }) => {
    const manager = new MemoryManager({ appPath });
    assert.equal(manager.memoryDir, path.join(appPath, "Memory"));
  });
});

test("Clawdbot context includes MEMORY.md and daily logs", () => {
  const appPath = tempDir();
  const memoryDir = path.join(appPath, "Memory");
  const dailyDir = path.join(memoryDir, "daily");
  fs.mkdirSync(dailyDir, { recursive: true });

  fs.writeFileSync(path.join(memoryDir, "MEMORY.md"), "LONG_TERM", "utf-8");

  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  fs.writeFileSync(
    path.join(dailyDir, `${dateString(today)}.md`),
    "TODAY_LOG",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(dailyDir, `${dateString(yesterday)}.md`),
    "YESTERDAY_LOG",
    "utf-8",
  );

  return loadMemoryModule().then(({ MemoryManager }) => {
    const manager = new MemoryManager({ appPath });
    const context = manager.getClawdbotContext();
    assert.ok(context.includes("LONG_TERM"));
    assert.ok(context.includes("TODAY_LOG"));
    assert.ok(context.includes("YESTERDAY_LOG"));
  });
});

function loadMemoryModule() {
  const moduleUrl = pathToFileURL(
    path.resolve("src/server/utils/memory-manager.js"),
  );
  return import(`${moduleUrl.href}?t=${Date.now()}`);
}
