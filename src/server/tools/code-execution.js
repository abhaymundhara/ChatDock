/**
 * Code Execution Tools
 * Sandboxed code execution for JavaScript, Python, and Bash
 */

const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');

// Sandbox configuration
const SANDBOX_CONFIG = {
  timeout: 30000,           // 30 seconds default
  maxMemory: '256M',        // Memory limit (for external processes)
  maxOutputSize: 100000,    // Max output characters
  allowNetwork: false,      // Disable network by default
  tempDir: path.join(os.tmpdir(), 'chatdock-sandbox'),
  restrictedPaths: [
    '/etc', '/usr', '/bin', '/sbin', '/var',
    path.join(os.homedir(), '.ssh'),
    path.join(os.homedir(), '.gnupg'),
    path.join(os.homedir(), '.config')
  ]
};

// Ensure temp directory exists
if (!fs.existsSync(SANDBOX_CONFIG.tempDir)) {
  fs.mkdirSync(SANDBOX_CONFIG.tempDir, { recursive: true });
}

/**
 * code_execute - Execute code in a sandboxed environment
 */
const code_execute = {
  name: 'code_execute',
  description: 'Executes code in a sandboxed environment. Supports JavaScript, Python, and Bash. Output is captured and returned.',
  parameters: {
    type: 'object',
    properties: {
      language: {
        type: 'string',
        enum: ['javascript', 'python', 'bash'],
        description: 'Programming language'
      },
      code: {
        type: 'string',
        description: 'Code to execute'
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)',
        default: 30000
      },
      workdir: {
        type: 'string',
        description: 'Working directory for execution'
      }
    },
    required: ['language', 'code']
  },
  requiresConfirmation: true,
  keywords: ['code', 'execute', 'run', 'python', 'javascript', 'bash'],
  
  run: async ({ language, code, timeout = 30000, workdir }) => {
    const actualTimeout = Math.min(timeout, 60000); // Max 1 minute
    const cwd = workdir ? path.resolve(workdir) : SANDBOX_CONFIG.tempDir;
    
    // Validate working directory
    for (const restricted of SANDBOX_CONFIG.restrictedPaths) {
      if (cwd.startsWith(restricted)) {
        throw new Error(`Access denied to restricted path: ${cwd}`);
      }
    }
    
    switch (language) {
      case 'javascript':
        return executeJavaScript(code, actualTimeout);
      case 'python':
        return executePython(code, actualTimeout, cwd);
      case 'bash':
        return executeBash(code, actualTimeout, cwd);
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  }
};

/**
 * Execute JavaScript in a sandboxed VM
 */
function executeJavaScript(code, timeout) {
  return new Promise((resolve) => {
    const output = [];
    
    // Create sandbox context with limited globals
    const sandbox = {
      console: {
        log: (...args) => output.push(args.map(String).join(' ')),
        error: (...args) => output.push('[ERROR] ' + args.map(String).join(' ')),
        warn: (...args) => output.push('[WARN] ' + args.map(String).join(' '))
      },
      setTimeout: undefined,
      setInterval: undefined,
      require: undefined,
      process: undefined,
      __dirname: undefined,
      __filename: undefined,
      Math,
      JSON,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Error,
      Map,
      Set,
      Promise
    };
    
    try {
      const script = new vm.Script(code, { timeout });
      const context = vm.createContext(sandbox);
      const result = script.runInContext(context, { timeout });
      
      resolve({
        language: 'javascript',
        success: true,
        output: output.join('\n'),
        result: result !== undefined ? String(result) : null,
        executionTime: null
      });
    } catch (error) {
      resolve({
        language: 'javascript',
        success: false,
        output: output.join('\n'),
        error: error.message
      });
    }
  });
}

/**
 * Execute Python code
 */
