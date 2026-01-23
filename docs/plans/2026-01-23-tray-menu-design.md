# Tray Menu + Settings Window Design

Date: 2026-01-23

## Goals
- Provide a cross-platform tray/menu-bar icon instead of a dock/taskbar icon.
- Show a dropdown menu with:
  - Server URL (listening address)
  - Ask AI button
  - Settings button
  - Quit
- Open a basic Settings window placeholder.

## Non-Goals
- No real settings UI yet (placeholder only).
- No custom icons beyond a simple placeholder.
- No auto-updater or advanced tray behaviors.

## Architecture
- Use Electron `Tray` + `Menu` to create a cross-platform tray icon.
- Build menu dynamically using the current server port.
- Use a single `settingsWindow` instance.
- Hide dock icon on macOS with `app.dock.hide()`.
- Keep `skipTaskbar: true` for Windows/Linux window.

## Menu Behavior
- Left-click tray icon opens the context menu (dropdown behavior).
- Menu includes:
  - Disabled label: `Server: http://127.0.0.1:<port>`
  - `Ask AI` (show/focus main window)
  - `Settings` (open settings window)
  - `Quit`

## Settings Window
- Small `BrowserWindow` with a placeholder HTML string.
- Reuse window if already open.
- `Settings` menu item brings it to front.

## Assets
- Placeholder tray icon generated from a simple SVG data URL.
- No external icon file required yet.

## Testing
- Unit spec for menu template to assert labels and server URL presence.
- Manual run to verify tray icon and settings window appear.

