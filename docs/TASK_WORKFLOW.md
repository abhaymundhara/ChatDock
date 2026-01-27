# Claude Cowork-Inspired Task Workflow

**ChatDock's task management system is inspired by Claude Cowork's approach to transparent, structured work tracking.**

## Overview

The task workflow system provides a structured approach to handling complex multi-step work with clear visibility into progress and execution state. It enforces best practices for task management while maintaining flexibility for different types of work.

## Core Principles

### 1. **Write Complete Lists**

Create task lists with specific, actionable items upfront. Each task should be:

- **Concise**: 3-7 words for the title
- **Actionable**: Clear what needs to be done
- **Detailed**: Include file paths, methods, or acceptance criteria in descriptions

### 2. **One Task at a Time**

Only ONE task should be `in_progress` at any given time. This ensures:

- Focused execution
- Clear progress visibility
- Easier tracking and debugging

### 3. **Immediate Status Updates**

Mark tasks as completed IMMEDIATELY after finishing work, not in batches. This provides:

- Real-time progress visibility
- Accurate state tracking
- Better user feedback

### 4. **Proper State Transitions**

Tasks follow a clear lifecycle:

```
pending → in_progress → completed
                ↓
              blocked (if issues arise)
```

## Task States

| State         | Icon | Description                                  |
| ------------- | ---- | -------------------------------------------- |
| `pending`     | ○    | Task not yet started                         |
| `in_progress` | ▶️   | Currently being worked on (only ONE allowed) |
| `completed`   | ✅   | Successfully finished                        |
| `blocked`     | 🚫   | Cannot proceed due to dependency or issue    |

## Task Data Model

### Task Object

```javascript
{
  id: "task_1",              // Unique identifier
  task: "Create login form", // Short description/title
  status: "pending",         // Current state
  dependsOn: ["task_0"],    // Array of task IDs this depends on
  notes: "Use React hooks"   // Optional additional context
}
```

### Plan Object

```javascript
{
  title: "Implement Login Feature",
  createdAt: "2026-01-26T10:00:00Z",
  updatedAt: "2026-01-26T10:30:00Z",
  tasks: [...],              // Array of task objects
  dependencies: {            // Computed dependency map
    task_1: [],
    task_2: ["task_1"],
    task_3: ["task_2"]
  }
}
```

## API Reference

### `task_write`

Creates or updates a task list/plan.

**Parameters:**

- `title` (string): Plan title
- `mode` (string): `"replace"` (default) or `"append"`
- `tasks` (array): Array of task objects

**Example:**

```javascript
task_write({
  title: "Database Migration",
  mode: "replace",
  tasks: [
    { id: "task_1", task: "Backup current database" },
    { id: "task_2", task: "Run migration scripts", dependsOn: ["task_1"] },
    { id: "task_3", task: "Verify data integrity", dependsOn: ["task_2"] },
  ],
});
```

### `task_update`

Updates the status of a specific task.

**Parameters:**

- `taskId` (string): ID of task to update
- `status` (string): New status (`pending`, `in_progress`, `completed`, `blocked`)

**Returns:**

- `updated`: Task ID that was updated
- `oldStatus`: Previous status
- `newStatus`: New status
- `plan`: Complete updated plan

**Example:**

```javascript
task_update({
  taskId: "task_1",
  status: "in_progress",
});
// Returns: { updated: "task_1", oldStatus: "pending", newStatus: "in_progress", ... }
```

### `task_read`

Retrieves the current task plan.

**Returns:**

- `hasPlan` (boolean): Whether a plan exists
- `title`, `tasks`, `dependencies`, `createdAt`, `updatedAt`

**Example:**

```javascript
task_read();
// Returns: { hasPlan: true, title: "...", tasks: [...], dependencies: {...} }
```

## Workflow Examples

### Simple Sequential Tasks

