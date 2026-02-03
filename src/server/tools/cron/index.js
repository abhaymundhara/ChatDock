/**
 * Cron Management Skills
 * Tools for scheduling and managing reminders/tasks
 */

// Tool definitions
const tools = [
  {
    type: "function",
    function: {
      name: "schedule_reminder",
      description: "Schedule a reminder or recurring task",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name/description of the reminder",
          },
          message: {
            type: "string",
            description: "Message to process when reminder triggers",
          },
          schedule_type: {
            type: "string",
            enum: ["at", "every", "cron"],
            description: "Type of schedule: 'at' (one-time), 'every' (recurring), 'cron' (cron expression)",
          },
          at_time: {
            type: "string",
            description: "ISO timestamp for 'at' type (e.g., '2024-12-25T09:00:00Z')",
          },
          every_ms: {
            type: "number",
            description: "Interval in milliseconds for 'every' type (e.g., 3600000 for 1 hour)",
          },
          cron_expr: {
            type: "string",
            description: "Cron expression for 'cron' type (e.g., '0 9 * * *' for daily at 9am)",
          },
          deliver_to_channel: {
            type: "boolean",
            description: "Whether to deliver response to a channel (default: false)",
          },
          channel: {
            type: "string",
            description: "Channel to deliver to (e.g., 'telegram', 'whatsapp')",
          },
          channel_recipient: {
            type: "string",
            description: "Recipient ID for the channel",
          },
        },
        required: ["name", "message", "schedule_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_reminders",
      description: "List all scheduled reminders and tasks",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_reminder",
      description: "Cancel a scheduled reminder by ID",
      parameters: {
        type: "object",
        properties: {
          reminder_id: {
            type: "string",
            description: "ID of the reminder to cancel",
          },
        },
        required: ["reminder_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_reminder",
      description: "Get details of a specific reminder",
      parameters: {
        type: "object",
        properties: {
          reminder_id: {
            type: "string",
            description: "ID of the reminder",
          },
        },
        required: ["reminder_id"],
      },
    },
  },
];

// Tool executors
const executors = {
  async schedule_reminder({
    name,
    message,
    schedule_type,
    at_time,
    every_ms,
    cron_expr,
    deliver_to_channel = false,
    channel,
    channel_recipient,
  }) {
    try {
      const scheduler = arguments[0].__context?.scheduler;
      if (!scheduler) {
        return { success: false, error: "Scheduler not available" };
      }

      // Build schedule object
      const schedule = { kind: schedule_type };

      if (schedule_type === "at") {
        if (!at_time) {
          return { success: false, error: "at_time required for 'at' schedule" };
        }
        schedule.at_ms = new Date(at_time).getTime();
      } else if (schedule_type === "every") {
        if (!every_ms) {
          return { success: false, error: "every_ms required for 'every' schedule" };
        }
        schedule.every_ms = every_ms;
      } else if (schedule_type === "cron") {
        if (!cron_expr) {
          return { success: false, error: "cron_expr required for 'cron' schedule" };
        }
        schedule.expr = cron_expr;
      }

      // Build payload
      const payload = {
        message,
        deliver: deliver_to_channel,
        channel: channel || null,
        to: channel_recipient || null,
      };

      // Add job
      const job = scheduler.addJob({
        name,
        schedule,
        payload,
      });

      return {
        success: true,
        reminder_id: job.id,
        name: job.name,
        next_run: job.state.next_run_at_ms
          ? new Date(job.state.next_run_at_ms).toISOString()
          : null,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async list_reminders() {
    try {
      const scheduler = arguments[0].__context?.scheduler;
      if (!scheduler) {
        return { success: false, error: "Scheduler not available" };
      }

      const jobs = scheduler.listJobs();

      return {
        success: true,
        count: jobs.length,
        reminders: jobs.map((j) => ({
          id: j.id,
          name: j.name,
          enabled: j.enabled,
          schedule_type: j.schedule.kind,
          next_run: j.state.next_run_at_ms
            ? new Date(j.state.next_run_at_ms).toISOString()
            : null,
          last_run: j.state.last_run_at_ms
            ? new Date(j.state.last_run_at_ms).toISOString()
            : null,
          last_status: j.state.last_status,
        })),
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async cancel_reminder({ reminder_id }) {
    try {
      const scheduler = arguments[0].__context?.scheduler;
      if (!scheduler) {
        return { success: false, error: "Scheduler not available" };
      }

      const removed = scheduler.removeJob(reminder_id);

      return {
        success: removed,
        message: removed ? "Reminder cancelled" : "Reminder not found",
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async get_reminder({ reminder_id }) {
    try {
      const scheduler = arguments[0].__context?.scheduler;
      if (!scheduler) {
        return { success: false, error: "Scheduler not available" };
      }

      const job = scheduler.getJob(reminder_id);

      if (!job) {
        return { success: false, error: "Reminder not found" };
      }

      return {
        success: true,
        reminder: {
          id: job.id,
          name: job.name,
          enabled: job.enabled,
          schedule: job.schedule,
          payload: job.payload,
          state: {
            next_run: job.state.next_run_at_ms
              ? new Date(job.state.next_run_at_ms).toISOString()
              : null,
            last_run: job.state.last_run_at_ms
              ? new Date(job.state.last_run_at_ms).toISOString()
              : null,
            last_status: job.state.last_status,
            last_error: job.state.last_error,
          },
          created_at: new Date(job.created_at_ms).toISOString(),
          updated_at: new Date(job.updated_at_ms).toISOString(),
        },
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

// Plugin metadata
module.exports = {
  name: "Cron Management",
  description: "Schedule and manage reminders and recurring tasks",
  version: "1.0.0",
  category: "cron",
  tools,
  executors,
  metadata: {
    tags: ["scheduler", "reminders", "cron", "tasks"],
  },
};
