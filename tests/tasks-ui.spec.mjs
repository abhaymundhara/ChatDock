import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("src/renderer/ace-interface.html", "utf-8");

test("ace interface includes task strip container", () => {
  assert.ok(html.includes("tasks-strip"));
  assert.ok(html.includes("tasks-list"));
});

test("ace interface handles tasks stream events", () => {
  assert.ok(html.includes('event.type === "tasks"'));
});
