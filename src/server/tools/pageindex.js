/**
 * PageIndex - Reasoning-based Document RAG
 * Vectorless retrieval using hierarchical tree indexing
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// PageIndex storage
const INDEX_DIR = path.join(process.env.HOME || '', '.chatdock', 'pageindex');
const indexes = new Map();

/**
 * Ensure index directory exists
 */
function ensureIndexDir() {
  if (!fs.existsSync(INDEX_DIR)) {
    fs.mkdirSync(INDEX_DIR, { recursive: true });
  }
}

/**
 * Load all indexes from disk
 */
function loadIndexes() {
  ensureIndexDir();
  try {
    const files = fs.readdirSync(INDEX_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const indexPath = path.join(INDEX_DIR, file);
        const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        indexes.set(data.id, data);
      } catch {}
    }
  } catch {}
}

// Load on module init
loadIndexes();

/**
 * Generate short ID
 */
function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * pageindex_build - Build a PageIndex tree from a document
 */
const pageindex_build = {
  name: 'pageindex_build',
  description: 'Builds a hierarchical tree index from a document for reasoning-based retrieval. Works best with structured documents like reports or papers.',
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the document (PDF, DOCX, TXT, MD)'
      },
      name: {
        type: 'string',
        description: 'Name for this index'
      },
      maxPagesPerNode: {
        type: 'number',
        description: 'Maximum pages per leaf node (default: 5)',
        default: 5
      }
    },
    required: ['filePath']
  },
  keywords: ['pageindex', 'index', 'build', 'document', 'rag'],
  
  run: async ({ filePath, name, maxPagesPerNode = 5 }) => {
    const absolutePath = path.resolve(filePath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }
    
    const ext = path.extname(absolutePath).toLowerCase();
    const fileName = path.basename(absolutePath, ext);
    
    // Extract text from document
    let text;
    let pageCount = 1;
    
    if (ext === '.pdf') {
      try {
        text = execSync(`pdftotext -layout "${absolutePath}" -`, { 
          encoding: 'utf-8', 
          maxBuffer: 20 * 1024 * 1024 
        });
        
        // Try to get page count
        try {
          const info = execSync(`pdfinfo "${absolutePath}" 2>/dev/null | grep Pages`, { encoding: 'utf-8' });
          const match = info.match(/Pages:\s+(\d+)/);
          if (match) {
            pageCount = parseInt(match[1], 10);
          }
        } catch {}
      } catch (e) {
        throw new Error(`Failed to parse PDF: ${e.message}. Install poppler-utils: brew install poppler`);
      }
    } else if (ext === '.docx') {
      try {
        text = execSync(`pandoc -f docx -t plain "${absolutePath}"`, { encoding: 'utf-8' });
      } catch {
        text = fs.readFileSync(absolutePath, 'utf-8');
      }
    } else {
      text = fs.readFileSync(absolutePath, 'utf-8');
    }
    
    // Build tree structure
    const tree = buildTree(text, pageCount, maxPagesPerNode, fileName);
    
    const indexId = generateId();
    const indexData = {
      id: indexId,
      name: name || fileName,
      sourcePath: absolutePath,
      sourceType: ext.slice(1),
      pageCount,
      createdAt: new Date().toISOString(),
      tree
    };
    
    // Save to disk
    ensureIndexDir();
    fs.writeFileSync(
      path.join(INDEX_DIR, `${indexId}.json`),
      JSON.stringify(indexData, null, 2)
    );
    
    indexes.set(indexId, indexData);
    
    return {
      success: true,
      indexId,
      name: indexData.name,
      pageCount,
      nodeCount: countNodes(tree)
    };
  }
};

/**
 * Build tree from text
 */
function buildTree(text, pageCount, maxPagesPerNode, docName) {
  // Split into pages (crude: by double newlines or form feeds)
  const pageBreak = text.includes('\f') ? /\f/ : /\n\n\n+/;
  const pages = text.split(pageBreak).filter(p => p.trim());
  
  const actualPageCount = Math.max(pages.length, pageCount);
  
  // If small document, just create a single node
  if (actualPageCount <= maxPagesPerNode) {
    return {
      nodeId: 'root',
      title: docName,
      startPage: 1,
      endPage: actualPageCount,
      summary: summarizeText(text, 200),
      children: []
    };
  }
  
  // Try to detect sections by headings
  const sections = detectSections(text, pages);
  
  if (sections.length > 0) {
    return {
      nodeId: 'root',
      title: docName,
      startPage: 1,
      endPage: actualPageCount,
      summary: summarizeText(text, 200),
      children: sections.map((section, i) => ({
        nodeId: `section_${i}`,
        title: section.title,
        startPage: section.startPage,
        endPage: section.endPage,
        summary: summarizeText(section.content, 150),
        children: []
      }))
    };
  }
  
  // Fall back to page-based chunking
  const chunks = [];
  for (let i = 0; i < pages.length; i += maxPagesPerNode) {
    const chunkPages = pages.slice(i, i + maxPagesPerNode);
    chunks.push({
      nodeId: `chunk_${i}`,
      title: `Pages ${i + 1}-${Math.min(i + maxPagesPerNode, pages.length)}`,
      startPage: i + 1,
      endPage: Math.min(i + maxPagesPerNode, pages.length),
      summary: summarizeText(chunkPages.join('\n'), 150),
      children: []
    });
  }
  
  return {
    nodeId: 'root',
    title: docName,
    startPage: 1,
    endPage: actualPageCount,
    summary: summarizeText(text, 200),
    children: chunks
  };
}

