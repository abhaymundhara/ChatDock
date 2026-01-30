const { getCapability, getAllCapabilities, isExecutable, isKnownType, isEnabled, enableCapability, disableCapability, setGlobalExecutionMode, getProfiles, applyProfile } = require("../capabilities/capabilityRegistry");
const fs = require("node:fs");
const path = require("node:path");
const { getScopeName } = require("./utils");
const { logAudit } = require("../utils/auditLogger");

function handlePlannerCommands(userMsg, state) {
  const normalizedMsg = userMsg.trim().toLowerCase();

  // 0a. Execution Mode Commands
  if (normalizedMsg === "show execution mode") {
    const mode = state.executionMode || "manual";
    return { handled: true, response: `**Execution Mode:** ${mode}\n*Manual: You explicitly run steps via 'execute step <n>'.*\n*Disabled: No steps can be executed.*` };
  }

  if (normalizedMsg === "set execution mode manual") {
    setGlobalExecutionMode("manual");
    logAudit("EXECUTION_MODE_CHANGED", { mode: "manual" });
    return {
      handled: true,
      response: "Execution mode set to **manual**. You can now execute steps individually.",
      newState: { ...state, executionMode: "manual" }
    };
  }

  if (normalizedMsg === "set execution mode disabled") {
    setGlobalExecutionMode("disabled");
    logAudit("EXECUTION_MODE_CHANGED", { mode: "disabled" });
    return {
      handled: true,
      response: "Execution mode set to **disabled**. All plan execution is now blocked.",
      newState: { ...state, executionMode: "disabled" }
    };
  }

  // Execution Profiles
  if (normalizedMsg === "list execution profiles" || normalizedMsg === "show execution profiles") {
    const { active, profiles } = getProfiles();
    let response = `**Execution Profiles:** (Current: **${active}**)\n\n`;
    for (const [name, info] of Object.entries(profiles)) {
        response += `- **${name}**: ${info.description}\n` +
                    `  *Mode:* ${info.executionMode}, *Caps:* ${info.enabledCaps.join(", ") || "None"}\n`;
    }
    return { handled: true, response };
  }

  if (normalizedMsg === "current execution profile") {
    const { active } = getProfiles();
    return { handled: true, response: `Current Execution Profile: **${active}**` };
  }

  if (normalizedMsg.startsWith("use execution profile")) {
    const name = normalizedMsg.split("profile")[1].trim();
    if (applyProfile(name)) {
        logAudit("PROFILE_SWITCHED", { profile: name });
        // Sync session state executionMode
        const { profiles } = getProfiles();
        const newMode = profiles[name].executionMode;
        
        return { 
            handled: true, 
            response: `Switched to execution profile: **${name}**`,
            newState: { ...state, executionMode: newMode }
        };
    }
    return { handled: true, response: `Unknown execution profile: '${name}'.` };
  }



  // 1a. Plan Locking
  if (normalizedMsg === "lock plan") {
      if (!state.lastGeneratedPlan) return { handled: true, response: "There is no active plan to lock." };
      
      logAudit("PLAN_LOCKED", { planId: state.lastGeneratedPlan.id || "current" });
      return { 
          handled: true, 
          response: "The current plan is now locked and cannot be modified.",
          newState: { ...state, planLocked: true }
      };
  }

  if (normalizedMsg === "unlock plan") {
      if (!state.lastGeneratedPlan) return { handled: true, response: "There is no active plan to unlock." };
      
      logAudit("PLAN_UNLOCKED", { planId: state.lastGeneratedPlan.id || "current" });
      return { 
          handled: true, 
          response: "The current plan has been unlocked.",
          newState: { ...state, planLocked: false }
      };
  }
  
  // Helper for Locked Check
  const isLocked = state.planLocked === true;
  const lockedMsg = { handled: true, response: "Action blocked: The current plan is locked. Say 'unlock plan' to make changes." };

  // 1b. Step Reordering & Skipping
  if (normalizedMsg.startsWith("move step")) {
    if (isLocked) return lockedMsg;
    // Syntax: move step <from> to <to>
    const match = normalizedMsg.match(/move step (\d+) to (\d+)/);
    if (!match) {
        return { handled: true, response: "Usage: move step <from_number> to <to_number>" };
    }

    if (!state.lastGeneratedPlan) {
        return { handled: true, response: "There is no active plan to modify." };
    }

    const fromIdx = parseInt(match[1], 10);
    const toIdx = parseInt(match[2], 10);
    const steps = state.lastGeneratedPlan.steps;

    if (fromIdx < 1 || fromIdx > steps.length || toIdx < 1 || toIdx > steps.length) {
        return { handled: true, response: `Invalid step numbers. Plan has ${steps.length} steps.` };
    }

    if (fromIdx === toIdx) {
        return { handled: true, response: "Source and destination are the same." };
    }

    // Move logic
    const stepsCopy = [...steps];
    const [movedStep] = stepsCopy.splice(fromIdx - 1, 1);
    stepsCopy.splice(toIdx - 1, 0, movedStep);

    // Renumber IDs
    stepsCopy.forEach((s, i) => { s.id = i + 1; });

    // Reset Execution State (Safety)
    const newState = {
        ...state,
        lastGeneratedPlan: { ...state.lastGeneratedPlan, steps: stepsCopy },
        executedPlanSteps: [],
        pendingStepPermission: null,
        pendingEdits: {},
        pendingOrganize: {},
        skippedPlanSteps: [] // Reset skips on reorder to avoid confusion
    };

    logAudit("PLAN_REORDERED", { from: fromIdx, to: toIdx });

    const historyEntry = {
        timestamp: new Date().toISOString(),
        changeType: "reordered",
        details: `Moved step ${fromIdx} to position ${toIdx}`
    };

    return { 
        handled: true, 
        response: `Moved step ${fromIdx} to position ${toIdx}. Plan execution state has been reset.`,
        newState: {
            ...newState,
            planChangeHistory: [...(state.planChangeHistory || []), historyEntry]
        }
    };
  }

  if (normalizedMsg.startsWith("skip step")) {
    if (isLocked) return lockedMsg;
    const parts = userMsg.trim().split(/\s+/);
    const stepNumber = parseInt(parts[2], 10);

    if (!state.lastGeneratedPlan) return { handled: true, response: "No active plan." };
    if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > state.lastGeneratedPlan.steps.length) {
        return { handled: true, response: "Invalid step number." };
    }

    const skipped = state.skippedPlanSteps || [];
    if (skipped.includes(stepNumber)) {
        return { handled: true, response: `Step ${stepNumber} is already skipped.` };
    }

    logAudit("STEP_SKIPPED", { step: stepNumber });

    const historyEntry = {
        timestamp: new Date().toISOString(),
        changeType: "step_skipped",
        details: `Skipped step ${stepNumber}`
    };

    return {
        handled: true,
        response: `Step ${stepNumber} marked as skipped. It will be ignored during execution checks.`,
        newState: { 
            ...state, 
            skippedPlanSteps: [...skipped, stepNumber],
            planChangeHistory: [...(state.planChangeHistory || []), historyEntry]
        }
    };
  }

  if (normalizedMsg.startsWith("unskip step")) {
    if (isLocked) return lockedMsg;
    const parts = userMsg.trim().split(/\s+/);
    const stepNumber = parseInt(parts[2], 10);

    if (!state.lastGeneratedPlan) return { handled: true, response: "No active plan." };
    const skipped = state.skippedPlanSteps || [];
    
    if (!skipped.includes(stepNumber)) {
        return { handled: true, response: `Step ${stepNumber} is not currently skipped.` };
    }

    logAudit("STEP_UNSKIPPED", { step: stepNumber });

    const historyEntry = {
        timestamp: new Date().toISOString(),
        changeType: "step_unskipped",
        details: `Unskipped step ${stepNumber}`
    };

    return {
        handled: true,
        response: `Step ${stepNumber} unskipped. It is now back in the plan flow.`,
        newState: { 
            ...state, 
            skippedPlanSteps: skipped.filter(s => s !== stepNumber),
            planChangeHistory: [...(state.planChangeHistory || []), historyEntry]
        }
    };
  }
  
  // Undo Step
  if (normalizedMsg.startsWith("undo step")) {
      if (isLocked) return lockedMsg;
      const parts = userMsg.trim().split(/\s+/);
      const stepNumber = parseInt(parts[2], 10);

      if (isNaN(stepNumber)) return { handled: true, response: "Usage: undo step <number>" };
      if (!state.lastGeneratedPlan) return { handled: true, response: "No active plan." };

      const history = state.stepExecutionHistory || [];
      const entryIndex = history.findIndex(h => h.stepNumber === stepNumber);
      
      if (entryIndex === -1) {
          return { handled: true, response: `Step ${stepNumber} has no execution history to undo.` };
      }

      const entry = history[entryIndex];
      const metadata = entry.metadata;

      try {
          // Perform Inverse
          if (entry.type === "write_file") {
              if (metadata.operation === "create") {
                  if (fs.existsSync(metadata.path)) fs.unlinkSync(metadata.path);
              } else if (metadata.operation === "overwrite") {
                  fs.writeFileSync(metadata.path, metadata.previousContent, "utf-8");
              }
          } else if (entry.type === "edit_file") {
              fs.writeFileSync(metadata.path, metadata.previousContent, "utf-8");
          } else if (entry.type === "organize_files") {
              // Inverse moves: move from 'to' back to 'from'
              for (const move of metadata.moves) {
                  if (fs.existsSync(move.to)) {
                       const srcDir = path.dirname(move.from);
                       if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir, { recursive: true });
                       fs.renameSync(move.to, move.from);
                  }
              }
          } else {
              // Read file or others with no side effects
          }

          logAudit("STEP_UNDONE", { step: stepNumber });
          
          // Remove from history and executed list
          const newHistory = [...history];
          newHistory.splice(entryIndex, 1);
          
          const newExecuted = (state.executedPlanSteps || []).filter(s => s !== stepNumber);

          return {
              handled: true,
              response: `Step ${stepNumber} has been rolled back successfully.`,
              newState: {
                  ...state,
                  stepExecutionHistory: newHistory,
                  executedPlanSteps: newExecuted
              }
          };

      } catch (err) {
          return { handled: true, response: `Failed to undo step ${stepNumber}: ${err.message}` };
      }
  }

  // Plan Status
  if (normalizedMsg === "plan status" || normalizedMsg === "summary plan") {
    if (!state.lastGeneratedPlan) {
      return { handled: true, response: "There is no active plan. You can create one by saying 'plan'." };
    }

    const plan = state.lastGeneratedPlan;
    const executedSteps = state.executedPlanSteps || [];
    const skippedSteps = state.skippedPlanSteps || [];
    const executionMode = state.executionMode || "manual";
    const pendingPerm = state.pendingStepPermission;
    
    let summary = `**Plan Status:**\n` +
                  `**Goal:** ${plan.goal}\n` +
                  `**Steps:** ${plan.steps.length} total\n` +
                  `**Executed:** ${executedSteps.length} (Steps: ${executedSteps.join(", ") || "none"})\n` +
                  `**Skipped:** ${skippedSteps.length} (Steps: ${skippedSteps.join(", ") || "none"})\n` +
                  `**Locked:** ${state.planLocked ? "Yes" : "No"}\n`;
    
    if (pendingPerm) {
      summary += `**Pending permission:** Step ${pendingPerm.stepNumber} (${pendingPerm.capability})\n`;
    } else {
      summary += `**Pending permission:** None\n`;
    }

    summary += `**Execution mode:** ${executionMode}`;

    return { handled: true, response: summary };
  }

  // 0b. List Capabilities
  if (normalizedMsg === "list capabilities" || normalizedMsg === "show capabilities") {
    const caps = getAllCapabilities();
    let response = "**Capabilities Status:**\n\n";
    for (const [type, info] of Object.entries(caps)) {
      if (type === "unknown") continue;
      const executableStatus = info.executable ? "executable" : "not executable";
      const enabledStatus = info.enabled ? "**enabled**" : "disabled";
      response += `- \`${type}\`: ${executableStatus}, ${enabledStatus}\n  *${info.description}*\n`;
    }
    return { handled: true, response };
  }

  // 1. Enable/Disable Capabilities
  if (normalizedMsg.startsWith("enable capability")) {
    const type = normalizedMsg.split(" ")[2];
    if (enableCapability(type)) {
      logAudit("CAPABILITY_ENABLED", { capability: type });
      return { handled: true, response: `Capability '${type}' is now enabled.` };
    }
    return { handled: true, response: `Unknown capability '${type}'.` };
  }
  
  if (normalizedMsg.startsWith("disable capability")) {
    const type = normalizedMsg.split(" ")[2];
    if (disableCapability(type)) {
      logAudit("CAPABILITY_DISABLED", { capability: type });
      return { handled: true, response: `Capability '${type}' is now disabled.` };
    }
    return { handled: true, response: `Unknown capability '${type}'.` };
  }

  // 2. Proceed with Plan
  if (normalizedMsg === "proceed with plan") {
    if (!state.lastGeneratedPlan) {
      return {
        handled: true,
        response: "There is no active plan to proceed with. You can create one by saying 'plan'."
      };
    }

    const plan = state.lastGeneratedPlan;
    const hasSteps = plan && Array.isArray(plan.steps) && plan.steps.length > 0;
    const requiresConfirmation = plan && plan.requires_user_confirmation === true;

    if (!hasSteps || !requiresConfirmation) {
      return {
        handled: true,
        response: "The active plan is invalid or does not require confirmation. Please generate a new plan by saying 'plan'."
      };
    }

    const mode = state.executionMode || "manual";
    return {
      handled: true,
      response: `Plan confirmed. Current Execution Mode: **${mode}**. Say 'execute step 1' to begin.`
    };
  }

  // 3. Show Plan Steps
  if (normalizedMsg === "show plan" || normalizedMsg === "show plan steps") {
    if (!state.lastGeneratedPlan) {
      return {
        handled: true,
        response: "There is no active plan to show. You can create one by saying 'plan'."
      };
    }

    const plan = state.lastGeneratedPlan;
    const steps = plan.steps || [];

    if (steps.length === 0) {
      return {
        handled: true,
        response: "The active plan has no steps to show."
      };
    }

    let response = `**Current Plan: ${plan.goal || "Untitled"}**\n\n`;
    const skipped = state.skippedPlanSteps || [];
    response += steps.map(s => {
        const isSkipped = skipped.includes(s.id);
        const prefix = isSkipped ? "(Skipped) " : "";
        const style = isSkipped ? "~~" : "";
        return `${s.id}. ${style}[${s.type || "unknown"}] ${prefix}${s.description}${style}`;
    }).join("\n");

    return {
      handled: true,
      response
    };
  }

  // 4. Allow / Deny Step Permission
  if (normalizedMsg.startsWith("allow step")) {
    if (isLocked) return lockedMsg;
    const parts = userMsg.trim().split(/\s+/);
    const stepNumber = parseInt(parts[2], 10);
    
    if (!state.pendingStepPermission || state.pendingStepPermission.stepNumber !== stepNumber) {
      return { handled: true, response: "There is no pending step awaiting permission matching that number." };
    }

    // Proceed to execute
    // We clear the permission first
    const cleanState = { ...state, pendingStepPermission: null };
    logAudit("STEP_ALLOWED", { step: stepNumber });
    return executeStepLogic(stepNumber, cleanState, userMsg);
  }

  if (normalizedMsg.startsWith("deny step")) {
    if (isLocked) return lockedMsg;
    const parts = userMsg.trim().split(/\s+/);
    const stepNumber = parseInt(parts[2], 10);

    if (!state.pendingStepPermission || state.pendingStepPermission.stepNumber !== stepNumber) {
      return { handled: true, response: "There is no pending step awaiting permission matching that number." };
    }

    logAudit("STEP_DENIED", { step: stepNumber });
    return {
      handled: true,
      response: `Step ${stepNumber} was denied and will not be executed.`,
      newState: { ...state, pendingStepPermission: null }
    };
  }

  // 5. Dry Run Step
  if (normalizedMsg.startsWith("dry run step")) {
    const parts = userMsg.trim().split(/\s+/);
    const stepNumber = parseInt(parts[3], 10);

    if (!state.lastGeneratedPlan) {
      return { handled: true, response: "There is no active plan. Create one first by saying 'plan'." };
    }
    if (isNaN(stepNumber)) {
      return { handled: true, response: "Please specify a valid step number, e.g. 'dry run step 1'." };
    }
    return dryRunStepLogic(stepNumber, state);
  }

  // 6. Execute Step (Permission Request)
  if (normalizedMsg.startsWith("execute step")) {
    if (isLocked) return lockedMsg;
    // GATE: Check Global Execution Mode
    const mode = state.executionMode || "manual";
    if (mode === "disabled") {
      return {
        handled: true,
        response: "Execution is currently disabled. Enable manual execution with 'set execution mode manual'."
      };
    }

    const parts = userMsg.trim().split(/\s+/);
    const stepNumber = parseInt(parts[2], 10);

    if (!state.lastGeneratedPlan) {
      return {
        handled: true,
        response: "There is no active plan. Create one first by saying 'plan'."
      };
    }

    if (isNaN(stepNumber)) {
      return {
        handled: true,
        response: "Please specify a valid step number, e.g. 'execute step 1'."
      };
    }

    const plan = state.lastGeneratedPlan;
    const steps = plan.steps || [];

    if (stepNumber < 1 || stepNumber > steps.length) {
      return {
        handled: true,
        response: `Step ${stepNumber} does not exist in the current plan.`
      };
    }

    const step = steps[stepNumber - 1];
    const cap = getCapability(step.type);
    const enabled = isEnabled(step.type);
    const executable = isExecutable(step.type);

    // Track execution
    const alreadyExecuted = (state.executedPlanSteps || []).includes(stepNumber);
    if (alreadyExecuted) {
      return {
        handled: true,
        response: `Step ${stepNumber} has already been executed.`
      };
    }

    const skipped = state.skippedPlanSteps || [];
    if (skipped.includes(stepNumber)) {
        return {
            handled: true,
            response: `Step ${stepNumber} is marked as **skipped**. You must 'unskip step ${stepNumber}' before executing it.`
        };
    }



    if (!enabled) {
      return {
        handled: true,
        response: `**Step ${stepNumber} selected [${step.type}]:**\n${step.description}\n\n` +
                  `**Capability:** ${cap.description}\n` +
                  `*Status:* Capability '${step.type}' is currently disabled. Use 'enable capability ${step.type}' to turn it on.`
      };
    }

    // Ask for permission
    logAudit("STEP_PERMISSION_REQUESTED", { step: stepNumber, capability: step.type });
    return {
      handled: true,
      response: `**Step ${stepNumber} requires confirmation:**\n` + 
                `*Action:* ${step.type} (${cap.description})\n` +
                `*Description:* ${step.description}\n\n` +
                `Do you want to allow this step? Type: **allow step ${stepNumber}** or **deny step ${stepNumber}**.`,
      newState: {
        ...state,
        pendingStepPermission: { stepNumber, capability: step.type }
      }
    };
  }

  // 5. Apply Edit
  if (normalizedMsg.startsWith("apply edit")) {
    if (isLocked) return lockedMsg;
    const parts = userMsg.trim().split(/\s+/);
    const stepNumber = parseInt(parts[2], 10);

    if (isNaN(stepNumber)) {
       return { handled: true, response: "Please specify a valid step number to apply, e.g. 'apply edit 1'." };
    }

    const pendingEdit = state.pendingEdits ? state.pendingEdits[stepNumber] : null;
    
    if (!pendingEdit) {
      return { handled: true, response: `No pending edit found for step ${stepNumber}. Run 'execute step ${stepNumber}' first.` };
    }

    try {
      // Ensure directory exists (should exist if file exists, but for safety)
      const dir = path.dirname(pendingEdit.path);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      // RECORD HISTORY BEFORE EDIT
      let previousContent = "";
      if (fs.existsSync(pendingEdit.path)) {
          previousContent = fs.readFileSync(pendingEdit.path, "utf-8");
      }

      fs.writeFileSync(pendingEdit.path, pendingEdit.content, "utf-8");

      // Cleanup pending edit and mark executed
      const newPendingEdits = { ...state.pendingEdits };
      delete newPendingEdits[stepNumber];

      const fileName = path.basename(pendingEdit.path);
      
      // Update history
      const historyEntry = {
          stepNumber,
          type: "edit_file",
          metadata: { path: pendingEdit.path, previousContent }
      };

      return {
        handled: true,
        response: `Edit applied to '${fileName}' successfully.`,
        newState: {
          ...state,
          pendingEdits: newPendingEdits,
          executedPlanSteps: [...(state.executedPlanSteps || []), stepNumber],
          stepExecutionHistory: [...(state.stepExecutionHistory || []), historyEntry]
        }
      };
    } catch (err) {
      return { handled: true, response: `Failed to apply edit: ${err.message}` };
    }
  }

  if (normalizedMsg.startsWith("apply organize")) {
    if (isLocked) return lockedMsg;
    const parts = userMsg.trim().split(/\s+/);
    const stepNumber = parseInt(parts[2], 10);

    if (isNaN(stepNumber)) {
       return { handled: true, response: "Please specify a valid step number to apply, e.g. 'apply organize 1'." };
    }

    const operations = state.pendingOrganize ? state.pendingOrganize[stepNumber] : null;

    if (!operations || operations.length === 0) {
      return { handled: true, response: `No pending organization changes found for step ${stepNumber}. Run 'execute step ${stepNumber}' first.` };
    }

    try {

      // Execute moves and record history
      const recordedMoves = [];
      
      for (const op of operations) {
        const destDir = path.dirname(op.dest);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        
        fs.renameSync(op.source, op.dest);
        recordedMoves.push({ from: op.source, to: op.dest });
      }

      // Cleanup
      const newPendingOrganize = { ...state.pendingOrganize };
      delete newPendingOrganize[stepNumber];
      
      // History Entry
      const historyEntry = {
          stepNumber,
          type: "organize_files",
          metadata: { moves: recordedMoves }
      };

      return {
        handled: true,
        response: "File organization changes applied successfully.",
        newState: {
          ...state,
          pendingOrganize: newPendingOrganize,
          executedPlanSteps: [...(state.executedPlanSteps || []), stepNumber],
          stepExecutionHistory: [...(state.stepExecutionHistory || []), historyEntry]
        }
      };
    } catch (err) {
      return { handled: true, response: `Failed to apply organization changes: ${err.message}` };
    }
  }

  // 7. Cancel / Clear Plan (Updated to clear pending)
  const cancelCommands = ["cancel plan", "clear plan", "reset plan"];
  if (cancelCommands.includes(normalizedMsg)) {
    if (isLocked) return lockedMsg;
    if (!state.lastGeneratedPlan) {
      return {
        handled: true,
        response: "There is no active plan to cancel."
      };
    }

    return {
      handled: true,
      response: "The current plan has been cleared.",
      newState: {
        ...state,
        lastGeneratedPlan: null,
        lastGeneratedPlan: null,
        executedPlanSteps: [],
        pendingEdits: {},
        pendingOrganize: {},
        skippedPlanSteps: [],
        stepExecutionHistory: []
      }
    };
  }

  // 7b. Plan Persistence
  const PLANS_DIR_NAME = "plans";
  
  if (normalizedMsg === "save plan") {
      if (!state.lastGeneratedPlan) return { handled: true, response: "No active plan to save." };
      
      const planId = `plan_${Date.now()}`;
      // Safety: Allow creating plans dir in WORKSPACE_ROOT
      const plansDir = path.join(state.WORKSPACE_ROOT, PLANS_DIR_NAME);
      if (!fs.existsSync(plansDir)) fs.mkdirSync(plansDir, { recursive: true });
      
      const planData = {
          id: planId,
          goal: state.lastGeneratedPlan.goal,
          steps: state.lastGeneratedPlan.steps,
          createdAt: new Date().toISOString(),
          projectSlug: state.currentProjectSlug || null
      };
      
      fs.writeFileSync(path.join(plansDir, `${planId}.json`), JSON.stringify(planData, null, 2));
      logAudit("PLAN_SAVED", { planId });
      return { handled: true, response: `Plan saved with ID: **${planId}**` };
  }

  if (normalizedMsg === "list plans" || normalizedMsg === "show saved plans") {
      const plansDir = path.join(state.WORKSPACE_ROOT, PLANS_DIR_NAME);
      if (!fs.existsSync(plansDir)) return { handled: true, response: "No saved plans found." };
      
      const files = fs.readdirSync(plansDir).filter(f => f.endsWith(".json"));
      if (files.length === 0) return { handled: true, response: "No saved plans found." };
      
      let response = "**Saved Plans:**\n\n";
      for (const file of files) {
          try {
              const content = fs.readFileSync(path.join(plansDir, file), "utf-8");
              const p = JSON.parse(content);
              const project = p.projectSlug ? `(Project: ${p.projectSlug})` : "(Global)";
              response += `- **${p.id}**: ${p.goal} _${project}_ [${new Date(p.createdAt).toLocaleString()}]\n`;
          } catch (e) {
              response += `- ${file} (Error reading)\n`;
          }
      }
      return { handled: true, response };
  }

  if (normalizedMsg.startsWith("load plan")) {
      const parts = userMsg.trim().split(/\s+/);
      const planId = parts[2]; // "load plan <id>"
      if (!planId) return { handled: true, response: "Usage: load plan <id>" };
      
      const plansDir = path.join(state.WORKSPACE_ROOT, PLANS_DIR_NAME);
      const planPath = path.join(plansDir, `${planId}.json`);
      // Security check: ensure strictly inside plans dir
      if (!path.resolve(planPath).startsWith(plansDir)) {
          return { handled: true, response: "Invalid plan ID path." };
      }

      if (!fs.existsSync(planPath)) return { handled: true, response: `Plan ID '${planId}' not found.` };
      
      try {
          const content = fs.readFileSync(planPath, "utf-8");
          const loadedPlan = JSON.parse(content);
          
          logAudit("PLAN_LOADED", { planId });
          
          const historyEntry = {
             timestamp: new Date().toISOString(),
             changeType: "loaded",
             details: `Plan loaded (ID: ${planId})`
          };

          return {
              handled: true,
              response: `Plan '${planId}' loaded successfully.`,
              newState: {
                  ...state,
                  lastGeneratedPlan: { 
                      goal: loadedPlan.goal, 
                      steps: loadedPlan.steps,
                      requires_user_confirmation: true 
                  },
                  executedPlanSteps: [],
                  skippedPlanSteps: [],
                  pendingStepPermission: null,
                  pendingEdits: {},
                  pendingOrganize: {},
                  stepExecutionHistory: [],
                  planChangeHistory: [historyEntry] // Reset history on load
                  // We do NOT automatically switch projectSlug based on the plan, maintaining current user context.
              }
          };
      } catch (e) {
          return { handled: true, response: `Failed to load plan: ${e.message}` };
      }
  }

  if (normalizedMsg.startsWith("delete plan")) {
      const parts = userMsg.trim().split(/\s+/);
      const planId = parts[2];
      if (!planId) return { handled: true, response: "Usage: delete plan <id>" };

      const plansDir = path.join(state.WORKSPACE_ROOT, PLANS_DIR_NAME);
      const planPath = path.join(plansDir, `${planId}.json`);
       // Security check
      if (!path.resolve(planPath).startsWith(plansDir)) {
          return { handled: true, response: "Invalid plan ID path." };
      }

      if (!fs.existsSync(planPath)) return { handled: true, response: `Plan ID '${planId}' not found.` };
      
      fs.unlinkSync(planPath);
      logAudit("PLAN_DELETED", { planId });
      return { handled: true, response: `Plan '${planId}' deleted.` };
  }

  // 8. Plan Changes / History
  if (normalizedMsg === "plan changes" || normalizedMsg === "plan history") {
      if (!state.lastGeneratedPlan) return { handled: true, response: "There is no active plan." };
      
      const history = state.planChangeHistory || [];
      if (history.length === 0) return { handled: true, response: "No changes recorded for this plan." };
      
      let response = "**Plan change history**\n";
      for (const h of history) {
          response += `- [${h.timestamp}] **${h.changeType}** — ${h.details}\n`;
      }
      return { handled: true, response };
  }

  // 9. Export Plan
  if (normalizedMsg === "export plan") {
      if (!state.lastGeneratedPlan) return { handled: true, response: "There is no active plan to export." };

      const plan = state.lastGeneratedPlan;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `plan-${timestamp}.md`;
      const exportsDir = path.join(state.WORKSPACE_ROOT, "exports");

      if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

      const executed = state.executedPlanSteps || [];
      const skipped = state.skippedPlanSteps || [];
      const project = state.currentProjectSlug || "Global";

      let md = `# Plan Export\n\n`;
      md += `**Goal:** ${plan.goal}\n`;
      md += `**Date:** ${new Date().toLocaleString()}\n`;
      md += `**Project Scope:** ${project}\n\n`;
      md += `## Steps\n\n`;

      plan.steps.forEach(step => {
          let status = "";
          let prefix = "";
          let suffix = "";
          
          if (executed.includes(step.id)) {
              status = " (Executed)";
              prefix = "**";
              suffix = "**";
          } else if (skipped.includes(step.id)) {
              status = " (Skipped)";
              prefix = "~~";
              suffix = "~~";
          }

          md += `${step.id}. ${prefix}[${step.type}] ${step.description}${status}${suffix}\n`;
      });

      const filePath = path.join(exportsDir, filename);
      fs.writeFileSync(filePath, md, "utf-8");

      logAudit("PLAN_EXPORTED", { file: filename });

      return {
          handled: true,
          response: `Plan exported successfully to: \`exports/${filename}\``
      };
  }

  // 9b. Plan Templates & Duplication
  const TEMPLATES_DIR_NAME = "plan-templates";

  // Duplicate Plan (from saved plans)
  if (normalizedMsg.startsWith("duplicate plan")) {
      const parts = userMsg.trim().split(/\s+/);
      const planId = parts[2];
      if (!planId) return { handled: true, response: "Usage: duplicate plan <id>" };

      const plansDir = path.join(state.WORKSPACE_ROOT, "plans");
      const planPath = path.join(plansDir, `${planId}.json`);
      
      if (!path.resolve(planPath).startsWith(plansDir)) return { handled: true, response: "Invalid plan ID path." };
      if (!fs.existsSync(planPath)) return { handled: true, response: `Plan ID '${planId}' not found.` };

      try {
          const content = fs.readFileSync(planPath, "utf-8");
          const originalPlan = JSON.parse(content);
          
          // Create new plan object (stripping old ID implies new instance)
          const newPlan = { 
              goal: originalPlan.goal, 
              steps: originalPlan.steps,
              requires_user_confirmation: true 
          };
          
          logAudit("PLAN_DUPLICATED", { originalId: planId });
          
          const historyEntry = {
             timestamp: new Date().toISOString(),
             changeType: "duplicated",
             details: `Plan duplicated from ${planId}`
          };

          return {
              handled: true,
              response: `Plan duplicated from '${planId}' and set as active.`,
              newState: {
                  ...state,
                  lastGeneratedPlan: newPlan,
                  executedPlanSteps: [],
                  skippedPlanSteps: [],
                  pendingStepPermission: null,
                  pendingEdits: {},
                  pendingOrganize: {},
                  stepExecutionHistory: [],
                  planChangeHistory: [historyEntry]
              }
          };
      } catch (e) {
          return { handled: true, response: `Failed to duplicate plan: ${e.message}` };
      }
  }

  // Save as Template
  if (normalizedMsg === "save plan as template") {
      if (!state.lastGeneratedPlan) return { handled: true, response: "No active plan to save as template." };

      const templateId = `template_${Date.now()}`;
      const templatesDir = path.join(state.WORKSPACE_ROOT, TEMPLATES_DIR_NAME);
      if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });

      const templateData = {
          id: templateId,
          goal: state.lastGeneratedPlan.goal,
          steps: state.lastGeneratedPlan.steps,
          createdAt: new Date().toISOString(),
          projectSlug: state.currentProjectSlug || null,
          isTemplate: true
      };

      fs.writeFileSync(path.join(templatesDir, `${templateId}.json`), JSON.stringify(templateData, null, 2));
      logAudit("TEMPLATE_SAVED", { templateId });
      return { handled: true, response: `Plan saved as template with ID: **${templateId}**` };
  }

  // List Templates
  if (normalizedMsg === "list plan templates") {
      const templatesDir = path.join(state.WORKSPACE_ROOT, TEMPLATES_DIR_NAME);
      if (!fs.existsSync(templatesDir)) return { handled: true, response: "No plan templates found." };
      
      const files = fs.readdirSync(templatesDir).filter(f => f.endsWith(".json"));
      if (files.length === 0) return { handled: true, response: "No plan templates found." };
      
      let response = "**Plan Templates:**\n\n";
      for (const file of files) {
          try {
              const content = fs.readFileSync(path.join(templatesDir, file), "utf-8");
              const t = JSON.parse(content);
              response += `- **${t.id}**: ${t.goal} [${new Date(t.createdAt).toLocaleString()}]\n`;
          } catch (e) {
              response += `- ${file} (Error reading)\n`;
          }
      }
      return { handled: true, response };
  }

  // Load Template
  if (normalizedMsg.startsWith("load plan template")) {
      const parts = userMsg.trim().split(/\s+/);
      const templateId = parts[3];
      if (!templateId) return { handled: true, response: "Usage: load plan template <id>" };

      const templatesDir = path.join(state.WORKSPACE_ROOT, TEMPLATES_DIR_NAME);
      const templatePath = path.join(templatesDir, `${templateId}.json`);
      
      // Security check
      if (!path.resolve(templatePath).startsWith(templatesDir)) return { handled: true, response: "Invalid template ID path." };
      if (!fs.existsSync(templatePath)) return { handled: true, response: `Template ID '${templateId}' not found.` };

      try {
          const content = fs.readFileSync(templatePath, "utf-8");
          const template = JSON.parse(content);
          
          logAudit("TEMPLATE_LOADED", { templateId });
          
          const historyEntry = {
             timestamp: new Date().toISOString(),
             changeType: "template_loaded",
             details: `Template loaded (ID: ${templateId})`
          };

          return {
              handled: true,
              response: `Template '${templateId}' loaded as active plan.`,
              newState: {
                  ...state,
                  lastGeneratedPlan: { 
                      goal: template.goal, 
                      steps: template.steps, 
                      requires_user_confirmation: true 
                  },
                  executedPlanSteps: [],
                  skippedPlanSteps: [],
                  pendingStepPermission: null,
                  pendingEdits: {},
                  pendingOrganize: {},
                  stepExecutionHistory: [],
                  planChangeHistory: [historyEntry]
              }
          };
      } catch (e) {
          return { handled: true, response: `Failed to load template: ${e.message}` };
      }
  }

  // 9c. Session Snapshot & Restore
  const SESSIONS_DIR_NAME = "sessions";

  if (normalizedMsg === "save session") {
     const sessionId = `session_${Date.now()}`;
     const sessionsDir = path.join(state.WORKSPACE_ROOT, SESSIONS_DIR_NAME);
     if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

     // Capture Capability State
     const caps = getAllCapabilities(); // returns object { type: { executable, enabled, description } }
     const capabilityState = {};
     for (const [type, info] of Object.entries(caps)) {
         capabilityState[type] = info.enabled;
     }

     const snapshot = {
         id: sessionId,
         timestamp: new Date().toISOString(),
         sessionState: {
             lastGeneratedPlan: state.lastGeneratedPlan,
             executedPlanSteps: state.executedPlanSteps || [],
             skippedPlanSteps: state.skippedPlanSteps || [],
             pendingStepPermission: state.pendingStepPermission,
             planLocked: state.planLocked || false,
             executionMode: state.executionMode || "manual",
             stepExecutionHistory: state.stepExecutionHistory || [],
             planChangeHistory: state.planChangeHistory || [],
             currentProjectSlug: state.currentProjectSlug || null,
             pendingEdits: state.pendingEdits || {},
             pendingOrganize: state.pendingOrganize || {}
         },
         capabilities: capabilityState
     };

     fs.writeFileSync(path.join(sessionsDir, `${sessionId}.json`), JSON.stringify(snapshot, null, 2));
     logAudit("SESSION_SAVED", { sessionId });
     return { handled: true, response: `Session saved with ID: **${sessionId}**` };
  }

  if (normalizedMsg === "list sessions") {
      const sessionsDir = path.join(state.WORKSPACE_ROOT, SESSIONS_DIR_NAME);
      if (!fs.existsSync(sessionsDir)) return { handled: true, response: "No saved sessions found." };
      
      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith(".json"));
      if (files.length === 0) return { handled: true, response: "No saved sessions found." };

      let response = "**Saved Sessions:**\n\n";
      for (const file of files) {
          try {
              const content = fs.readFileSync(path.join(sessionsDir, file), "utf-8");
              const s = JSON.parse(content);
              const planGoal = s.sessionState.lastGeneratedPlan ? s.sessionState.lastGeneratedPlan.goal : "No active plan";
              response += `- **${s.id}**: ${planGoal} [${new Date(s.timestamp).toLocaleString()}]\n`;
          } catch (e) {
              response += `- ${file} (Error reading)\n`;
          }
      }
      return { handled: true, response };
  }

  if (normalizedMsg.startsWith("load session")) {
      const parts = userMsg.trim().split(/\s+/);
      const sessionId = parts[2];
      if (!sessionId) return { handled: true, response: "Usage: load session <id>" };

      const sessionsDir = path.join(state.WORKSPACE_ROOT, SESSIONS_DIR_NAME);
      const sessionPath = path.join(sessionsDir, `${sessionId}.json`);
      
      // Security check
      if (!path.resolve(sessionPath).startsWith(sessionsDir)) return { handled: true, response: "Invalid session ID path." };
      if (!fs.existsSync(sessionPath)) return { handled: true, response: `Session ID '${sessionId}' not found.` };

      try {
          const content = fs.readFileSync(sessionPath, "utf-8");
          const snapshot = JSON.parse(content);
          
          // Restore Capabilities
          if (snapshot.capabilities) {
              for (const [type, enabled] of Object.entries(snapshot.capabilities)) {
                  if (enabled) enableCapability(type);
                  else disableCapability(type);
              }
          }
           
          logAudit("SESSION_LOADED", { sessionId });
          return {
              handled: true,
              response: `Session '${sessionId}' restored successfully.`,
              newState: {
                  ...state,
                  ...snapshot.sessionState
              }
          };

      } catch (e) {
           return { handled: true, response: `Failed to load session: ${e.message}` };
      }
  }

  if (normalizedMsg.startsWith("delete session")) {
      const parts = userMsg.trim().split(/\s+/);
      const sessionId = parts[2];
      if (!sessionId) return { handled: true, response: "Usage: delete session <id>" };

      const sessionsDir = path.join(state.WORKSPACE_ROOT, SESSIONS_DIR_NAME);
      const sessionPath = path.join(sessionsDir, `${sessionId}.json`);
      
      if (!path.resolve(sessionPath).startsWith(sessionsDir)) return { handled: true, response: "Invalid session ID path." };
      if (!fs.existsSync(sessionPath)) return { handled: true, response: `Session ID '${sessionId}' not found.` };

      fs.unlinkSync(sessionPath);
      logAudit("SESSION_DELETED", { sessionId });
      return { handled: true, response: `Session '${sessionId}' deleted.` };
  }

  // 10. Check Plan Readiness
  if (normalizedMsg === "check plan readiness") {
    if (!state.lastGeneratedPlan) {
      return {
        handled: true,
        response: "There is no active plan to check. Create one first by saying 'plan'."
      };
    }

    const steps = state.lastGeneratedPlan.steps || [];
    const skipped = state.skippedPlanSteps || [];
    
    let summary = "**Plan readiness:**\n";
    let executableCount = 0;
    let consideredSteps = 0;

    steps.forEach((s, idx) => {
      // 1-based index
      const id = idx + 1;
      
      if (skipped.includes(id)) {
        summary += `${id}. ~~${s.type || "unknown"}~~ (Skipped)\n`;
        return;
      }
      
      consideredSteps++;
      let status = "unknown";
      if (isKnownType(s.type)) {
        if (isExecutable(s.type) && isEnabled(s.type)) {
          status = "executable";
          executableCount++;
        } else {
          status = "recognized but not executable";
        }
      }
      summary += `${id}. ${s.type || "unknown"} — ${status}\n`;
    });

    let overallStatus = "not executable yet";
    if (consideredSteps === 0) {
        overallStatus = "no active steps (all skipped)";
    } else if (executableCount === consideredSteps) {
      overallStatus = "fully executable (for active steps)";
    } else if (executableCount > 0) {
      overallStatus = "partially executable";
    }

    summary += `\n**Overall status:** ${overallStatus}`;

    return {
      handled: true,
      response: summary
    };
  }

  return { handled: false };
}

