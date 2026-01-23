# ChatDock

A minimal, floating, always-on-top AI chat interface designed to live on your desktop and stay out of the way while you work. Summon it via keyboard shortcut and fire off questions or commands directly to a local or cloud-based AI — without switching windows.

The long-term goal is to run this chat bar fully locally using tools like [Ollama](https://ollama.com), with zero cloud dependencies — just fast, private AI access baked into the OS.

---

## 🚀 Features

- Always-on-top floating chat bar UI
- Clean, misty visual design with animated typing indicator
- Message thread floats above the bar like a messaging app
- Live prompt + response system via OpenAI API (for now)
- Designed to evolve into a self-hosted AI tool
- Can be called on top of any app on any screen with a global hotkey (CommandOrControl+Shift+Space)

---

## 🧱 Stack

- HTML/CSS/JS frontend
- Node.js + Express backend
- OpenAI API (current backend)
- Ollama (local AI backend)

---


### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- [npm](https://www.npmjs.com/)
- [Ollama](https://ollama.com) for running local models

### Installation

```bash
git clone https://github.com/your-username/ChatDock.git
cd ChatDock
npm install
```

### Development

```bash
npm run dev   # Starts server + Electron together
```

### Production (Packaged Builds)

```bash
npm run build   # Builds installers for your current OS
```

Build outputs are written to `dist/`. To produce installers for Windows, macOS, and Linux, run `npm run build` on each OS.

---

## ⚙️ Configuration

Environment variables can be set in a `.env` file:

```bash
OLLAMA_BASE=http://127.0.0.1:11434
OLLAMA_MODEL=gemma2:2b # (recommended)
CHAT_SERVER_PORT=3001
```

---

## 📖 Roadmap

- [ ] Realtime screen context aware sessions
- [ ] Compute use capabilities
- [ ] Browser Use(more of agentic path)
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

Please ensure all PRs are well-documented and tested. Bug reports, feature requests, and discussions are encouraged via the [Issues](../../issues) tab.

I'm not that familiar with github contributions and stuff so please if you're interested to connect and discuss further about the project please do!
My discord is - abhay066841

---

## 📜 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 🙌 Acknowledgements

- [Ollama](https://ollama.com) for model APIs
- The open-source community for inspiration and tools
