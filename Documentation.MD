# ChatDock Documentation

**Version**: 1.0 (Simplified Release)

**License**: MIT

**Platform**: macOS, Windows, Linux

ChatDock is a local-first, simple AI chat assistant that runs on your desktop. It uses Ollama for local LLM inference and provides a floating, always-on-top interface for chatting with local language models.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Configuration](#configuration)
4. [Installation & Setup](#installation--setup)
5. [API Endpoints](#api-endpoints)
6. [Development](#development)
7. [Troubleshooting](#troubleshooting)

---

## Overview

ChatDock provides a simple, clean interface for chatting with local LLMs via Ollama:

- Floating, always-on-top chat interface
- Model selection from installed Ollama models
- Customizable system prompt and temperature
- Streaming responses
- Privacy-focused (100% local)

### Core Principles

| Principle            | Description                                                                         |
| -------------------- | ----------------------------------------------------------------------------------- |
| **Local-First**      | All LLM inference happens on your machine via Ollama. No data leaves your computer. |
| **Privacy-Focused**  | No tracking, no analytics, no cloud dependency.                                     |
| **Simple & Fast**    | Minimal overhead, just you and your local AI.                                       |
| **User Sovereignty** | You control everything - settings, models, and data.                                |

---

## Architecture

ChatDock follows a **simple client-server architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│                     USER INTERFACE                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Floating HUD (ACE-style Pill)             │   │
│  │  • Text Input • Model Picker • Settings             │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    EXPRESS SERVER                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   /health    │  │   /models    │  │    /chat     │      │
│  │              │  │              │  │  (streaming) │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        OLLAMA API                           │
│                    (Local LLM Inference)                    │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
~/ChatDock/
├── src/
│   ├── main/                   # Electron main process
│   ├── renderer/               # UI (chat interface, settings)
│   ├── server/                 # Express server
│   │   ├── server.js           # Main server file
│   │   ├── orchestrator/       # Ollama client
│   │   │   └── ollama-client.js
│   │   └── utils/              # Settings, config
│   └── shared/                 # Shared utilities
└── config/
    ├── settings.json            # User settings
    └── last_model.txt           # Last selected Ollama model
```

---

## Configuration

ChatDock stores configuration in `config/settings.json`:

```json
{
  "systemPrompt": "You are a helpful AI assistant.",
  "temperature": 0.7,
  "hotkey": "CommandOrControl+Shift+Space"
}
```

### Settings

| Setting      | Type   | Default                           | Description                         |
| ------------ | ------ | --------------------------------- | ----------------------------------- |
| systemPrompt | string | "You are a helpful AI assistant." | System prompt sent to the model     |
| temperature  | number | 0.7                               | Sampling temperature (0.0 - 1.0)    |
| hotkey       | string | CommandOrControl+Shift+Space      | Global hotkey to show/hide ChatDock |

---

## Installation & Setup

### Prerequisites

1. **Ollama**: Install from [ollama.ai](https://ollama.ai)
2. **Node.js**: Version 18 or higher
3. **At least one Ollama model**: Run `ollama pull llama2` or similar

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ChatDock.git
cd ChatDock

# Install dependencies
npm install

# Start ChatDock
npm start
```

### First Launch

1. ChatDock will start automatically
2. Press `CommandOrControl+Shift+Space` to open the chat window
3. Select a model from the dropdown
4. Start chatting!

---

## API Endpoints

ChatDock's Express server exposes the following endpoints:

### GET /health

Returns server and Ollama health status.

**Response**:

```json
{
  "server": true,
  "ollama": true
}
```

### GET /models

Lists available Ollama models.

**Response**:

```json
{
  "models": ["llama2", "mistral"],
  "online": true,
  "lastModel": "llama2"
}
```

### POST /models/selected

Saves the selected model.

**Request**:

```json
{
  "model": "llama2"
}
```

**Response**:

```json
{
  "ok": true,
  "model": "llama2"
}
```

### POST /chat

Streams chat responses from Ollama.

**Request**:

```json
{
  "message": "Hello, how are you?",
  "model": "llama2"
}
```

**Response**: Streaming text/plain with model responses

---

## Development

### Project Structure

- **src/main/**: Electron main process (window management, tray, IPC)
- **src/renderer/**: Chat UI, settings UI, components
- **src/server/**: Express server, Ollama integration
- **src/shared/**: Code shared between main and renderer
- **tests/**: Test files

### Running Tests

```bash
npm test
```

### Building

```bash
npm run build
```

This creates a distributable app in the `dist/` folder.

---

## Troubleshooting

### Ollama Connection Issues

**Problem**: "No model available" error

**Solutions**:

- Verify Ollama is running: `ollama list`
- Check Ollama is accessible: `curl http://127.0.0.1:11434/api/version`
- Pull a model: `ollama pull llama2`

### Port Conflicts

**Problem**: Server fails to start

**Solutions**:

- Check if port 3001 is in use: `lsof -i :3001`
- Set a custom port: `CHAT_SERVER_PORT=3002 npm start`

### UI Not Showing

**Problem**: Hotkey doesn't work

**Solutions**:

- Check hotkey in settings
- Try the default: `CommandOrControl+Shift+Space`
- On macOS, grant accessibility permissions to the app

### Model Selection Issues

**Problem**: Models not appearing in dropdown

**Solutions**:

- Restart Ollama: `ollama serve`
- Verify models are installed: `ollama list`
- Check server logs for connection errors

---

## License

MIT License - see [LICENSE](LICENSE) file for details.
