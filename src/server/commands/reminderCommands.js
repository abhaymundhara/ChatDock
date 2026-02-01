const {
  parseDueDate,
  loadReminders,
  saveReminder,
  deleteReminder,
  updateReminder,
  getDueReminders,
  formatReminder
} = require("../utils/reminderUtils");

function handleReminderCommands(userMsg, state) {
  const normalizedMsg = userMsg.trim().toLowerCase();

  if (normalizedMsg === "list reminders" || normalizedMsg === "reminders") {
    const reminders = loadReminders(state);
    if (!reminders.length) {
      return { handled: true, response: "No reminders yet. Use `add reminder <text>`." };
    }
    const lines = reminders
      .sort((a, b) => {
        const aTime = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
        const bTime = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
        return aTime - bTime;
      })
      .map(formatReminder);
    return { handled: true, response: `**Reminders:**\n\n${lines.join("\n")}` };
  }

  if (normalizedMsg.startsWith("add reminder") || normalizedMsg.startsWith("remind me")) {
    const raw = normalizedMsg.startsWith("add reminder")
      ? userMsg.trim().slice("add reminder".length).trim()
      : userMsg.trim().slice("remind me".length).trim();

    if (!raw) {
      return {
        handled: true,
        response: "Usage: add reminder <text> [in 2 hours|at 2026-02-01 09:00]"
      };
    }

    const parsed = parseDueDate(raw);
    const text = parsed.text || raw;
    if (!text) {
      return { handled: true, response: "Reminder text cannot be empty." };
    }

    const reminder = saveReminder(state, {
      text,
      dueAt: parsed.dueAt || null
    });

    const dueLabel = reminder.dueAt ? ` (due ${new Date(reminder.dueAt).toLocaleString()})` : "";
    return {
      handled: true,
      response: `Saved reminder **${reminder.id}**${dueLabel}: ${reminder.text}`
    };
  }

  if (normalizedMsg.startsWith("show reminder")) {
    const id = userMsg.trim().slice("show reminder".length).trim();
    if (!id) {
      return { handled: true, response: "Usage: show reminder <id>" };
    }
    const reminders = loadReminders(state);
    const reminder = reminders.find((r) => r.id === id);
    if (!reminder) {
      return { handled: true, response: `Reminder '${id}' not found.` };
    }
    return {
      handled: true,
      response: `**Reminder ${reminder.id}**\nText: ${reminder.text}\nStatus: ${reminder.status || "pending"}\nDue: ${reminder.dueAt || "unscheduled"}`
    };
  }

  if (normalizedMsg.startsWith("delete reminder") || normalizedMsg.startsWith("remove reminder")) {
    const prefix = normalizedMsg.startsWith("delete reminder") ? "delete reminder" : "remove reminder";
    const id = userMsg.trim().slice(prefix.length).trim();
    if (!id) {
      return { handled: true, response: "Usage: delete reminder <id>" };
    }
    const deleted = deleteReminder(state, id);
    return {
      handled: true,
      response: deleted ? `Deleted reminder ${id}.` : `Reminder '${id}' not found.`
    };
  }

  if (normalizedMsg.startsWith("done reminder") || normalizedMsg.startsWith("complete reminder")) {
    const prefix = normalizedMsg.startsWith("done reminder") ? "done reminder" : "complete reminder";
    const id = userMsg.trim().slice(prefix.length).trim();
    if (!id) {
      return { handled: true, response: "Usage: done reminder <id>" };
    }
    const updated = updateReminder(state, id, { status: "done" });
    if (!updated) {
      return { handled: true, response: `Reminder '${id}' not found.` };
    }
    return { handled: true, response: `Marked reminder ${id} as done.` };
  }

  if (normalizedMsg.startsWith("snooze reminder")) {
    const parts = userMsg.trim().split(/\s+/);
    const id = parts[2];
    const minutes = parseInt(parts[3], 10);
    if (!id || !Number.isFinite(minutes)) {
      return { handled: true, response: "Usage: snooze reminder <id> <minutes>" };
    }
    const dueAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    const updated = updateReminder(state, id, { dueAt, status: "pending", notifiedAt: null });
    if (!updated) {
      return { handled: true, response: `Reminder '${id}' not found.` };
    }
    return {
      handled: true,
      response: `Snoozed reminder ${id} until ${new Date(dueAt).toLocaleString()}.`
    };
  }

  if (normalizedMsg === "check reminders") {
    const due = getDueReminders(state);
    if (!due.length) {
      return { handled: true, response: "No reminders are due right now." };
    }
    const lines = due.map(formatReminder);
    return { handled: true, response: `**Reminders due:**\n\n${lines.join("\n")}` };
  }

  return { handled: false };
}

module.exports = { handleReminderCommands };
