---
name: chatdock-skill-registry
description: |
  Use when adding or modifying skill-based planning in ChatDock. Applies to work that registers
  skills, matches intents, or wires skill-generated plans into the planner pipeline. Includes
  how to expose "list skills" and embed generated content into write_file steps.
author: Claude Code
version: 1.0.0
date: 2026-01-30
---

# ChatDock Skill Registry Integration

## Problem
ChatDock needs deterministic, reusable skills for common user intents to reduce ad-hoc plan generation
and improve consistency, especially for smaller models.

## Context / Trigger Conditions
- You are adding new skills or modifying existing ones.
- You need the planner to prefer skill-generated plans.
- You need to expose a `list skills` command.
- You need to embed generated content into `write_file` steps.

## Solution
1. **Create a registry module** in `src/server/skills/skillRegistry.js`:
   - Define skills with `{ id, name, description, match, buildPlan }`.
   - Provide `findMatchingSkill(userMessage, context)` and `getAllSkills()`.
   - Keep registry decoupled; pass helpers (like content generation) via context.
2. **Wire into the task pipeline** in `src/server/server.js`:
   - Build a skill context (workspace root, projects dir, current project slug).
   - Call `findMatchingSkill` before `invokePlanner`.
   - If matched, build plan via the skill; otherwise fallback to LLM planning.
   - Log selection via `logPlanning("skill_selected", ...)`.
3. **Generate content for write skills** with a helper like `generateSkillContent`:
   - Use Ollama chat with `stream: false`.
   - System prompt should instruct the model to return only content (no preface).
4. **Expose skills to users**:
   - Add `list skills` / `show skills` to `KNOWN_COMMANDS`.
   - Handle `list skills` in `plannerCommands` using `getAllSkills()`.
   - Add the command to `helpCommands`.
5. **Preserve plan validation and history**:
   - Run `validatePlan` / `normalizePlan` on skill plans.
   - Store `planChangeHistory` with skill metadata.

## Verification
- `Write a short poem and save it as poem.md` selects `write_and_save_doc` and produces a `write_file` step with content.
- `Open report.txt and summarize it` selects `open_and_summarize_resource`.
- `Organize my project folder` selects `organize_workspace_files`.
- `list skills` shows the registered skills.
- Non-matching tasks still fall back to the LLM planner.

## Example
User: “Write a short poem about Belfast rain and save it as belfast-rain.md.”
- Skill matched: `write_and_save_doc`
- Plan contains a `write_file` step with `content:` populated by the model.

## Notes
- Always set `requires_user_confirmation: true` in skill-generated plans.
- Use explicit, concrete step descriptions so the executor can run them.
- Keep skill matching deterministic (regex/keywords) for predictable behavior.
