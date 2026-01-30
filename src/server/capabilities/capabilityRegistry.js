const fs = require("node:fs");
const path = require("node:path");

const REGISTRY = {
  read_file: { executable: true, enabled: false, description: "Reads a file from the workspace" },
  write_file: { executable: true, enabled: false, description: "Writes a new file to the workspace" },
  edit_file: { executable: true, enabled: false, description: "Edits an existing file" },
  organize_files: { executable: true, enabled: false, description: "Moves or restructures files" },
  analyze_content: { executable: false, enabled: false, description: "Analyzes existing content" },
  research: { executable: false, enabled: false, description: "Gathers external information when enabled in the future (stub)" },
  os_action: { executable: false, enabled: false, description: "Performs OS-level actions such as opening apps, controlling windows, or running system commands (future)" },
  unknown: { executable: false, enabled: false, description: "Unclassified step" }
};

const PROFILES = {
  safe: {
    description: "Default Safe Mode. All capabilities disabled.",
    executionMode: "manual",
    enabledCaps: []
  },
  editor: {
    description: "Editor Mode. Can read, write, and edit files.",
    executionMode: "manual",
    enabledCaps: ["read_file", "write_file", "edit_file"]
  },
  organizer: {
    description: "Organizer Mode. Can read and move/rename files.",
    executionMode: "manual",
    enabledCaps: ["read_file", "organize_files"]
  },
  analysis: {
    description: "Analysis Mode. Can read and analyze content.",
    executionMode: "manual",
    enabledCaps: ["read_file", "analyze_content"]
  }
};

let runtimeConfigPath = null;
let globalExecutionMode = "manual";
let activeProfileName = "safe"; // Default start

function initRuntime(workspaceRoot) {
  if (!workspaceRoot) return;
  const configDir = path.join(workspaceRoot, "config");
  runtimeConfigPath = path.join(configDir, "runtime.json");

  // Ensure directory exists
  if (!fs.existsSync(configDir)) {
    try {
      fs.mkdirSync(configDir, { recursive: true });
    } catch (err) {
      console.warn("[CapabilityRegistry] Failed to create config dir:", err.message);
      runtimeConfigPath = null; // Disable persistence
      return;
    }
  }

  // Load state if exists
  if (fs.existsSync(runtimeConfigPath)) {
    try {
      const data = fs.readFileSync(runtimeConfigPath, "utf-8");
      const config = JSON.parse(data);
      
      // Load Execution Mode
      if (config.executionMode && ["manual", "disabled"].includes(config.executionMode)) {
        globalExecutionMode = config.executionMode;
      }

      // Load Capabilities
      if (config.capabilities) {
        for (const [type, enabled] of Object.entries(config.capabilities)) {
          if (REGISTRY[type]) {
            REGISTRY[type].enabled = !!enabled;
          }
        }
      }

      // Load Profile Name
      if (config.activeProfile) {
        activeProfileName = config.activeProfile;
      } else {
        activeProfileName = "custom"; // If missing but caps loaded, assume custom
      }

      console.log("[CapabilityRegistry] Loaded runtime config:", config);
    } catch (err) {
      console.warn("[CapabilityRegistry] Failed to load runtime config:", err.message);
    }
  } else {
    // Initial save of defaults (Safe Profile effectively)
    activeProfileName = "safe";
    applyProfile("safe"); // Enforce safe defaults
  }
}

function persistState() {
  if (!runtimeConfigPath) return;
  
  const capState = {};
  for (const [type, info] of Object.entries(REGISTRY)) {
    if (type !== "unknown") {
      capState[type] = info.enabled;
    }
  }

  const config = {
    executionMode: globalExecutionMode,
    capabilities: capState,
    activeProfile: activeProfileName
  };

  try {
    fs.writeFileSync(runtimeConfigPath, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    console.warn("[CapabilityRegistry] Failed to save runtime config:", err.message);
  }
}

function getCapability(type) {
  return REGISTRY[type] || REGISTRY.unknown;
}

function isExecutable(type) {
  const cap = getCapability(type);
  return cap.executable === true;
}

function isEnabled(type) {
  const cap = getCapability(type);
  return cap.enabled === true;
}

function isKnownType(type) {
  return REGISTRY.hasOwnProperty(type);
}

function enableCapability(type) {
  if (REGISTRY[type]) {
    REGISTRY[type].enabled = true;
    activeProfileName = "custom"; // Deviation from profile
    persistState();
    return true;
  }
  return false;
}

function disableCapability(type) {
  if (REGISTRY[type]) {
    REGISTRY[type].enabled = false;
    activeProfileName = "custom"; // Deviation from profile
    persistState();
    return true;
  }
  return false;
}

function getAllCapabilities() {
  return REGISTRY;
}

function getGlobalExecutionMode() {
  return globalExecutionMode;
}

function setGlobalExecutionMode(mode) {
  if (["manual", "disabled"].includes(mode)) {
    globalExecutionMode = mode;
    activeProfileName = "custom"; // Deviation from profile
    persistState();
    return true;
  }
  return false;
}

function getProfiles() {
  return {
    active: activeProfileName,
    profiles: PROFILES
  };
}

function applyProfile(profileName) {
  const profile = PROFILES[profileName];
  if (!profile) return false;

  // Apply Settings
  globalExecutionMode = profile.executionMode;
  
  for (const type of Object.keys(REGISTRY)) {
    if (type === "unknown") continue;
    REGISTRY[type].enabled = profile.enabledCaps.includes(type);
  }

  activeProfileName = profileName;
  persistState();
  return true;
}

module.exports = {
  initRuntime,
  getCapability,
  getAllCapabilities,
  isExecutable,
  isEnabled,
  isKnownType,
  enableCapability,
  disableCapability,
  getGlobalExecutionMode,
  setGlobalExecutionMode,
  getProfiles,
  applyProfile
};
