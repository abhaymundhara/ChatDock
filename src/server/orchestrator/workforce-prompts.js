const DECOMPOSE_PROMPT = `You need to either decompose a complex task or enhance a simple one.

Rules:
- If the task is simple, DO NOT decompose it. Rewrite it into ONE clear task with explicit WHAT/WHERE/HOW and a concrete deliverable.
- If the task is complex, decompose into multiple self-contained tasks that can run in parallel when possible.
- Each task must be independently understandable with no relative references.
- Be explicit about the output format for each task.

Return ONLY XML in this exact format:
<tasks>
<task>Subtask 1</task>
<task>Subtask 2</task>
</tasks>`;

const ASSIGN_PROMPT = `Assign each task to the most suitable worker type and identify dependencies.

Return ONLY JSON in this exact format:
{"assignments":[{"task_id":"task_1","assignee_id":"file","dependencies":[]}]}

Rules:
- assignee_id must be one of: file, shell, web, code
- dependencies is a list of task IDs this task depends on
- If no dependencies, use an empty list`;

function buildDecomposePrompt({ content, workers }) {
  return `${DECOMPOSE_PROMPT}\n\nTASK:\n${content}\n\nWORKERS:\n${workers}`;
}

function buildAssignPrompt({ tasks, workers }) {
  return `${ASSIGN_PROMPT}\n\nTASKS:\n${tasks}\n\nWORKERS:\n${workers}`;
}

module.exports = { buildDecomposePrompt, buildAssignPrompt };
