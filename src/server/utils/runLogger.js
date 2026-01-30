/**
 * Session-Based Human-Readable Logger
 * Logs interactions into a single file per session in a readable format.
 */
const fs = require("node:fs");
const path = require("node:path");

let logDir = null;

/**
 * Initialize the logger with a workspace root directory
 * @param {string} workspaceRoot - Root directory for the workspace
 */
function initRunLogger(workspaceRoot) {
  if (!workspaceRoot) return;

  logDir = path.join(workspaceRoot, "logs", "sessions");

  // Ensure logs directory exists
  if (!fs.existsSync(logDir)) {
    try {
      fs.mkdirSync(logDir, { recursive: true });
    } catch (err) {
      console.warn("[RunLogger] Failed to create logs dir:", err.message);
      logDir = null;
      return;
    }
  }

  console.log("[RunLogger] Initialized at:", logDir);
}

/**
 * Start a new interaction within a session
 * @param {string} userMessage - The initial user message
 * @param {object} metadata - Additional metadata (must include sessionId)
 * @returns {string} The sessionId
 */
function startRun(userMessage, metadata = {}) {
  const sessionId = metadata.sessionId || "default";
  
  if (!logDir) return sessionId;

  const timestamp = new Date().toISOString();
  
  // Separator for new interaction
  const header = `\n\n` + 
    `================================================================================\n` +
    `INTERACTION START [${timestamp}]\n` +
    `Model: ${metadata.requestedModel || "default"}\n` +
    `--------------------------------------------------------------------------------\n` +
    `[USER] ${userMessage}\n` +
    `--------------------------------------------------------------------------------\n`;

  appendLog(sessionId, header);
  return sessionId;
}

/**
 * Log a general step
 */
function logStep(stepType, description, details = {}) {
  appendLogEntry(null, stepType.toUpperCase(), description, details);
}

/**
 * Log a tool execution
 */
function logToolCall(toolName, params, result) {
  const paramStr = JSON.stringify(params, null, 2);
  const resultStr = JSON.stringify(result, null, 2);
  
  const msg = `Tool: ${toolName}\nParams: ${paramStr}\nResult: ${resultStr}`;
  appendLogEntry(null, "TOOL", msg);
}

/**
 * Log intent classification
 */
function logIntentClassification(userMessage, intent, matchedPattern = null) {
  appendLogEntry(null, "INTENT", `Classified as: ${intent}`, { matchedPattern });
}

/**
 * Log planning activity
 */
function logPlanning(phase, planData) {
  let msg = `Phase: ${phase}`;
  if (planData) {
    msg += `\nData: ${JSON.stringify(planData, null, 2)}`;
  }
  appendLogEntry(null, "PLANNING", msg);
}

/**
 * Log plan step execution
 */
function logPlanStep(stepIndex, stepDescription, status, result = {}) {
  const msg = `Step ${stepIndex + 1}: ${stepDescription}\nStatus: ${status}\nResult: ${JSON.stringify(result, null, 2)}`;
  appendLogEntry(null, "PLAN_EXEC", msg);
}

/**
 * Log LLM response
 */
function logLLMResponse(model, tokenCount, responsePreview) {
  appendLogEntry(null, "LLM", `Response from ${model} (${tokenCount} tokens)\n${responsePreview}`);
}

/**
 * Log error
 */
function logError(errorType, message, errorDetails = {}) {
  const msg = `${errorType}: ${message}\nStack: ${errorDetails.stack || "N/A"}`;
  appendLogEntry(null, "ERROR", msg);
}

/**
 * End the interaction (run)
 */
