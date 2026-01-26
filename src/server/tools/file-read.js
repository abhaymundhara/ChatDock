/**
 * File System Tools - Read Operations
 * Native tools for reading and exploring the file system
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

/**
 * read_file - Reads the full content of a file
 */
const read_file = {
  name: 'read_file',
  description: 'Reads the full content of a file at the specified path. Returns the file content as a string.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative path to the file to read'
      },
      encoding: {
        type: 'string',
        description: 'Optional encoding (default: utf-8)',
        default: 'utf-8'
      }
    },
    required: ['path']
  },
  keywords: ['read', 'file', 'content', 'open', 'view', 'cat'],
  
  run: async ({ path: filePath, encoding = 'utf-8' }) => {
    const absolutePath = path.resolve(filePath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }
    
    const stats = fs.statSync(absolutePath);
    
    if (stats.isDirectory()) {
      throw new Error(`Path is a directory, not a file: ${absolutePath}`);
    }
    
    // Limit file size to 1MB for safety
    const MAX_SIZE = 1024 * 1024;
    if (stats.size > MAX_SIZE) {
      throw new Error(`File too large (${(stats.size / 1024 / 1024).toFixed(2)} MB). Maximum is 1 MB.`);
    }
    
    const content = fs.readFileSync(absolutePath, encoding);
    return content;
  }
};

/**
 * list_directory - Lists contents of a directory
 */
const list_directory = {
  name: 'list_directory',
  description: 'Lists all files and subdirectories in a given directory. Returns an array of objects with name, type, and size.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the directory to list'
      },
      showHidden: {
        type: 'boolean',
        description: 'Include hidden files (starting with .)',
        default: false
      },
      recursive: {
        type: 'boolean',
        description: 'List subdirectories recursively (max 2 levels)',
        default: false
      }
    },
    required: ['path']
  },
  keywords: ['list', 'directory', 'folder', 'ls', 'dir', 'contents'],
  
  run: async ({ path: dirPath, showHidden = false, recursive = false }) => {
    const absolutePath = path.resolve(dirPath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Directory not found: ${absolutePath}`);
    }
    
    const stats = fs.statSync(absolutePath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${absolutePath}`);
    }
    
    const listDir = (dir, depth = 0, maxDepth = 2) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      return entries
        .filter(entry => showHidden || !entry.name.startsWith('.'))
        .map(entry => {
          const fullPath = path.join(dir, entry.name);
          const isDir = entry.isDirectory();
          
          const item = {
            name: entry.name,
            type: isDir ? 'directory' : 'file',
            path: fullPath
          };
          
          if (!isDir) {
            try {
              item.size = fs.statSync(fullPath).size;
            } catch {
              item.size = 0;
            }
          }
          
          if (recursive && isDir && depth < maxDepth) {
            try {
              item.children = listDir(fullPath, depth + 1, maxDepth);
            } catch {
              item.children = [];
            }
          }
          
          return item;
        })
        .sort((a, b) => {
          // Directories first, then alphabetically
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
    };
    
    return listDir(absolutePath);
  }
};

/**
 * find_file - Searches for files by name
 */
