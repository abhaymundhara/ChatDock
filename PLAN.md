# ChatDock Multi-Agent Architecture Implementation Plan

**Based on Anthropic Cowork Patterns**  
**Branch:** agent_arc  
**Timeline:** 3 weeks (21 days)  
**Model Strategy:** Single user-selected model for all agents (Planner + Specialists)

---

## Core Philosophy

**Fresh Context Strategy:** Only the Planner sees full conversation history. All specialists receive fresh, focused context for their specific tasks. This enables smaller, faster models to perform better than larger models with bloated context.

**No ML Routing:** Use function calling and structured JSON outputs for routing decisions. Simple, deterministic, debuggable.

**Anthropic-Proven Flow:**

```
User Input → Planner (clarify if needed)
          → Task Breakdown (JSON)
          → Coordinator (spawn specialists)
          → Specialists Execute (fresh context)
          → Results Aggregated
          → Response to User
```

---

## Architecture Overview

### Three-Tier System

1. **Planner Agent (User-Selected Model)**
   - Receives full conversation history
   - Determines if request is conversational or task-based
   - Asks clarifying questions if needed
   - Breaks down tasks into JSON structure
   - Has access to ALL tools for awareness, but doesn't execute

2. **Coordinator**
   - Lightweight orchestration layer (no LLM)
   - Parses Planner's JSON output
   - Spawns specialists with fresh context
   - Manages parallel vs sequential execution
   - Aggregates results
   - Handles failures and retries

3. **Specialist Agents (Same User-Selected Model)**
   - Receive ONLY the task description (fresh context)
   - Each has limited, focused toolset
   - Execute and return results
   - No awareness of parent conversation

---

## Specialist Definitions

### 1. Conversation Specialist

- **Purpose:** Handle general chat, explanations, questions
- **Tools:** NONE (pure LLM conversation)
- **Context:** User's current message + last 2-3 exchanges for continuity
- **Examples:** "Hello", "Explain recursion", "Thank you", "What do you think about X?"

### 2. File Specialist

- **Purpose:** Safe file system operations
- **Tools:** search-files, read-file, write-file, move-file (shell-based versions)
- **Context:** Task description only (e.g., "Search for config.json and read its contents")
- **Safety:**
  - Path validation, gitignore support, auto-create parent directories
  - **Read-before-write enforcement:** System tracks which files have been read in current task
  - Write/edit operations FAIL if file hasn't been read first (prevents accidental overwrites)
  - Session state: Maintains list of read files for validation

### 3. Shell Specialist

- **Purpose:** Advanced system commands
- **Tools:** execute-command (unrestricted shell access)
- **Context:** Task description + required context (e.g., "Run npm install in project root")
- **Examples:** git operations, package management, build scripts, process control

### 4. Web Specialist

- **Purpose:** Internet research and content fetching
- **Tools:** web-search, web-fetch
- **Context:** Task description + search query/URL
- **Examples:** "Search for React 19 features", "Fetch content from https://example.com"

### 5. Code Specialist

- **Purpose:** Execute Python/JavaScript code
- **Tools:** execute-python, execute-javascript
- **Context:** Task description + code to execute
- **Safety:** Sandboxed execution, timeout limits

---

## Agent Tool Access Matrix

**Anthropic Pattern:** Each agent has explicit, limited tool access for security and performance.

| Agent                | Tool Access                                    | Rationale                                                        |
| -------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| **Planner**          | ALL tools (awareness only)                     | Needs to know all capabilities for planning, but doesn't execute |
| **Conversation**     | NONE (pure LLM)                                | Just conversational responses, no actions                        |
| **File Specialist**  | search-files, read-file, write-file, move-file | Safe, validated file operations only                             |
| **Shell Specialist** | execute-command                                | Unrestricted shell access for power users                        |
| **Web Specialist**   | web-search, web-fetch                          | Internet research and content retrieval                          |
| **Code Specialist**  | execute-python, execute-javascript             | Sandboxed code execution                                         |
| **Coordinator**      | NONE (pure orchestration)                      | Lightweight routing, no LLM or tools                             |

