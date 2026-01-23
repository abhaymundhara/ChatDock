# Cross-Platform Compatibility + Packaging Design

Date: 2026-01-23

## Goals
- Ensure the app runs reliably on macOS, Windows, and Linux.
- Automatically start the local `server.js` backend from the Electron app.
- Provide native installers/builds for macOS, Windows, and Linux.
- Keep runtime behavior consistent across OSes (hotkeys, window behavior, paths).

## Non-Goals
- Not re-architecting the UI or chat logic.
- Not replacing Ollama or adding new model backends.
- Not building an auto-updater in this iteration.

## Architecture
- Electron main process manages:
  - BrowserWindow creation
  - Server lifecycle (spawn/monitor/terminate)
  - App single-instance lock
  - OS-specific window/shortcut settings
- Renderer stays a static `Index.html` UI.
- Local Express server remains `server.js` and is launched via `child_process.fork`.

## Server Lifecycle
- On app start:
  - Spawn `server.js` with `fork` and environment variables (`CHAT_SERVER_PORT`, `OLLAMA_BASE`, `OLLAMA_MODEL`).
  - Poll `GET /health` to determine readiness.
  - Only show the window after readiness or a timeout error.
- On app quit:
  - Terminate the server process.

## Data Flow
- Renderer uses a `CHAT_BASE` injected from the main process (via preload / IPC).
- The chat endpoint and models endpoint are based on this injected base URL.
- Avoid hard-coded `127.0.0.1:3001` in the UI.

## OS Compatibility Adjustments
- Global hotkey uses `CommandOrControl+Shift+Space`.
- Window options may vary by platform:
  - Disable transparency on Linux if it causes black window issues.
  - Guard `skipTaskbar`/`alwaysOnTop` where window managers are unreliable.
- Use `app.requestSingleInstanceLock()` to prevent multiple server instances.

## Security / Stability
- Add `preload.js` and enable `contextIsolation: true`.
- Remove `nodeIntegration` from the renderer.
- Expose only minimal APIs (chat base URL, optional app metadata).

## Packaging
- Use `electron-builder`.
- `package.json` `build` config:
  - `appId`, `productName`
  - `files`: include `main.js`, `server.js`, `Index.html`, `prompt.txt`, assets
  - Targets:
    - macOS: `dmg`
    - Windows: `nsis`
    - Linux: `AppImage`, `deb`

## Testing Checklist
- Startup: app launches and server auto-starts.
- Hotkey: toggle visibility works on each OS.
- Chat: message send + streaming response works.
- Model picker: models list loads or shows offline state.
- Dragging: dock draggable and stays within bounds.
- Packaging: installers/builds run and launch the app on each OS.

## Documentation
- Update README with:
  - Platform-specific install instructions.
  - Ollama dependency note per OS.
  - Build commands using `electron-builder`.

