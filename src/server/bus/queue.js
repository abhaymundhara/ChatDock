/**
 * Message Bus
 * Async message queue for decoupled channel-agent communication
 * Matches nanobot's MessageBus architecture
 */

const { EventEmitter } = require("events");

/**
 * Async-compatible message queue
 */
class AsyncQueue {
  constructor() {
    this._queue = [];
    this._waiters = [];
  }

  /**
   * Add item to queue
   * @param {any} item
   */
  put(item) {
    if (this._waiters.length > 0) {
      const resolve = this._waiters.shift();
      resolve(item);
    } else {
      this._queue.push(item);
    }
  }

  /**
   * Get item from queue (async, waits if empty)
   * @param {number} timeout - Optional timeout in ms
   * @returns {Promise<any>}
   */
  get(timeout = null) {
    return new Promise((resolve, reject) => {
      if (this._queue.length > 0) {
        resolve(this._queue.shift());
      } else {
        this._waiters.push(resolve);
        
        if (timeout !== null) {
          setTimeout(() => {
            const idx = this._waiters.indexOf(resolve);
            if (idx !== -1) {
              this._waiters.splice(idx, 1);
              reject(new Error("Queue timeout"));
            }
          }, timeout);
        }
      }
    });
  }

  /**
   * Get queue size
   * @returns {number}
   */
  size() {
    return this._queue.length;
  }

  /**
   * Clear the queue
   */
  clear() {
    this._queue = [];
    this._waiters = [];
  }
}

/**
 * Message Bus
 * Decouples chat channels from the agent core
 */
class MessageBus extends EventEmitter {
  constructor() {
    super();
    this.inbound = new AsyncQueue();
    this.outbound = new AsyncQueue();
    this._outboundSubscribers = new Map(); // channel -> [callbacks]
    this._running = false;
  }

  /**
   * Publish inbound message from a channel to the agent
   * @param {InboundMessage} msg
   */
  async publishInbound(msg) {
    this.inbound.put(msg);
    this.emit("inbound", msg);
  }

  /**
   * Consume next inbound message (blocks until available)
   * @param {number} timeout - Optional timeout in ms
   * @returns {Promise<InboundMessage>}
   */
  async consumeInbound(timeout = 1000) {
    return this.inbound.get(timeout);
  }

  /**
   * Publish outbound message from agent to channels
   * @param {OutboundMessage} msg
   */
  async publishOutbound(msg) {
    this.outbound.put(msg);
    this.emit("outbound", msg);
    
    // Dispatch to subscribers
    const subscribers = this._outboundSubscribers.get(msg.channelType) || [];
    for (const callback of subscribers) {
      try {
        await callback(msg);
      } catch (e) {
        console.error(`[bus] Error dispatching to ${msg.channelType}:`, e);
      }
    }
  }

  /**
   * Consume next outbound message (blocks until available)
   * @param {number} timeout - Optional timeout in ms
   * @returns {Promise<OutboundMessage>}
   */
  async consumeOutbound(timeout = 1000) {
    return this.outbound.get(timeout);
  }

  /**
   * Subscribe to outbound messages for a specific channel
   * @param {string} channel - Channel type
   * @param {Function} callback - Async callback (msg) => Promise<void>
   */
  subscribe(channel, callback) {
    if (!this._outboundSubscribers.has(channel)) {
      this._outboundSubscribers.set(channel, []);
    }
    this._outboundSubscribers.get(channel).push(callback);
  }

  /**
   * Unsubscribe from outbound messages
   * @param {string} channel
   * @param {Function} callback
   */
  unsubscribe(channel, callback) {
    const subscribers = this._outboundSubscribers.get(channel);
    if (subscribers) {
      const idx = subscribers.indexOf(callback);
      if (idx !== -1) {
        subscribers.splice(idx, 1);
      }
    }
  }

  /**
   * Start the outbound dispatcher loop
   */
  async startDispatcher() {
    this._running = true;
    console.log("[bus] Dispatcher started");

    while (this._running) {
      try {
        const msg = await this.consumeOutbound(1000);
        // Already dispatched in publishOutbound, but could add more logic here
      } catch (e) {
        // Timeout, continue loop
      }
    }
  }

  /**
   * Stop the dispatcher
   */
  stop() {
    this._running = false;
    console.log("[bus] Dispatcher stopping");
  }

  /**
   * Get inbound queue size
   * @returns {number}
   */
  get inboundSize() {
    return this.inbound.size();
  }

  /**
   * Get outbound queue size
   * @returns {number}
   */
  get outboundSize() {
    return this.outbound.size();
  }
}

// Singleton instance
let busInstance = null;

function getMessageBus() {
  if (!busInstance) {
    busInstance = new MessageBus();
  }
  return busInstance;
}

module.exports = { MessageBus, AsyncQueue, getMessageBus };