**Enforcement:**

- Specialists cannot access tools outside their defined scope
- Planner can reference all tools but cannot execute them
- Each specialist's system prompt explicitly lists available tools

---

## Planner Output Format

The Planner must output structured JSON for tasks:

```json
{
  "type": "conversation" | "task",
  "clarification_needed": false,
  "questions": [],
  "tasks": [
    {
      "id": "task_1",
      "specialist": "file" | "shell" | "web" | "code",
      "description": "Clear, focused task description",
      "context": "Any additional context needed",
      "depends_on": []
    }
  ],
  "execution_mode": "parallel" | "sequential"
}
```

### Examples

**Conversational Request:**

```json
{
  "type": "conversation",
  "response": "Hello! I'm ChatDock, your AI assistant..."
}
```

**Simple Task:**

```json
{
  "type": "task",
  "tasks": [
    {
      "id": "task_1",
      "specialist": "file",
      "description": "Search for willo.txt and return its path",
      "context": "User is looking for a specific file",
      "depends_on": []
    }
  ],
  "execution_mode": "sequential"
}
```

**Complex Task (Parallel):**

```json
{
  "type": "task",
  "tasks": [
    {
      "id": "task_1",
      "specialist": "web",
      "description": "Search for React 19 new features",
      "context": "User wants to learn about latest React updates",
      "depends_on": []
    },
    {
      "id": "task_2",
      "specialist": "web",
      "description": "Search for React 19 performance improvements",
      "context": "User wants performance-specific information",
      "depends_on": []
    },
    {
      "id": "task_3",
      "specialist": "file",
      "description": "Search for React-related files in project",
      "context": "Check current project's React usage",
      "depends_on": []
    }
  ],
  "execution_mode": "parallel"
}
```

**Task with Dependencies:**

```json
{
  "type": "task",
  "tasks": [
    {
      "id": "task_1",
      "specialist": "file",
      "description": "Search for package.json",
      "context": "Need to find project dependencies",
      "depends_on": []
    },
    {
      "id": "task_2",
      "specialist": "file",
      "description": "Read package.json and extract dependencies",
      "context": "Analyze project dependencies",
      "depends_on": ["task_1"]
    },
    {
      "id": "task_3",
      "specialist": "shell",
      "description": "Run npm outdated",
      "context": "Check for outdated packages",
      "depends_on": ["task_2"]
    }
  ],
  "execution_mode": "sequential"
}
```

---

## Implementation Phases

### Phase 0: Foundation (Days 1-2) ✅ COMPLETE

**Goal:** Set up agent markdown files and basic infrastructure

**Tasks:**

1. ✅ Create `/brain/agents/PLANNER.md`
   - System prompt for intent analysis
   - Task breakdown rules
   - JSON output format
   - Clarification question guidelines

2. ✅ Create `/brain/agents/CONVERSATION.md`
   - Conversational system prompt
   - No tool access
   - Personality guidelines

3. ✅ Create `/brain/agents/FILE_SPECIALIST.md`
   - File operation expert prompt
   - Available tools list
   - Safety rules
   - Examples

4. ✅ Create `/brain/agents/SHELL_SPECIALIST.md`
   - Command execution expert prompt
   - Available tools
   - Safety warnings

5. ✅ Create `/brain/agents/WEB_SPECIALIST.md`
   - Web research expert prompt
   - Search strategies
   - Content extraction guidelines

6. ✅ Create `/brain/agents/CODE_SPECIALIST.md`
   - Code execution expert prompt
   - Supported languages
   - Sandboxing rules

**Success Criteria:**

- ✅ All 6 agent markdown files created
- ✅ Each has clear role definition, tools, and examples

---

### Phase 1: Planner Implementation (Days 3-5) ✅ COMPLETE

**Goal:** Build the Planner agent with intent analysis and task breakdown

**Tasks:**

1. ✅ Create `/src/server/orchestrator/planner.js`
   - Load PLANNER.md system prompt
   - Implement LLM call with conversation history
   - Parse JSON output
   - Validate task structure