// Helper to run the actual logic after permission is granted
function executeStepLogic(stepNumber, state, userMsg) {
    const plan = state.lastGeneratedPlan;
    const steps = plan.steps || [];
    const step = steps[stepNumber - 1];
    const cap = getCapability(step.type);
    const executable = isExecutable(step.type);

    logAudit("STEP_EXECUTION_ATTEMPTED", { step: stepNumber, type: step.type });

    // Track execution
    // (Double check executed just in case state shifted, though rare)
    const alreadyExecuted = (state.executedPlanSteps || []).includes(stepNumber);
    if (alreadyExecuted) {
      return {
        handled: true,
        response: `Step ${stepNumber} has already been executed.`
      };
    }
    
    // Check skipped in execution logic just in case
    const skipped = state.skippedPlanSteps || [];
    if (skipped.includes(stepNumber)) {
        return {
            handled: true,
            response: `Step ${stepNumber} is marked as **skipped** and cannot be executed.`
        };
    }
    


    // --- REAL EXECUTION LOGIC STARTS HERE ---
    
    // Handle 'read_file' execution
    if (executable && step.type === "read_file") {
      try {
        // Extract filename: greedy match for anything in quotes, or fallback to first word looking like a file
        const quoteMatch = step.description.match(/["'`]((?:[^"']+\.[a-zA-Z0-9]+)|(?:[^"']+\/)?(?:[^"']+\.[a-zA-Z0-9]+))["'`]/);
        const tokenMatch = step.description.match(/\b([\w-]+\.[a-z0-9]{2,4})\b/i);
        
        let filename = null;
        if (quoteMatch) {
          filename = quoteMatch[1];
        } else if (tokenMatch) {
          filename = tokenMatch[1];
        }

        if (!filename) {
          return {
            handled: true,
            response: `Could not determine the file to read from description: "${step.description}".`
          };
        }

        // Determine Root
        let rootDir = state.WORKSPACE_ROOT;
        if (state.currentProjectSlug) {
          rootDir = path.join(state.PROJECTS_DIR, state.currentProjectSlug);
        }

        // Safe Path Resolution
        const targetPath = path.resolve(rootDir, filename);
        if (!targetPath.startsWith(rootDir)) {
           return {
            handled: true,
            response: `Access denied: Path '${filename}' resolves outside of the current scope.`
          };
        }

        if (!fs.existsSync(targetPath)) {
          return {
            handled: true,
            response: `File not found: ${filename} (in ${getScopeName(state)})`
          };
        }
        
        // Read Content
        const stats = fs.statSync(targetPath);
        if (stats.isDirectory()) {
           return {
            handled: true,
            response: `Target '${filename}' is a directory, not a file.`
          };
        }

        const content = fs.readFileSync(targetPath, "utf-8");
        const preview = content.length > 2000 ? content.substring(0, 2000) + "\n... (truncated)" : content;

        return {
          handled: true,
          response: `**Executed Step ${stepNumber}: Read file '${filename}'**\n\n\`\`\`\n${preview}\n\`\`\``,
          newState: {
            ...state,
            executedPlanSteps: [...(state.executedPlanSteps || []), stepNumber]
          }
        };

      } catch (err) {
        return {
          handled: true,
          response: `Error executing step ${stepNumber}: ${err.message}`
        };
      }
    }

    // Handle 'write_file' execution
    if (executable && step.type === "write_file") {
      try {
        // Parse filename: look for first quoted string or token
        const filenameMatch = step.description.match(/["'`]((?:[^"']+\.[a-zA-Z0-9]+)|(?:[^"']+\/)?(?:[^"']+\.[a-zA-Z0-9]+))["'`]/) || step.description.match(/\b([\w-]+\.[a-z0-9]{2,4})\b/i);
        
        let filename = null;
        if (filenameMatch) filename = filenameMatch[1];

        if (!filename) {
          return {
            handled: true,
            response: `Could not determine target filename from description: "${step.description}".`
          };
        }

        // Determine Root
        let rootDir = state.WORKSPACE_ROOT;
        if (state.currentProjectSlug) {
          rootDir = path.join(state.PROJECTS_DIR, state.currentProjectSlug);
        }

        // Safe Path Resolution
        const targetPath = path.resolve(rootDir, filename);
        if (!targetPath.startsWith(rootDir)) {
           return {
            handled: true,
            response: `Access denied: Path '${filename}' resolves outside of the current scope.`
          };
        }

        // Parse content: Attempt to find "content: ..." or "with content ..."
        // Simple heuristic: everything after the last colon or "with content"
        let content = "";
        const contentMatch = step.description.match(/content[:\s]+["'`]?(.*?)["'`]?$/i) || step.description.match(/write[:\s]+["'`]?(.*?)["'`]?$/i);
        
        if (contentMatch) {
          content = contentMatch[1];
        } else {
          // If no content specified, create empty file
          content = ""; 
        }

        // Check for overwrite unless explicitly handled (naive check for now)
        if (fs.existsSync(targetPath) && !step.description.toLowerCase().includes("overwrite")) {
          return {
            handled: true,
            response: `File '${filename}' already exists. Use 'overwrite' in the step description to force.`
          };
        }

        // Ensure directory exists
        const dir = path.dirname(targetPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // RECORD HISTORY
        const exists = fs.existsSync(targetPath);
        let historyMetadata = {};
        if (exists && !step.description.toLowerCase().includes("overwrite")) {
           // Should have caught this earlier, but just in case
        } else if (exists) {
            historyMetadata = { operation: "overwrite", path: targetPath, previousContent: fs.readFileSync(targetPath, "utf-8") };
        } else {
            historyMetadata = { operation: "create", path: targetPath };
        }

        fs.writeFileSync(targetPath, content, "utf-8");

        const historyEntry = { stepNumber, type: "write_file", metadata: historyMetadata };

        return {
          handled: true,
          response: `**Executed Step ${stepNumber}: Wrote file '${filename}'** successfully.`,
          newState: {
            ...state,
            executedPlanSteps: [...(state.executedPlanSteps || []), stepNumber],
            stepExecutionHistory: [...(state.stepExecutionHistory || []), historyEntry]
          }
        };

      } catch (err) {
        return {
          handled: true,
          response: `Error executing step ${stepNumber}: ${err.message}`
        };
      }
    }

    // Handle 'edit_file' execution
    if (executable && step.type === "edit_file") {
      try {
        // Parse filename: robust search for tokens looking like filenames
        const filenameMatch = step.description.match(/([a-zA-Z0-9_\-]+\.[a-zA-Z0-9]{2,4})/);
        
        let filename = null;
        if (filenameMatch) filename = filenameMatch[1];

        if (!filename) {
          return {
            handled: true,
            response: `Could not determine target filename from description: "${step.description}".`
          };
        }

        // Determine Root
        let rootDir = state.WORKSPACE_ROOT;
        if (state.currentProjectSlug) {
          rootDir = path.join(state.PROJECTS_DIR, state.currentProjectSlug);
        }

        // Safe Path Resolution
        const targetPath = path.resolve(rootDir, filename);
        if (!targetPath.startsWith(rootDir)) {
           return {
            handled: true,
            response: `Access denied: Path '${filename}' resolves outside of the current scope.`
          };
        }

        if (!fs.existsSync(targetPath)) {
          return {
            handled: true,
            response: `File not found: ${filename} (in ${getScopeName(state)})`
          };
        }

        const currentContent = fs.readFileSync(targetPath, "utf-8");
        let newContent = currentContent;
        let diffDesc = "";

        // Parse Edit Instruction
        // 1. Replace
        // Matches "replace 'old' with 'new'" or "replacing ... 'old' with 'new'"
        const replaceMatch = step.description.match(/replac(?:e|ing).*?["'](.*?)["'].*?with\s+["'](.*?)["']/is);
        // 2. Append
        // Matches "append 'content'"
        const appendMatch = step.description.match(/append\s+["'](.*?)["']/is);
        // 3. Prepend
        // Matches "prepend 'content'"
        const prependMatch = step.description.match(/prepend\s+["'](.*?)["']/is);

        if (replaceMatch) {
          const [_, oldStr, newStr] = replaceMatch;
          if (!currentContent.includes(oldStr)) {
            return {
              handled: true,
              response: `Edit failed: Could not find substring '${oldStr}' in file '${filename}'.`
            };
          }
          newContent = currentContent.replace(oldStr, newStr);
          diffDesc = `Replacing:\n"${oldStr}"\n\nWith:\n"${newStr}"`;
        } else if (appendMatch) {
          const [_, toAppend] = appendMatch;
          newContent = currentContent + "\n" + toAppend;
          diffDesc = `Appending:\n"${toAppend}"`;
        } else if (prependMatch) {
          const [_, toPrepend] = prependMatch;
          newContent = toPrepend + "\n" + currentContent;
          diffDesc = `Prepending:\n"${toPrepend}"`;
        } else {
           return {
            handled: true,
            response: `Could not parse simple edit instruction (replace/append/prepend) from description: "${step.description}".`
          };
        }

        return {
          handled: true,
          response: `**Proposed edit for '${filename}':**\n\n${diffDesc}\n\nApply this edit by typing: **apply edit ${stepNumber}**`,
          newState: {
            ...state,
            pendingEdits: {
              ...(state.pendingEdits || {}),
              [stepNumber]: { path: targetPath, content: newContent }
            }
          }
        };

      } catch (err) {
        return {
          handled: true,
          response: `Error executing step ${stepNumber}: ${err.message}`
        };
      }
    }

    // Handle 'organize_files' execution
    if (executable && step.type === "organize_files") {
      try {
        // Parse operations: Heuristic - find the first two filename-like tokens in the description
        // This handles "move A to B" as well as "rename A to new identifier B"
        const filenameRegex = /([a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]{2,4})/g;
        const matches = [...step.description.matchAll(filenameRegex)];
        
        if (matches.length < 2) {
           // Fallback to strict regex if heuristic fails (e.g. filenames w/o extensions not caught likely, but user asked for extensions mostly)
           const strictMatch = step.description.match(/(?:move|rename)\s+(?:['"`])?(.*?)(?:['"`])?\s+to\s+(?:['"`])?(.*?)(?:['"`])?$/i);
           if (!strictMatch) {
             return {
              handled: true,
              response: `Could not determine source and destination files from description: "${step.description}". Expected two filenames.`
             };
           }
           // Use strict match
           var srcName = strictMatch[1].replace(/^['"`]|['"`]$/g, "");
           var destName = strictMatch[2].replace(/^['"`]|['"`]$/g, "");
        } else {
           var srcName = matches[0][1];
           var destName = matches[1][1];
        }

        // Determine Root
        let rootDir = state.WORKSPACE_ROOT;
        if (state.currentProjectSlug) {
          rootDir = path.join(state.PROJECTS_DIR, state.currentProjectSlug);
        }

        const sourcePath = path.resolve(rootDir, srcName);
        const destPath = path.resolve(rootDir, destName);

        // Security Checks
        if (!sourcePath.startsWith(rootDir) || !destPath.startsWith(rootDir)) {
           return {
            handled: true,
            response: `Access denied: Operations must be within scope '${getScopeName(state)}'.`
          };
        }

        if (!fs.existsSync(sourcePath)) {
          return {
            handled: true,
            response: `Source file not found: ${srcName}`
          };
        }

        if (fs.existsSync(destPath)) {
           return {
            handled: true,
            response: `Destination already exists: ${destName}. Overwriting via organize is not supported.`
          };
        }

        return {
          handled: true,
          response: `**Proposed file operations:**\n- ${srcName} -> ${destName}\n\nApply these changes by typing: **apply organize ${stepNumber}**`,
          newState: {
            ...state,
            pendingOrganize: {
              ...(state.pendingOrganize || {}),
              [stepNumber]: [{ source: sourcePath, dest: destPath }]
            }
          }
        };

      } catch (err) {
        return {
          handled: true,
          response: `Error executing step ${stepNumber}: ${err.message}`
        };
      }
    }

    // Handle 'research' (Stub)
    if (step.type === "research") {
       return {
         handled: true,
         response: "This step requires the research capability, which is not executable yet.",
         newState: {
            ...state,
            executedPlanSteps: [...(state.executedPlanSteps || []), stepNumber]
         }
       };
    }

    // Handle 'os_action' (Stub)
    if (step.type === "os_action") {
       return {
         handled: true,
         response: "This step requires OS-level control, which is not enabled or executable yet.",
         newState: {
            ...state,
            executedPlanSteps: [...(state.executedPlanSteps || []), stepNumber]
         }
       };
    }

    // Default for recognized but not implemented executable types
    return {
      handled: true,
      response: `**Step ${stepNumber} selected [${step.type}]:**\n${step.description}\n\n` +
                `**Capability:** ${cap.description}\n` +
                `*Status:* Executable logic for '${step.type}' is not yet implemented.`,
      newState: {
        ...state,
        executedPlanSteps: [...(state.executedPlanSteps || []), stepNumber]
      }
    };
}

function dryRunStepLogic(stepNumber, state) {
    const plan = state.lastGeneratedPlan;
    const steps = plan.steps || [];
    if (stepNumber < 1 || stepNumber > steps.length) {
      return { handled: true, response: `Step ${stepNumber} does not exist in the current plan.` };
    }

    const step = steps[stepNumber - 1];
    const executable = isExecutable(step.type);

    if (!executable) {
        return {
            handled: true,
            response: `Step ${stepNumber} uses capability '${step.type}', which is not executable yet.`
        };
    }

    let rootDir = state.WORKSPACE_ROOT;
    if (state.currentProjectSlug) {
        rootDir = path.join(state.PROJECTS_DIR, state.currentProjectSlug);
    }

    // read_file
    if (step.type === "read_file") {
        const quoteMatch = step.description.match(/["'`]((?:[^"']+\.[a-zA-Z0-9]+)|(?:[^"']+\/)?(?:[^"']+\.[a-zA-Z0-9]+))["'`]/);
        const tokenMatch = step.description.match(/\b([\w-]+\.[a-z0-9]{2,4})\b/i);
        let filename = quoteMatch ? quoteMatch[1] : (tokenMatch ? tokenMatch[1] : null);

        if (!filename) return { handled: true, response: `[Dry Run] Could not determine filename from description: "${step.description}"` };

        const targetPath = path.resolve(rootDir, filename);
        const scope = getScopeName(state);
        
        if (!targetPath.startsWith(rootDir)) return { handled: true, response: `[Dry Run] Access Denied: Path '${filename}' resolves outside of the current scope.` };
        
        if (!fs.existsSync(targetPath)) return { handled: true, response: `[Dry Run] File '${filename}' does not exist in ${scope} (would fail to read).` };
        
        return { handled: true, response: `**[Dry Run] Step ${stepNumber} (read_file):**\nWould read file '${filename}' and return its contents.` };
    }

    // write_file
    if (step.type === "write_file") {
        const filenameMatch = step.description.match(/["'`]((?:[^"']+\.[a-zA-Z0-9]+)|(?:[^"']+\/)?(?:[^"']+\.[a-zA-Z0-9]+))["'`]/) || step.description.match(/\b([\w-]+\.[a-z0-9]{2,4})\b/i);
        let filename = filenameMatch ? filenameMatch[1] : null;

        if (!filename) return { handled: true, response: `[Dry Run] Could not determine target filename from description: "${step.description}"` };

        const targetPath = path.resolve(rootDir, filename);
        if (!targetPath.startsWith(rootDir)) return { handled: true, response: `[Dry Run] Access Denied: Path '${filename}' resolves outside of the current scope.` };

        const contentMatch = step.description.match(/content[:\s]+["'`]?(.*?)["'`]?$/i) || step.description.match(/write[:\s]+["'`]?(.*?)["'`]?$/i);
        let contentPreview = contentMatch ? contentMatch[1] : "(empty/unknown)";
        if (contentPreview.length > 50) contentPreview = contentPreview.substring(0, 50) + "...";

        return { handled: true, response: `**[Dry Run] Step ${stepNumber} (write_file):**\nWould create file '${filename}' with content: "${contentPreview}"` };
    }

    // edit_file
    if (step.type === "edit_file") {
        const filenameMatch = step.description.match(/([a-zA-Z0-9_\-]+\.[a-zA-Z0-9]{2,4})/);
        let filename = filenameMatch ? filenameMatch[1] : null;
        if (!filename) return { handled: true, response: `[Dry Run] Could not determine target filename from description: "${step.description}"` };
        
        const targetPath = path.resolve(rootDir, filename);
        const scope = getScopeName(state);
        if (!targetPath.startsWith(rootDir)) return { handled: true, response: `[Dry Run] Access Denied: Path '${filename}' resolves outside of the current scope.` };
        if (!fs.existsSync(targetPath)) return { handled: true, response: `[Dry Run] File '${filename}' does not exist in ${scope} (would fail to edit).` };

        const replaceMatch = step.description.match(/replac(?:e|ing).*?["'](.*?)["'].*?with\s+["'](.*?)["']/is);
        const appendMatch = step.description.match(/append\s+["'](.*?)["']/is);
        const prependMatch = step.description.match(/prepend\s+["'](.*?)["']/is);

        let action = "Unknown Edit";
        if (replaceMatch) action = `Replace "${replaceMatch[1]}" with "${replaceMatch[2]}"`;
        else if (appendMatch) action = `Append "${appendMatch[1]}"`;
        else if (prependMatch) action = `Prepend "${prependMatch[1]}"`;

        return { handled: true, response: `**[Dry Run] Step ${stepNumber} (edit_file):**\nWould apply the following edit to '${filename}' (diff not applied):\n${action}` };
    }

    // organize_files
    if (step.type === "organize_files") {
         const filenameRegex = /([a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]{2,4})/g;
         const matches = [...step.description.matchAll(filenameRegex)];
         let srcName, destName;
         if (matches.length < 2) {
            const strictMatch = step.description.match(/(?:move|rename)\s+(?:['"`])?(.*?)(?:['"`])?\s+to\s+(?:['"`])?(.*?)(?:['"`])?$/i);
            if (strictMatch) {
               srcName = strictMatch[1].replace(/^['"`]|['"`]$/g, "");
               destName = strictMatch[2].replace(/^['"`]|['"`]$/g, "");
            }
         } else {
            srcName = matches[0][1];
            destName = matches[1][1];
         }

         if (!srcName || !destName) return { handled: true, response: `[Dry Run] Could not determine source and destination files from description: "${step.description}"` };

         return { handled: true, response: `**[Dry Run] Step ${stepNumber} (organize_files):**\nWould move/rename '${srcName}' to '${destName}'.` };
    }

    return { handled: true, response: `**[Dry Run] Step ${stepNumber}:**\nSimulation logic for '${step.type}' is not yet implemented.` };
}

module.exports = { handlePlannerCommands };
