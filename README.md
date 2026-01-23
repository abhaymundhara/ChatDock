# ChatDock

A minimal, floating, always-on-top desktop chat bar for local AI. ChatDock uses Ollama models and launches its local server automatically, so you can ask questions without switching windows.

---

## 🚀 Features

- Always-on-top floating chat bar UI
- Global hotkey toggle (CommandOrControl+Shift+Space)
- Model picker powered by local Ollama models
- Local, private inference (no cloud dependency)
- Auto-starts the local server on app launch

---

## 🧱 Stack

- Electron (desktop shell)
- HTML/CSS/JS frontend
- Node.js + Express backend
- Ollama (local model runtime)

---

## ✅ Prerequisites

- [Ollama](https://ollama.com) installed and running
- [Node.js](https://nodejs.org/) (v18+ recommended)
- [npm](https://www.npmjs.com/)

---

## 📦 Installation

```bash
git clone https://github.com/abhaymundhara/ChatDock.git
cd ChatDock
npm install
```

---

## 🧪 Development

```bash
npm run dev   # Starts Electron (server auto-starts)
```

---

## 🏗️ Production (Packaged Builds)

```bash
npm run build   # Builds installers for your current OS
```

Build outputs are written to `dist/`. To produce installers for Windows, macOS, and Linux, run `npm run build` on each OS.

---

## ⚙️ Configuration

Environment variables can be set in a `.env` file:

```bash
OLLAMA_BASE=http://127.0.0.1:11434
OLLAMA_MODEL=gemma2:2b
CHAT_SERVER_PORT=3001
```

---

## 📖 Roadmap

- [ ] Realtime screen context aware sessions
- [ ] Multi-chat sessions
- [ ] Rich message formatting
- [ ] Auto-updates

---

## 🤝 Contributing

Contributions are welcome! To get started:

1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add new feature'`)
4. Push to your branch (`git push origin feature/your-feature`)
5. Open a Pull Request

If you want to chat about the project, feel free to reach out on Discord: **abhay066841**.

---

## 📜 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 🙌 Acknowledgements

- [Ollama](https://ollama.com) for local model APIs
- The open-source community for inspiration and tools
