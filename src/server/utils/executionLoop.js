
/**
 * Executes steps in the current plan sequentially.
 * This function streams updates to the response and updates the session state.
 * It handles both Safe Auto-Execution checks (via handleCommand logic) and Unsafe checks (pausing).
 */
async function executePlanLoop(state, res, sessionId, handleCommandFn, sessionState) {
  // Enrich state with workspace paths
  // Note: These global variables (WORKSPACE_ROOT, etc.) must be available in the module scope
  // If this function is inside server.js, they should be fine.
  
  const plan = state.lastGeneratedPlan;
  if (!plan || !plan.steps) {
      res.write("No valid plan steps to execute.");
      return;
  }

  res.write("\n**Executing Plan Steps...**\n");
  
  let allSuccess = true;
  
  // Identify where to start?
  // If some steps are already executed, skip them?
  // handleCommand("execute step N") checks if already executed. 
  // So we can just iterate ALL steps, and the handler will say "Already executed" or execute.
  // HOWEVER, we don't want to spam "Already executed" for the first 10 steps.
  // We can filter locally first.
  
  const executedIds = state.executedPlanSteps || [];
  
  for (const step of plan.steps) {
      if (executedIds.includes(step.id)) {
          continue; 
      }
      
      const executeCmd = `execute step ${step.id}`;
            
      // Execute with enriched state
      // We assume WORKSPACE_ROOT etc are globals in server.js scope.
      // If not, we need to pass them or rely on them being captured if this function is inside server.js
      // To be safe, let's create the enriched state based on current state + known globals if possible,
      // But passing globals is cleaner.
      // Since I am appending this to server.js, I will access the globals directly.
      
      const executionState = {
         ...state,
         WORKSPACE_ROOT: global.WORKSPACE_ROOT || state.WORKSPACE_ROOT, // Fallback
         NOTES_DIR: global.NOTES_DIR || state.NOTES_DIR,
         DOCS_DIR: global.DOCS_DIR || state.DOCS_DIR,
         PROJECTS_DIR: global.PROJECTS_DIR || state.PROJECTS_DIR,
         MEMORY_DIR: global.MEMORY_DIR || state.MEMORY_DIR
      };
      // Actually, server.js constants like WORKSPACE_ROOT are top-level constants, not on `global`.
      // I will assume they are in scope.

      try {
          const cmdResult = await handleCommandFn(executeCmd, executionState); // injected handleCommand
          
          if (cmdResult.handled) {
              // Update state immediately
              if (cmdResult.newState) {
                  Object.assign(state, cmdResult.newState);
                  sessionState.set(sessionId, state);
              }
              
              if (cmdResult.response.includes("requires confirmation")) {
                  res.write(`\n- Step ${step.id}: Paused for confirmation (Unsafe Action).`);
                  res.write("\n  Type 'allow step " + step.id + "' to proceed.");
                  allSuccess = false;
                  break; // PAUSE EXECUTION
              }
              
              // Helper: Auto-apply pending edits or organization
              if (state.pendingEdits && state.pendingEdits[step.id]) {
                 res.write(`\n- Step ${step.id}: Auto-applying edit...`);
                 const applyCmd = `apply edit ${step.id}`;
                 const applyRes = await handleCommandFn(applyCmd, state);
                 if (applyRes.handled) {
                      if (applyRes.newState) Object.assign(state, applyRes.newState);
                      sessionState.set(sessionId, state);
                      res.write(" Done.");
                 }
              }
              
              if (state.pendingOrganize && state.pendingOrganize[step.id]) {
                 res.write(`\n- Step ${step.id}: Auto-applying organization...`);
                 const applyCmd = `apply organize ${step.id}`;
                 const applyRes = await handleCommandFn(applyCmd, state);
                 if (applyRes.handled) {
                      if (applyRes.newState) Object.assign(state, applyRes.newState);
                      sessionState.set(sessionId, state);
                      res.write(" Done.");
                 }
              }

              // Stream the actual response from the handler
              res.write(`\n- Step ${step.id}: ${cmdResult.response}`);
              
              if (cmdResult.response.toLowerCase().includes("error") || cmdResult.response.toLowerCase().includes("failed")) {
                  allSuccess = false;
                  break;
              }
              
          } else {
             res.write(`\n- Step ${step.id}: Failed to execute (unhandled).`);
             allSuccess = false;
             break;
          }
      } catch (err) {
          console.error(err);
          res.write(`\n- Step ${step.id}: Error: ${err.message}`);
          allSuccess = false;
          break;
      }
  }
  
  if (allSuccess) {
      res.write("\n\n**All available steps executed.**");
  }
}
module.exports = { executePlanLoop };
