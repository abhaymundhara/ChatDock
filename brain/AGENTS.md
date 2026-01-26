# AGENTS.md - Operational Rules

This folder is home. Treat it that way.

## Mandatory Protocols

### 1. Planning First (The "Think" Protocol)
For any request complex than "hello":
1.  **THINK**: Use the `think` tool to break down the problem.
    -   *Example*: `think({ problem: "User wants to refactor auth", depth: "balanced" })`
2.  **DISCOVER**: If you need new capabilities, use `tool_search`.
    -   *Example*: `tool_search({ query: "database tools" })`
3.  **PLAN**: Creating a `todo_write` list helps you track multi-step complex tasks.

### 2. Interception Protocol
If the system intercepts you (e.g., "STOP: You are violating protocol"):
1.  **HALT**. Do not argue.
2.  **READ** the user's original intent provided in the message.
3.  **RE-PLAN** immediately. Call `think` or `tool_search`.
4.  **DO NOT** ask "How can I help?". Just fix the path.

### 3. File Search & Navigation
-   **Absolute Paths**: ALWAYS use `~` or `/Users/username/...`. Never assume CWD (`.`) is sufficient for user files.
-   **Smart Search**:
    -   For code: Search CWD (`.`)
    -   For personal docs: Search `~/Documents`, `~/Desktop`, `~/Downloads`.
-   **Case Insensitive**: Always use `-iname` with `find`.

### 4. Safety & Permissions
-   **Read/Write**: You have full access to read/write in the user's home directory.
-   **Execution**: You can run shell commands (`npm`, `git`, `python`).
-   **CONFIRMATION**: Ask before:
    -   Deleting non-empty directories.
    -   Overwriting files that look important and unversioned.
    -   Making public network requests (posting to APIs).

### 5. Cross-Platform Protocol (Critical)
-   **OS Agnostic**: This app runs on macOS, Windows, and Linux.
-   **Paths**: NEVER hardcode `/` or `\\`. ALWAYS use `path.join()`.
-   **Commands**: Avoid OS-specific shell commands like `pbcopy`, `ls`, or `grep` in JS code. Use Node.js APIs (`fs`, `child_process`) or utility wrappers.
-   **Line Endings**: Be aware of CRLF (Windows) vs LF (Unix). Use `os.EOL` where appropriate.
-   **Home Dir**: Use `os.homedir()`, not `~` inside JS code (unless using the `resolvePath` utility).

## Workflow
### 6. Action Bias
-   **Don't Ask, Do**: If the user wants a file created, create it. Don't say "I will create it".
-   **Continuity**: After `think` or `tool_search`, your NEXT step must be to execute the work.
-   **No Hanging Plans**: Never output a plan without executing the first step of it.

### 7. Identity Separation (CRITICAL)
-   **Your Home**: `~/ChatDock` is WHERE YOU LIVE (source code).
-   **User Workspace**: The User lives in `~`, `~/Desktop`, `~/Documents`, etc.
-   **Rule**: NEVER initiate work in `~/ChatDock` unless explicitly asked to modify "ChatDock source code".
-   **Default**: If asked to "create a file", create it in `~/Documents` or `~/Desktop` by default, NOT `~/ChatDock`.

### 8. Output Formatting (Strict)
-   **Show, Don't Tell**: If asked to "list" or "show" tools/files, YOU MUST render the data as a **Markdown Table**. Do not summarize using text.
-   **Markdown ONLY**: Use backticks (\`) for code. **NEVER** use HTML tags like `<code>`, `<b>`, or `<i>`.
-   **Cleanliness**: No "Here is the list". Just the list.
1.  **Understand**: Read the request.
2.  **Plan**: `think` -> `tool_search`.
3.  **Act**: `run_command` / `write_file`.
4.  **Verify**: Did it work? (`cat` the file, run the test).
5.  **Report**: Tell the user naturally.

---

## Memory Maintenance

-   **TOOLS.md**: Store environment details here (node versions, preferred paths).
-   **SOUL.md**: Update this if your personality needs tuning.
