/**
 * Heartbeat Scheduler
 * Proactive agent wake-up system for regular check-ins
 */

const { EventEmitter } = require("events");

class HeartbeatScheduler extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.agent = null;
    this.router = null;
    this.enabled = config.heartbeat?.enabled || false;
    this.intervalMs = config.heartbeat?.intervalMs || 3600000; // Default: 1 hour
    this.prompt = config.heartbeat?.prompt || "Perform a routine check-in. Check if there are any pending tasks, reminders, or updates to share.";
    this.timer = null;
    this.lastBeat = null;
  }

  /**
   * Set the agent for processing heartbeats
   * @param {Agent} agent
   */
  setAgent(agent) {
    this.agent = agent;
  }

  /**
   * Set the message router for broadcasting results
   * @param {MessageRouter} router
   */
  setRouter(router) {
    this.router = router;
  }

  /**
   * Start the heartbeat scheduler
   */
  start() {
    if (!this.enabled) {
      console.log("[heartbeat] Disabled in config. Skipping.");
      return;
    }

    if (!this.agent) {
      console.error("[heartbeat] No agent configured. Skipping.");
      return;
    }

    console.log(`[heartbeat] Starting with interval: ${this.intervalMs}ms`);
    
    // Schedule recurring heartbeats
    this.timer = setInterval(() => {
      this._beat();
    }, this.intervalMs);

    // Optionally trigger first beat after a delay
    // setTimeout(() => this._beat(), 10000);
  }

  /**
   * Stop the heartbeat scheduler
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[heartbeat] Stopped.");
    }
  }

  /**
   * Trigger a manual heartbeat
   */
  async trigger() {
    return this._beat();
  }

  /**
   * Execute a heartbeat
   * @private
   */
  async _beat() {
    if (!this.agent) {
      console.error("[heartbeat] No agent for beat.");
      return null;
    }

    console.log("[heartbeat] Executing proactive beat...");
    this.lastBeat = Date.now();

    try {
      const response = await this.agent.processDirect(this.prompt, {
        isHeartbeat: true,
      });

      console.log("[heartbeat] Beat result:", response.substring(0, 100) + "...");
      
      this.emit("beat", {
        timestamp: this.lastBeat,
        response,
      });

      // If router is configured, we could broadcast the result
      // This is optional and depends on use case
      // if (this.router && response) {
      //   await this.router.broadcast(`🤖 Proactive Update:\n${response}`);
      // }

      return response;

    } catch (error) {
      console.error("[heartbeat] Beat failed:", error);
      this.emit("error", { timestamp: this.lastBeat, error });
      return null;
    }
  }

  /**
   * Get heartbeat status
   * @returns {Object}
   */
  getStatus() {
    return {
      enabled: this.enabled,
      intervalMs: this.intervalMs,
      lastBeat: this.lastBeat,
      running: !!this.timer,
    };
  }

  /**
   * Update heartbeat configuration
   * @param {Object} newConfig
   */
  updateConfig(newConfig) {
    const wasRunning = !!this.timer;
    
    if (wasRunning) {
      this.stop();
    }

    if (newConfig.enabled !== undefined) {
      this.enabled = newConfig.enabled;
    }
    if (newConfig.intervalMs) {
      this.intervalMs = newConfig.intervalMs;
    }
    if (newConfig.prompt) {
      this.prompt = newConfig.prompt;
    }

    if (wasRunning && this.enabled) {
      this.start();
    }
  }
}

module.exports = { HeartbeatScheduler };