```javascript
// 1. Create plan
task_write({
  title: "Fix Bug #123",
  tasks: [
    { id: "1", task: "Reproduce the bug" },
    { id: "2", task: "Identify root cause" },
    { id: "3", task: "Implement fix" },
    { id: "4", task: "Add regression test" },
    { id: "5", task: "Submit PR" },
  ],
});

// 2-5. For each task, execute this pattern:
task_update({ taskId: "1", status: "in_progress" });
// [do the work...]
task_update({ taskId: "1", status: "completed" });
```

### Tasks with Dependencies

```javascript
task_write({
  title: "Build Feature",
  tasks: [
    { id: "backend", task: "Build API endpoint" },
    { id: "frontend", task: "Create UI component", dependsOn: ["backend"] },
    {
      id: "tests",
      task: "Write integration tests",
      dependsOn: ["backend", "frontend"],
    },
  ],
});

// Backend can start immediately
task_update({ taskId: "backend", status: "in_progress" });
```

### Appending Tasks Dynamically

```javascript
// Start with initial tasks
task_write({
  title: "Research Project",
  tasks: [
    { id: "1", task: "Review documentation" },
    { id: "2", task: "Identify key patterns" },
  ],
});

// Later, add more tasks without replacing
task_write({
  mode: "append",
  tasks: [
    { id: "3", task: "Create summary report" },
    { id: "4", task: "Present findings" },
  ],
});
```

### Updating Task Details

```javascript
// Update existing task status
task_write({
  mode: "append",
  tasks: [{ id: "task_2", status: "blocked", notes: "Waiting for API access" }],
});
```

## UI Integration

### Progress Tracking

The UI automatically displays:

- **Progress bar**: Visual indicator of completion percentage
- **Active task highlight**: Currently `in_progress` task has a pulsing blue glow
- **Status indicators**: Color-coded status pills for quick scanning

### Real-time Updates

Task changes are streamed to the UI via:

- `tasks` event: Complete plan with progress metadata
- `task_status_change` event: Individual status transitions

```javascript
// Orchestrator emits:
{
  type: "tasks",
  data: {
    title: "...",
    tasks: [...],
    dependencies: {...},
    currentTask: { id: "task_2", task: "...", status: "in_progress" },
    progress: {
      completed: 3,
      total: 5,
      percentage: 60
    }
  }
}
```

## Best Practices

### ✅ DO

- Write complete task lists upfront
- Mark tasks `in_progress` before starting work
- Mark `completed` immediately after finishing
- Use descriptive task titles (3-7 words)
- Include file paths or method names in notes
- Use dependencies to show task relationships

### ❌ DON'T

- Have multiple tasks `in_progress` simultaneously
- Batch completion updates
- Skip the `in_progress` state
- Use vague task descriptions ("fix stuff", "update code")
- Create tasks for trivial single-step operations

## When to Use Task Management

### Use task_write for:

- Multi-step work requiring planning (3+ steps)
- Complex requests with dependencies
- Work that benefits from progress tracking
- Breaking down ambiguous requests
- Maintaining visibility for users

### Skip task_write for:

- Single-step operations (read file, run command)
- Purely conversational requests
- Simple information lookups
- Trivial file edits

## Workflow Enforcement

The system provides guidance but allows flexibility:

### Warnings (Not Errors)

- Multiple tasks marked `in_progress`: System warns but allows
- This accommodates parallel work when intentional

### Console Logging

All state transitions are logged with emoji indicators:

```
[task_update] ▶️ Task "task_1": pending → in_progress
[task_update] ✅ Task "task_1": in_progress → completed
[task_update] ⚠️  Warning: Task "task_2" is already in progress...
```

## Storage

Tasks are persisted to: `~/.chatdock/current_tasks.json`

The file is updated:

- After `task_write` operations
- After `task_update` changes
- Automatically migrates from legacy `current_plan.json`

## Testing

See `tests/tasks.spec.mjs` for comprehensive test coverage:

- Basic task CRUD operations
- Dependency computation
- Append mode behavior
- Status transition tracking
- Workflow validation
- Legacy file migration

---

**This task workflow system ensures transparent, trackable execution of complex work while maintaining the flexibility needed for real-world development tasks.**
