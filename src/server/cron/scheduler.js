/**
 * Cron Scheduler Service
 * Manages scheduled tasks and reminders
 */

const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

class CronScheduler {
  constructor(config, agent) {
    this.config = config;
    this.agent = agent;
    this.jobs = [];
    this.timers = new Map();
    this.storePath = path.join(config.userDataPath, "cron.json");
    this._load();
  }

  /**
   * Add a new scheduled job
   */
  addJob(jobConfig) {
    const job = {
      id: jobConfig.id || uuidv4(),
      name: jobConfig.name,
      enabled: jobConfig.enabled !== false,
      schedule: jobConfig.schedule, // { kind: 'at'|'every'|'cron', at_ms, every_ms, expr }
      payload: jobConfig.payload, // { message, deliver, channel, to }
      state: {
        next_run_at_ms: null,
        last_run_at_ms: null,
        last_status: null,
        last_error: null,
      },
      created_at_ms: Date.now(),
      updated_at_ms: Date.now(),
      delete_after_run: jobConfig.delete_after_run || false,
    };

    this.jobs.push(job);
    this._scheduleJob(job);
    this._persist();

    console.log(`[cron] Added job: ${job.name} (${job.id})`);
    return job;
  }

  /**
   * Remove a job by ID
   */
  removeJob(id) {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      clearInterval(timer);
      this.timers.delete(id);
    }

    this.jobs = this.jobs.filter((j) => j.id !== id);
    this._persist();

    console.log(`[cron] Removed job: ${id}`);
    return true;
  }

  /**
   * List all jobs
   */
  listJobs() {
    return this.jobs.map((j) => ({
      id: j.id,
      name: j.name,
      enabled: j.enabled,
      schedule: j.schedule,
      state: j.state,
      created_at: new Date(j.created_at_ms).toISOString(),
    }));
  }

  /**
   * Get a specific job
   */
  getJob(id) {
    return this.jobs.find((j) => j.id === id);
  }

  /**
   * Update a job
   */
  updateJob(id, updates) {
    const job = this.jobs.find((j) => j.id === id);
    if (!job) return null;

    // Clear existing timer
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      clearInterval(timer);
      this.timers.delete(id);
    }

    // Apply updates
    Object.assign(job, updates);
    job.updated_at_ms = Date.now();

    // Reschedule if enabled
    if (job.enabled) {
      this._scheduleJob(job);
    }

    this._persist();
    return job;
  }

  /**
   * Start the scheduler (reschedule all jobs)
   */
  start() {
    console.log(`[cron] Starting scheduler with ${this.jobs.length} jobs`);
    for (const job of this.jobs) {
      if (job.enabled) {
        this._scheduleJob(job);
      }
    }
  }

  /**
   * Stop the scheduler (clear all timers)
   */
  stop() {
    console.log("[cron] Stopping scheduler");
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    this.timers.clear();
  }

  /**
   * Schedule a single job
   */
  _scheduleJob(job) {
    const { schedule } = job;

    if (schedule.kind === "at") {
      // One-time execution at specific time
      const delay = schedule.at_ms - Date.now();
      if (delay > 0) {
        const timer = setTimeout(() => this._executeJob(job), delay);
        this.timers.set(job.id, timer);
        job.state.next_run_at_ms = schedule.at_ms;
        console.log(`[cron] Scheduled '${job.name}' to run at ${new Date(schedule.at_ms).toISOString()}`);
      }
    } else if (schedule.kind === "every") {
      // Recurring execution
      const timer = setInterval(() => this._executeJob(job), schedule.every_ms);
      this.timers.set(job.id, timer);
      job.state.next_run_at_ms = Date.now() + schedule.every_ms;
      console.log(`[cron] Scheduled '${job.name}' to run every ${schedule.every_ms}ms`);
    } else if (schedule.kind === "cron") {
      // Cron expression (requires node-cron)
      try {
        const cron = require("node-cron");
        if (!cron.validate(schedule.expr)) {
          console.error(`[cron] Invalid cron expression: ${schedule.expr}`);
          return;
        }
        const task = cron.schedule(schedule.expr, () => this._executeJob(job));
        this.timers.set(job.id, task);
        console.log(`[cron] Scheduled '${job.name}' with cron: ${schedule.expr}`);
      } catch (e) {
        console.error(`[cron] node-cron not installed. Run: npm install node-cron`);
      }
    }
  }

  /**
   * Execute a job
   */
  async _executeJob(job) {
    console.log(`[cron] Executing job: ${job.name}`);

    try {
      const { payload } = job;

      // Run agent with the scheduled message
      const response = await this.agent.processDirect(payload.message);

      // Update state
      job.state.last_run_at_ms = Date.now();
      job.state.last_status = "ok";
      job.state.last_error = null;

      // Optionally deliver to channel
      if (payload.deliver && payload.channel && payload.to) {
        await this._deliverToChannel(payload.channel, payload.to, response);
      }

      // Delete if one-time
      if (job.delete_after_run) {
        this.removeJob(job.id);
      } else {
        // Update next run time for recurring jobs
        if (job.schedule.kind === "every") {
          job.state.next_run_at_ms = Date.now() + job.schedule.every_ms;
        }
        this._persist();
      }
    } catch (error) {
      console.error(`[cron] Job ${job.name} failed:`, error);
      job.state.last_run_at_ms = Date.now();
      job.state.last_status = "error";
      job.state.last_error = error.message;
      this._persist();
    }
  }

  /**
   * Deliver message to a channel
   */
  async _deliverToChannel(channel, to, content) {
    // This will be implemented when we add channel manager
    console.log(`[cron] Would deliver to ${channel}:${to}: ${content.substring(0, 50)}...`);
  }

  /**
   * Load jobs from disk
   */
  _load() {
    try {
      if (fs.existsSync(this.storePath)) {
        const data = JSON.parse(fs.readFileSync(this.storePath, "utf-8"));
        this.jobs = data.jobs || [];
        console.log(`[cron] Loaded ${this.jobs.length} jobs from disk`);
      }
    } catch (error) {
      console.error("[cron] Failed to load jobs:", error);
      this.jobs = [];
    }
  }

  /**
   * Persist jobs to disk
   */
  _persist() {
    try {
      const data = {
        version: 1,
        jobs: this.jobs,
      };
      fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      console.error("[cron] Failed to persist jobs:", error);
    }
  }
}

module.exports = { CronScheduler };