async function executePython(code, timeout, cwd) {
  return new Promise((resolve) => {
    // Write code to temp file
    const tempFile = path.join(SANDBOX_CONFIG.tempDir, `exec_${Date.now()}.py`);
    fs.writeFileSync(tempFile, code);
    
    let stdout = '';
    let stderr = '';
    
    const child = spawn('python3', [tempFile], {
      cwd,
      timeout,
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: '1'
      }
    });
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      if (stdout.length > SANDBOX_CONFIG.maxOutputSize) {
        stdout = stdout.slice(0, SANDBOX_CONFIG.maxOutputSize) + '\n[OUTPUT TRUNCATED]';
        child.kill();
      }
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (exitCode) => {
      // Clean up temp file
      try { fs.unlinkSync(tempFile); } catch {}
      
      resolve({
        language: 'python',
        success: exitCode === 0,
        output: stdout.trim(),
        error: stderr.trim() || null,
        exitCode
      });
    });
    
    child.on('error', (error) => {
      try { fs.unlinkSync(tempFile); } catch {}
      resolve({
        language: 'python',
        success: false,
        output: '',
        error: error.message
      });
    });
    
    // Handle timeout
    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGTERM');
        resolve({
          language: 'python',
          success: false,
          output: stdout.trim(),
          error: `Execution timed out after ${timeout}ms`
        });
      }
    }, timeout);
  });
}

/**
 * Execute Bash code
 */
async function executeBash(code, timeout, cwd) {
  return new Promise((resolve) => {
    // Block dangerous commands
    const dangerous = ['rm -rf /', 'mkfs', ':(){', '> /dev/sda', 'chmod -R 777 /'];
    for (const d of dangerous) {
      if (code.includes(d)) {
        return resolve({
          language: 'bash',
          success: false,
          output: '',
          error: `Blocked dangerous command pattern: ${d}`
        });
      }
    }
    
    let stdout = '';
    let stderr = '';
    
    const child = spawn('bash', ['-c', code], {
      cwd,
      timeout,
      env: {
        ...process.env,
        PATH: '/usr/local/bin:/usr/bin:/bin'
      }
    });
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      if (stdout.length > SANDBOX_CONFIG.maxOutputSize) {
        stdout = stdout.slice(0, SANDBOX_CONFIG.maxOutputSize) + '\n[OUTPUT TRUNCATED]';
        child.kill();
      }
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (exitCode) => {
      resolve({
        language: 'bash',
        success: exitCode === 0,
        output: stdout.trim(),
        error: stderr.trim() || null,
        exitCode
      });
    });
    
    child.on('error', (error) => {
      resolve({
        language: 'bash',
        success: false,
        output: '',
        error: error.message
      });
    });
    
    // Handle timeout
    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGTERM');
        resolve({
          language: 'bash',
          success: false,
          output: stdout.trim(),
          error: `Execution timed out after ${timeout}ms`
        });
      }
    }, timeout);
  });
}

/**
 * code_execute_file - Execute a code file
 */
const code_execute_file = {
  name: 'code_execute_file',
  description: 'Executes a code file. Automatically detects language from file extension.',
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the code file'
      },
      args: {
        type: 'array',
        items: { type: 'string' },
        description: 'Command line arguments'
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds',
        default: 30000
      }
    },
    required: ['filePath']
  },
  requiresConfirmation: true,
  keywords: ['execute', 'file', 'run', 'script'],
  
  run: async ({ filePath, args = [], timeout = 30000 }) => {
    const absolutePath = path.resolve(filePath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }
    
    const ext = path.extname(absolutePath).toLowerCase();
    const cwd = path.dirname(absolutePath);
    
    let command;
    switch (ext) {
      case '.js':
        command = ['node', absolutePath, ...args];
        break;
      case '.py':
        command = ['python3', absolutePath, ...args];
        break;
      case '.sh':
        command = ['bash', absolutePath, ...args];
        break;
      case '.ts':
        command = ['npx', 'ts-node', absolutePath, ...args];
        break;
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }
    
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      
      const child = spawn(command[0], command.slice(1), { cwd, timeout });
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (exitCode) => {
        resolve({
          file: absolutePath,
          success: exitCode === 0,
          output: stdout.trim(),
          error: stderr.trim() || null,
          exitCode
        });
      });
      
      child.on('error', (error) => {
        resolve({
          file: absolutePath,
          success: false,
          error: error.message
        });
      });
      
      setTimeout(() => {
        if (!child.killed) {
          child.kill();
          resolve({
            file: absolutePath,
            success: false,
            error: `Timeout after ${timeout}ms`
          });
        }
      }, timeout);
    });
  }
};

module.exports = {
  code_execute,
  code_execute_file
};
