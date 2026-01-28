# TOOLS.md - Local Notes & Environment

This file is for **your** specifics — the stuff that's unique to this machine and user.

## CRITICAL WORKSPACE RULES

**NEVER work in your installation directory.** You are installed somewhere on the system - that is NOT your workspace.

**ALWAYS work in the user's home directory (`~`) or subdirectories within it.**

Your workspace is the USER's space, not your installation location.

## Path Guidelines (CRITICAL - Cross-Platform)

When user asks about their files, **ALWAYS use paths starting with `~`**:

- ✅ **Desktop**: `~/Desktop`
- ✅ **Documents**: `~/Documents`
- ✅ **Downloads**: `~/Downloads`
- ✅ **Pictures**: `~/Pictures`
- ✅ **Home**: `~`

**NEVER use these formats:**

- ❌ `/Desktop` - This does NOT exist (root has no Desktop)
- ❌ `/Documents` - This does NOT exist (root has no Documents)
- ❌ `.` or `./` - This is YOUR installation directory, NOT the user's workspace
- ❌ Relative paths without `~` - You'll end up in the wrong place

**Where different paths point:**

- `/` = System root (macOS: /Applications, /Library | Linux: /etc, /usr | Windows: C:\)
- `~` = User's home (macOS: /Users/username | Linux: /home/username | Windows: C:\Users\username)
- `.` = Current directory = **ChatDock installation** = ❌ **OFF LIMITS**

**Correct Examples:**

- User says "list my desktop" → `list_directory({ dir_path: "~/Desktop" })`
- User says "read my file.txt" → `read_file({ file_path: "~/Documents/file.txt" })`
- User says "create a folder" → `create_directory({ dir_path: "~/MyFolder" })`

**Wrong Examples:**

- ❌ `list_directory({ dir_path: "/Desktop" })` - Does not exist!
- ❌ `list_directory({ dir_path: "." })` - That's ChatDock installation!
- ❌ `read_file({ file_path: "./file.txt" })` - Wrong workspace!

## User Preferences

_(Add things here as you learn them)_

- [ ] Preferred Language: (e.g. TypeScript vs JS)
- [ ] Test Runner: (e.g. Jest vs Vitest)
- [ ] Package Manager: (e.g. npm vs pnpm)

## Local Aliases

_(Map complex paths to simple names if needed)_

- **Brain**: `~/ChatDock/brain`

---

## AVAILABLE TOOLS

### Memory Tools (Long-term Knowledge Storage)

**create_memory** - Store long-term knowledge using entity-observation knowledge graph

- **Parameters**: `name` (entity name), `entity_type` (e.g., "person", "preference", "fact"), `observations` (array of strings)
- **Example**: `{name: "John_Smith", entity_type: "person", observations: ["Works at Acme Corp", "Speaks Spanish"]}`
- **Guardrails**: Auto-merges duplicate observations, timestamps all entries, validates required fields
- **Storage**: `/memory/long-term/memories.jsonl` (JSONL format, one entity per line)

**recall** - Retrieve specific memory by entity name

- **Parameters**: `name` (entity name), `include_daily_logs` (boolean, default: true)
- **Example**: `{name: "John_Smith"}`
- **Fallback**: Searches last 7 days of daily logs if not found in long-term storage
- **Returns**: Full entity with all observations or matched daily log excerpts

**search_memories** - Keyword search across all memories with relevance scoring

- **Parameters**: `query` (search string), `entity_type` (optional filter), `limit` (default: 10)
- **Scoring**: Exact name match=100, partial name=50, type=30, each observation=10
- **Example**: `{query: "Spanish", entity_type: "person", limit: 5}`

**list_memories** - List all memories with optional filtering

- **Parameters**: `entity_type` (optional filter), `show_observations` (boolean, default: false), `limit` (default: 20)
- **Returns**: Type statistics (e.g., {person: 5, preference: 12}) + sorted list by most recent update
- **Token optimization**: Defaults to hiding observations to save tokens

### Web Tools (Search & Fetch)

**search_web** - DuckDuckGo web search (no API key required)

- **Parameters**: `query` (search string), `max_results` (default: 10)
- **Implementation**: HTML scraping via native Node.js https module
- **Guardrails**: 10s timeout, max 10 results, HTML entity decoding, filters DuckDuckGo internal links
- **Cross-platform**: Pure Node.js (works on macOS, Windows, Linux)
- **Example**: `{query: "latest Node.js features", max_results: 5}`

**fetch_webpage** - Fetch webpage content and convert to clean text

