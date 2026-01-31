
/**
 * Executes steps in the current plan sequentially.
 * This function streams updates to the response and updates the session state.
 * It handles both Safe Auto-Execution checks (via handleCommand logic) and Unsafe checks (pausing).
 */
function syncSessionState(state, sessionState, sessionId, updates) {
  Object.assign(state, updates);
  sessionState.set(sessionId, state);
}

async function executePlanLoop(state, res, sessionId, handleCommandFn, sessionState, metrics) {
  const updateStepStatus = (stepId, update) => {
      if (!metrics) return;
      const current = state.stepStatus || {};
      if (!metrics.stepStatus) {
          metrics.stepStatus = { ...current };
      } else if (metrics.stepStatus !== current) {
          metrics.stepStatus = { ...current, ...metrics.stepStatus };
      }
      const prev = metrics.stepStatus[stepId] || {};
      metrics.stepStatus[stepId] = { ...prev, ...update };
      syncSessionState(state, sessionState, sessionId, { stepStatus: metrics.stepStatus });
  };
  // Enrich state with workspace paths
  // Note: These global variables (WORKSPACE_ROOT, etc.) must be available in the module scope
  // If this function is inside server.js, they should be fine.
  
  const plan = state.lastGeneratedPlan;
  if (!plan || !plan.steps) {
      res.write("No valid plan steps to execute.");
      return;
  }

  res.write("\n**Executing Plan Steps...**\n");
  syncSessionState(state, sessionState, sessionId, { planStatus: "executing" });
  
  let allSuccess = true;
  
  const executedIds = state.executedPlanSteps || [];
  
  for (const step of plan.steps) {
      const initialStatus = executedIds.includes(step.id) ? "done" : "queued";
      updateStepStatus(step.id, {
          status: initialStatus,
          type: step.type,
          description: step.description,
          startedAt: null,
          finishedAt: null,
          latencyMs: null
      });
      if (executedIds.includes(step.id)) {
          continue; 
      }
      
      // Update UI state: which step is running?
      syncSessionState(state, sessionState, sessionId, { executingStepId: step.id });

      const stepStart = Date.now();
      updateStepStatus(step.id, {
          status: "running",
          type: step.type,
          description: step.description,
          startedAt: stepStart,
          finishedAt: null,
          latencyMs: null
      });
      if (metrics && metrics.logStepMetric) {
          metrics.logStepMetric({
              sessionId,
              planId: metrics.planId,
              stepId: step.id,
              type: step.type,
              status: "running",
              timestamp: new Date().toISOString()
          });
      }

      const executeCmd = `execute step ${step.id}`;
      
      const executionState = {
         ...state,
         WORKSPACE_ROOT: global.WORKSPACE_ROOT || state.WORKSPACE_ROOT,
         NOTES_DIR: global.NOTES_DIR || state.NOTES_DIR,
         DOCS_DIR: global.DOCS_DIR || state.DOCS_DIR,
         PROJECTS_DIR: global.PROJECTS_DIR || state.PROJECTS_DIR,
         MEMORY_DIR: global.MEMORY_DIR || state.MEMORY_DIR
      };

      try {
          const cmdResult = await handleCommandFn(executeCmd, executionState); // injected handleCommand
          
          if (cmdResult.handled) {
              // Update state immediately
              if (cmdResult.newState) {
                  syncSessionState(state, sessionState, sessionId, cmdResult.newState);
              }
              
              if (cmdResult.response.includes("requires confirmation")) {
                  syncSessionState(state, sessionState, sessionId, { planStatus: "paused", executingStepId: null });
                  updateStepStatus(step.id, {
                      status: "paused",
                      type: step.type,
                      description: step.description,
                      startedAt: stepStart,
                      finishedAt: null,
                      latencyMs: null,
                      output: cmdResult.response
                  });
                  if (metrics && metrics.logStepMetric) {
                      metrics.logStepMetric({
                          sessionId,
                          planId: metrics.planId,
                          stepId: step.id,
                          type: step.type,
                          status: "paused",
                          timestamp: new Date().toISOString()
                      });
                  }

                  res.write(`\n- Step ${step.id}: Paused for confirmation (Unsafe Action).`);
                  res.write("\n  Click **Allow** in the plan panel to proceed.");
                  allSuccess = false;
                  break; // PAUSE EXECUTION
              }
              
              // Helper: Auto-apply pending edits or organization
              if (state.pendingEdits && state.pendingEdits[step.id]) {
                 res.write(`\n- Step ${step.id}: Auto-applying edit...`);
                 const applyCmd = `apply edit ${step.id}`;
                 const applyRes = await handleCommandFn(applyCmd, state);
                 if (applyRes.handled) {
                      if (applyRes.newState) syncSessionState(state, sessionState, sessionId, applyRes.newState);
                      res.write(" Done.");
                 }
              }
              
              if (state.pendingOrganize && state.pendingOrganize[step.id]) {
                 res.write(`\n- Step ${step.id}: Auto-applying organization...`);
                 const applyCmd = `apply organize ${step.id}`;
                 const applyRes = await handleCommandFn(applyCmd, state);
                 if (applyRes.handled) {
                      if (applyRes.newState) syncSessionState(state, sessionState, sessionId, applyRes.newState);
                      res.write(" Done.");
                 }
              }

              // Stream the actual response from the handler
              res.write(`\n- Step ${step.id}: ${cmdResult.response}`);
              updateStepStatus(step.id, { output: cmdResult.response });
              
              if (cmdResult.response.includes("**Failed Step**") || cmdResult.response.startsWith("Error")) {
                  syncSessionState(state, sessionState, sessionId, { planStatus: "error", executingStepId: null });
                  const finishedAt = Date.now();
                  const latencyMs = finishedAt - stepStart;
                  updateStepStatus(step.id, {
                      status: "failed",
                      type: step.type,
                      description: step.description,
                      startedAt: stepStart,
                      finishedAt,
                      latencyMs
                  });
                  if (metrics && metrics.logStepMetric) {
                      metrics.logStepMetric({
                          sessionId,
                          planId: metrics.planId,
                          stepId: step.id,
                          type: step.type,
                          status: "failed",
                          latencyMs,
                          timestamp: new Date().toISOString()
                      });
                  }
                  allSuccess = false;
                  break;
              }
              
          } else {
             syncSessionState(state, sessionState, sessionId, { planStatus: "error", executingStepId: null });
             res.write(`\n- Step ${step.id}: Failed to execute (unhandled).`);
             const finishedAt = Date.now();
             const latencyMs = finishedAt - stepStart;
             updateStepStatus(step.id, {
                 status: "failed",
                 type: step.type,
                 description: step.description,
                 startedAt: stepStart,
                 finishedAt,
                 latencyMs
             });
             if (metrics && metrics.logStepMetric) {
                 metrics.logStepMetric({
                     sessionId,
                     planId: metrics.planId,
                     stepId: step.id,
                     type: step.type,
                     status: "failed",
                     latencyMs,
                     timestamp: new Date().toISOString()
                 });
             }
             allSuccess = false;
             break;
          }
      } catch (err) {
          syncSessionState(state, sessionState, sessionId, { planStatus: "error", executingStepId: null });
          console.error(err);
          res.write(`\n- Step ${step.id}: Error: ${err.message}`);
          const finishedAt = Date.now();
          const latencyMs = finishedAt - stepStart;
          updateStepStatus(step.id, {
              status: "failed",
              type: step.type,
              description: step.description,
              startedAt: stepStart,
              finishedAt,
              latencyMs
          });
          if (metrics && metrics.logStepMetric) {
              metrics.logStepMetric({
                  sessionId,
                  planId: metrics.planId,
                  stepId: step.id,
                  type: step.type,
                  status: "failed",
                  latencyMs,
                  timestamp: new Date().toISOString()
              });
          }
          allSuccess = false;
          break;
      }

      // Step done, clear executing ID
      syncSessionState(state, sessionState, sessionId, { executingStepId: null });
      const finishedAt = Date.now();
      const latencyMs = finishedAt - stepStart;
      updateStepStatus(step.id, {
          status: "done",
          type: step.type,
          description: step.description,
          startedAt: stepStart,
          finishedAt,
          latencyMs
      });
      if (metrics && metrics.logStepMetric) {
          metrics.logStepMetric({
              sessionId,
              planId: metrics.planId,
              stepId: step.id,
              type: step.type,
              status: "done",
              latencyMs,
              timestamp: new Date().toISOString()
          });
      }
  }
  
  if (allSuccess) {
      syncSessionState(state, sessionState, sessionId, { planStatus: "completed", executingStepId: null });
      res.write("\n\n**All available steps executed.**");
      if (metrics && metrics.logPlanOutcome && !state.planOutcomeLogged) {
          metrics.logPlanOutcome({
              sessionId,
              planId: metrics.planId,
              status: "success",
              goal: metrics.planGoal,
              source: metrics.planSource,
              request: metrics.planRequest || null,
              planSteps: metrics.planSteps || [],
              stepsTotal: plan.steps.length,
              timestamp: new Date().toISOString()
          });
          syncSessionState(state, sessionState, sessionId, { planOutcomeLogged: true });
      }
  } else if (metrics && metrics.logPlanOutcome && !state.planOutcomeLogged) {
      metrics.logPlanOutcome({
          sessionId,
          planId: metrics.planId,
          status: "failed",
          goal: metrics.planGoal,
          source: metrics.planSource,
          request: metrics.planRequest || null,
          planSteps: metrics.planSteps || [],
          stepsTotal: plan.steps.length,
          timestamp: new Date().toISOString()
      });
      syncSessionState(state, sessionState, sessionId, { planOutcomeLogged: true });
  }
}
module.exports = { executePlanLoop };
