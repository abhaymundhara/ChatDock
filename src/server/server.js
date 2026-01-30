// server.js - Intent Clarifier Mode with Workspace Sandboxed Save Note action
const http = require("node:http");
const express = require("express");
const cors = require("cors");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { chooseModel } = require("../shared/choose-model");
const { getServerConfig } = require("./utils/server-config");
const { handleCommand } = require("./commands/commandRouter");
const {
  initRuntime,
  getGlobalExecutionMode,
} = require("./capabilities/capabilityRegistry");
const { initAuditLogger, logAudit } = require("./utils/auditLogger");
const {
  initRunLogger,
  startRun,
  logStep,
  logIntentClassification,
  logPlanning,
  logLLMResponse,
  logError,
  endRun,
} = require("./utils/runLogger");
const { executePlanLoop } = require("./utils/executionLoop");

const {
  port: PORT,
  host: HOST,
  lastModelPath: LAST_MODEL_PATH,
} = getServerConfig();

const OLLAMA_BASE = process.env.OLLAMA_BASE || "http://127.0.0.1:11434";

// Workspace Configuration - Default to Desktop
const WORKSPACE_ROOT = path.join(os.homedir(), "Desktop", "chatdock_workspace");
const NOTES_DIR = path.join(WORKSPACE_ROOT, "notes");
const DOCS_DIR = path.join(WORKSPACE_ROOT, "docs");
const PROJECTS_DIR = path.join(WORKSPACE_ROOT, "projects");
const MEMORY_DIR = path.join(WORKSPACE_ROOT, "memory");

// Ensure workspace directories exist
if (!fs.existsSync(WORKSPACE_ROOT)) {
  fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });
}
if (!fs.existsSync(NOTES_DIR)) {
  fs.mkdirSync(NOTES_DIR, { recursive: true });
}
if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}
if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}
if (!fs.existsSync(MEMORY_DIR)) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

// Initialize Runtime Config (Capabilities & Execution Mode persistence)
initRuntime(WORKSPACE_ROOT);
initAuditLogger(WORKSPACE_ROOT);
initRunLogger(WORKSPACE_ROOT);

// Load prompts from external MD files
const PROMPTS_DIR = path.join(__dirname, "../../prompts");
const INTENT_CLARIFIER_SYSTEM_PROMPT = fs.readFileSync(
  path.join(PROMPTS_DIR, "intent_clarifier.md"),
  "utf-8",
);
const ANSWER_MODE_SYSTEM_PROMPT = fs.readFileSync(
  path.join(PROMPTS_DIR, "answer_mode.md"),
  "utf-8",
);
const PLANNER_SYSTEM_PROMPT = fs.readFileSync(
  path.join(PROMPTS_DIR, "planner_mode.md"),
  "utf-8",
);

// ===== INTENT CLASSIFIER =====
// Deterministic, rule-based intent classification for routing messages
// Returns: "command" | "task" | "chat"

const KNOWN_COMMANDS = [
  // Save commands
  "save",
  "save note",
  "save doc",
  "save document",
  "save as note",
  "save as doc",
  // List commands
  "list",
  "list notes",
  "list docs",
  "list documents",
  "list projects",
  "list memories",
  // Open commands
  "open",
  "open note",
  "open doc",
  "open document",
  "open project",
  // Rename commands
  "rename",
  "rename note",
  "rename doc",
  "rename project",
  // Delete commands
  "delete",
  "delete note",
  "delete doc",
  "delete document",
  "delete project",
  "remove",
  // Memory commands
  "remember this",
  "recall",
  "search memories",
  "find memories",
  // Plan commands (explicit)
  "show plan",
  "show plan steps",
  "plan status",
  "summary plan",
  "export plan",
  "duplicate plan",
  "save plan as template",
  "list plan templates",
  "load plan template",
  "check plan readiness",
  // Execution commands
  "proceed with plan",
  "execute step",
  "allow step",
  "deny step",
  "dry run step",
  // Plan management
  "lock plan",
  "unlock plan",
  "move step",
  "skip step",
  "unskip step",
  "undo step",
  "cancel plan",
  "clear plan",
  "reset plan",
  // Capability commands
  "list capabilities",
  "show capabilities",
  "enable capability",
  "disable capability",
  // Execution mode commands
  "show execution mode",
  "set execution mode manual",
  "set execution mode disabled",
  // Execution profile commands
  "list execution profiles",
  "show execution profiles",
  "current execution profile",
  "use execution profile",
  // Help
  "help",
  "what can you do",
];

