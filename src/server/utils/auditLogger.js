const fs = require("node:fs");
const path = require("node:path");

let auditDir = null;

function initAuditLogger(workspaceRoot) {
  if (!workspaceRoot) return;
  auditDir = path.join(workspaceRoot, "audit");
  
  // Ensure audit directory exists
  if (!fs.existsSync(auditDir)) {
    try {
      fs.mkdirSync(auditDir, { recursive: true });
    } catch (err) {
      console.warn("[AuditLogger] Failed to create audit dir:", err.message);
      auditDir = null; // Disable logging
    }
  }
}

function logAudit(eventType, metadata = {}) {
  if (!auditDir) return;

  try {
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const logFile = path.join(auditDir, `audit-${dateStr}.log`);
    
    const entry = {
      timestamp: now.toISOString(),
      event: eventType,
      ...metadata
    };

    const line = JSON.stringify(entry) + "\n";
    
    fs.appendFile(logFile, line, (err) => {
      if (err) {
        console.warn("[AuditLogger] Write failed:", err.message);
      }
    });
  } catch (err) {
    // Fail silently/warn, never throw
    console.warn("[AuditLogger] Error:", err.message);
  }
}

module.exports = {
  initAuditLogger,
  logAudit
};
