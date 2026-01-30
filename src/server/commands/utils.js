const fs = require("node:fs");
const path = require("node:path");

/**
 * Resolves the notes directory.
 * If currentProjectSlug is set, returns path within that project.
 * Otherwise returns the global NOTES_DIR.
 */
function getActiveNotesDir(state) {
  const { currentProjectSlug, PROJECTS_DIR, NOTES_DIR } = state;
  let targetDir = NOTES_DIR;

  if (currentProjectSlug) {
    targetDir = path.join(PROJECTS_DIR, currentProjectSlug, "notes");
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  return targetDir;
}

/**
 * Resolves the docs directory.
 * If currentProjectSlug is set, returns path within that project.
 * Otherwise returns the global DOCS_DIR.
 */
function getActiveDocsDir(state) {
  const { currentProjectSlug, PROJECTS_DIR, DOCS_DIR } = state;
  let targetDir = DOCS_DIR;

  if (currentProjectSlug) {
    targetDir = path.join(PROJECTS_DIR, currentProjectSlug, "docs");
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  return targetDir;
}

/**
 * Resolves the memory directory.
 * If currentProjectSlug is set, returns path within that project.
 * Otherwise returns the global MEMORY_DIR.
 */
function getActiveMemoryDir(state) {
  const { currentProjectSlug, PROJECTS_DIR, MEMORY_DIR } = state;
  let targetDir = MEMORY_DIR;

  if (currentProjectSlug) {
    targetDir = path.join(PROJECTS_DIR, currentProjectSlug, "memory");
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  return targetDir;
}

/**
 * Returns a suffix for messages based on whether a project is active.
 */
function getScopeName(state) {
  return state.currentProjectSlug ? "current project" : "workspace";
}

module.exports = {
  getActiveNotesDir,
  getActiveDocsDir,
  getActiveMemoryDir,
  getScopeName
};
