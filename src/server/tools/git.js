/**
 * Git Tools
 * Tools for interacting with Git repositories
 */

const { execSync, execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

/**
 * Check if a directory is a git repository
 */
function isGitRepo(dir) {
  try {
    execSync('git rev-parse --git-dir', { cwd: dir, encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * git_status - Show repository status
 */
const git_status = {
  name: 'git_status',
  description: 'Shows the current Git repository status including branch, staged changes, and modified files.',
  parameters: {
    type: 'object',
    properties: {
      cwd: {
        type: 'string',
        description: 'Path to the Git repository (default: current directory)'
      }
    }
  },
  keywords: ['git', 'status', 'changes', 'modified', 'staged'],
  
  run: async ({ cwd = '.' }) => {
    const dir = path.resolve(cwd);
    
    if (!isGitRepo(dir)) {
      throw new Error(`Not a git repository: ${dir}`);
    }
    
    try {
      // Get branch name
      const branch = execSync('git branch --show-current', { cwd: dir, encoding: 'utf-8' }).trim();
      
      // Get status
      const status = execSync('git status --porcelain', { cwd: dir, encoding: 'utf-8' });
      
      const files = {
        staged: [],
        modified: [],
        untracked: []
      };
      
      for (const line of status.split('\n').filter(Boolean)) {
        const code = line.slice(0, 2);
        const file = line.slice(3);
        
        if (code[0] !== ' ' && code[0] !== '?') {
          files.staged.push({ status: code[0], file });
        }
        if (code[1] !== ' ' && code[1] !== '?') {
          files.modified.push({ status: code[1], file });
        }
        if (code === '??') {
          files.untracked.push(file);
        }
      }
      
      // Check if there are unpushed commits
      let unpushed = 0;
      try {
        const ahead = execSync('git rev-list --count @{u}..HEAD 2>/dev/null', { cwd: dir, encoding: 'utf-8' });
        unpushed = parseInt(ahead.trim(), 10) || 0;
      } catch {}
      
      return {
        branch,
        clean: status.trim() === '',
        staged: files.staged,
        modified: files.modified,
        untracked: files.untracked,
        unpushedCommits: unpushed
      };
    } catch (error) {
      throw new Error(`Git status failed: ${error.message}`);
    }
  }
};

/**
 * git_diff - Show file differences
 */
const git_diff = {
  name: 'git_diff',
  description: 'Shows the diff of changes in the repository.',
  parameters: {
    type: 'object',
    properties: {
      cwd: {
        type: 'string',
        description: 'Path to the Git repository'
      },
      staged: {
        type: 'boolean',
        description: 'Show staged changes (default: false, shows unstaged)',
        default: false
      },
      file: {
        type: 'string',
        description: 'Show diff for a specific file only'
      }
    }
  },
  keywords: ['git', 'diff', 'changes', 'compare'],
  
  run: async ({ cwd = '.', staged = false, file }) => {
    const dir = path.resolve(cwd);
    
    if (!isGitRepo(dir)) {
      throw new Error(`Not a git repository: ${dir}`);
    }
    
    try {
      let command = 'git diff';
      if (staged) {
        command += ' --staged';
      }
      if (file) {
        command += ` -- "${file}"`;
      }
      
      const diff = execSync(command, { cwd: dir, encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 });
      
      // Truncate if too long
      const maxLength = 50000;
      const truncated = diff.length > maxLength;
      
      return {
        staged,
        file: file || null,
        hasDiff: diff.trim().length > 0,
        diff: truncated ? diff.slice(0, maxLength) + '\n\n[...diff truncated]' : diff,
        truncated
      };
    } catch (error) {
      throw new Error(`Git diff failed: ${error.message}`);
    }
  }
};

/**
 * git_log - Show commit history
 */
const git_log = {
  name: 'git_log',
  description: 'Shows the commit history of the repository.',
  parameters: {
    type: 'object',
    properties: {
      cwd: {
        type: 'string',
        description: 'Path to the Git repository'
      },
      count: {
        type: 'number',
        description: 'Number of commits to show (default: 10)',
        default: 10
      },
      oneline: {
        type: 'boolean',
        description: 'Show one line per commit (default: true)',
        default: true
      }
    }
  },
  keywords: ['git', 'log', 'history', 'commits'],
  
  run: async ({ cwd = '.', count = 10, oneline = true }) => {
    const dir = path.resolve(cwd);
    
    if (!isGitRepo(dir)) {
      throw new Error(`Not a git repository: ${dir}`);
    }
    
    try {
      const format = oneline
        ? '%h|%s|%an|%ar'
        : '%H%n%s%n%an <%ae>%n%ad%n%b%n---';

      const log = execFileSync(
        'git',
        ['log', '-n', String(count), `--format=${format}`],
        { cwd: dir, encoding: 'utf-8' }
      );
      
      if (oneline) {
        const commits = log.split('\n').filter(Boolean).map(line => {
          const [hash, message, author, date] = line.split('|');
          return { hash, message, author, date };
        });
        
        return { count: commits.length, commits };
      }
      
      return { log };
    } catch (error) {
      throw new Error(`Git log failed: ${error.message}`);
    }
  }
};

/**
 * git_commit - Commit changes
 */
const git_commit = {
  name: 'git_commit',
  description: 'Stages all changes and creates a commit with the provided message.',
  parameters: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Commit message'
      },
      cwd: {
        type: 'string',
        description: 'Path to the Git repository'
      },
      addAll: {
        type: 'boolean',
        description: 'Stage all changes before committing (default: true)',
        default: true
      }
    },
    required: ['message']
  },
  requiresConfirmation: true,
  keywords: ['git', 'commit', 'save', 'snapshot'],
  
  run: async ({ message, cwd = '.', addAll = true }) => {
    const dir = path.resolve(cwd);
    
    if (!isGitRepo(dir)) {
      throw new Error(`Not a git repository: ${dir}`);
    }
    
    try {
      if (addAll) {
        execSync('git add -A', { cwd: dir, encoding: 'utf-8' });
      }
      
      // Check if there's anything to commit
      const status = execSync('git status --porcelain', { cwd: dir, encoding: 'utf-8' });
      if (!status.trim() && addAll) {
        return { success: false, message: 'Nothing to commit' };
      }
      
      const result = execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { 
        cwd: dir, 
        encoding: 'utf-8' 
      });
      
      // Get the commit hash
      const hash = execSync('git rev-parse --short HEAD', { cwd: dir, encoding: 'utf-8' }).trim();
      
      return {
        success: true,
        hash,
        message,
        output: result.trim()
      };
    } catch (error) {
      throw new Error(`Git commit failed: ${error.message}`);
    }
  }
};

/**
 * git_push - Push commits to remote
 */
const git_push = {
  name: 'git_push',
  description: 'Pushes commits to the remote repository.',
  parameters: {
    type: 'object',
    properties: {
      cwd: {
        type: 'string',
        description: 'Path to the Git repository'
      },
      remote: {
        type: 'string',
        description: 'Remote name (default: origin)',
        default: 'origin'
      },
      branch: {
        type: 'string',
        description: 'Branch to push (default: current branch)'
      }
    }
  },
  requiresConfirmation: true,
  keywords: ['git', 'push', 'upload', 'remote'],
  
  run: async ({ cwd = '.', remote = 'origin', branch }) => {
    const dir = path.resolve(cwd);
    
    if (!isGitRepo(dir)) {
      throw new Error(`Not a git repository: ${dir}`);
    }
    
    try {
      const currentBranch = branch || execSync('git branch --show-current', { cwd: dir, encoding: 'utf-8' }).trim();
      
      const result = execSync(`git push ${remote} ${currentBranch}`, { 
        cwd: dir, 
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      return {
        success: true,
        remote,
        branch: currentBranch,
        output: result.trim()
      };
    } catch (error) {
      throw new Error(`Git push failed: ${error.message}`);
    }
  }
};

/**
 * git_branch - List or create branches
 */
const git_branch = {
  name: 'git_branch',
  description: 'Lists branches or creates a new branch.',
  parameters: {
    type: 'object',
    properties: {
      cwd: {
        type: 'string',
        description: 'Path to the Git repository'
      },
      name: {
        type: 'string',
        description: 'Name of new branch to create (optional)'
      },
      checkout: {
        type: 'boolean',
        description: 'Switch to the new branch after creating (default: true)',
        default: true
      }
    }
  },
  keywords: ['git', 'branch', 'create', 'switch'],
  
  run: async ({ cwd = '.', name, checkout = true }) => {
    const dir = path.resolve(cwd);
    
    if (!isGitRepo(dir)) {
      throw new Error(`Not a git repository: ${dir}`);
    }
    
    try {
      if (name) {
        // Create new branch
        if (checkout) {
          execSync(`git checkout -b ${name}`, { cwd: dir, encoding: 'utf-8' });
        } else {
          execSync(`git branch ${name}`, { cwd: dir, encoding: 'utf-8' });
        }
        
        return {
          created: name,
          checkedOut: checkout
        };
      }
      
      // List branches
      const branches = execSync('git branch -a', { cwd: dir, encoding: 'utf-8' });
      const current = execSync('git branch --show-current', { cwd: dir, encoding: 'utf-8' }).trim();
      
      return {
        current,
        branches: branches.split('\n').filter(Boolean).map(b => b.trim().replace(/^\* /, ''))
      };
    } catch (error) {
      throw new Error(`Git branch failed: ${error.message}`);
    }
  }
};

module.exports = {
  git_status,
  git_diff,
  git_log,
  git_commit,
  git_push,
  git_branch
};
