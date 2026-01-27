/**
 * Tool Search - Dynamic Tool Discovery
 * Enables on-demand loading of relevant tools to save context tokens
 */

const allTools = require('./index');

// Build tool catalog with keywords and descriptions
const toolCatalog = new Map();

// Initialize catalog from all tools
function initializeCatalog() {
  for (const [name, tool] of Object.entries(allTools)) {
    if (tool && tool.name && typeof tool.run === 'function') {
      toolCatalog.set(tool.name, {
        name: tool.name,
        description: tool.description || '',
        keywords: tool.keywords || [],
        parameters: tool.parameters || {},
        requiresConfirmation: tool.requiresConfirmation || false
      });
    }
  }
}

initializeCatalog();

/**
 * Tokenize a string into searchable terms
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

/**
 * Calculate relevance score for a tool
 */
function scoreMatch(tool, queryTokens) {
  let score = 0;
  
  const nameLower = tool.name.toLowerCase();
  const descLower = tool.description.toLowerCase();
  
  for (const token of queryTokens) {
    // Exact name match
    if (nameLower === token) {
      score += 20;
    }
    // Name contains token
    else if (nameLower.includes(token)) {
      score += 10;
    }
    
    // Description match
    if (descLower.includes(token)) {
      score += 3;
    }
    
    // Keyword match
    for (const keyword of tool.keywords) {
      if (keyword.toLowerCase() === token) {
        score += 8;
      } else if (keyword.toLowerCase().includes(token)) {
        score += 4;
      }
    }
  }
  
  return score;
}

/**
 * tool_finder - Search the tool catalog
 */
const tool_finder = {
  name: 'tool_finder',
  description: 'Finds tools relevant to a query. Returns tool names and descriptions for the most relevant matches.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query describing what you want to do'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of tools to return (default: 5)',
        default: 5
      },
      threshold: {
        type: 'number',
        description: 'Minimum relevance score (default: 3)',
        default: 3
      }
    },
    required: ['query']
  },
  keywords: ['tool', 'search', 'find', 'discover', 'help'],
  
  run: async ({ query, limit = 5, threshold = 3 }) => {
    const queryTokens = tokenize(query);
    
    if (queryTokens.length === 0) {
      return {
        query,
        matches: [],
        message: 'Please provide a more specific query'
      };
    }
    
    const scored = [];
    
    for (const tool of toolCatalog.values()) {
      const score = scoreMatch(tool, queryTokens);
      if (score >= threshold) {
        scored.push({ ...tool, score });
      }
    }
    
    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    
    const matches = scored.slice(0, limit).map(t => ({
      name: t.name,
      description: t.description,
      keywords: t.keywords,
      requiresConfirmation: t.requiresConfirmation,
      relevanceScore: t.score
    }));
    
    return {
      query,
      totalTools: toolCatalog.size,
      matchCount: matches.length,
      matches
    };
  }
};

/**
 * tool_list - List all available tools
 */
const tool_list = {
  name: 'tool_list',
  description: 'Lists all available tools grouped by category.',
  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'Filter by category (file, search, git, system, planning, etc.)'
      }
    }
  },
  keywords: ['tool', 'list', 'all', 'available'],
  
  run: async ({ category }) => {
    // Categorize tools by their first keyword or name prefix
    const categories = {
      file: [],
      search: [],
      git: [],
      system: [],
      planning: [],
      utility: [],
      code: [],
      pageindex: [],
      other: []
    };
    
    for (const tool of toolCatalog.values()) {
      let assigned = false;
      
      // Check name prefix
      for (const cat of Object.keys(categories)) {
        if (tool.name.startsWith(cat) || tool.name.includes(cat)) {
          categories[cat].push(tool.name);
          assigned = true;
          break;
        }
      }
      
      // Check keywords
      if (!assigned) {
        for (const keyword of tool.keywords) {
          for (const cat of Object.keys(categories)) {
            if (keyword === cat || keyword.includes(cat)) {
              categories[cat].push(tool.name);
              assigned = true;
              break;
            }
          }
          if (assigned) break;
        }
      }
      
      if (!assigned) {
        categories.other.push(tool.name);
      }
    }
    
    // Filter by category if specified
    if (category && categories[category]) {
      return {
        category,
        toolCount: categories[category].length,
        tools: categories[category]
      };
    }
    
    // Return all categories
    const result = {};
    for (const [cat, tools] of Object.entries(categories)) {
      if (tools.length > 0) {
        result[cat] = tools;
      }
    }
    
    return {
      totalTools: toolCatalog.size,
      categories: result
    };
  }
};

/**
 * tool_info - Get detailed info about a specific tool
 */
const tool_info = {
  name: 'tool_info',
  description: 'Gets detailed information about a specific tool including its parameters.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the tool'
      }
    },
    required: ['name']
  },
  keywords: ['tool', 'info', 'help', 'usage'],
  
  run: async ({ name }) => {
    const tool = toolCatalog.get(name);
    
    if (!tool) {
      // Try fuzzy match
      const similar = [];
      for (const t of toolCatalog.values()) {
        if (t.name.includes(name) || name.includes(t.name)) {
          similar.push(t.name);
        }
      }
      
      return {
        found: false,
        message: `Tool not found: ${name}`,
        similar: similar.slice(0, 5)
      };
    }
    
    return {
      found: true,
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      keywords: tool.keywords,
      requiresConfirmation: tool.requiresConfirmation
    };
  }
};

module.exports = {
  tool_finder,
  tool_list,
  tool_info
};
