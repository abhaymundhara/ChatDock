/**
 * Message Tool
 * Allows the agent to send messages to users on chat channels
 */

// Tool definitions
const tools = [
  {
    type: "function",
    function: {
      name: "send_message",
      description: "Send a message to the user. Use this when you want to communicate something explicitly.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The message content to send",
          },
          channel: {
            type: "string",
            description: "Optional: target channel (telegram, whatsapp, web). Defaults to current channel.",
          },
          chat_id: {
            type: "string",
            description: "Optional: target chat/user ID. Defaults to current chat.",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "notify_user",
      description: "Send a notification to the user. Use this for important alerts or updates.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Notification title",
          },
          message: {
            type: "string",
            description: "Notification message",
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high"],
            description: "Notification priority level",
          },
        },
        required: ["message"],
      },
    },
  },
];

// Tool executors
const executors = {
  async send_message({ content, channel, chat_id, __context }) {
    const router = __context?.router;
    
    // If no router, just return success (message was already streamed)
    if (!router) {
      return {
        success: true,
        message: "Message will be included in response",
        content,
      };
    }
    
    try {
      const targetChannel = channel || __context?.channelType || "web";
      const targetChatId = chat_id || __context?.chatId;
      
      if (!targetChatId) {
        return { success: false, error: "No target chat specified" };
      }
      
      // Use router to send message
      const { OutboundMessage } = require("../../bus/events");
      const outbound = new OutboundMessage({
        content,
        chatId: targetChatId,
        channelType: targetChannel,
      });
      
      await router.sendToChannel(outbound);
      
      return {
        success: true,
        message: `Sent to ${targetChannel}:${targetChatId}`,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async notify_user({ title, message, priority = "normal", __context }) {
    const formattedMessage = title 
      ? `📢 **${title}**\n\n${message}`
      : `📢 ${message}`;
    
    // For now, just return the notification content
    // In a full implementation, this could use system notifications
    return {
      success: true,
      notification: {
        title: title || "Notification",
        message,
        priority,
        formattedMessage,
      },
    };
  },
};

// Plugin metadata
module.exports = {
  name: "Message",
  description: "Send messages and notifications to users",
  version: "1.0.0",
  category: "message",
  tools,
  executors,
  metadata: {
    tags: ["message", "notification", "communication"],
  },
};