2. ✅ Create `/src/server/orchestrator/conversation-handler.js`
   - Load CONVERSATION.md system prompt
   - Handle pure conversational requests
   - Maintain continuity context (last 2-3 exchanges)

3. ✅ Add Planner tests
   - Test conversational detection
   - Test task breakdown
   - Test clarification questions (deferred to Phase 6)
   - Test JSON parsing

**Success Criteria:**

- ✅ Planner correctly identifies conversation vs task
- ✅ Planner outputs valid JSON for tasks
- ⏸️ Planner can ask clarifying questions (deferred to Phase 6)
- ✅ 100% test coverage (38/38 tests passing for planner, 26/26 for conversation handler)

---

### Phase 2: Coordinator Core (Days 6-8) ✅ COMPLETE

**Goal:** Build orchestration layer that spawns specialists

**Tasks:**

1. ✅ Create `/src/server/orchestrator/coordinator.js`
   - Parse Planner tool calls
   - Dependency graph resolution
   - **Parallel execution:** Use Promise.all to spawn independent specialists simultaneously
   - **Sequential execution:** Awaited chain for tasks with dependencies
   - Result aggregation
   - **Anthropic Pattern:** Launch multiple specialists in single execution for parallel performance

2. ✅ Create `/src/server/orchestrator/task-channel.js`
   - Shared results storage (Eigent pattern)
   - Task state tracking (pending, running, completed, failed)
   - Cross-task result sharing
   - Store specialist outputs for dependent tasks

3. ✅ Create `/src/server/orchestrator/specialist-factory.js`
   - Load specialist markdown prompts
   - **Stateless spawning:** Each specialist invocation is independent
   - **Fresh context only:** No conversation history, just task description
   - **Single report:** Specialist returns complete result and terminates
   - Handle specialist responses and errors

**Success Criteria:**

- ✅ Coordinator can parse Planner tool calls
- ✅ Coordinator handles both parallel and sequential execution
- ✅ Task channel stores and retrieves results
- ✅ Specialist factory loads correct prompts

---

### Phase 3: First Specialist (File) (Days 9-11)

**Goal:** Implement File Specialist with shell-based tools

**Tasks:**

1. Create `/src/server/orchestrator/specialists/file-specialist.js`
   - Load FILE_SPECIALIST.md
   - Fresh context only (no conversation history)
   - Tool execution wrapper
   - **Read-before-write tracker:** Maintain Set of read file paths in current task
   - **Validation:** write-file and move-file check tracker before executing
   - **Stateless:** Tracker resets between specialist invocations

2. Convert file tools to shell-based
   - Update search-files.js to use `find` command
   - Update read-file.js to use `cat` command
   - Update write-file.js to use shell redirection
   - Update move-file.js to use `mv` command

3. Add a open-file tool and a multi-file tool

4. Integration test: "open willo.txt"
   - Planner breaks down into: search → open
   - Coordinator spawns File Specialist twice
   - Verify results aggregation

**Success Criteria:**

- File Specialist executes with fresh context
- Shell-based file operations are 2-5x faster
- End-to-end test passes (search → read workflow)

---

### Phase 4: Parallel Execution (Days 12-13)

**Goal:** Validate parallel specialist execution

**Tasks:**

1. Implement parallel task execution in Coordinator
   - Use Promise.all for independent tasks
   - Collect results in task channel
   - Handle partial failures

2. Test parallel execution
   - Run 3 independent file searches simultaneously
   - Verify 3x speedup vs sequential
   - Confirm no CPU pressure (I/O-bound)

3. Add failure handling
   - Retry logic (up to 2 retries)
   - Graceful degradation (continue on non-critical failures)
   - Error aggregation in results

**Success Criteria:**

- Parallel execution shows 2-3x speedup for I/O tasks
- Failed tasks retry automatically
- Coordinator aggregates partial results

---

### Phase 5: Additional Specialists (Days 14-17)

**Goal:** Implement remaining specialists

**Tasks:**