/**
 * Detect sections by headings
 */
function detectSections(text, pages) {
  const sections = [];
  
  // Look for common heading patterns
  const headingPatterns = [
    /^#{1,3}\s+(.+)$/gm,                    // Markdown headings
    /^([A-Z][A-Z\s]+)$/gm,                  // ALL CAPS HEADINGS
    /^(\d+\.?\s+[A-Z].+)$/gm,               // Numbered headings
    /^(Chapter\s+\d+.*)$/gmi,               // Chapter X
    /^(Section\s+\d+.*)$/gmi                // Section X
  ];
  
  for (const pattern of headingPatterns) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length >= 2 && matches.length <= 20) {
      // Found reasonable number of sections
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index;
        const end = i < matches.length - 1 ? matches[i + 1].index : text.length;
        
        sections.push({
          title: matches[i][1].trim(),
          content: text.slice(start, end),
          startPage: Math.floor(start / (text.length / pages.length)) + 1,
          endPage: Math.floor(end / (text.length / pages.length)) + 1
        });
      }
      break;
    }
  }
  
  return sections;
}

/**
 * Summarize text (first N characters, cleaned up)
 */
function summarizeText(text, maxLength) {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength * 2);
  
  // Try to cut at a sentence boundary
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned];
  let summary = '';
  for (const sentence of sentences) {
    if (summary.length + sentence.length > maxLength) break;
    summary += sentence;
  }
  
  return summary.trim() || cleaned.slice(0, maxLength);
}

/**
 * Count nodes in tree
 */
function countNodes(node) {
  let count = 1;
  for (const child of node.children || []) {
    count += countNodes(child);
  }
  return count;
}

/**
 * pageindex_query - Query a PageIndex tree
 */
const pageindex_query = {
  name: 'pageindex_query',
  description: 'Queries a PageIndex tree to find relevant sections for a question. Uses the tree structure to reason about which sections are most relevant.',
  parameters: {
    type: 'object',
    properties: {
      indexId: {
        type: 'string',
        description: 'ID of the PageIndex to query'
      },
      query: {
        type: 'string',
        description: 'The question or query'
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of relevant sections to return (default: 3)',
        default: 3
      }
    },
    required: ['indexId', 'query']
  },
  keywords: ['pageindex', 'query', 'search', 'find', 'rag'],
  
  run: async ({ indexId, query, maxResults = 3 }) => {
    const index = indexes.get(indexId);
    if (!index) {
      throw new Error(`Index not found: ${indexId}`);
    }
    
    // Simple keyword matching for now
    // In production, this would use LLM reasoning
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/\s+/).filter(t => t.length > 2);
    
    const results = [];
    
    function searchNode(node, depth = 0) {
      const titleLower = (node.title || '').toLowerCase();
      const summaryLower = (node.summary || '').toLowerCase();
      
      let score = 0;
      for (const token of queryTokens) {
        if (titleLower.includes(token)) score += 5;
        if (summaryLower.includes(token)) score += 2;
      }
      
      if (score > 0) {
        results.push({
          nodeId: node.nodeId,
          title: node.title,
          startPage: node.startPage,
          endPage: node.endPage,
          summary: node.summary,
          score,
          depth
        });
      }
      
      for (const child of node.children || []) {
        searchNode(child, depth + 1);
      }
    }
    
    searchNode(index.tree);
    
    // Sort by score, prefer shallower nodes for ties
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.depth - b.depth;
    });
    
    return {
      indexId,
      indexName: index.name,
      query,
      resultCount: Math.min(results.length, maxResults),
      results: results.slice(0, maxResults).map(r => ({
        title: r.title,
        pages: `${r.startPage}-${r.endPage}`,
        summary: r.summary,
        relevanceScore: r.score
      }))
    };
  }
};

/**
 * pageindex_list - List all indexed documents
 */
const pageindex_list = {
  name: 'pageindex_list',
  description: 'Lists all documents that have been indexed with PageIndex.',
  parameters: {
    type: 'object',
    properties: {}
  },
  keywords: ['pageindex', 'list', 'indexes'],
  
  run: async () => {
    const list = Array.from(indexes.values()).map(idx => ({
      id: idx.id,
      name: idx.name,
      sourceType: idx.sourceType,
      pageCount: idx.pageCount,
      createdAt: idx.createdAt
    }));
    
    return {
      count: list.length,
      indexes: list
    };
  }
};

/**
 * pageindex_delete - Remove an index
 */
const pageindex_delete = {
  name: 'pageindex_delete',
  description: 'Removes a PageIndex from storage.',
  parameters: {
    type: 'object',
    properties: {
      indexId: {
        type: 'string',
        description: 'ID of the index to delete'
      }
    },
    required: ['indexId']
  },
  keywords: ['pageindex', 'delete', 'remove'],
  
  run: async ({ indexId }) => {
    if (!indexes.has(indexId)) {
      throw new Error(`Index not found: ${indexId}`);
    }
    
    const index = indexes.get(indexId);
    
    // Delete from disk
    try {
      const indexPath = path.join(INDEX_DIR, `${indexId}.json`);
      if (fs.existsSync(indexPath)) {
        fs.unlinkSync(indexPath);
      }
    } catch {}
    
    indexes.delete(indexId);
    
    return {
      deleted: indexId,
      name: index.name
    };
  }
};

module.exports = {
  pageindex_build,
  pageindex_query,
  pageindex_list,
  pageindex_delete
};
