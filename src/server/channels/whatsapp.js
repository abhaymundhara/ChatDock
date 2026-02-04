/**
 * WhatsApp Channel
 * Connects to WhatsApp bridge via WebSocket
 */

const WebSocket = require("ws");

class WhatsAppChannel {
  constructor(config) {
    this.config = config;
    this.ws = null;
    this.connected = false;
    this.agent = null;
    this.bridgeUrl = config.whatsapp?.bridgeUrl || "ws://localhost:8080";
    this.enabled = config.whatsapp?.enabled || false;
  }

  setAgent(agent) {
    this.agent = agent;
  }

  async start() {
    if (!this.enabled) {
      console.log("[whatsapp] Disabled in config. Skipping.");
      return;
    }

    this._connect();
  }

  _connect() {
    console.log(`[whatsapp] Connecting to bridge at ${this.bridgeUrl}...`);

    this.ws = new WebSocket(this.bridgeUrl);

    this.ws.on("open", () => {
      this.connected = true;
      console.log("[whatsapp] Connected to bridge");
    });

    this.ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        await this._handleBridgeMessage(msg);
      } catch (error) {
        console.error("[whatsapp] Error handling message:", error);
      }
    });

    this.ws.on("close", () => {
      this.connected = false;
      console.log("[whatsapp] Disconnected from bridge");

      // Reconnect after 5 seconds
      setTimeout(() => this._connect(), 5000);
    });

    this.ws.on("error", (error) => {
      console.error("[whatsapp] WebSocket error:", error.message);
    });
  }

  async _handleBridgeMessage(msg) {
    const { type } = msg;

    if (type === "message") {
      // Incoming WhatsApp message
      const { sender, content } = msg;
      console.log(`[whatsapp] Message from ${sender}: ${content.substring(0, 50)}...`);

      // Send to Message Bus (Nanobot way)
      const { getMessageBus } = require("../bus/queue");
      const bus = getMessageBus();
      
      await bus.publishInbound({
        channelType: "whatsapp",
        userId: sender,
        sessionId: sender,
        text: content,
      });
    } else if (type === "status") {
      console.log(`[whatsapp] Status: ${msg.status}`);
    } else if (type === "qr") {
      console.log("[whatsapp] QR code available in bridge terminal");
    } else if (type === "error") {
      console.error(`[whatsapp] Bridge error: ${msg.error}`);
    }
  }

  /**
   * Initialize outbound listener
   */
  async initOutbound() {
    const { getMessageBus } = require("../bus/queue");
    const bus = getMessageBus();
    
    bus.subscribe("whatsapp", async (msg) => {
      await this.send({ chat_id: msg.userId, content: msg.text });
    });
  }

  async send(message) {
    if (!this.connected || !this.ws) {
      console.warn("[whatsapp] Not connected to bridge");
      return false;
    }

    try {
      this.ws.send(
        JSON.stringify({
          type: "send",
          to: message.chat_id,
          text: message.content,
        })
      );
      return true;
    } catch (error) {
      console.error("[whatsapp] Error sending message:", error);
      return false;
    }
  }

  async stop() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

module.exports = { WhatsAppChannel };
