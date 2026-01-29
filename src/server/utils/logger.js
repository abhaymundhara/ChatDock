/**
 * Logger for ChatDock
 * Comprehensive logging system that creates detailed log files for every run
 * Logs all tool executions, planning, specialist assignments, task completion, and system events
 */

const fs = require("fs");
const path = require("path");

// Get logs directory path
const getLogsDir = () => {
    const appPath =
        process.env.CHATDOCK_APP_PATH || path.join(__dirname, "../../..");
    return path.join(appPath, "logs");
};

// Ensure logs directory exists
const ensureLogsDir = () => {
    const logsDir = getLogsDir();
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    return logsDir;
};

// Format timestamp for log entries
const formatTimestamp = () => {
    return new Date().toISOString();
};

// Generate session ID for grouping related logs
const generateSessionId = () => {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Current session state
let currentSessionId = null;
let sessionLogFile = null;
let sessionStats = {
    requestsProcessed: 0,
    toolCalls: 0,
    toolSuccesses: 0,
    toolFailures: 0,
    specialistsSpawned: 0,
    specialistSuccesses: 0,
    specialistFailures: 0,
    tasksCreated: 0,
    tasksCompleted: 0,
    tasksFailed: 0,
};

/**
 * Initialize a new logging session
 * Creates a new log file for this session
 * @returns {string} Session ID
 */
function initSession() {
    currentSessionId = generateSessionId();
    const logsDir = ensureLogsDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    sessionLogFile = path.join(logsDir, `run_${timestamp}.log`);

    // Reset stats
    sessionStats = {
        requestsProcessed: 0,
        toolCalls: 0,
        toolSuccesses: 0,
        toolFailures: 0,
        specialistsSpawned: 0,
        specialistSuccesses: 0,
        specialistFailures: 0,
        tasksCreated: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
    };

    // Write session header
    const header = `================================================================================
                         CHATDOCK SESSION LOG
================================================================================
Session ID: ${currentSessionId}
Started: ${formatTimestamp()}
Log File: ${sessionLogFile}
================================================================================

`;

    fs.writeFileSync(sessionLogFile, header, "utf-8");
    console.log(`[logger] Session started: ${sessionLogFile}`);

    return currentSessionId;
}

/**
 * Log an entry to the current session
 * @param {string} level - Log level (INFO, WARN, ERROR, DEBUG)
 * @param {string} category - Category (SPECIALIST, TOOL, PLANNER, ORCHESTRATOR, SYSTEM, TASK)
 * @param {string} message - Log message
 * @param {Object} data - Additional data to log
 */
function log(level, category, message, data = null) {
    // Initialize session if not started
    if (!sessionLogFile) {
        initSession();
    }

    const timestamp = formatTimestamp();
    const levelPadded = level.padEnd(5);
    const categoryPadded = category.padEnd(12);

    // Format data nicely
    let dataStr = "";
    if (data) {
        const cleanData = JSON.stringify(data, null, 2)
            .split("\n")
            .map((line, i) => (i === 0 ? line : "                                      " + line))
            .join("\n");
        dataStr = `\n                                      ${cleanData}`;
    }

    const logLine = `[${timestamp}] [${levelPadded}] [${categoryPadded}] ${message}${dataStr}\n`;

    // Append to log file
    try {
        fs.appendFileSync(sessionLogFile, logLine, "utf-8");
    } catch (error) {
        console.error("[logger] Failed to write log:", error.message);
    }

    // Also log to console with color coding
    const consolePrefix = `[${category.toLowerCase()}]`;
    if (level === "ERROR") {
        console.error(consolePrefix, message);
    } else if (level === "WARN") {
        console.warn(consolePrefix, message);
    } else if (level === "DEBUG") {
        // Only log debug to file, not console
    } else {
        console.log(consolePrefix, message);
    }
}

/**
 * Log a section separator for better readability
 * @param {string} title - Section title
 */
function logSection(title) {
    if (!sessionLogFile) initSession();

    const separator = `\n${"─".repeat(80)}\n  ${title}\n${"─".repeat(80)}\n`;
    try {
        fs.appendFileSync(sessionLogFile, separator, "utf-8");
    } catch (error) {
        console.error("[logger] Failed to write section:", error.message);
    }
}

// ==================== PLANNING LOGS ====================

/**
 * Log user request received
 * @param {string} message - User's message
 * @param {string} sessionId - Session ID
 * @param {string} model - Model being used
 */
function logRequest(message, sessionId, model) {
    sessionStats.requestsProcessed++;
    logSection(`REQUEST #${sessionStats.requestsProcessed}`);
    log("INFO", "REQUEST", `New request received`, {
        user_message: message.substring(0, 500) + (message.length > 500 ? "..." : ""),
        session_id: sessionId,
        model: model,
        request_number: sessionStats.requestsProcessed,
    });
}

/**
 * Log planner analysis
 * @param {string} action - ANALYZE, ROUTE, BREAKDOWN
 * @param {Object} details - Planning details
 */
function logPlanner(action, details = {}) {
    const messages = {
        ANALYZE: "Analyzing user intent",
        ROUTE: "Routing decision made",
        BREAKDOWN: "Task breakdown created",
        CLARIFY: "Requesting clarification from user",
    };

    log("INFO", "PLANNER", messages[action] || `Planner ${action}`, {
        action,
        ...details,
    });
}

/**
 * Log to-do list planning
 * @param {Array} todos - List of to-do items
 */
function logTodoList(todos) {
    if (!todos || todos.length === 0) return;

    log("INFO", "PLANNER", `To-do list created with ${todos.length} items`, {
        todo_count: todos.length,
        todos: todos.map((t, i) => `${i + 1}. ${typeof t === "string" ? t : t.description || t.title || JSON.stringify(t)}`),
    });
}

// ==================== ORCHESTRATOR LOGS ====================

/**
 * Log orchestrator processing
 * @param {string} action - PROCESS, ROUTE, AGGREGATE
 * @param {Object} details - Orchestration details
 */
function logOrchestrator(action, details = {}) {
    const messages = {
        PROCESS: "Processing planner result",
        ROUTE: "Routing to appropriate handler",
        AGGREGATE: "Aggregating results from specialists",
        COMPLETE: "Request processing complete",
    };

    log("INFO", "ORCHESTRATOR", messages[action] || `Orchestrator ${action}`, {
        action,
        ...details,
    });
}

// ==================== TASK LOGS ====================

/**
 * Log task creation
 * @param {Object} task - Task object
 * @param {string} agentType - Type of agent assigned
 */
function logTaskCreated(task, agentType) {
    sessionStats.tasksCreated++;
    log("INFO", "TASK", `Task created and assigned`, {
        task_id: task.id,
        task_title: task.title,
        task_description: task.description?.substring(0, 200) + (task.description?.length > 200 ? "..." : ""),
        assigned_agent: agentType,
        task_number: sessionStats.tasksCreated,
    });
}

/**
 * Log task completion
 * @param {string} taskId - Task ID
 * @param {boolean} success - Whether task succeeded
 * @param {Object} details - Completion details
 */
function logTaskComplete(taskId, success, details = {}) {
    if (success) {
        sessionStats.tasksCompleted++;
    } else {
        sessionStats.tasksFailed++;
    }

    const level = success ? "INFO" : "ERROR";
    const status = success ? "COMPLETED" : "FAILED";

    log(level, "TASK", `Task ${status}`, {
        task_id: taskId,
        success,
        status,
        completed_count: sessionStats.tasksCompleted,
        failed_count: sessionStats.tasksFailed,
        ...details,
    });
}

// ==================== SPECIALIST LOGS ====================

/**
 * Log specialist spawning
 * @param {string} specialistType - Type of specialist
 * @param {string} taskId - Task ID
 * @param {string} action - START, COMPLETE, FAIL
 * @param {Object} details - Additional details
 */
function logSpecialist(specialistType, taskId, action, details = {}) {
    if (action === "START") {
        sessionStats.specialistsSpawned++;
        log("INFO", "SPECIALIST", `${specialistType.toUpperCase()} specialist SPAWNED`, {
            specialist_type: specialistType,
            task_id: taskId,
            specialist_number: sessionStats.specialistsSpawned,
            ...details,
        });
    } else if (action === "COMPLETE") {
        sessionStats.specialistSuccesses++;
        log("INFO", "SPECIALIST", `${specialistType.toUpperCase()} specialist COMPLETED`, {
            specialist_type: specialistType,
            task_id: taskId,
            status: "SUCCESS",
            success_count: sessionStats.specialistSuccesses,
            ...details,
        });
    } else if (action === "FAIL") {
        sessionStats.specialistFailures++;
        log("ERROR", "SPECIALIST", `${specialistType.toUpperCase()} specialist FAILED`, {
            specialist_type: specialistType,
            task_id: taskId,
            status: "FAILED",
            failure_count: sessionStats.specialistFailures,
            ...details,
        });
    } else {
        log("INFO", "SPECIALIST", `${specialistType.toUpperCase()} specialist ${action}`, {
            specialist_type: specialistType,
            task_id: taskId,
            action,
            ...details,
        });
    }
}

// ==================== TOOL LOGS ====================

/**
 * Log tool execution
 * @param {string} toolName - Name of the tool
 * @param {string} action - CALL, SUCCESS, FAIL
 * @param {Object} details - Tool arguments and results
 */
function logTool(toolName, action, details = {}) {
    if (action === "CALL") {
        sessionStats.toolCalls++;
        log("INFO", "TOOL", `Executing tool: ${toolName}`, {
            tool_name: toolName,
            action: "CALL",
            call_number: sessionStats.toolCalls,
            arguments: details.args || details,
        });
    } else if (action === "SUCCESS") {
        sessionStats.toolSuccesses++;
        log("INFO", "TOOL", `Tool succeeded: ${toolName}`, {
            tool_name: toolName,
            action: "SUCCESS",
            success_count: sessionStats.toolSuccesses,
            result_preview: details.result ?
                (typeof details.result === "string" ? details.result.substring(0, 200) : JSON.stringify(details.result).substring(0, 200)) :
                undefined,
            ...details,
        });
    } else if (action === "FAIL") {
        sessionStats.toolFailures++;
        log("ERROR", "TOOL", `Tool failed: ${toolName}`, {
            tool_name: toolName,
            action: "FAIL",
            failure_count: sessionStats.toolFailures,
            error: details.error,
            ...details,
        });
    } else {
        log("INFO", "TOOL", `Tool ${action}: ${toolName}`, {
            tool_name: toolName,
            action,
            ...details,
        });
    }
}

/**
 * Log detailed tool execution with full arguments and results
 * @param {string} toolName - Name of the tool
 * @param {Object} args - Tool arguments
 * @param {Object} result - Tool result
 * @param {number} duration - Execution duration in ms
 */
function logToolExecution(toolName, args, result, duration) {
    const success = result && result.success !== false && !result.error;

    if (success) {
        sessionStats.toolSuccesses++;
    } else {
        sessionStats.toolFailures++;
    }
    sessionStats.toolCalls++;

    const level = success ? "INFO" : "ERROR";
    const status = success ? "SUCCESS" : "FAILED";

    // Clean up args for logging (remove internal context)
    const cleanArgs = { ...args };
    delete cleanArgs.__context;

    log(level, "TOOL", `${toolName} → ${status} (${duration}ms)`, {
        tool_name: toolName,
        status,
        duration_ms: duration,
        arguments: cleanArgs,
        result: result ? {
            success: result.success,
            error: result.error,
            // Include first 500 chars of any string result
            output: result.content ? result.content.substring(0, 500) :
                result.stdout ? result.stdout.substring(0, 500) :
                    result.files ? `${result.files.length} files` :
                        undefined,
        } : undefined,
        call_number: sessionStats.toolCalls,
        success_rate: `${sessionStats.toolSuccesses}/${sessionStats.toolCalls}`,
    });
}

// ==================== SYSTEM LOGS ====================

/**
 * Log system events
 * @param {string} event - Event type
 * @param {Object} details - Event details
 */
function logSystem(event, details = {}) {
    log("INFO", "SYSTEM", event, details);
}

/**
 * Log errors
 * @param {string} category - Category where error occurred
 * @param {string} message - Error message
 * @param {Error|Object} error - Error object or details
 */
function logError(category, message, error = {}) {
    const errorDetails =
        error instanceof Error
            ? { message: error.message, stack: error.stack?.split("\n").slice(0, 5).join("\n") }
            : error;
    log("ERROR", category, message, errorDetails);
}

/**
 * Log response sent to user
 * @param {string} responseType - Type of response (conversation, clarification, task)
 * @param {Object} details - Response details
 */
function logResponse(responseType, details = {}) {
    log("INFO", "RESPONSE", `Sending ${responseType} response to user`, {
        response_type: responseType,
        content_length: details.content?.length,
        has_results: !!details.results,
        ...details,
    });
}

/**
 * End the current session with a summary
 * @param {Object} extraSummary - Additional summary info
 */
function endSession(extraSummary = {}) {
    if (!sessionLogFile) return;

    const footer = `
================================================================================
                         SESSION SUMMARY
================================================================================
Session ID: ${currentSessionId}
Ended: ${formatTimestamp()}

STATISTICS:
  Requests Processed: ${sessionStats.requestsProcessed}
  
  Tasks:
    Created:   ${sessionStats.tasksCreated}
    Completed: ${sessionStats.tasksCompleted}
    Failed:    ${sessionStats.tasksFailed}
  
  Specialists:
    Spawned:   ${sessionStats.specialistsSpawned}
    Succeeded: ${sessionStats.specialistSuccesses}
    Failed:    ${sessionStats.specialistFailures}
  
  Tools:
    Calls:     ${sessionStats.toolCalls}
    Succeeded: ${sessionStats.toolSuccesses}
    Failed:    ${sessionStats.toolFailures}
    Success Rate: ${sessionStats.toolCalls > 0 ? Math.round((sessionStats.toolSuccesses / sessionStats.toolCalls) * 100) : 0}%

${extraSummary.reason ? `Shutdown Reason: ${extraSummary.reason}` : ""}
================================================================================
`;

    try {
        fs.appendFileSync(sessionLogFile, footer, "utf-8");
        console.log(`[logger] Session ended: ${sessionLogFile}`);
    } catch (error) {
        console.error("[logger] Failed to write session footer:", error.message);
    }

    // Reset session state
    currentSessionId = null;
    sessionLogFile = null;
}

/**
 * Get the current session log file path
 * @returns {string|null}
 */
function getSessionLogFile() {
    return sessionLogFile;
}

/**
 * Get the current session ID
 * @returns {string|null}
 */
function getSessionId() {
    return currentSessionId;
}

/**
 * Get current session statistics
 * @returns {Object}
 */
function getStats() {
    return { ...sessionStats };
}

module.exports = {
    initSession,
    endSession,
    log,
    logSection,
    logRequest,
    logPlanner,
    logTodoList,
    logOrchestrator,
    logTaskCreated,
    logTaskComplete,
    logSpecialist,
    logTool,
    logToolExecution,
    logSystem,
    logError,
    logResponse,
    getSessionLogFile,
    getSessionId,
    getStats,
    getLogsDir,
    ensureLogsDir,
};
