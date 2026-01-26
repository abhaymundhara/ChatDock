/**
 * Files API
 * Tools for handling documents: PDF, DOCX, CSV, etc.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// File registry for tracking uploaded/processed files
const fileRegistry = new Map();
const REGISTRY_PATH = path.join(process.env.HOME || '', '.chatdock', 'files', 'registry.json');

/**
 * Initialize registry from disk
 */
function loadRegistry() {
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      const data = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
      for (const [id, file] of Object.entries(data)) {
        fileRegistry.set(id, file);
      }
    }
  } catch {}
}

/**
 * Save registry to disk
 */
function saveRegistry() {
  try {
    const dir = path.dirname(REGISTRY_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = Object.fromEntries(fileRegistry);
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(data, null, 2));
  } catch {}
}

// Load registry on module load
loadRegistry();

/**
 * Generate a short ID
 */
function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * file_upload - Register a file with the Files API
 */
const file_upload = {
  name: 'file_upload',
  description: 'Registers a file with the Files API for parsing and querying. Supports PDF, DOCX, TXT, MD, CSV, JSON.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to register'
      },
      alias: {
        type: 'string',
        description: 'Optional friendly name for the file'
      }
    },
    required: ['path']
  },
  keywords: ['file', 'upload', 'register', 'pdf', 'document'],
  
  run: async ({ path: filePath, alias }) => {
    const absolutePath = path.resolve(filePath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }
    
    const stats = fs.statSync(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase();
    const name = path.basename(absolutePath);
    
    // Supported types
    const supported = ['.pdf', '.docx', '.txt', '.md', '.csv', '.json', '.html'];
    if (!supported.includes(ext)) {
      throw new Error(`Unsupported file type: ${ext}. Supported: ${supported.join(', ')}`);
    }
    
    // Max file size: 50MB
    if (stats.size > 50 * 1024 * 1024) {
      throw new Error('File too large. Maximum size is 50MB.');
    }
    
    const fileId = generateId();
    
    const fileInfo = {
      id: fileId,
      path: absolutePath,
      name,
      alias: alias || name,
      type: ext.slice(1),
      size: stats.size,
      sizeFormatted: formatBytes(stats.size),
      registeredAt: new Date().toISOString(),
      parsed: false,
      pageCount: null
    };
    
    // Try to get page count for PDFs
    if (ext === '.pdf') {
      try {
        // Use pdfinfo if available
        const info = execSync(`pdfinfo "${absolutePath}" 2>/dev/null | grep Pages`, { encoding: 'utf-8' });
        const match = info.match(/Pages:\s+(\d+)/);
        if (match) {
          fileInfo.pageCount = parseInt(match[1], 10);
        }
      } catch {}
    }
    
    fileRegistry.set(fileId, fileInfo);
    saveRegistry();
    
    return {
      success: true,
      fileId,
      ...fileInfo
    };
  }
};

/**
 * file_read - Read and parse a file
 */
const file_read = {
  name: 'file_read',
  description: 'Reads and parses the content of a registered file. For PDFs, extracts text. For CSV, parses to structured data.',
  parameters: {
    type: 'object',
    properties: {
      fileId: {
        type: 'string',
        description: 'ID of the registered file (from file_upload)'
      },
      pages: {
        type: 'string',
        description: 'For PDFs: page range to read (e.g., "1-5", "3,7,10"). Default: all'
      },
      maxLength: {
        type: 'number',
        description: 'Maximum characters to return (default: 20000)',
        default: 20000
      }
    },
    required: ['fileId']
  },
  keywords: ['file', 'read', 'parse', 'content', 'pdf', 'extract'],
  
  run: async ({ fileId, pages, maxLength = 20000 }) => {
    const fileInfo = fileRegistry.get(fileId);
    if (!fileInfo) {
      throw new Error(`File not found in registry: ${fileId}`);
    }
    
    const { path: filePath, type } = fileInfo;
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`File no longer exists: ${filePath}`);
    }
    
    let content;
    
    switch (type) {
      case 'txt':
      case 'md':
        content = fs.readFileSync(filePath, 'utf-8');
        break;
        
      case 'json':
        const json = fs.readFileSync(filePath, 'utf-8');
        content = JSON.stringify(JSON.parse(json), null, 2);
        break;
        
      case 'csv':
        content = parseCSV(filePath);
        break;
        
      case 'pdf':
        content = await parsePDF(filePath, pages);
        break;
        
      case 'docx':
        content = await parseDOCX(filePath);
        break;
        
      case 'html':
        content = parseHTML(filePath);
        break;
        
      default:
        content = fs.readFileSync(filePath, 'utf-8');
    }
    
    // Update registry
    fileInfo.parsed = true;
    fileInfo.lastRead = new Date().toISOString();
    saveRegistry();
    
    // Truncate if needed
    const truncated = content.length > maxLength;
    const finalContent = truncated ? content.slice(0, maxLength) + '\n\n[...content truncated]' : content;
    
    return {
      fileId,
      name: fileInfo.alias,
      type,
      contentLength: content.length,
      truncated,
      content: finalContent
    };
  }
};

