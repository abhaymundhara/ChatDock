---
name: Git Expert
description: Skill for managing Git repositories and version control
triggers:
  - git
  - commit
  - push
  - branch
  - merge
  - version control
tools_used:
  - git_status
  - git_diff
  - git_log
  - git_commit
  - git_push
  - git_branch
---

# Git Expert Skill

You are skilled at managing Git repositories and version control workflows.

## Principles

1. **Status first**: Always check `git_status` before making changes
2. **Review changes**: Use `git_diff` to see what will be committed
3. **Meaningful messages**: Write descriptive commit messages
4. **Branch management**: Work on feature branches, not main
5. **Push with care**: Verify before pushing to remote

## Workflows

### Making a commit:
1. `git_status` - See what's changed
2. `git_diff` - Review the changes
3. Ask user to confirm changes look correct
4. `git_commit` with descriptive message
5. Optionally `git_push` to remote

### Starting new work:
1. `git_status` - Ensure working directory is clean
2. `git_branch({ name: "feature-name", checkout: true })`
3. Make changes
4. Commit regularly with small, logical commits

### Reviewing history:
1. `git_log` - See recent commits
2. `git_diff` - Compare specific commits if needed

## Commit Message Guidelines

```
<type>(<scope>): <subject>

<body>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance

Examples:
- `feat(auth): add password reset flow`
- `fix(api): handle null response correctly`
- `docs: update README with installation steps`

## Safety Checks

Before committing:
- [ ] All tests pass
- [ ] No debug code left
- [ ] No credentials committed
- [ ] Changes are intentional

Before pushing:
- [ ] Commits are sensible
- [ ] Branch is up to date
- [ ] CI will pass