1. **Shell Specialist (Days 14-15)**
   - Create `/src/server/orchestrator/specialists/shell-specialist.js`
   - Implement execute-command tool (unrestricted shell access)
   - Add safety warnings in prompt
   - Test: git operations, npm install, build scripts

2. **Web Specialist (Day 16)**
   - Create `/src/server/orchestrator/specialists/web-specialist.js`
   - Connect to existing web-search and web-fetch tools
   - Test: search for information, fetch webpage content

3. **Code Specialist (Day 17)**
   - Create `/src/server/orchestrator/specialists/code-specialist.js`
   - Implement execute-python and execute-javascript tools
   - Sandboxing with timeout limits
   - Test: simple calculations, data processing

**Success Criteria:**

- All 5 specialists functional
- Each specialist has focused toolset
- Integration tests pass for each specialist

---

### Phase 6: Clarification Flow (Days 18-19)

**Goal:** Implement Planner's clarification questions

**Tasks:**

1. Add clarification support to Planner
   - Detect underspecified requests
   - Generate clarifying questions
   - Store intermediate state

2. Update chat API to handle clarification
   - Return questions to user
   - Accept user's answers
   - Feed answers back to Planner

3. Test clarification scenarios
   - Ambiguous request: "create a report"
   - Missing context: "optimize the code"
   - Multiple approaches: "add authentication"

**Success Criteria:**

- Planner asks relevant clarifying questions
- User responses feed back correctly
- Task breakdown uses clarification context

---

### Phase 7: Integration & Polish (Days 20-21)

**Goal:** Full system integration and optimization

**Tasks:**

1. Connect orchestrator to main server
   - Update `/src/server/server.js` to use Planner → Coordinator flow
   - Replace direct LLM calls with orchestrator
   - Maintain backward compatibility for simple requests

2. End-to-end testing
   - Conversational: "Hello, how are you?"
   - Simple task: "find config files"
   - Complex task: "search for React docs, analyze project dependencies, and create summary"
   - Parallel task: "search 3 different topics simultaneously"

3. Performance benchmarking
   - Measure Planner response time
   - Measure specialist spawn time
   - Verify parallel speedup (2-3x for I/O tasks)
   - Confirm shell operations are 2-5x faster than Node.js fs

4. Documentation
   - Update README with architecture overview
   - Add troubleshooting guide
   - Document specialist capabilities

**Success Criteria:**

- All test scenarios pass
- Performance meets targets (shell 2-5x faster, parallel 2-3x faster)
- System handles conversation + tasks seamlessly

---

## Technical Decisions

### Model Strategy

- **Single Model:** User selects one model (e.g., Qwen 2.5:7b, Qwen 2.5:14b, etc.)
- **Same model for all agents:** Planner, Conversation, and all Specialists use the user's chosen model
- **Rationale:** Fresh context strategy means even smaller models perform well as Specialists. The Planner gets full context for complex reasoning, while Specialists get focused context for better performance with the same model.

### Execution Strategy

- **Parallel:** Default for independent tasks (I/O-bound = no CPU pressure)
- **Sequential:** Only when tasks have dependencies
- **Mixed:** Coordinator can handle both in same request

### Tool Access

- **Planner:** Aware of all tools (for planning), but doesn't execute
- **Specialists:** Limited toolset per role (security + performance)
- **Coordinator:** No tools (pure orchestration)

### State Management

- **Task Channel:** Shared results storage (Eigent pattern)
- **In-memory:** Session-scoped (reset between sessions)
- **Persistent:** None (stateless per-request)
- **Specialist State:** Completely stateless - each invocation is independent
  - Read-before-write tracker: Task-scoped only
  - No cross-task state persistence
  - No conversation history awareness
  - **Anthropic Pattern:** "Each agent invocation is stateless"

### Error Handling

- **Retry:** Up to 2 retries for failed specialists
- **Escalation:** Return partial results + error details
- **Graceful:** Continue on non-critical failures
- **User-facing:** Clear error messages with recovery suggestions

### Task Tracking (TodoWrite Pattern)

**Anthropic's Strict Rules:**

