# Task System Fix - January 26, 2026

## Problem Identified

The task system was **forcing task_write for EVERY request**, including simple queries. This caused the AI to create useless "meta-tasks" about its own planning process instead of actual user work.

### Example of Bad Behavior

```javascript
// User asks something simple
// AI was forced to create these useless tasks:
task_write({
  tasks: [
    "Understand the current context and user request",
    "Identify appropriate tools for upcoming actions",
    "Plan a step-by-step execution strategy",
    "Execute the plan using necessary tool calls",
  ],
});
```

This violated Claude Cowork principles:

- ❌ Not specific or actionable
- ❌ Meta-tasks about planning, not actual work
- ❌ Used for simple queries that don't need tasks
- ❌ Circular logic (creating tasks to find tools to execute tasks)

## Root Cause

### 1. **Overly Aggressive Task Detection**

```javascript
// OLD CODE - Everything needed tasks except URLs
detectComplexTask(userMessage) {
  if (this.extractUrls(userMessage).length > 0) {
    return false;  // Only URLs skipped tasks
  }
  return true;  // EVERYTHING ELSE forced tasks
}
```

### 2. **No Complexity Check in Workflow Enforcement**

The `getWorkflowViolation()` function enforced tasks regardless of whether the request was actually complex.

### 3. **Unclear Guidelines in AGENTS.md**

The instructions said "for any request beyond hello" which was too broad.

## Solution Implemented

### 1. **Smart Complexity Detection**

```javascript
detectComplexTask(userMessage) {
  // Skip tasks for simple queries
  const simplePatterns = [
    /^(what|who|when|where|why|how)\s/i,  // Questions
    /^(tell me|show me|explain|describe)\s/i,  // Info requests
    /^(list|display|view)\s/i,  // Simple listings
    /\b(hello|hi|hey|thanks|thank you)\b/i,  // Greetings
  ];

  if (simplePatterns.some(pattern => pattern.test(lowerMessage))) {
    return false;  // Simple query - no tasks needed
  }

  // Require tasks for complex work
  const complexPatterns = [
    /\b(create|build|implement|refactor|migrate)\b/i,
    /\b(fix|debug|solve|resolve)\b.{0,20}\b(bug|issue|error|problem)\b/i,
    /\b(add|remove|update|modify|change).{0,20}\b(feature|functionality)\b/i,
    /\band\b.*\band\b/i,  // Multiple "and" suggests steps
    /\bthen\b/i,  // Sequential steps
    /\d+[\.\)]\s/,  // Numbered lists
  ];

  const isComplex = complexPatterns.some(pattern => pattern.test(lowerMessage));
  const hasMultipleSteps = wordCount > 20 || isComplex;

  return hasMultipleSteps;
}
```

### 2. **Workflow Enforcement Respects Complexity**

```javascript
getWorkflowViolation(toolCalls, { hasTaskPlan, hasToolFinder }, userMessage) {
  // Check if this is actually a complex task that needs planning
  const needsTasks = this.detectComplexTask(userMessage);

  if (!hasTaskPlan && !needsTasks) {
    // Simple task - no task_write required, proceed normally
    return null;
  }

  if (!hasTaskPlan && needsTasks) {
    // Complex task - enforce task_write with better error message
    return {
      type: "task_write_required",
      message: `STOP: This is a complex task that requires planning.

REQUIRED ACTION: Call task_write({ tasks: [...] }) to create specific, actionable tasks.
Example: task_write({ title: "Fix Login Bug", tasks: [
  { id: "1", task: "Reproduce the bug in dev environment" },
  { id: "2", task: "Identify root cause in auth.js" },
  { id: "3", task: "Implement fix with proper error handling" }
]})

After tasks are created, call tool_finder if tools are needed.`,
    };
  }
  // ... rest of enforcement
}
```

### 3. **Clearer Guidelines in AGENTS.md**

Updated to explicitly state:

- **When to create tasks**: Creating/building/fixing features, multi-step work
- **When NOT to create tasks**: Questions, info lookups, simple operations
- **Examples of BAD tasks**: "Understand context", "Identify tools", "Plan strategy"
- **Examples of GOOD tasks**: "Read login.js to find bug", "Fix token validation"

## Impact

### Before (BAD)

```
User: "What files are in src/?"
AI: Creates tasks → "Understand request" → "Find tools" → "Execute plan" → Finally lists files
```

### After (GOOD)

```
User: "What files are in src/?"
AI: Directly calls list_dir("src/") → Returns files immediately

User: "Fix the login bug and add tests"
AI: Creates tasks → "Reproduce bug" → "Fix in auth.js" → "Add unit tests" → Executes properly
```

## Files Modified

1. **src/server/orchestrator/orchestrator.js**
   - Enhanced `detectComplexTask()` with pattern matching
   - Updated `getWorkflowViolation()` to check complexity
   - Passes `userMessage` to violation checker

2. **brain/AGENTS.md**
   - Added clear "When to create tasks" vs "When NOT to" sections
   - Provided examples of bad vs good tasks
   - Emphasized tasks are for COMPLEX work only

## Testing

Test both scenarios:

### Simple Query (Should NOT create tasks)

```
User: "What is the capital of France?"
Expected: Direct answer without tasks
```

### Complex Request (Should create tasks)

```
User: "Fix the authentication bug and add error handling"
Expected: Creates specific tasks, marks in-progress, completes individually
```

## Conclusion

The task system now follows **true Claude Cowork principles**:

- ✅ Only used for complex multi-step work
- ✅ Creates specific, actionable tasks (not meta-tasks)
- ✅ Simple queries get direct responses
- ✅ Proper balance between structure and flexibility

This provides the benefits of task tracking for complex work while avoiding the overhead and confusion for simple queries.
