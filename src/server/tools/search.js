/**
 * Search Tools
 * Tools for searching files and the web
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { resolvePath } = require('./utility');

/**
 * grep_search - Regex search in files
 */
const grep_search = {
  name: 'grep_search',
  description: 'Searches for a regex pattern within files. Returns matching lines with file paths and line numbers.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regex pattern to search for'
      },
      path: {
        type: 'string',
        description: 'File or directory to search in',
        default: '.'
      },

      ignoreCase: {
        type: 'boolean',
        description: 'Case-insensitive search (default: false)',
        default: false
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 50)',
        default: 50
      },
      filePattern: {
        type: 'string',
        description: 'Only search files matching this pattern (e.g., "*.js")'
      }
    },
    required: ['pattern']
  },
  keywords: ['grep', 'search', 'find', 'regex', 'pattern', 'text'],
  
  run: async ({ pattern, path: searchPath = '.', ignoreCase = false, maxResults = 50, filePattern }) => {
    const absolutePath = resolvePath(searchPath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Path not found: ${absolutePath}`);
    }
    
    const results = [];
    
    // Try ripgrep first (faster), fall back to grep
    try {
      const flags = [
        '--line-number',
        '--no-heading',
        '--color=never',
        `--max-count=${maxResults}`,
        ignoreCase ? '-i' : ''
      ].filter(Boolean);
      
      if (filePattern) {
        flags.push(`--glob=${filePattern}`);
      }
      
      // Exclude common non-relevant directories
      flags.push('--glob=!node_modules', '--glob=!.git', '--glob=!dist', '--glob=!build');

      const rgArgs = [...flags, '--', pattern, absolutePath];
      const output = execFileSync('rg', rgArgs, {
        encoding: 'utf-8',
        maxBuffer: 5 * 1024 * 1024
      });
      
      for (const line of output.split('\n').filter(Boolean)) {
        const match = line.match(/^(.+?):(\d+):(.*)$/);
        if (match) {
          results.push({
            file: match[1],
            line: parseInt(match[2], 10),
            content: match[3].trim()
          });
        }
      }
    } catch {
      // Fallback to grep
      try {
        const flags = ignoreCase ? ['-rni'] : ['-rn'];
        const grepArgs = [...flags, '-m', String(maxResults), '--', pattern, absolutePath];
        const output = execFileSync('grep', grepArgs, {
          encoding: 'utf-8',
          maxBuffer: 5 * 1024 * 1024
        });
        
        for (const line of output.split('\n').filter(Boolean)) {
          const match = line.match(/^(.+?):(\d+):(.*)$/);
          if (match) {
            results.push({
              file: match[1],
              line: parseInt(match[2], 10),
              content: match[3].trim()
            });
          }
        }
      } catch {
        // No matches or error
      }
    }
    
    return {
      pattern,
      searchPath: absolutePath,
      matchCount: results.length,
      results: results.slice(0, maxResults)
    };
  }
};

/**
 * web_search - Search the web using DuckDuckGo (no API key required)
 */
const web_search = {
  name: 'web_search',
  description: 'Searches the web using DuckDuckGo. Returns search results with titles, URLs, and snippets.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query'
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results (default: 5)',
        default: 5
      }
    },
    required: ['query']
  },
  keywords: ['search', 'web', 'google', 'internet', 'lookup', 'find online'],
  
  run: async ({ query, maxResults = 5 }) => {
    // Try ddgr CLI first
    try {
      const output = execFileSync('ddgr', ['--json', '-n', String(maxResults), query], {
        encoding: 'utf-8',
        timeout: 15000
      });
      const results = JSON.parse(output);
      
      return {
        query,
        resultCount: results.length,
        results: results.map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.abstract || r.description || ''
        }))
      };
    } catch {
      // Fallback: scrape DuckDuckGo HTML
      try {
        const encodedQuery = encodeURIComponent(query);
        const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
        
        const html = execFileSync(
          'curl',
          ['-s', '-A', 'Mozilla/5.0', url],
          { encoding: 'utf-8', timeout: 15000, maxBuffer: 2 * 1024 * 1024 }
        );
        
        // Simple regex extraction of results
        const results = [];
        const resultPattern = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
        const snippetPattern = /<a[^>]*class="result__snippet"[^>]*>([^<]+)<\/a>/g;
        
        let match;
        while ((match = resultPattern.exec(html)) !== null && results.length < maxResults) {
          results.push({
            url: match[1],
            title: match[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
            snippet: ''
          });
        }
        
        // Try to add snippets
        let i = 0;
        while ((match = snippetPattern.exec(html)) !== null && i < results.length) {
          results[i].snippet = match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
          i++;
        }
        
        return {
          query,
          resultCount: results.length,
          results
        };
      } catch (error) {
        return {
          query,
          resultCount: 0,
          results: [],
          error: 'Web search failed. Install ddgr for better results: brew install ddgr'
        };
      }
    }
  }
};

/**
 * fetch_url - Download and parse a webpage
 */
const fetch_url = {
  name: 'fetch_url',
  description: 'Downloads a webpage and converts it to readable text/markdown. Useful for reading documentation or articles.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL of the webpage to fetch'
      },
      maxLength: {
        type: 'number',
        description: 'Maximum characters to return (default: 10000)',
        default: 10000
      }
    },
    required: ['url']
  },
  keywords: ['fetch', 'url', 'webpage', 'download', 'read', 'http'],
  
  run: async ({ url, maxLength = 10000 }) => {
    // Validate URL
    try {
      new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }
    
    try {
      // Use curl to fetch the page
      const html = execFileSync(
        'curl',
        ['-s', '-L', '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', url],
        {
          encoding: 'utf-8',
          timeout: 30000,
          maxBuffer: 5 * 1024 * 1024
        }
      );
      
      // Convert HTML to readable text
      const text = htmlToText(html);
      
      // Truncate if needed
      const truncated = text.length > maxLength;
      const content = truncated ? text.slice(0, maxLength) + '\n\n[...truncated]' : text;
      
      return {
        url,
        contentLength: text.length,
        truncated,
        content
      };
    } catch (error) {
      throw new Error(`Failed to fetch URL: ${error.message}`);
    }
  }
};

/**
 * Simple HTML to text converter
 */
function htmlToText(html) {
  // Remove script and style tags
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
  
  // Convert common elements
  text = text
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n## $1\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n')
    .replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<pre[^>]*>(.*?)<\/pre>/gis, '\n```\n$1\n```\n')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  
  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, '');
  
  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');
  
  // Clean up whitespace
  text = text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  
  return text;
}

module.exports = {
  grep_search,
  web_search,
  fetch_url
};