- **Parameters**: `url` (webpage URL)
- **Implementation**: Native http/https modules, HTML-to-text conversion
- **Guardrails**: 15s timeout, 30KB max page size, 10KB max output, truncation marker
- **Features**: Follows redirects, strips scripts/styles, converts to plain text
- **Example**: `{url: "https://example.com/article"}`

### System Tools (Screenshot & Clipboard)

**take_screenshot** - Cross-platform screenshot capture

- **Parameters**: `file_path` (optional, default: ~/Desktop/screenshot\_{timestamp}.png), `full_screen` (boolean, default: true)
- **Platform commands**:
  - macOS: `screencapture` (full screen) or `screencapture -i` (interactive selection)
  - Windows: PowerShell System.Drawing.Bitmap or SendKeys
  - Linux: `scrot` or `gnome-screenshot`
- **Returns**: file_path, size, platform, mode
- **Guardrails**: 30s timeout, verifies file created, creates parent directories
- **Example**: `{file_path: "~/Desktop/my_screenshot.png", full_screen: false}`

**read_clipboard** - Read text from system clipboard

- **Parameters**: None
- **Platform commands**:
  - macOS: `pbpaste`
  - Windows: `powershell Get-Clipboard`
  - Linux: `xclip -selection clipboard -o` or `xsel --clipboard --output`
- **Returns**: text, length, platform
- **Guardrails**: 5s timeout
- **Example**: `{}`

**write_clipboard** - Write text to system clipboard

- **Parameters**: `text` (string to copy)
- **Platform commands**:
  - macOS: `echo "text" | pbcopy`
  - Windows: `powershell Set-Clipboard`
  - Linux: `echo "text" | xclip -selection clipboard` or `xsel --clipboard --input`
- **Returns**: success message, length copied, platform
- **Guardrails**: 5s timeout, text-only (no binary)
- **Example**: `{text: "Hello, world!"}`

### Code Execution Tools (Sandboxed)

**execute_python** - Run Python code in sandboxed environment

- **Parameters**: `code` (Python code string), `timeout` (seconds, default: 10, max: 60)
- **Implementation**: Temp file execution via `python3` with timeout
- **Guardrails**: Max 60s timeout, 1MB output limit, temp file cleanup, kills on timeout
- **Returns**: stdout, stderr, timeout
- **Example**: `{code: "print(sum(range(100)))", timeout: 5}`

**execute_javascript** - Run Node.js code in sandboxed environment

- **Parameters**: `code` (JavaScript code string), `timeout` (seconds, default: 10, max: 60)
- **Implementation**: Temp file execution via `node` with timeout
- **Guardrails**: Max 60s timeout, 1MB output limit, temp file cleanup, kills on timeout
- **Returns**: stdout, stderr, timeout
- **Example**: `{code: "console.log([1,2,3].reduce((a,b)=>a+b))", timeout: 5}`

### Analysis Tools (Math & Data)

**calculate** - Safe mathematical calculations

- **Parameters**: `expression` (math expression string)
- **Supported**: Basic math (+, -, \*, /), Math library (sqrt, pow, sin, cos, tan, log, exp, floor, ceil, round, min, max), constants (PI, E)
- **Safety**: Function constructor with Math whitelist (no eval()), character validation
- **Returns**: result (number), formatted (locale string)
- **Example**: `{expression: "Math.sqrt(16) + Math.PI * 2"}`

**analyze_data** - Statistical analysis on numerical datasets

- **Parameters**: `data` (array of numbers), `operations` (optional array, default: all)
- **Operations**: mean, median, mode, stddev, min, max, sum, count
- **Guardrails**: Max 100,000 elements, validates all finite numbers
- **Returns**: Requested statistics as object
- **Example**: `{data: [1, 2, 3, 4, 5], operations: ["mean", "stddev"]}`

**generate_chart** - ASCII chart visualization

- **Parameters**: `data` (array of numbers), `labels` (optional array of strings), `chart_type` ("bar"/"line"/"histogram"), `title` (optional), `width` (default: 50, max: 100)
- **Chart types**:
  - **bar**: Horizontal bars with values
  - **line**: Dot-connected line graph with Y-axis
  - **histogram**: Distribution bins (10 bins)
- **Guardrails**: Max 1,000 elements, width 10-100 characters
- **Returns**: ASCII chart string, chart_type, data_points count
- **Example**: `{data: [10, 20, 15, 30], chart_type: "bar", title: "Sales Data"}`

---

_Add whatever helps you do your job. This is your cheat sheet._