1. **Exactly ONE in_progress at a time**
   - Not less, not more - always exactly one
   - Complete current task before starting next

2. **Mark completed IMMEDIATELY**
   - Don't batch multiple completions
   - Update status as soon as task finishes

3. **Two required forms:**
   - `content`: Imperative ("Fix authentication bug")
   - `activeForm`: Present continuous ("Fixing authentication bug")

4. **Completion criteria:**
   - ONLY mark completed when FULLY accomplished
   - Keep as in_progress if errors, blockers, or partial work
   - Create new task for blockers instead of marking failed task complete

5. **Never mark complete if:**
   - Tests are failing
   - Implementation is partial
   - Unresolved errors exist
   - Required files/dependencies not found

**Implementation:**

- Coordinator tracks current in_progress task
- Updates UI in real-time as tasks progress
- Validates exactly one in_progress before spawning specialists

---

## Success Metrics

### MVP (Must Have)

- ✅ Planner correctly routes conversation vs task
- ✅ File Specialist works with shell commands (2-5x faster)
- ✅ Coordinator handles parallel execution
- ✅ End-to-end test: complex multi-step task completes successfully
- ✅ Fresh context pattern validated (smaller model = better results)

### Should Have

- ✅ All 5 specialists implemented and tested
- ✅ Clarification flow working
- ✅ Parallel execution shows 2-3x speedup
- ✅ Failure handling with retry logic
- ✅ 80%+ test coverage

### Nice to Have

- Specialist performance monitoring
- Task execution analytics
- User preference learning (remember clarifications)
- Specialist warm-up pool (reduce spawn latency)
- Streaming results (show progress during execution)

---

## Risk Mitigation

| Risk                                     | Mitigation                                                           |
| ---------------------------------------- | -------------------------------------------------------------------- |
| Planner produces invalid JSON            | Strict schema validation + retry with error feedback                 |
| Specialists timeout                      | Configurable timeout per specialist type + retry logic               |
| Parallel execution overwhelms system     | Limit concurrent specialists (default: 3) + queue                    |
| Fresh context loses important info       | Coordinator includes task dependencies in specialist context         |
| Shell commands fail silently             | Capture stderr + exit codes, surface to user                         |
| Model quality degrades with small models | Benchmark against current single-agent, validate fresh context gains |
| Coordinator becomes bottleneck           | Keep stateless, use async/await, profile and optimize                |

---

## Future Enhancements

### Phase 8+ (Post-MVP)

1. **Memory Layer**
   - Store user preferences from clarifications
   - Learn common task patterns
   - Personalize specialist behavior

2. **Streaming Responses**
   - Show Planner's thinking
   - Stream specialist progress
   - Real-time result updates

3. **Specialist Pool**
   - Pre-warm specialists on app start
   - Reduce spawn latency (0.5s → 0.05s)
   - Connection pooling for LLM calls

4. **Advanced Coordination**
   - Dynamic task splitting (break large tasks into smaller)
   - Load balancing (distribute across available specialists)
   - Smart retries (change specialist on repeated failure)

5. **User Control**
   - Manual specialist selection ("use File Specialist for this")
   - Execution plan approval (show plan, wait for user confirmation)
   - Specialist capability extension (user adds custom tools)

---

## Appendix: Anthropic Patterns Used

1. **AskUserQuestion → TodoWrite → Task Tool Flow**
   - Planner clarifies → breaks down → spawns specialists

2. **Context Hiding**
   - Specialists receive fresh context only
   - Prevents distraction from parent conversation

3. **Specialized Agents**
   - Each specialist has focused role + limited tools
   - Bash agent = Shell Specialist
   - general-purpose agent = multiple specialists

4. **Parallel Execution**
   - Multiple independent tool calls in single message
   - Coordinator uses Promise.all

5. **Simple Routing**
   - Function calling, not ML classification
   - Deterministic, debuggable

6. **Conversation vs Tool Use**
   - Explicit handling of non-task requests
   - Conversation Specialist with no tools

This plan is based on production-proven patterns from Anthropic's Cowork system, adapted for local LLM deployment with small models.