function endRun(status = "completed", summary = {}) {
  const timestamp = new Date().toISOString();
  const msg = `--------------------------------------------------------------------------------\n` +
              `INTERACTION END [${timestamp}] - Status: ${status}\n` +
              `================================================================================\n`;
  // We need the sessionId here. Since the original signature didn't have it, 
  // we rely on the caller to manage context or we just append to the active session if we tracked it.
  // Ideally, `endRun` should take sessionId or we assume single-threaded for now (which is risky).
  // Limitation: The original server.js calls endRun without sessionId. 
  // We will assume "default" if not provided, OR better, server.js needs to pass it.
  // For the immediate refactor without deeply changing server.js flow, we'll try to rely on global/module state 
  // ONLY IF we can strictly map it. But server is async. 
  // SAFE FIX: We will update `session_default.log` by default if no ID is passed, but we should update server.js to pass it.
  // For now, let's append to the last used session if possible, or just require sessionId.
  
  // Actually, let's update server.js to pass sessionId to endRun.
  // If not passed, we'll just log to a default.
  const sessionId = summary.sessionId || "default";
  appendLog(sessionId, msg);
}

// ===== Helper Functions =====

function appendLogEntry(sessionId, level, message, details = null) {
  // If sessionId not explicitly passed, we might need a way to know. 
  // Since server.js calls logStep without sessionId, this is a problem for concurrent sessions.
  // HOWEVER, the user asked for "one log for one session each".
  // Given the current architecture where `server.js` calls `logStep` without session context,
  // we either inject session ID into every call (big refactor) or maintain a formatted string in memory
  // or (simplest for now) write to a "latest" log or require strict passing.
  
  // TEMPORARY TRICK: The server.js `startRun` returns `runId`. In the new model, `runId` IS `sessionId`.
  // So server.js variable `runId` will actually hold the `sessionId`.
  // But `logStep` doesn't take `runId`.
  // CHECKING `server.js` again... `logStep` calls do NOT pass logId.
  // The original `runLogger.js` used a module-level `currentRunId`. This IS NOT SAFE for concurrent requests.
  // BUT, assuming the user is single-user (local desktop app), we can stick to module-level tracking 
  // for the "active" request.
  
  // We will use the module-level variable `activeSessionId` essentially replacing `currentRunId`.
  
  if (sessionId) activeSessionId = sessionId;
  
  if (!logDir || !activeSessionId) return;

  const timestamp = new Date().toISOString().split("T")[1].slice(0, 8); // HH:mm:ss
  let entry = `[${timestamp}] [${level}] ${message}`;
  if (details) {
      if (typeof details === 'object') {
          // Compact JSON for small details, pretty for large
          const detailsStr = JSON.stringify(details, null, 2);
          if (detailsStr.length < 100) entry += ` ${JSON.stringify(details)}`;
          else entry += `\n${detailsStr}`;
      } else {
          entry += ` ${details}`;
      }
  }
  entry += "\n";

  appendLog(activeSessionId, entry);
}

let activeSessionId = "default";

function appendLog(sessionId, content) {
  if (!logDir) return;
  if (sessionId) activeSessionId = sessionId;

  const logFile = path.join(logDir, `session_${activeSessionId}.log`);
  
  fs.appendFile(logFile, content, (err) => {
    if (err) console.warn("[RunLogger] Write failed:", err.message);
  });
}

function getRecentRuns(limit = 10) {
    // Return list of session logs
    if (!logDir) return [];
    try {
        return fs.readdirSync(logDir)
            .filter(f => f.startsWith('session_') && f.endsWith('.log'))
            .map(f => ({ runId: f, timestamp: new Date(), event: 'session_log' })); 
    } catch { return []; }
}

function getRunLog(runId) {
    // Read the text file
    if (!logDir) return [];
    try {
         // Handle both "session_X.log" and just "X"
         let filename = runId;
         if (!filename.endsWith('.log')) filename = `session_${filename}`;
         if (!filename.endsWith('.log')) filename += ".log";
         
         const filepath = path.join(logDir, filename);
         if (fs.existsSync(filepath)) {
             return fs.readFileSync(filepath, 'utf-8').split('\n');
         }
         return [];
    } catch { return []; }
}


module.exports = {
  initRunLogger,
  startRun,
  logStep,
  logToolCall,
  logIntentClassification,
  logPlanning,
  logPlanStep,
  logLLMResponse,
  logError,
  endRun,
  getRecentRuns,
  getRunLog,
};
