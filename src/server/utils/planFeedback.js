const fs = require("node:fs");
const path = require("node:path");

let feedbackDir = null;
let outcomesLogPath = null;
let metricsLogPath = null;
let tuningDir = null;
let tuningLogPath = null;
let statsPath = null;

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
  statsPath = path.join(feedbackDir, "plan_stats.json");

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

function loadStats() {
  if (!statsPath) return null;
  if (!fs.existsSync(statsPath)) {
    return {
      totals: { total: 0, success: 0, failed: 0 },
      successRate: 0,
      avgDurationMs: null,
      corrections: { total: 0, lastAt: null },
      skills: {}
    };
  }

  try {
    return JSON.parse(fs.readFileSync(statsPath, "utf-8"));
  } catch {
    return {
      totals: { total: 0, success: 0, failed: 0 },
      successRate: 0,
      avgDurationMs: null,
      corrections: { total: 0, lastAt: null },
      skills: {}
    };
  }
}

function saveStats(stats) {
  if (!statsPath) return;
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2), "utf-8");
}

function updateAverage(currentAvg, newValue, totalCount) {
  if (!Number.isFinite(newValue)) return currentAvg;
  if (!Number.isFinite(currentAvg)) return newValue;
  if (totalCount <= 1) return newValue;
  return currentAvg + (newValue - currentAvg) / totalCount;
}

function updatePlanStats(payload) {
  const stats = loadStats();
  if (!stats) return;

  stats.totals.total += 1;
  if (payload.status === "success") stats.totals.success += 1;
  if (payload.status === "failed") stats.totals.failed += 1;

  stats.successRate =
    stats.totals.total > 0 ? stats.totals.success / stats.totals.total : 0;

  if (Number.isFinite(payload.durationMs)) {
    stats.avgDurationMs = updateAverage(
      stats.avgDurationMs,
      payload.durationMs,
      stats.totals.total
    );
  }

  const skillId = payload.skillId || null;
  if (skillId) {
    if (!stats.skills[skillId]) {
      stats.skills[skillId] = {
        total: 0,
        success: 0,
        failed: 0,
        successRate: 0,
        avgDurationMs: null
      };
    }
    const skillStats = stats.skills[skillId];
    skillStats.total += 1;
    if (payload.status === "success") skillStats.success += 1;
    if (payload.status === "failed") skillStats.failed += 1;
    skillStats.successRate =
      skillStats.total > 0 ? skillStats.success / skillStats.total : 0;
    if (Number.isFinite(payload.durationMs)) {
      skillStats.avgDurationMs = updateAverage(
        skillStats.avgDurationMs,
        payload.durationMs,
        skillStats.total
      );
    }
  }

  saveStats(stats);
}

function logPlanOutcome(payload) {
  appendJsonLine(outcomesLogPath, payload);
  if (tuningLogPath) {
    appendJsonLine(tuningLogPath, buildTuningExample(payload));
  }
  updatePlanStats(payload);
}

function logStepMetric(payload) {
  appendJsonLine(metricsLogPath, payload);
}

function logActionMetric(payload) {
  appendJsonLine(metricsLogPath, payload);
}

function logUserCorrection(payload) {
  appendJsonLine(metricsLogPath, payload);
  const stats = loadStats();
  if (!stats) return;
  stats.corrections.total += 1;
  stats.corrections.lastAt = payload.timestamp || new Date().toISOString();
  saveStats(stats);
}

function getPlanStats() {
  return loadStats();
}

module.exports = {
  initPlanFeedbackLogger,
  logPlanOutcome,
  logStepMetric,
  logActionMetric,
  logUserCorrection,
  getPlanStats
};
