/**
 * Message Router
 * Routes messages between channels and agent
 */

const { EventEmitter } = require("events");

class MessageRouter extends EventEmitter {
  constructor() {
    super();
    this.channels = new Map(); // channelType -> channel instance
    this.agent = null;
    this.sessionManager = null;
  }

  /**
   * Set the agent for processing messages
   * @param {Agent} agent
   */
  setAgent(agent) {
    this.agent = agent;
  }

  /**
   * Set the session manager
   * @param {SessionManager} sessionManager
   */
  setSessionManager(sessionManager) {
    this.sessionManager = sessionManager;
  }

  /**
   * Register a channel
   * @param {string} type - Channel type (e.g., "telegram", "whatsapp", "web")
   * @param {Object} channel - Channel instance
   */
  registerChannel(type, channel) {
    this.channels.set(type, channel);
    console.log(`[router] Registered channel: ${type}`);
  }

  /**
   * Get a registered channel
   * @param {string} type - Channel type
   * @returns {Object|null}
   */
  getChannel(type) {
    return this.channels.get(type) || null;
  }

  /**
   * Handle an inbound message from any channel
   * @param {InboundMessage} message
   * @returns {Promise<OutboundMessage>}
   */
  async handleInbound(message) {
    if (!this.agent) {
      throw new Error("No agent configured");
    }

    console.log(`[router] Inbound from ${message.channelType}:${message.chatId}: ${message.content.substring(0, 50)}...`);
    
    // Get or create session for this chat
    const sessionId = message.getSessionId();
    let session = null;
    
    if (this.sessionManager) {
      session = this.sessionManager.getOrCreate(sessionId, {
        userId: message.senderId,
        channelId: message.chatId,
        metadata: { channelType: message.channelType },
      });
    }

    this.emit("inbound", message);

    try {
      // Process through agent
      const response = await this.agent.processDirect(message.content, {
        userId: message.senderId,
        sessionId,
        channelType: message.channelType,
        chatId: message.chatId,
      });

      // Save to session if available
      if (session) {
        session.addMessage("user", message.content);
        session.addMessage("assistant", response);
      }

      // Create outbound message
      const { OutboundMessage } = require("./events");
      const outbound = new OutboundMessage({
        content: response,
        chatId: message.chatId,
        channelType: message.channelType,
        replyToId: message.id,
      });

      this.emit("outbound", outbound);
      return outbound;

    } catch (error) {
      console.error(`[router] Error processing message:`, error);
      
      const { OutboundMessage } = require("./events");
      return new OutboundMessage({
        content: `Error: ${error.message}`,
        chatId: message.chatId,
        channelType: message.channelType,
        replyToId: message.id,
      });
    }
  }

  /**
   * Send a message to a specific channel
   * @param {OutboundMessage} message
   */
  async sendToChannel(message) {
    const channel = this.channels.get(message.channelType);
    if (!channel) {
      console.error(`[router] Channel not found: ${message.channelType}`);
      return false;
    }

    if (typeof channel.send !== "function") {
      console.error(`[router] Channel ${message.channelType} does not have send method`);
      return false;
    }

    try {
      await channel.send(message.chatId, message.content);
      return true;
    } catch (error) {
      console.error(`[router] Failed to send to ${message.channelType}:`, error);
      return false;
    }
  }

  /**
   * Broadcast a message to all channels
   * @param {string} content - Message content
   * @param {Array} excludeTypes - Channel types to exclude
   */
  async broadcast(content, excludeTypes = []) {
    for (const [type, channel] of this.channels) {
      if (excludeTypes.includes(type)) continue;
      
      if (typeof channel.broadcast === "function") {
        try {
          await channel.broadcast(content);
        } catch (error) {
          console.error(`[router] Broadcast to ${type} failed:`, error);
        }
      }
    }
  }
}

// Singleton instance
let routerInstance = null;

function getMessageRouter() {
  if (!routerInstance) {
    routerInstance = new MessageRouter();
  }
  return routerInstance;
}

module.exports = { MessageRouter, getMessageRouter };
