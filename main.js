const path = require("node:path");
const { fork } = require("node:child_process");
const { findAvailablePort } = require("./port-allocator");
const { buildTrayTemplate } = require("./tray-menu");
const { getSettingsHtml } = require("./settings-window");

let electron;
try {
  electron = require("electron");
} catch {
  electron = null;
}

const app = electron && typeof electron === "object" ? electron.app : null;
const BrowserWindow =
  electron && typeof electron === "object" ? electron.BrowserWindow : null;
const globalShortcut =
  electron && typeof electron === "object" ? electron.globalShortcut : null;

const DEFAULT_PORT = Number(process.env.CHAT_SERVER_PORT || 3001);
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "gemma2:2b";
const DEFAULT_BASE = process.env.OLLAMA_BASE || "http://127.0.0.1:11434";

let win;
let serverProcess;
let tray;
let settingsWindow;

function getHotkey() {
  return process.env.CHAT_HOTKEY || "CommandOrControl+Shift+Space";
}

function getIndexHtmlPath() {
  return path.join(__dirname, "Index.html");
}

function buildServerEnv({ port, model, base }) {
  return {
    ...process.env,
    CHAT_SERVER_PORT: String(port),
    OLLAMA_MODEL: model,
    OLLAMA_BASE: base,
  };
}

async function waitForServerReady(
  port,
  { timeoutMs = 8000, intervalMs = 300 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  const url = `http://127.0.0.1:${port}/health`;

  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { method: "GET" });
      if (r.ok) return true;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

function startServer({ port, model, base }) {
  const env = buildServerEnv({ port, model, base });
  const appPath =
    app && typeof app.getAppPath === "function" ? app.getAppPath() : __dirname;
  const serverPath = path.join(appPath, "server.js");
  serverProcess = fork(serverPath, [], { env, stdio: "inherit" });
}

function showErrorWindow(message) {
  if (!BrowserWindow) return;
  const errWin = new BrowserWindow({
    width: 480,
    height: 240,
    resizable: false,
    title: "ChatDock Error",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  const html = encodeURIComponent(`<h2>ChatDock</h2><p>${message}</p>`);
  errWin.loadURL(`data:text/html,${html}`);
}

function createMainWindow() {
  const isLinux = process.platform === "linux";
  win = new BrowserWindow({
    width: 700,
    height: 300,
    frame: false,
    transparent: !isLinux,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    backgroundColor: isLinux ? "#111111" : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.setIgnoreMouseEvents(false);
  win.loadFile(getIndexHtmlPath()); // Your floating chat bar HTML file
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }
  settingsWindow = new BrowserWindow({
    width: 420,
    height: 300,
    resizable: false,
    title: "Settings",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  const html = encodeURIComponent(getSettingsHtml());
  settingsWindow.loadURL(`data:text/html,${html}`);
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
  return settingsWindow;
}

function createTray({ serverUrl }) {
  const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <rect x="1" y="1" width="14" height="14" rx="3" ry="3" fill="#1f2937" />
  <circle cx="8" cy="8" r="3" fill="#60a5fa" />
</svg>`;
  const icon = electron.nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString('base64')}`
  );
  tray = new electron.Tray(icon);
  tray.setToolTip("ChatDock");

  const template = buildTrayTemplate({ serverUrl });
  const menu = electron.Menu.buildFromTemplate(template.map((item) => {
    if (item.id === "ask-ai") {
      return {
        ...item,
        click: () => {
          if (win) {
            win.show();
            win.focus();
          }
        },
      };
    }
    if (item.id === "settings") {
      return {
        ...item,
        click: () => createSettingsWindow(),
      };
    }
    if (item.id === "quit") {
      return {
        ...item,
        click: () => app.quit(),
      };
    }
    return item;
  }));

  tray.on("click", () => {
    tray.popUpContextMenu(menu);
  });
  tray.on("right-click", () => {
    tray.popUpContextMenu(menu);
  });
}

async function boot() {
  const port = await findAvailablePort(DEFAULT_PORT);
  process.env.CHAT_SERVER_PORT = String(port);
  startServer({ port, model: DEFAULT_MODEL, base: DEFAULT_BASE });

  const ready = await waitForServerReady(port);
  if (!ready) {
    showErrorWindow(
      "Local server failed to start. Check Ollama is running and restart the app.",
    );
    return;
  }

  createMainWindow();
  const serverUrl = `http://127.0.0.1:${port}`;
  createTray({ serverUrl });
  if (app.dock && typeof app.dock.hide === "function") {
    app.dock.hide();
  }

  // GLOBAL HOTKEY
  if (!globalShortcut || typeof globalShortcut.register !== "function") {
    console.warn(
      "globalShortcut is not available in this environment; hotkey will not be registered.",
    );
    return;
  }

  const primaryHotkey = getHotkey();
  let registered = false;
  try {
    registered = globalShortcut.register(primaryHotkey, () => {
      if (win.isVisible()) {
        win.hide();
      } else {
        win.show();
        win.focus();
      }
    });
  } catch (err) {
    console.warn("Error registering global hotkey", err);
    registered = false;
  }

  if (!registered) {
    const fallback = "CommandOrControl+Shift+Y";
    console.warn(
      `Failed to register hotkey '${primaryHotkey}'. Attempting fallback '${fallback}'.`,
    );
    try {
      registered = globalShortcut.register(fallback, () => {
        if (win.isVisible()) {
          win.hide();
        } else {
          win.show();
          win.focus();
        }
      });
    } catch (err) {
      console.warn("Error registering fallback hotkey", err);
      registered = false;
    }
  }

  if (!registered) {
    console.warn(
      "Could not register any global hotkey. This may be due to a conflicting system shortcut. Set CHAT_HOTKEY to a different value",
    );
    showErrorWindow(
      `Could not register global hotkey (${primaryHotkey}). It may conflict with a system shortcut. Set CHAT_HOTKEY to a different value and restart.`,
    );
  }
}

if (app && typeof app.whenReady === "function") {
  app.whenReady().then(boot);

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill();
    }
    if (tray) tray.destroy();
  });
}

module.exports = { buildServerEnv, getHotkey, getIndexHtmlPath };
