/**
 * Message Bus Events
 * Defines event types for message routing
 */

/**
 * Inbound message from a channel
 */
class InboundMessage {
  constructor({
    id,
    content,
    senderId,
    senderName,
    chatId,
    channelType,
    timestamp,
    metadata = {},
  }) {
    this.id = id;
    this.content = content;
    this.senderId = senderId;
    this.senderName = senderName;
    this.chatId = chatId;
    this.channelType = channelType;
    this.timestamp = timestamp || Date.now();
    this.metadata = metadata;
  }

  /**
   * Get a unique session ID for this message
   * Based on channel type and chat ID
   */
  getSessionId() {
    return `${this.channelType}:${this.chatId || this.senderId}`;
  }
}

/**
 * Outbound message to a channel
 */
class OutboundMessage {
  constructor({
    content,
    chatId,
    channelType,
    replyToId,
    metadata = {},
  }) {
    this.content = content;
    this.chatId = chatId;
    this.channelType = channelType;
    this.replyToId = replyToId;
    this.timestamp = Date.now();
    this.metadata = metadata;
  }
}

/**
 * Agent response event
 */
class AgentResponse {
  constructor({
    content,
    sessionId,
    toolCalls = [],
    isComplete = true,
  }) {
    this.content = content;
    this.sessionId = sessionId;
    this.toolCalls = toolCalls;
    this.isComplete = isComplete;
    this.timestamp = Date.now();
  }
}

module.exports = { InboundMessage, OutboundMessage, AgentResponse };
