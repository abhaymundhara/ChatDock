const fs = require("node:fs");
const path = require("node:path");

let feedbackDir = null;
let outcomesLogPath = null;
let metricsLogPath = null;
let tuningDir = null;
let tuningLogPath = null;

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function appendJsonLine(filePath, payload) {
  if (!filePath) return;
  const entry = `${JSON.stringify(payload)}\n`;
  fs.appendFileSync(filePath, entry, "utf-8");
}

function truncate(value, max = 2000) {
  if (!value || typeof value !== "string") return value;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function initPlanFeedbackLogger(workspaceRoot, memoryDir) {
  if (!workspaceRoot) return;
  feedbackDir = path.join(workspaceRoot, "logs", "plan_feedback");
  ensureDir(feedbackDir);
  outcomesLogPath = path.join(feedbackDir, "plan_outcomes.jsonl");
  metricsLogPath = path.join(feedbackDir, "plan_metrics.jsonl");

  const memoryRoot =
    memoryDir || (workspaceRoot ? path.join(workspaceRoot, "memory") : null);
  if (memoryRoot) {
    tuningDir = path.join(memoryRoot, "tuning");
    ensureDir(tuningDir);
    tuningLogPath = path.join(tuningDir, "plan_tuning.jsonl");
  }
}

function buildTuningExample(payload) {
  const steps = Array.isArray(payload.planSteps)
    ? payload.planSteps.map((step) => ({
        id: step.id,
        type: step.type,
        description: truncate(step.description, 2000)
      }))
    : null;

  return {
    timestamp: payload.timestamp || new Date().toISOString(),
    planId: payload.planId || null,
    request: truncate(payload.request || payload.userMessage || null, 2000),
    plan: {
      goal: truncate(payload.goal || payload.planGoal || null, 1000),
      steps
    },
    outcome: payload.status || null,
    source: payload.source || null
  };
}

function logPlanOutcome(payload) {
  appendJsonLine(outcomesLogPath, payload);
  if (tuningLogPath) {
    appendJsonLine(tuningLogPath, buildTuningExample(payload));
  }
}

function logStepMetric(payload) {
  appendJsonLine(metricsLogPath, payload);
}

function logActionMetric(payload) {
  appendJsonLine(metricsLogPath, payload);
}

module.exports = {
  initPlanFeedbackLogger,
  logPlanOutcome,
  logStepMetric,
  logActionMetric
};
