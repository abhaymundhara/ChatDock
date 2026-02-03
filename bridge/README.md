# WhatsApp Bridge

This Node.js bridge connects ChatDock to WhatsApp using the Baileys library.

## Setup

1. Install dependencies:
```bash
cd bridge
npm install
```

2. Start the bridge:
```bash
npm start
```

3. Scan the QR code with WhatsApp (Settings → Linked Devices → Link a Device)

4. The bridge will maintain the connection and forward messages to ChatDock

## How it Works

- Uses `@whiskeysockets/baileys` to connect to WhatsApp Web
- Exposes a WebSocket server on port 8080
- ChatDock server connects via WebSocket to send/receive messages
- Authentication state saved in `auth_info/` directory

## Troubleshooting

- **QR code not showing**: Make sure WhatsApp is installed on your phone
- **Connection lost**: The bridge will automatically reconnect
- **Port conflict**: Change `WS_PORT` in `index.js` if 8080 is in use
