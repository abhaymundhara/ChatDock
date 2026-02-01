const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getRemindersDir(state) {
  const root = state?.WORKSPACE_ROOT || process.cwd();
  const dir = path.join(root, "reminders");
  ensureDir(dir);
  return dir;
}

function generateReminderId() {
  const base = new Date().toISOString().replace(/[:T.]/g, "-").slice(0, 19);
  const suffix = crypto.randomBytes(2).toString("hex");
  return `${base}-${suffix}`;
}

function parseDueDate(rawText) {
  if (!rawText) return { dueAt: null, text: "" };
  let text = rawText.trim();
  let dueAt = null;

  const inMatch = text.match(/\bin\s+(\d+)\s*(minutes?|hours?|days?)\b/i);
  if (inMatch) {
    const value = parseInt(inMatch[1], 10);
    const unit = inMatch[2].toLowerCase();
    if (Number.isFinite(value)) {
      const now = new Date();
      let ms = 0;
      if (unit.startsWith("minute")) ms = value * 60 * 1000;
      if (unit.startsWith("hour")) ms = value * 60 * 60 * 1000;
      if (unit.startsWith("day")) ms = value * 24 * 60 * 60 * 1000;
      dueAt = new Date(now.getTime() + ms).toISOString();
      text = text.replace(inMatch[0], "").trim();
      return { dueAt, text };
    }
  }

  const atMatch = text.match(/\b(?:at|on)\s+(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/i);
  if (atMatch) {
    const datePart = atMatch[1];
    const timePart = atMatch[2] || "09:00";
    const iso = `${datePart}T${timePart}:00.000Z`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) {
      dueAt = parsed.toISOString();
      text = text.replace(atMatch[0], "").trim();
      return { dueAt, text };
    }
  }

  return { dueAt: null, text };
}

function loadReminders(state) {
  const dir = getRemindersDir(state);
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("reminder-") && f.endsWith(".json"));

  const reminders = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, file), "utf-8");
      const reminder = JSON.parse(raw);
      reminders.push(reminder);
    } catch {
      continue;
    }
  }

  return reminders;
}

function saveReminder(state, reminder) {
  const dir = getRemindersDir(state);
  const id = reminder.id || generateReminderId();
  const payload = {
    id,
    text: reminder.text || "",
    createdAt: reminder.createdAt || new Date().toISOString(),
    dueAt: reminder.dueAt || null,
    status: reminder.status || "pending",
    notifiedAt: reminder.notifiedAt || null
  };

  const filePath = path.join(dir, `reminder-${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
  return payload;
}

function deleteReminder(state, reminderId) {
  const dir = getRemindersDir(state);
  const filePath = path.join(dir, `reminder-${reminderId}.json`);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

function updateReminder(state, reminderId, updates) {
  const dir = getRemindersDir(state);
  const filePath = path.join(dir, `reminder-${reminderId}.json`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  const reminder = JSON.parse(raw);
  const next = { ...reminder, ...updates };
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

function getDueReminders(state) {
  const now = Date.now();
  return loadReminders(state)
    .filter((r) => r.status !== "done")
    .filter((r) => r.dueAt && new Date(r.dueAt).getTime() <= now)
    .filter((r) => !r.notifiedAt);
}

function formatReminder(reminder) {
  const due = reminder.dueAt ? new Date(reminder.dueAt).toLocaleString() : "unscheduled";
  const status = reminder.status || "pending";
  return `- [${reminder.id}] (${status}) ${reminder.text} ${reminder.dueAt ? `— due ${due}` : ""}`;
}

module.exports = {
  parseDueDate,
  loadReminders,
  saveReminder,
  deleteReminder,
  updateReminder,
  getDueReminders,
  formatReminder
};