// Verbs and phrases that indicate task-like requests
const TASK_VERBS = [
  "plan", // added
  "write", // added
  "compose", // added
  "organize",
  "clean",
  "refactor",
  "create",
  "set up",
  "configure",
  "rename",
  "move",
  "delete",
  "summarize",
  "scan",
  "analyze",
  "rewrite",
  "generate",
  "build",
  "design",
  "draft",
  "fix",
  "update",
  "migrate",
  "consolidate",
  "extract",
  "convert",
  "import",
  "export",
  "sync",
  "backup",
  "restore",
];

// Phrases that indicate task-like requests
const TASK_PHRASES = [
  "do this for me",
  "handle this",
  "make me",
  "can you do",
  "fix this",
  "i need you to",
  "please organize",
  "please clean",
  "please refactor",
  "i want to",
  "help me organize",
  "help me clean",
  "could you organize",
  "would you mind",
  "can you please",
  "i'd like to",
];

/**
 * Classifies a user message into one of three intents:
 * - "command": Matches known command syntax, routes to command handler
 * - "task": Looks like a concrete action request, triggers automatic planning
 * - "chat": General conversation, explanation, or Q&A - uses answer mode
 *
 * @param {string} messageText - The raw user message
 * @returns {"command" | "task" | "chat"}
 */
function classifyIntent(messageText) {
  const normalized = messageText.trim().toLowerCase();

  // Empty or whitespace-only messages default to chat
  if (!normalized || normalized.length === 0) {
    return "chat";
  }

  // 1. Check for known commands (exact matches or prefix matches)
  // This is conservative - if unsure, don't classify as command
  for (const cmd of KNOWN_COMMANDS) {
    // Exact match
    if (normalized === cmd) {
      console.log(`[Intent] Exact command match: "${cmd}"`);
      return "command";
    }
    // Prefix match: "save" matches "save note", "save doc", etc.
    // But not vice versa - "save note" should not match "save"
    if (
      normalized.startsWith(cmd + " ") ||
      normalized.startsWith(cmd + ":") ||
      normalized.startsWith(cmd + "...")
    ) {
      console.log(`[Intent] Command prefix match: "${cmd}"`);
      return "command";
    }
  }

  // 2. Check for task-like patterns

  // Check if starts with a task verb
  for (const verb of TASK_VERBS) {
    if (
      normalized.startsWith(verb + " ") ||
      normalized.startsWith(verb + " ")
    ) {
      console.log(`[Intent] Task verb match: "${verb}"`);
      return "task";
    }
  }

  // Check for task-like phrases
  for (const phrase of TASK_PHRASES) {
    if (normalized.includes(phrase)) {
      console.log(`[Intent] Task phrase match: "${phrase}"`);
      return "task";
    }
  }

  // 3. Default to chat for general conversation
  console.log(
    `[Intent] Defaulting to chat for: "${normalized.substring(0, 50)}..."`,
  );
  return "chat";
}

// ===== END INTENT CLASSIFIER =====

// State management
const sessionState = new Map(); // sessionId -> { history: [], awaitingConfirmation: bool, canSaveLastAnswer: bool, pendingIntent: string, lastAnswerContent: string, currentProjectSlug: string | null, pendingProjectDeletionSlug: string | null, lastGeneratedPlan: any | null, executedPlanSteps: number[] }

// Persist the last user-chosen model between runs
function loadLastModel() {
  try {
    const v = fs.readFileSync(LAST_MODEL_PATH, "utf-8").trim();
    return v || null;
  } catch {
    return null;
  }
}

function saveLastModel(name) {
  try {
    fs.writeFileSync(LAST_MODEL_PATH, String(name), "utf-8");
  } catch (e) {
    console.warn(
      "[server] failed to persist last model:",
      e?.message || String(e),
    );
  }
}

const app = express();
app.use(cors());
app.use(express.json());

