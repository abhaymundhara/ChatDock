/**
 * Subagent Manager
 * Spawns and manages background agents for long-running tasks
 */

const { v4: uuidv4 } = require("uuid");
const { EventEmitter } = require("events");

class SubagentManager extends EventEmitter {
  constructor(agent) {
    super();
    this.agent = agent;
    this.subagents = new Map(); // id -> { task, status, result, startTime, endTime }
  }

  /**
   * Spawn a subagent to handle a task in the background
   * @param {Object} options - Spawn options
   * @param {string} options.task - Task description for the subagent
   * @param {string} options.name - Optional human-readable name
   * @param {boolean} options.notify - Whether to notify when complete
   * @returns {Object} - Subagent info { id, name, task, status }
   */
  spawn({ task, name, notify = true }) {
    const id = uuidv4();
    const subagentName = name || `Subagent-${id.slice(0, 8)}`;
    
    const subagent = {
      id,
      name: subagentName,
      task,
      status: "running",
      result: null,
      error: null,
      startTime: Date.now(),
      endTime: null,
      notify,
    };
    
    this.subagents.set(id, subagent);
    console.log(`[subagent] Spawned: ${subagentName} (${id})`);
    
    // Execute in background
    this._execute(id, task).catch(err => {
      console.error(`[subagent] Error in ${id}:`, err);
    });
    
    return {
      id,
      name: subagentName,
      task,
      status: "running",
    };
  }

  /**
   * Execute the subagent task
   * @private
   */
  async _execute(id, task) {
    const subagent = this.subagents.get(id);
    if (!subagent) return;
    
    try {
      // Use the main agent's processDirect for now
      // In a full implementation, this could use worker threads
      const result = await this.agent.processDirect(task, {
        isSubagent: true,
        subagentId: id,
      });
      
      subagent.status = "completed";
      subagent.result = result;
      subagent.endTime = Date.now();
      
      console.log(`[subagent] Completed: ${subagent.name} (${id})`);
      this.emit("complete", { id, name: subagent.name, result });
      
      // If notify is enabled, we could send a message through channels
      // This would require access to channel references
      
    } catch (err) {
      subagent.status = "failed";
      subagent.error = err.message;
      subagent.endTime = Date.now();
      
      console.error(`[subagent] Failed: ${subagent.name} (${id}):`, err.message);
      this.emit("error", { id, name: subagent.name, error: err.message });
    }
  }

  /**
   * Get status of a subagent
   * @param {string} id - Subagent ID
   * @returns {Object|null}
   */
  getStatus(id) {
    const subagent = this.subagents.get(id);
    if (!subagent) return null;
    
    return {
      id: subagent.id,
      name: subagent.name,
      task: subagent.task,
      status: subagent.status,
      result: subagent.result,
      error: subagent.error,
      duration: subagent.endTime 
        ? subagent.endTime - subagent.startTime 
        : Date.now() - subagent.startTime,
    };
  }

  /**
   * List all subagents
   * @param {Object} options - Filter options
   * @param {string} options.status - Filter by status
   * @returns {Array}
   */
  list({ status } = {}) {
    const results = [];
    for (const [id, subagent] of this.subagents) {
      if (status && subagent.status !== status) continue;
      results.push(this.getStatus(id));
    }
    return results;
  }

  /**
   * Cancel a running subagent (not implemented - requires worker threads)
   * @param {string} id - Subagent ID
   * @returns {boolean}
   */
  cancel(id) {
    const subagent = this.subagents.get(id);
    if (!subagent || subagent.status !== "running") return false;
    
    // For now, just mark as cancelled
    // In a worker_threads implementation, we would terminate the worker
    subagent.status = "cancelled";
    subagent.endTime = Date.now();
    console.log(`[subagent] Cancelled: ${subagent.name} (${id})`);
    
    return true;
  }

  /**
   * Clean up completed/failed subagents older than maxAge
   * @param {number} maxAge - Max age in milliseconds (default: 1 hour)
   */
  cleanup(maxAge = 3600000) {
    const now = Date.now();
    for (const [id, subagent] of this.subagents) {
      if (subagent.status !== "running" && subagent.endTime) {
        if (now - subagent.endTime > maxAge) {
          this.subagents.delete(id);
          console.log(`[subagent] Cleaned up: ${id}`);
        }
      }
    }
  }
}

module.exports = { SubagentManager };
