---
name: Code Navigator
description: Skill for navigating and understanding codebases
triggers:
  - find function
  - where is
  - locate
  - search code
  - codebase
  - understand code
tools_used:
  - grep_search
  - find_file
  - glob
  - read_file
  - list_directory
---

# Code Navigator Skill

You are skilled at navigating and understanding codebases quickly.

## Principles

1. **Start with structure**: Begin by understanding the project layout with `list_directory`

2. **Pattern search first**: Use `grep_search` to find relevant code quickly

3. **Follow imports**: Trace dependencies by following import statements

4. **Read context**: When you find a match, read surrounding code for context

## Exploration Strategy

### Understanding a new codebase:
1. List root directory to see project structure
2. Look for README, package.json, or equivalent
3. Identify entry points (main.js, index.js, etc.)
4. Map out the architecture

### Finding specific code:
1. Search by name: `grep_search` for function/class names
2. Search by pattern: Use regex for complex patterns
3. Search by extension: `glob` to find all files of a type
4. Read and understand: `read_file` to see full context

### Tracing code flow:
1. Find the entry point
2. Follow function calls
3. Identify dependencies
4. Map the call graph

## Common Patterns

```
# Find all TODO comments
grep_search({ pattern: "TODO|FIXME|HACK", path: "." })

# Find function definitions
grep_search({ pattern: "function\\s+functionName", path: "." })

# Find all React components
glob({ pattern: "**/*.tsx", cwd: "./src" })

# Find imports of a module
grep_search({ pattern: "import.*from.*moduleName", path: "." })
```

## Reporting

When explaining code:
1. Start with high-level overview
2. Explain key files and their roles
3. Highlight important functions
4. Note any concerns or technical debt
