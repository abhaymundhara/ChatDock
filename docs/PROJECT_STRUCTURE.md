# ChatDock Project Structure

This document outlines the organized project structure for ChatDock, designed for clarity, maintainability, and future scalability.

## Directory Structure

```
ChatDock/
├── src/                           # All source code
│   ├── main/                      # Electron main process
│   │   ├── main.js              # Main entry point
│   │   ├── tray/                # System tray functionality
│   │   │   ├── tray-menu.js     # Tray menu template
│   │   │   └── tray-utils.js    # Tray utilities
│   │   └── settings/            # Settings window functionality
│   │       ├── settings-window.js # Settings window creation
│   │       └── settings-ipc.js    # Settings IPC handlers
│   ├── renderer/                  # Electron renderer process (UI)
│   │   ├── Index.html           # Main application UI
│   │   ├── preload.js           # Main window preload script
│   │   ├── settings-preload.js  # Settings window preload script
│   │   ├── renderer-config.js   # Renderer configuration
│   │   ├── components/          # UI components
│   │   │   ├── model-selection.js # Model selection logic
│   │   │   └── settings.html    # Settings UI HTML
│   │   ├── styles/              # CSS stylesheets
│   │   │   └── settings.css    # Settings styles
│   │   └── utils/               # Frontend utilities
│   ├── server/                   # Backend server
│   │   ├── server.js            # Express server
│   │   └── utils/               # Server utilities
│   │       ├── settings-store.js # Settings persistence
│   │       └── settings.js      # Settings utilities
│   └── shared/                   # Shared utilities
│       └── port-allocator.js    # Dynamic port allocation
├── assets/                       # Static assets
│   └── prompt.txt               # AI system prompt
├── config/                      # Configuration files
│   └── last_model.txt          # Last selected model
├── tests/                       # Test files
├── docs/                        # Documentation
└── node_modules/                # Dependencies
```

## File Responsibilities

### Main Process (`src/main/`)
- **main.js**: Application entry point, window management, server startup
- **tray/**: System tray integration and menu management
- **settings/**: Settings window creation and IPC communication

### Renderer Process (`src/renderer/`)
- **Index.html**: Main chat interface UI
- **preload.js**: Secure bridge between main and renderer processes
- **components/**: Reusable UI components
- **styles/**: CSS stylesheets

### Server (`src/server/`)
- **server.js**: Express backend API server
- **utils/**: Server-side utilities and data management

### Shared (`src/shared/`)
- **port-allocator.js**: Utilities used across multiple processes

### Assets & Config
- **assets/**: Static files that don't change at runtime
- **config/**: Runtime configuration and data files

## Design Principles

1. **Separation of Concerns**: Each directory has a single, clear responsibility
2. **Process Isolation**: Clear distinction between Electron processes
3. **Scalability**: Structure supports future growth without reorganization
4. **Maintainability**: Easy to locate and modify specific functionality
5. **Testing**: Clear structure makes test organization straightforward

## Import Patterns

### Main Process Imports
```javascript
// Shared utilities
const { findAvailablePort } = require('../shared/port-allocator');

// Main process modules
const { buildTrayTemplate } = require('./tray/tray-menu');
const { getSettingsHtml } = require('./settings/settings-window');

// Server utilities
const { loadSettings } = require('../server/utils/settings-store');
```

### Renderer Process Imports
```javascript
// Components
const { chooseModel } = require('./components/model-selection');

// Configuration
const { resolveChatBase } = require('./renderer-config');
```

### Server Imports
```javascript
// Shared utilities
const { findAvailablePort } = require('../shared/port-allocator');

// Renderer components (if needed)
const { chooseModel } = require('../renderer/components/model-selection');

// Server utilities
const { loadSettings } = require('./utils/settings-store');
```

## Build Configuration

The `package.json` build configuration includes:
- `src/**/*`: All source code
- `assets/**/*`: Static assets
- `config/**/*`: Configuration files
- `asarUnpack`: Files that need to be accessible outside the asar archive

## Migration Notes

This structure was created by reorganizing the previous flat structure:

### Moved Files
- `main.js` → `src/main/main.js`
- `server.js` → `src/server/server.js`
- `Index.html` → `src/renderer/Index.html`
- `preload.js` → `src/renderer/preload.js`
- All settings files → appropriate `src/main/settings/` or `src/server/utils/`
- `port-allocator.js` → `src/shared/port-allocator.js`
- `prompt.txt` → `assets/prompt.txt`
- `last_model.txt` → `config/last_model.txt`

### Updated Imports
All `require()` statements have been updated to reflect the new structure:
- Relative imports use `../` to navigate between directories
- Shared utilities are accessible from all processes
- Process-specific modules remain isolated

## Benefits

1. **Clear Architecture**: Easy to understand the application structure
2. **Better Organization**: Related files are grouped together
3. **Easier Testing**: Tests can be organized alongside the code they test
4. **Scalability**: New features have clear locations
5. **Maintainability**: Reduced cognitive load when locating code

## Future Considerations

- **API Layer**: Consider creating `src/server/api/` for endpoint organization
- **Database**: Add `src/server/db/` for database-related code
- **Plugins**: Consider `src/plugins/` for future plugin architecture
- **Themes**: Add `src/renderer/themes/` for UI theme support