const find_file = {
  name: 'find_file',
  description: 'Recursively searches for files matching a name pattern. Returns a list of matching file paths.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'File name or pattern to search for (partial match supported)'
      },
      directory: {
        type: 'string',
        description: 'Starting directory for the search (default: current directory)',
        default: '.'
      },
      maxDepth: {
        type: 'number',
        description: 'Maximum directory depth to search (default: 5)',
        default: 5
      },
      type: {
        type: 'string',
        description: 'Type of entry to find: "file", "directory", or "all" (default: file)',
        default: 'file'
      }
    },
    required: ['name']
  },
  keywords: ['find', 'search', 'locate', 'file', 'name'],
  
  run: async ({ name, directory = '.', maxDepth = 5, type = 'file' }) => {
    const absolutePath = path.resolve(directory);
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Directory not found: ${absolutePath}`);
    }
    
    const results = [];
    const nameLower = name.toLowerCase();
    const MAX_RESULTS = 50;
    
    const search = (dir, depth) => {
      if (depth > maxDepth || results.length >= MAX_RESULTS) return;
      
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (results.length >= MAX_RESULTS) break;
          
          // Skip hidden directories for performance
          if (entry.name.startsWith('.') && entry.isDirectory()) continue;
          
          const fullPath = path.join(dir, entry.name);
          const matches = entry.name.toLowerCase().includes(nameLower);
          
          if (matches) {
            const isDir = entry.isDirectory();
            const shouldInclude = 
              type === 'all' ||
              (type === 'file' && !isDir) ||
              (type === 'directory' && isDir);
            
            if (shouldInclude) {
              results.push({
                name: entry.name,
                path: fullPath,
                type: isDir ? 'directory' : 'file'
              });
            }
          }
          
          if (entry.isDirectory()) {
            search(fullPath, depth + 1);
          }
        }
      } catch {
        // Ignore permission errors
      }
    };
    
    search(absolutePath, 0);
    
    return results;
  }
};

/**
 * glob - Find files by glob pattern
 */
const glob = {
  name: 'glob',
  description: 'Finds files matching a glob pattern (e.g., **/*.js for all JavaScript files).',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern to match files (e.g., **/*.js, src/**/*.ts)'
      },
      cwd: {
        type: 'string',
        description: 'Working directory for the search (default: current directory)',
        default: '.'
      },
      ignore: {
        type: 'array',
        items: { type: 'string' },
        description: 'Patterns to ignore (e.g., node_modules)',
        default: ['node_modules', '.git']
      }
    },
    required: ['pattern']
  },
  keywords: ['glob', 'pattern', 'wildcard', 'match', 'files'],
  
  run: async ({ pattern, cwd = '.', ignore = ['node_modules', '.git'] }) => {
    const absoluteCwd = path.resolve(cwd);
    
    if (!fs.existsSync(absoluteCwd)) {
      throw new Error(`Directory not found: ${absoluteCwd}`);
    }
    
    // Use find command with basic glob support for now
    // In future, we can add fast-glob as a dependency
    try {
      // Convert glob to find pattern
      let findPattern = pattern
        .replace(/\*\*\//g, '') // Remove **/ 
        .replace(/\*/g, '*');   // Keep single *
      
      // Extract extension if pattern is like *.js
      const extMatch = pattern.match(/\*\.(\w+)$/);
      let command;
      
      if (extMatch) {
        const ext = extMatch[1];
        command = `find "${absoluteCwd}" -type f -name "*.${ext}" 2>/dev/null | head -100`;
      } else {
        command = `find "${absoluteCwd}" -type f -name "*${findPattern}*" 2>/dev/null | head -100`;
      }
      
      // Add ignore patterns
      for (const ig of ignore) {
        command = command.replace('find ', `find . -not -path "*/${ig}/*" `);
      }
      
      const result = execSync(command, { 
        encoding: 'utf-8',
        cwd: absoluteCwd,
        maxBuffer: 1024 * 1024
      });
      
      return result.trim().split('\n')
        .filter(Boolean)
        .slice(0, 50)
        .map(p => path.resolve(absoluteCwd, p));
        
    } catch (error) {
      // Fallback to manual search
      const results = [];
      const extMatch = pattern.match(/\*\.(\w+)$/);
      const targetExt = extMatch ? `.${extMatch[1]}` : null;
      
      const search = (dir, depth = 0) => {
        if (depth > 5 || results.length >= 50) return;
        
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            if (ignore.includes(entry.name)) continue;
            if (results.length >= 50) break;
            
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory()) {
              search(fullPath, depth + 1);
            } else if (targetExt) {
              if (entry.name.endsWith(targetExt)) {
                results.push(fullPath);
              }
            }
          }
        } catch {}
      };
      
      search(absoluteCwd);
      return results;
    }
  }
};

/**
 * file_info - Get detailed file information
 */
const file_info = {
  name: 'file_info',
  description: 'Gets detailed information about a file: size, type, permissions, timestamps.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file'
      }
    },
    required: ['path']
  },
  keywords: ['info', 'stat', 'metadata', 'details', 'file'],
  
  run: async ({ path: filePath }) => {
    const absolutePath = path.resolve(filePath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }
    
    const stats = fs.statSync(absolutePath);
    
    return {
      path: absolutePath,
      name: path.basename(absolutePath),
      extension: path.extname(absolutePath),
      type: stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other',
      size: stats.size,
      sizeFormatted: formatBytes(stats.size),
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString(),
      accessed: stats.atime.toISOString(),
      permissions: stats.mode.toString(8).slice(-3)
    };
  }
};

// Helper function to format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = {
  read_file,
  list_directory,
  find_file,
  glob,
  file_info
};