/**
 * file_list - List registered files
 */
const file_list = {
  name: 'file_list',
  description: 'Lists all files registered with the Files API.',
  parameters: {
    type: 'object',
    properties: {}
  },
  keywords: ['file', 'list', 'files', 'registered'],
  
  run: async () => {
    const files = Array.from(fileRegistry.values()).map(f => ({
      id: f.id,
      name: f.alias || f.name,
      type: f.type,
      size: f.sizeFormatted,
      parsed: f.parsed,
      pageCount: f.pageCount
    }));
    
    return {
      count: files.length,
      files
    };
  }
};

/**
 * file_delete - Remove a file from the registry
 */
const file_delete = {
  name: 'file_delete',
  description: 'Removes a file from the Files API registry.',
  parameters: {
    type: 'object',
    properties: {
      fileId: {
        type: 'string',
        description: 'ID of the file to remove'
      }
    },
    required: ['fileId']
  },
  keywords: ['file', 'delete', 'remove', 'unregister'],
  
  run: async ({ fileId }) => {
    if (!fileRegistry.has(fileId)) {
      throw new Error(`File not found: ${fileId}`);
    }
    
    const fileInfo = fileRegistry.get(fileId);
    fileRegistry.delete(fileId);
    saveRegistry();
    
    return {
      deleted: fileId,
      name: fileInfo.name
    };
  }
};

/**
 * file_info - Get detailed file information
 */
const file_info_tool = {
  name: 'file_info',
  description: 'Gets detailed information about a registered file.',
  parameters: {
    type: 'object',
    properties: {
      fileId: {
        type: 'string',
        description: 'ID of the file'
      }
    },
    required: ['fileId']
  },
  keywords: ['file', 'info', 'details', 'metadata'],
  
  run: async ({ fileId }) => {
    const fileInfo = fileRegistry.get(fileId);
    if (!fileInfo) {
      throw new Error(`File not found: ${fileId}`);
    }
    
    return fileInfo;
  }
};

// ============ Parsing Functions ============

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  if (lines.length === 0) return '(empty CSV)';
  
  // Parse header
  const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  
  // Parse rows (first 100 for preview)
  const rows = [];
  for (let i = 1; i < Math.min(lines.length, 101); i++) {
    if (!lines[i].trim()) continue;
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    header.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  
  return JSON.stringify({ header, rowCount: lines.length - 1, preview: rows }, null, 2);
}

async function parsePDF(filePath, pages) {
  // Try pdftotext first (poppler-utils)
  try {
    let command = `pdftotext -layout "${filePath}" -`;
    if (pages) {
      // Parse page range
      const match = pages.match(/^(\d+)(?:-(\d+))?$/);
      if (match) {
        const start = match[1];
        const end = match[2] || start;
        command = `pdftotext -layout -f ${start} -l ${end} "${filePath}" -`;
      }
    }
    
    const text = execSync(command, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    return text;
  } catch {
    // Fallback: try to read as binary and extract ASCII text
    try {
      const buffer = fs.readFileSync(filePath);
      const text = buffer.toString('utf-8')
        .replace(/[^\x20-\x7E\n\r\t]/g, '')
        .replace(/\n{3,}/g, '\n\n');
      return text.length > 100 ? text : '(Could not extract text from PDF. Install poppler-utils: brew install poppler)';
    } catch {
      return '(PDF parsing failed. Install poppler-utils: brew install poppler)';
    }
  }
}

async function parseDOCX(filePath) {
  // Try pandoc first
  try {
    const text = execSync(`pandoc -f docx -t plain "${filePath}"`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    return text;
  } catch {
    // Fallback: unzip and read XML
    try {
      const text = execSync(`unzip -p "${filePath}" word/document.xml | sed -e 's/<[^>]*>//g'`, { encoding: 'utf-8' });
      return text.replace(/\s+/g, ' ').trim();
    } catch {
      return '(DOCX parsing failed. Install pandoc: brew install pandoc)';
    }
  }
}

function parseHTML(filePath) {
  const html = fs.readFileSync(filePath, 'utf-8');
  
  // Simple HTML to text
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = {
  file_upload,
  file_read,
  file_list,
  file_delete,
  file_info: file_info_tool
};
