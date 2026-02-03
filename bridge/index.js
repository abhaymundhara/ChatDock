/**
 * WhatsApp Bridge for ChatDock
 * Uses @whiskeysockets/baileys to connect to WhatsApp Web
 * Communicates with ChatDock server via WebSocket
 */

import makeWASocket, { 
  useMultiFileAuthState, 
  DisconnectReason,
  fetchLatestBaileysVersion 
} from '@whiskeysockets/baileys';
import { WebSocketServer } from 'ws';
import qrcode from 'qrcode-terminal';

const WS_PORT = 8080;
const wss = new WebSocketServer({ port: WS_PORT });

let sock = null;
let connectedClients = new Set();

console.log('[bridge] WhatsApp Bridge starting...');
console.log(`[bridge] WebSocket server listening on port ${WS_PORT}`);

/**
 * Connect to WhatsApp
 */
async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    version,
  });

  // Save credentials when updated
  sock.ev.on('creds.update', saveCreds);

  // Connection updates
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('[bridge] Scan this QR code with WhatsApp:');
      qrcode.generate(qr, { small: true });
      
      // Send QR to connected clients
      broadcast({ type: 'qr', qr });
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('[bridge] Connection closed. Reconnecting:', shouldReconnect);
      
      broadcast({ type: 'status', status: 'disconnected' });

      if (shouldReconnect) {
        setTimeout(connectWhatsApp, 3000);
      }
    } else if (connection === 'open') {
      console.log('[bridge] Connected to WhatsApp!');
      broadcast({ type: 'status', status: 'connected' });
    }
  });

  // Incoming messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message) continue;
      if (msg.key.fromMe) continue; // Skip own messages

      const sender = msg.key.remoteJid;
      const messageText = 
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        '';

      if (!messageText) continue;

      console.log(`[bridge] Message from ${sender}: ${messageText.substring(0, 50)}...`);

      // Forward to ChatDock server
      broadcast({
        type: 'message',
        sender,
        content: messageText,
        id: msg.key.id,
        timestamp: msg.messageTimestamp,
        isGroup: sender.endsWith('@g.us'),
      });
    }
  });
}

/**
 * Broadcast message to all connected WebSocket clients
 */
function broadcast(data) {
  const message = JSON.stringify(data);
  connectedClients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
}

/**
 * Handle WebSocket connections from ChatDock server
 */
wss.on('connection', (ws) => {
  console.log('[bridge] ChatDock server connected');
  connectedClients.add(ws);

  // Send current status
  if (sock) {
    ws.send(JSON.stringify({ 
      type: 'status', 
      status: sock.user ? 'connected' : 'connecting' 
    }));
  }

  ws.on('message', async (data) => {
    try {
      const { type, to, text } = JSON.parse(data);

      if (type === 'send' && sock && text) {
        await sock.sendMessage(to, { text });
        console.log(`[bridge] Sent message to ${to}`);
      }
    } catch (error) {
      console.error('[bridge] Error handling message:', error);
      ws.send(JSON.stringify({ 
        type: 'error', 
        error: error.message 
      }));
    }
  });

  ws.on('close', () => {
    console.log('[bridge] ChatDock server disconnected');
    connectedClients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('[bridge] WebSocket error:', error);
    connectedClients.delete(ws);
  });
});

// Start WhatsApp connection
connectWhatsApp().catch((error) => {
  console.error('[bridge] Failed to connect to WhatsApp:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[bridge] Shutting down...');
  if (sock) {
    sock.end();
  }
  wss.close();
  process.exit(0);
});
