/**
 * Utility Tools
 * Miscellaneous utility tools
 */

const { execSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

/**
 * Resolve a path, expanding ~ and environment variables
 * @param {string} filePath
 * @returns {string} Absolute path
 */
function resolvePath(filePath) {
  if (!filePath) return '';
  
  // Expand ~ to home dir
  if (filePath.startsWith('~/') || filePath === '~') {
    return path.join(os.homedir(), filePath.slice(1));
  }
  
  // Expand env vars like $HOME
  if (filePath.includes('$')) {
    filePath = filePath.replace(/\$([A-Z_]+[A-Z0-9_]*)|\${([A-Z_]+[A-Z0-9_]*)}/ig, (_, n1, n2) => {
      const name = n1 || n2;
      return process.env[name] || '';
    });
  }
  
  return path.resolve(filePath);
}

/**
 * clipboard_read - Read from system clipboard
 */
const clipboard_read = {
  name: 'clipboard_read',
  description: 'Reads the current content of the system clipboard.',
  parameters: {
    type: 'object',
    properties: {}
  },
  keywords: ['clipboard', 'paste', 'read', 'copy'],
  
  run: async () => {
    try {
      let content;
      if (process.platform === 'darwin') {
        content = execSync('pbpaste', { encoding: 'utf-8' });
      } else if (process.platform === 'linux') {
        content = execSync('xclip -selection clipboard -o', { encoding: 'utf-8' });
      } else if (process.platform === 'win32') {
        content = execSync('powershell -command "Get-Clipboard"', { encoding: 'utf-8' });
      } else {
        throw new Error('Unsupported platform');
      }
      
      return {
        content: content.trim(),
        length: content.length
      };
    } catch (error) {
      throw new Error(`Failed to read clipboard: ${error.message}`);
    }
  }
};

/**
 * clipboard_write - Write to system clipboard
 */
const clipboard_write = {
  name: 'clipboard_write',
  description: 'Writes content to the system clipboard.',
  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Content to write to clipboard'
      }
    },
    required: ['content']
  },
  keywords: ['clipboard', 'copy', 'write'],
  
  run: async ({ content }) => {
    try {
      if (process.platform === 'darwin') {
        execSync('pbcopy', { input: content, encoding: 'utf-8' });
      } else if (process.platform === 'linux') {
        execSync('xclip -selection clipboard', { input: content, encoding: 'utf-8' });
      } else if (process.platform === 'win32') {
        // Escape for PowerShell
        const escaped = content.replace(/'/g, "''");
        execSync(`powershell -command "Set-Clipboard -Value '${escaped}'"`, { encoding: 'utf-8' });
      } else {
        throw new Error('Unsupported platform');
      }
      
      return {
        success: true,
        length: content.length
      };
    } catch (error) {
      throw new Error(`Failed to write clipboard: ${error.message}`);
    }
  }
};

/**
 * open_url - Open a URL in the default browser
 */
const open_url = {
  name: 'open_url',
  description: 'Opens a URL in the system default browser.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to open'
      }
    },
    required: ['url']
  },
  requiresConfirmation: true,
  keywords: ['open', 'url', 'browser', 'web', 'link'],
  
  run: async ({ url }) => {
    // Validate URL
    try {
      new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }
    
    try {
      if (process.platform === 'darwin') {
        execSync(`open "${url}"`);
      } else if (process.platform === 'linux') {
        execSync(`xdg-open "${url}"`);
      } else if (process.platform === 'win32') {
        execSync(`start "" "${url}"`);
      } else {
        throw new Error('Unsupported platform');
      }
      
      return { opened: url };
    } catch (error) {
      throw new Error(`Failed to open URL: ${error.message}`);
    }
  }
};

/**
 * calculate - Evaluate a mathematical expression
 */
const calculate = {
  name: 'calculate',
  description: 'Evaluates a mathematical expression safely.',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematical expression to evaluate (e.g., "2 + 2 * 3")'
      }
    },
    required: ['expression']
  },
  keywords: ['calculate', 'math', 'compute', 'expression'],
  
  run: async ({ expression }) => {
    // Sanitize - only allow numbers, operators, parentheses, and common math functions
    const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');
    
    if (sanitized !== expression.replace(/\s/g, '').replace(/Math\./g, '').replace(/\w+\(/g, '(')) {
      // Check for common math functions
      const allowedFunctions = ['Math.sqrt', 'Math.pow', 'Math.sin', 'Math.cos', 'Math.tan', 'Math.log', 'Math.abs', 'Math.round', 'Math.floor', 'Math.ceil', 'Math.PI', 'Math.E'];
      let testExpr = expression;
      for (const fn of allowedFunctions) {
        testExpr = testExpr.replace(new RegExp(fn.replace('.', '\\.'), 'g'), '');
      }
      testExpr = testExpr.replace(/[0-9+\-*/().%\s]/g, '');
      if (testExpr.length > 0) {
        throw new Error('Invalid characters in expression');
      }
    }
    
    try {
      // Use Function constructor instead of eval for slightly better safety
      const result = new Function(`return ${expression}`)();
      
      return {
        expression,
        result,
        type: typeof result
      };
    } catch (error) {
      throw new Error(`Calculation error: ${error.message}`);
    }
  }
};

/**
 * sleep - Wait for a specified duration
 */
const sleep = {
  name: 'sleep',
  description: 'Pauses execution for a specified number of milliseconds.',
  parameters: {
    type: 'object',
    properties: {
      ms: {
        type: 'number',
        description: 'Duration to sleep in milliseconds'
      }
    },
    required: ['ms']
  },
  keywords: ['sleep', 'wait', 'pause', 'delay'],
  
  run: async ({ ms }) => {
    const maxSleep = 60000; // Max 1 minute
    const actualMs = Math.min(ms, maxSleep);
    
    await new Promise(resolve => setTimeout(resolve, actualMs));
    
    return {
      slept: actualMs,
      requested: ms,
      capped: ms > maxSleep
    };
  }
};

module.exports = {
  clipboard_read,
  clipboard_write,
  open_url,
  calculate,
  sleep,
  resolvePath
};
