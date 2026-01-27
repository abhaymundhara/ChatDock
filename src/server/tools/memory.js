/**
 * Memory Tools
 * Agent-accessible tools for persistent memory management (Clawdbot-style)
 */

const path = require('node:path');
const os = require('node:os');

// The MemoryManager instance will be injected via context
// For now, we create a singleton that can be set externally
let memoryManagerInstance = null;

/**
 * Set the memory manager instance (called by orchestrator)
 */
function setMemoryManager(manager) {
  memoryManagerInstance = manager;
}

/**
 * Get or create memory manager
 */
function getMemoryManager() {
  if (memoryManagerInstance) {
    return memoryManagerInstance;
  }
  
  // Lazy initialization fallback
  const { MemoryManager } = require('../utils/memory-manager');
  memoryManagerInstance = new MemoryManager({
    dataDir: path.join(os.homedir(), 'ChatDock/Memory')
  });
  memoryManagerInstance.initialize().catch(console.error);
  return memoryManagerInstance;
}

/**
 * memory_save - Save information to persistent memory
 */
const memory_save = {
  name: 'memory_save',
  description: 'Saves important information to persistent memory. Use this to remember user preferences, project details, facts, or anything that should persist across sessions. Set permanent=true for critical long-term facts that should never be forgotten.',
  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The information to remember. Be specific and include context.'
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tags for categorization (e.g., ["preference", "project"])'
      },
      permanent: {
        type: 'boolean',
        description: 'If true, saved to long-term memory (MEMORY.md). Use for critical facts like user preferences.',
        default: false
      }
    },
    required: ['content']
  },
  keywords: ['memory', 'remember', 'save', 'store', 'persist', 'note', 'learn'],

  run: async ({ content, tags = [], permanent = false }) => {
    const manager = getMemoryManager();
    
    if (!manager.initialized) {
      await manager.initialize();
    }

    const result = await manager.save(content, { tags, permanent });
    
    return {
      success: true,
      id: result.id,
      permanent: result.permanent,
      source: result.source,
      message: permanent 
        ? 'Saved to long-term memory (will persist indefinitely)'
        : 'Saved to daily log (will be searchable)'
    };
  }
};

/**
 * memory_search - Search through stored memories
 */
const memory_search = {
  name: 'memory_search',
  description: 'Searches through all stored memories using full-text search. Returns relevant memories with snippets and relevance scores. Use this to recall previously learned information about the user, their projects, or past conversations.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (keywords or phrases to find)'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 10)',
        default: 10
      }
    },
    required: ['query']
  },
  keywords: ['memory', 'search', 'recall', 'find', 'remember', 'history', 'context'],

  run: async ({ query, limit = 10 }) => {
    const manager = getMemoryManager();
    
    if (!manager.initialized) {
      await manager.initialize();
    }

    const results = await manager.search(query, limit);
    
    if (results.length === 0) {
      return {
        query,
        count: 0,
        results: [],
        message: 'No memories found matching the query'
      };
    }

    // Format results for readability
    const formattedResults = results.map((r, i) => ({
      rank: i + 1,
      id: r.id,
      content: r.snippet || r.content.substring(0, 200),
      source: r.source,
      permanent: Boolean(r.permanent),
      tags: r.tags ? r.tags.split(',').filter(Boolean) : [],
      date: r.created_at
    }));

    return {
      query,
      count: results.length,
      results: formattedResults
    };
  }
};

/**
 * memory_get - Retrieve a specific memory by ID
 */
const memory_get = {
  name: 'memory_get',
  description: 'Retrieves the full content of a specific memory by its ID. Use this after memory_search to get complete details of a relevant memory.',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The memory ID (e.g., "mem_abc123")'
      }
    },
    required: ['id']
  },
  keywords: ['memory', 'get', 'retrieve', 'fetch', 'detail'],

  run: async ({ id }) => {
    const manager = getMemoryManager();
    
    if (!manager.initialized) {
      await manager.initialize();
    }

    const memory = await manager.get(id);
    
    if (!memory) {
      return {
        found: false,
        id,
        message: 'Memory not found with the given ID'
      };
    }

    return {
      found: true,
      id: memory.id,
      content: memory.content,
      source: memory.source,
      permanent: Boolean(memory.permanent),
      tags: memory.tags ? memory.tags.split(',').filter(Boolean) : [],
      created: memory.created_at,
      updated: memory.updated_at
    };
  }
};

/**
 * memory_context - Get recent memory context for the conversation
 * (Internal tool, primarily used by orchestrator)
 */
const memory_context = {
  name: 'memory_context',
  description: 'Retrieves recent memory context from the last N days. Used to load context at the start of a conversation.',
  parameters: {
    type: 'object',
    properties: {
      days: {
        type: 'number',
        description: 'Number of days of context to load (default: 7)',
        default: 7
      }
    }
  },
  keywords: ['memory', 'context', 'recent', 'history'],

  run: async ({ days = 7 }) => {
    const manager = getMemoryManager();
    
    if (!manager.initialized) {
      await manager.initialize();
    }

    const context = await manager.getRecentContext(days);
    const stats = await manager.getStats();

    return {
      context,
      stats,
      days
    };
  }
};

/**
 * memory_stats - Get statistics about stored memories
 */
const memory_stats = {
  name: 'memory_stats',
  description: 'Returns statistics about the memory system: total memories, permanent count, etc.',
  parameters: {
    type: 'object',
    properties: {}
  },
  keywords: ['memory', 'stats', 'status', 'info'],

  run: async () => {
    const manager = getMemoryManager();
    
    if (!manager.initialized) {
      await manager.initialize();
    }

    return await manager.getStats();
  }
};

module.exports = {
  memory_save,
  memory_search,
  memory_get,
  memory_context,
  memory_stats,
  setMemoryManager,
  getMemoryManager
};
