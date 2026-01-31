---
name: chatdock-plan-ledger-feedback
description: |
  Use when implementing or debugging ChatDock's plan execution ledger and feedback loop.
  Triggers: (1) plan panel needs step state updates (queued/running/done/failed/paused),
  (2) stdout/stderr should surface in the plan UI, (3) plan success/failure needs
  logging into workspace logs and a memory/tuning dataset. Covers stepStatus lifecycle,
  planOutcome logging, and plan edit/status handling.
author: Claude Code
version: 1.0.0
date: 2026-01-30
---

# ChatDock Plan Ledger & Feedback Loop

## Problem
The plan panel needs real-time step state updates and output (stdout/stderr), while plan success/failure outcomes should feed a tuning dataset for future routing or prompt improvements.

## Context / Trigger Conditions
- Plan UI shows stale step state or missing queued/running/done/failed.
- OS action output only appears in the console, not in plan steps.
- Plan success/failure is logged to run logs, but not to a reusable tuning dataset.
- “Edit this plan” requests should regenerate plan and reset execution state cleanly.

## Solution
1) **Track plan request + initialize stepStatus**
   - On plan creation, store `lastPlanRequest` and initialize `stepStatus` to queued for all steps.
   - Reset `planOutcomeLogged` and create a fresh `activePlanRunId`.

2) **Update step state during execution**
   - In `executePlanLoop`, set per-step states: queued → running → done/failed/paused.
   - In manual execution (`runStepWithLedger`), update `planStatus` (executing/paused/completed/error) and set `stepStatus` output for each step.

3) **Surface stdout/stderr in plan UI**
   - When executing `os_action`, store `stdout`/`stderr` in `stepStatus`.
   - Render `stepStatus.output`, `stdout`, and `stderr` in the plan panel (use `<details>` blocks for readability).

4) **Log plan outcomes to tuning dataset**
   - Extend `planFeedback` logger to write outcomes to:
     - `workspace/logs/plan_feedback/plan_outcomes.jsonl`
     - `workspace/memory/tuning/plan_tuning.jsonl`
   - Include `request`, `plan goal`, and `plan steps` in the payload.

5) **Support plan edits**
   - Detect `edit this plan` intent, include the current plan JSON in the planner input, and reset execution state with a new `planChangeHistory` entry.

## Verification
- Create a plan and start execution; `/plan/active` returns `stepStatus` for each step.
- Run an `os_action` step and confirm stdout/stderr appear in the plan panel.
- After plan completion, check that `plan_outcomes.jsonl` and `plan_tuning.jsonl` were appended with the latest entry.
- Trigger “Edit this plan: …” and confirm a new plan replaces the old with execution state reset.

## Example
- User: “Edit this plan: add a step to export results.”
- Result: new plan created, stepStatus reset to queued, plan panel shows updated steps.

## Notes
- Keep logs truncated to prevent huge tuning files (trim step descriptions if necessary).
- Only log plan outcomes once per plan (`planOutcomeLogged`).

## References
- (Project-specific; no external references used.)