/* Health + model endpoints */
app.get("/health", async (_req, res) => {
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/version`, { method: "GET" });
    res.json({ server: true, ollama: r.ok });
  } catch {
    res.json({ server: true, ollama: false });
  }
});

app.get("/models", async (_req, res) => {
  const lastModel = loadLastModel();
  try {
    const upstream = await fetch(`${OLLAMA_BASE}/api/tags`, { method: "GET" });
    if (!upstream.ok) {
      return res.json({
        models: [],
        online: false,
        lastModel,
        error: `Upstream error: ${upstream.status} ${upstream.statusText}`,
      });
    }
    const data = await upstream.json().catch(() => ({}));
    const models = Array.isArray(data.models)
      ? data.models.map((m) => m.name).filter(Boolean)
      : [];
    res.json({ models, online: true, lastModel });
  } catch (err) {
    res.json({
      models: [],
      online: false,
      lastModel,
      error: err?.message || String(err),
    });
  }
});

app.post("/models/selected", (req, res) => {
  const model = String(req.body?.model || "").trim();
  if (!model) {
    return res.status(400).json({ ok: false, error: "Model is required" });
  }
  saveLastModel(model);
  return res.json({ ok: true, model });
});

// ===== Plan Status Endpoint =====
app.get("/plan/active", (req, res) => {
  const sessionId = req.query?.sessionId || "default";
  const state = sessionState.get(sessionId);

  if (!state || !state.lastGeneratedPlan) {
    return res.json({ hasPlan: false });
  }

  // Determine plan status based on state
  let status = "proposed";
  if (state.planLocked) {
    status = "locked";
  } else if (state.executedPlanSteps && state.executedPlanSteps.length > 0) {
    if (state.executedPlanSteps.length >= state.lastGeneratedPlan.steps.length) {
      status = "completed";
    } else {
      status = "accepted";
    }
  }

  res.json({
    hasPlan: true,
    plan: state.lastGeneratedPlan,
    status: status,
    locked: state.planLocked || false,
    executedSteps: state.executedPlanSteps || [],
    skippedSteps: state.skippedPlanSteps || [],
  });
});

// ===== END Plan Status Endpoint =====

// Calls the planner and returns the parsed plan, or null on failure
async function invokePlanner(userMsg, chosenModel, state) {
  const plannerMessages = [
    { role: "system", content: PLANNER_SYSTEM_PROMPT },
    { role: "user", content: userMsg },
  ];

  const plannerResponseStream = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: chosenModel,
      messages: plannerMessages,
      stream: true,
    }),
  });

  if (!plannerResponseStream.ok) {
    throw new Error(`Ollama error: ${plannerResponseStream.status}`);
  }

  const reader = plannerResponseStream.body.getReader();
  const decoder = new TextDecoder();
  let fullPlanContent = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.message?.content) {
            fullPlanContent += data.message.content;
          }
        } catch (e) {}
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Parse the plan JSON
  let parsedPlan = null;
  try {
    const jsonMatch = fullPlanContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      let jsonStr = jsonMatch[0];
      // Simple fix for common truncation issues
      if (jsonStr.includes('"steps":') && !jsonStr.includes("]"))
        jsonStr += "]}";
      else if (jsonStr.startsWith("{") && !jsonStr.endsWith("}"))
        jsonStr += "}";

      parsedPlan = JSON.parse(jsonStr);
      if (
        parsedPlan &&
        Array.isArray(parsedPlan.steps) &&
        parsedPlan.steps.length > 0
      ) {
        const allowedTypes = [
          "read_file",
          "write_file",
          "edit_file",
          "organize_files",
          "analyze_content",
          "research",
          "os_action",
          "unknown",
        ];
        parsedPlan.steps = parsedPlan.steps.map((step) => ({
          ...step,
          type: allowedTypes.includes(step.type) ? step.type : "unknown",
        }));
      } else {
        parsedPlan = null;
      }
    }
  } catch (e) {
    console.warn("[server] Failed to parse planner JSON:", e.message);
  }

  return { fullPlanContent, parsedPlan };
}

// ===== END HELPER =====

// ===== PLAN QUALITY GATE =====
// Validates and normalizes plans before storage/presentation

/**
 * Validates a plan for quality and safety
 * @param {object} plan - The parsed plan object
 * @param {string} userMessage - The original user message
 * @returns {{ valid: boolean, reasons: string[] }}
 */
function validatePlan(plan, userMessage) {
  const reasons = [];

  // Check 1: Plan must have a goal
  if (!plan.goal || typeof plan.goal !== "string") {
    reasons.push("Plan is missing a goal");
  } else {
    const goal = plan.goal.trim();
    const userMsgLower = userMessage.trim().toLowerCase();

    // Check 1a: Goal must not be empty
    if (goal.length === 0) {
      reasons.push("Goal is empty");
    }

    // Check 1b: Goal must be more specific than user message
    // (not just a restatement of the request)
    if (goal.length < userMsgLower.length * 0.5 && goal.length < 20) {
      reasons.push("Goal is too vague (not more specific than request)");
    }

    // Check 1c: Goal must not contain placeholder/meta language
    const metaPatterns = [
      /\[.*\]/, // square brackets as placeholders
      /\{\{.*\}\}/, // double curly braces
      /<.*>/, // angle brackets
      /TODO|FIXME|XXX|placeholder/i,
      /tbd|to be determined|unspecified/i,
    ];
    if (metaPatterns.some((p) => p.test(goal))) {
      reasons.push("Goal contains placeholder or meta language");
    }

    // Check 1d: Goal must not be identical to user message
    if (goal.toLowerCase() === userMsgLower) {
      reasons.push("Goal is identical to user message (not elaborated)");
    }
  }

  // Check 2: Steps must be a non-empty array
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    reasons.push("Plan has no steps");
  }

  // Check 3: Single research step should be flagged
  const researchOnly =
    plan.steps?.length === 1 && plan.steps[0]?.type === "research";
  const askedForResearch =
    /research|investigate|look up|find out|search for/i.test(userMessage);
  if (researchOnly && !askedForResearch) {
    reasons.push("Plan consists only of a research step (not requested)");
  }

  // Check 4: Step descriptions must be concrete
  if (Array.isArray(plan.steps)) {
    const metaVerbs = [
      "determine",
      "figure out",
      "decide",
      "consider",
      "evaluate",
      "assess",
    ];
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      if (!step.description || step.description.trim().length < 10) {
        reasons.push(`Step ${i + 1} description is too short`);
      }

      // Check if description is just meta verbs
      const descLower = step.description?.toLowerCase() || "";
      const isMetaOnly =
        metaVerbs.every((v) => !descLower.includes(v)) === false &&
        descLower.split(" ").length <= 4;
      if (isMetaOnly && descLower.length < 30) {
        reasons.push(`Step ${i + 1} description is too meta/vague`);
      }
    }
  }

  const valid = reasons.length === 0;
  if (!valid) {
    console.log(`[PlanQuality] Validation failed: ${reasons.join("; ")}`);
  }

  return { valid, reasons };
}

/**
 * Normalizes a plan to improve quality
 * @param {object} plan - The parsed plan object
 * @param {string} userMessage - The original user message
 * @returns {{ plan: object | null, normalized: boolean }}
 */
function normalizePlan(plan, userMessage) {
  let normalized = false;
  const normalizedPlan = JSON.parse(JSON.stringify(plan)); // Deep copy

  // Normalization 1: Rewrite goal to be more concrete
  if (normalizedPlan.goal && normalizedPlan.goal.length < 20) {
    // If goal is too short, prepend context from user message
    const userMsgWords = userMessage.split(" ").slice(0, 5).join(" ");
    normalizedPlan.goal = `${userMsgWords}: ${normalizedPlan.goal}`;
    normalized = true;
  }

  // Normalization 2: Handle single research step
  const askedForResearch =
    /research|investigate|look up|find out|search for/i.test(userMessage);
  if (
    !askedForResearch &&
    normalizedPlan.steps?.length === 1 &&
    normalizedPlan.steps[0]?.type === "research"
  ) {
    // Replace research step with clarification step
    normalizedPlan.steps[0] = {
      id: 1,
      type: "unknown",
      description:
        "Clarify requirements: The request needs more specifics before creating an actionable plan. What exactly should be done with the target?",
      params: { clarification_needed: true },
    };
    normalized = true;
  }

  // Normalization 3: Remove duplicate steps
  if (Array.isArray(normalizedPlan.steps)) {
    const seenDescriptions = new Set();
    const uniqueSteps = [];
    for (const step of normalizedPlan.steps) {
      const descKey = step.description?.toLowerCase().trim() || "";
      if (descKey && !seenDescriptions.has(descKey)) {
        seenDescriptions.add(descKey);
        uniqueSteps.push(step);
      } else {
        normalized = true; // Mark as normalized if we removed a duplicate
      }
    }
    normalizedPlan.steps = uniqueSteps;
  }

  // Normalization 4: Ensure sequential IDs
  if (Array.isArray(normalizedPlan.steps)) {
    normalizedPlan.steps.forEach((step, idx) => {
      if (step.id !== idx + 1) {
        step.id = idx + 1;
        normalized = true;
      }
    });
  }

  // Final validation after normalization
  const finalValidation = validatePlan(normalizedPlan, userMessage);
  if (!finalValidation.valid) {
    console.log(
      `[PlanQuality] Normalization still invalid: ${finalValidation.reasons.join("; ")}`,
    );
    return { plan: null, normalized: true }; // Return null to indicate rejection
  }

  return { plan: normalizedPlan, normalized };
}

// ===== END PLAN QUALITY GATE =====

/* Chat (streaming) */
app.post("/chat", async (req, res) => {
  let runId = null;
  try {
    let userMsg = String(req.body?.message ?? "");
    const requestedModel = req.body?.model ? String(req.body.model) : "";
    const sessionId = req.body?.sessionId || "default";
    const lastModel = loadLastModel();

    // Start run logging
    runId = startRun(userMsg, { sessionId, requestedModel, lastModel });
    logStep(
      "session_init",
      `Session: ${sessionId}, Model: ${lastModel || requestedModel || "default"}`,
    );

    const chosenModel = chooseModel({
      requested: requestedModel,
      last: lastModel,
      available: [],
    });

    if (!chosenModel) {
      logStep("model_selection", "No model available");
      return res.status(400).json({
        error: "No model available. Install a model with Ollama and try again.",
      });
    }

    logStep("model_selection", `Selected model: ${chosenModel}`);

    if (requestedModel && requestedModel !== lastModel) {
      saveLastModel(requestedModel);
    }

    // Get or create session state
    if (!sessionState.has(sessionId)) {
      sessionState.set(sessionId, {
        history: [],
        awaitingConfirmation: false,
        canSaveLastAnswer: false,
        pendingIntent: "",
        lastAnswerContent: "",
        currentProjectSlug: null,
        pendingProjectDeletionSlug: null,
        lastGeneratedPlan: null,
        executedPlanSteps: [],
        pendingEdits: {}, // stepNumber -> { path, content }
        pendingOrganize: {}, // stepNumber -> [{ source, dest }]
        executionMode: getGlobalExecutionMode(), // "manual" | "disabled" from config
        pendingStepPermission: null, // { stepNumber, capability }
        skippedPlanSteps: [], // [stepNumber]
        stepExecutionHistory: [], // [{ stepNumber, type, metadata }]
        planChangeHistory: [], // [{ timestamp, changeType, details }]
        planLocked: false, // boolean
      });
    }
    const state = sessionState.get(sessionId);

    // ===== INTENT CLASSIFICATION =====
    const intent = classifyIntent(userMsg);
    logIntentClassification(userMsg, intent);
    console.log(
      `[Intent] message="${userMsg.substring(0, 50)}..." intent="${intent}"`,
    );

    // ===== INTENT-BASED ROUTING =====

    // INTENT: COMMAND - Route to command handler (save, list, plan, etc.)
    if (intent === "command") {
      logStep("command_handling", "Routing to command handler");
      const cmdResult = await handleCommand(userMsg, {
        ...state,
        WORKSPACE_ROOT,
        NOTES_DIR,
        DOCS_DIR,
        PROJECTS_DIR,
        MEMORY_DIR,
      });

      // Special Case: Proceed/Execute Plan -> Run Execution Loop (which auto-handles safe vs unsafe)
      const normalizedMsg = userMsg.trim().toLowerCase();
      if (
        (normalizedMsg === "proceed with plan" || normalizedMsg === "execute plan") &&
        state.lastGeneratedPlan
      ) {
          // Pass handleCommand and globals via enriched logic inside loop helper if needed?
          // Actually, our helper expects (state, res, sessionId, handleCommandFn)
          // And inside helper it tries to access globals? NO, I assumed globals in helper comment, 
          // but I implemented it to access global.* which might not be set.
          // Better: Pass enriched state to helper.
          
          const enrichedState = {
            ...state,
            WORKSPACE_ROOT,
            NOTES_DIR,
            DOCS_DIR,
            PROJECTS_DIR,
            MEMORY_DIR
          };
          
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          
          await executePlanLoop(enrichedState, res, sessionId, handleCommand, sessionState);
          res.end();
          return;
      }

      if (cmdResult.handled) {
        if (cmdResult.newState) {
          sessionState.set(sessionId, cmdResult.newState);
        }
        logStep(
          "command_completed",
          `Command handled: ${cmdResult.command || "unknown"}`,
        );
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.write(cmdResult.response);
        res.end();
        endRun("completed", { intent, command: cmdResult.command });
        return;
      }
      // If command handler didn't handle it (shouldn't happen for command intent),
      // fall through to chat mode
    }

    // Always reset save capability if any other message is sent (and not handled as a command)
    state.canSaveLastAnswer = false;

    // INTENT: TASK - Automatic planning
    if (intent === "task") {
      console.log(`[server] Auto-planning triggered for session ${sessionId}.`);
      logStep("planning_init", "Starting automatic planning");

      try {
        const { fullPlanContent, parsedPlan } = await invokePlanner(
          userMsg,
          chosenModel,
          state,
        );

        logPlanning("generation", {
          hasPlan: !!parsedPlan,
          stepCount: parsedPlan?.steps?.length,
        });

        // ===== PLAN QUALITY GATE =====
        let planToStore = parsedPlan;
        let planNormalized = false;
        let planRejected = false;

        if (parsedPlan) {
          // Validate the plan
          const validation = validatePlan(parsedPlan, userMsg);

          if (!validation.valid) {
            console.log(
              `[PlanQuality] Plan validation failed: ${validation.reasons.join("; ")}`,
            );
            logPlanning("validation_failed", { reasons: validation.reasons });

            // Try to normalize
            const normalization = normalizePlan(parsedPlan, userMsg);
            if (normalization.plan) {
              planToStore = normalization.plan;
              planNormalized = normalization.normalized;
              console.log("[PlanQuality] Plan normalized successfully");
              logPlanning("normalization", { normalized: true });
            } else {
              // Normalization also failed - reject the plan
              planRejected = true;
              console.log(
                "[PlanQuality] Plan rejected after normalization failure",
              );
              logPlanning("rejected", { reason: "Normalization failed" });
            }
          } else {
            logPlanning("validation_passed", {
              stepCount: parsedPlan.steps.length,
            });
          }
        }

        // Build human-readable response
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");

        if (planToStore && !planRejected) {
          // Store the validated/normalized plan in state
          state.lastGeneratedPlan = planToStore;
          const historyEntry = {
            timestamp: new Date().toISOString(),
            changeType: "created",
            details: planNormalized
              ? "Auto-generated plan (normalized)"
              : "Auto-generated plan",
          };
          state.planChangeHistory = [historyEntry];
          logAudit("PLAN_GENERATED", {
            goal: planToStore.goal,
            steps: planToStore.steps.length,
            normalized: planNormalized,
          });

          // Summary + steps list
          const stepCount = planToStore.steps.length;

          // Add normalization notice if applicable
          if (planNormalized) {
            res.write(
              "I adjusted the plan slightly to make it more concrete and safer to execute.\n\n",
            );
          }

          const summary = `I've created a plan with ${stepCount} step${stepCount !== 1 ? "s" : ""} to accomplish your goal. You can review it in the plan panel above.`;
          res.write(summary);

          // Manual execution required - user must click Accept
          res.write("\n\n*Review the plan above and click **Accept** to execute.*");
        } else {
          // Plan was rejected - fall back to answer mode
          console.log("[PlanQuality] Falling back to answer mode");
          res.write(
            "I need a bit more detail before I can create a reliable plan. Here's a suggestion instead:\n\n",
          );

          // Use the LLM to give a textual suggestion (fallback to chat mode)
          // Update history first
          state.history.push({ role: "user", content: userMsg });
          if (state.history.length > 5) {
            state.history.splice(0, state.history.length - 5);
          }

          const messages = [
            { role: "system", content: ANSWER_MODE_SYSTEM_PROMPT },
            ...state.history,
          ];

          const fallbackResponse = await fetch(`${OLLAMA_BASE}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: chosenModel,
              messages: messages,
              stream: true,
            }),
          });

          if (fallbackResponse.ok) {
            const reader = fallbackResponse.body.getReader();
            const decoder = new TextDecoder();
            try {
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split("\n");
                for (const line of lines) {
                  if (!line.trim()) continue;
                  try {
                    const data = JSON.parse(line);
                    if (data.message?.content) {
                      res.write(data.message.content);
                    }
                  } catch (e) {}
                }
              }
            } finally {
              reader.releaseLock();
            }
          } else {
            res.write(
              "Please try rephrasing your request with more specific details.",
            );
          }
        }

        // Update history (only for stored plans)
        if (planToStore && !planRejected) {
          state.history.push({ role: "user", content: userMsg });
          state.history.push({
            role: "assistant",
            content: fullPlanContent,
          });
          if (state.history.length > 5) {
            state.history.splice(0, state.history.length - 5);
          }
        }

        res.end();
        return;
      } catch (err) {
        console.error("[server] Auto-planning failed:", err);
        // Return fallback response on error
        if (!res.headersSent) {
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.setHeader("Cache-Control", "no-cache");
        }
        res.write(
          "\n\nI wasn't able to complete the plan execution due to an error: " + (err.message || "Unknown error")
        );
        res.end();
        return;
      }
    }

    // INTENT: CHAT - Use intent clarifier -> answer mode flow
    // This also handles the case when command handler didn't match

    // --- EXISTING FLOWS (Clarify -> Confirm) ---
    // INTENT: CHAT - Use answer mode directly (User requested no confirmation flow)
    let activeSystemPrompt = ANSWER_MODE_SYSTEM_PROMPT;
    
    // Clear any stuck confirmation state
    if (state.awaitingConfirmation) {
        state.awaitingConfirmation = false;
        state.pendingIntent = "";
    }

    // --- LLM INTERACTION ---

    // Update history
    state.history.push({ role: "user", content: userMsg });
    if (state.history.length > 5) {
      state.history.splice(0, state.history.length - 5);
    }

    const messages = [
      { role: "system", content: activeSystemPrompt },
      ...state.history,
    ];

    const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: chosenModel,
        messages: messages,
        stream: true,
      }),
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantMsg = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              const content = data.message.content;
              assistantMsg += content;
              res.write(content);
            }
          } catch (e) {}
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Update history with raw assistant message
    state.history.push({ role: "assistant", content: assistantMsg });

    // Log LLM response
    const tokenEstimate = Math.ceil(assistantMsg.length / 4);
    logLLMResponse(chosenModel, tokenEstimate, assistantMsg);

    // --- POST-LLM LOGIC ---
    
    // Always treat as Answer Mode completion (since we disabled Clarifier)
    // Prepare for sandboxed save
    const saveInstruction =
      "\n\nIf you’d like, say 'save' to keep this as a note, or 'save doc' to store it as a document.";
    
    state.lastAnswerContent = assistantMsg;
    state.canSaveLastAnswer = true;

    // Send instructional line to client
    res.write(saveInstruction);

    // Append to history for consistency
    state.history[state.history.length - 1].content += saveInstruction;

    res.end();
    logStep("response_sent", "Response sent to client successfully");
    endRun("completed", { intent });
  } catch (err) {
    console.error("[chat] Error:", err);
    logError("chat_error", err.message, { stack: err.stack });
    endRun("failed", { error: err.message });
    res.status(500).end("Server error: " + (err?.message || String(err)));
  }
});

/* Run Logs Endpoints */
app.get("/logs/runs", (req, res) => {
  const limit = parseInt(req.query?.limit) || 10;
  const runs = require("./utils/runLogger").getRecentRuns(limit);
  res.json({ runs });
});

app.get("/logs/runs/:runId", (req, res) => {
  const { runId } = req.params;
  const log = require("./utils/runLogger").getRunLog(runId);
  if (log.length === 0) {
    return res.status(404).json({ error: "Run not found" });
  }
  res.json({ runId, log });
});

/* Start server */
const server = http.createServer(app);
server.listen(PORT, HOST, () => {
  console.log(
    `[server] Intent Clarifier (Workspace Enabled) listening on http://${HOST}:${PORT}`,
  );
  console.log(`[server] Workspace root: ${WORKSPACE_ROOT}`);
  console.log(
    `[server] Run logs: ${path.join(WORKSPACE_ROOT, "logs", "runs")}`,
  );
});
