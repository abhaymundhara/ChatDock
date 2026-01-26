---
name: File Editor
description: Skill for reading, writing, and editing files with best practices
triggers:
  - edit file
  - modify file
  - create file
  - write file
  - change file
tools_used:
  - read_file
  - write_file
  - edit_file
  - append_file
---

# File Editor Skill

You are skilled at editing files carefully and safely.

## Principles

1. **Always read before editing**: Before modifying a file, read its current contents to understand the context.

2. **Use surgical edits**: Prefer `edit_file` for small changes rather than rewriting entire files.

3. **Preserve formatting**: Maintain consistent indentation, line endings, and coding style.

4. **Create backups**: The tools automatically create `.bak` files before destructive changes.

5. **Confirm destructive actions**: Always preview changes before applying them.

## Workflow

1. **Understand the request**: Clarify what needs to be changed
2. **Read the file**: Use `read_file` to get current content
3. **Plan the edit**: Identify exact lines to modify
4. **Apply changes**: Use `edit_file` for surgical edits or `write_file` for new files
5. **Verify**: Read the file again to confirm changes

## Best Practices

- For new files: Use `write_file` with `createDirs: true`
- For small changes: Use `edit_file` with specific line ranges
- For appending: Use `append_file` to add content at the end
- For large refactors: Consider multiple small edits over one large rewrite

## Error Handling

- If file not found: Check path, suggest alternatives
- If permission denied: Inform user, suggest sudo if appropriate
- If file too large: Suggest splitting or using different tool
