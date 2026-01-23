# Settings Window (Frameless) Design

Date: 2026-01-23

## Goals
- Replace the default OS‑chrome settings window with a custom, borderless UI.
- Allow users to change the global hotkey.
- Allow users to edit the system prompt and temperature.
- Persist settings to the recommended per‑user app data directory.
- Show a toast notification on every save.

## Non-Goals
- Appearance settings (explicitly deferred).
- Server settings (deferred).
- Model selection (kept in main UI).

## Architecture
- Use a frameless `BrowserWindow` for settings (`frame: false`, `titleBarStyle: "hidden"`).
- Render a custom HTML settings page with our own header and controls.
- Use a preload script to expose a safe IPC API: load settings, save settings, and validate hotkey.
- Settings are stored at `app.getPath("userData")/settings.json`.
- On save, main process writes settings and replies with success; renderer shows toast.
- Hotkey changes update the global shortcut immediately.

## Settings Fields
- **Hotkey:** text input with “Save” button, validation feedback.
- **System Prompt:** multiline textarea.
- **Temperature:** slider (0.0–2.0) with numeric display.

## Toast Behavior
- Toast appears after each save (success or failure).
- Auto‑dismiss after ~2 seconds.

## Data Flow
1. Settings window loads and requests current settings via IPC.
2. User edits values and clicks Save.
3. Renderer sends settings to main via IPC.
4. Main validates, writes JSON, returns status.
5. Renderer shows toast and updates UI state.

## Testing
- Unit test for settings serialization defaults.
- Unit test for hotkey update helper logic.

