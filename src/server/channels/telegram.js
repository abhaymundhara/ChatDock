/**
 * Telegram Channel
 * Lightweight implementation using node-fetch (no extra dependencies)
 */

const fetch = require("node-fetch");
const { loadSettings } = require("../config/settings");

class TelegramChannel {
  constructor(config = {}) {
    this.userDataPath = config.userDataPath;
    this.agent = null;
    this.running = false;
    this.offset = 0;
    this.chatIds = new Map(); // sender_id -> chat_id
  }

  setAgent(agent) {
    this.agent = agent;
  }

  getToken() {
    const settings = loadSettings(this.userDataPath);
    return settings.telegram?.token || process.env.TELEGRAM_TOKEN;
  }

  getAllowedUsers() {
    const settings = loadSettings(this.userDataPath);
    return settings.telegram?.allowedUsers || []; // Array of user IDs/Usernames
  }

  async start() {
    const token = this.getToken();
    if (!token) {
      console.log("[telegram] No token configured. Skipping.");
      return;
    }

    this.running = true;
    console.log("[telegram] Starting polling...");
    this.poll();
  }

  async stop() {
    this.running = false;
  }

  async poll() {
    const token = this.getToken();
    if (!token) return;

    while (this.running) {
      try {
        const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${this.offset}&timeout=30`;
        const resp = await fetch(url);
        
        if (!resp.ok) {
          // console.warn(`[telegram] Polling error: ${resp.status}`);
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }

        const data = await resp.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            this.offset = update.update_id + 1;
            await this.handleUpdate(update);
          }
        }
      } catch (e) {
        console.error("[telegram] Polling exception:", e.message);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  async handleUpdate(update) {
    if (!update.message || !update.message.text) return; // Only text for now

    const msg = update.message;
    const chatId = msg.chat.id;
    const userId = String(msg.from.id);
    const username = msg.from.username;
    
    // Auth check
    const allowed = this.getAllowedUsers();
    if (allowed.length > 0) {
      const isAllowed = allowed.includes(userId) || (username && allowed.includes(username));
      if (!isAllowed) {
        console.log(`[telegram] Ignoring message from unauthorized user: ${userId} (@${username})`);
        return;
      }
    }

    console.log(`[telegram] Message from ${userId}: ${msg.text}`);
    this.chatIds.set(userId, chatId);

    // Send to Message Bus (Nanobot way)
    const { getMessageBus } = require("../bus/queue");
    const bus = getMessageBus();
    
    await bus.publishInbound({
      channelType: "telegram",
      userId: userId,
      sessionId: userId, // Use userId as sessionId for telegram
      text: msg.text,
      metadata: { chatId }
    });
  }

  /**
   * Initialize outbound listener
   */
  async initOutbound() {
    const { getMessageBus } = require("../bus/queue");
    const bus = getMessageBus();
    
    bus.subscribe("telegram", async (msg) => {
      const chatId = msg.metadata?.chatId || this.chatIds.get(msg.userId);
      if (chatId) {
        await this.sendMessage(chatId, msg.text);
      }
    });
  }

  async sendMessage(chatId, text) {
    const token = this.getToken();
    if (!token) return;

    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: "Markdown" 
        })
      });
    } catch (e) {
      console.error("[telegram] Failed to send message:", e.message);
    }
  }
}

module.exports = { TelegramChannel };
