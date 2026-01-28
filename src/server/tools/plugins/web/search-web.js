const https = require("https");

/**
 * search-web.js
 * Search the web using DuckDuckGo HTML scraping
 * Cross-platform: macOS, Windows, Linux
 * No API key required
 */

const definition = {
  type: "function",
  function: {
    name: "search_web",
    description:
      "Search the web using DuckDuckGo. Returns titles, snippets, and URLs. Best for finding current information, documentation, tutorials, or general knowledge.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            'Search query string (e.g., "python tutorial", "weather in london")',
        },
        max_results: {
          type: "number",
          description:
            "Maximum number of results to return (default: 5, max: 10)",
        },
      },
      required: ["query"],
    },
  },
};

function searchDuckDuckGo(query, maxResults = 5) {
  return new Promise((resolve, reject) => {
    // DuckDuckGo HTML search (no API key needed)
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ChatDock/1.0)",
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeout: 10000, // 10 second timeout
    };

    https
      .get(searchUrl, options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            // Parse HTML (simple regex-based parsing for performance)
            const results = [];

            // Match result blocks
            const resultRegex =
              /<div class="result__body">[\s\S]*?<a.*?href="(.*?)".*?>(.*?)<\/a>[\s\S]*?<a class="result__snippet".*?>([\s\S]*?)<\/a>/gi;

            let match;
            let count = 0;

            while (
              (match = resultRegex.exec(data)) !== null &&
              count < maxResults
            ) {
              const url = match[1].replace(/&amp;/g, "&");
              const title = match[2].replace(/<[^>]+>/g, "").trim();
              const snippet = match[3].replace(/<[^>]+>/g, "").trim();

              // Skip if empty or invalid
              if (title && url && snippet && !url.includes("duckduckgo.com")) {
                results.push({
                  title: decodeHTML(title),
                  url: decodeHTML(url),
                  snippet: decodeHTML(snippet),
                });
                count++;
              }
            }

            resolve(results);
          } catch (err) {
            reject(new Error(`Failed to parse search results: ${err.message}`));
          }
        });
      })
      .on("error", (err) => {
        reject(new Error(`Search request failed: ${err.message}`));
      })
      .on("timeout", () => {
        reject(new Error("Search request timed out"));
      });
  });
}

// Decode HTML entities
function decodeHTML(text) {
  const entities = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&nbsp;": " ",
  };

  return text.replace(/&[^;]+;/g, (match) => entities[match] || match);
}

async function execute(args) {
  try {
    const { query, max_results = 5 } = args;

    if (!query || query.trim().length === 0) {
      return {
        success: false,
        error: "Query is required and cannot be empty",
      };
    }

    // Validate max_results
    const limit = Math.min(Math.max(1, max_results || 5), 10);

    // Perform search
    const results = await searchDuckDuckGo(query, limit);

    if (results.length === 0) {
      return {
        success: true,
        query,
        results: [],
        message: "No results found. Try different keywords.",
      };
    }

    return {
      success: true,
      query,
      count: results.length,
      results: results.map((r, i) => ({
        rank: i + 1,
        title: r.title,
        url: r.url,
        snippet: r.snippet,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: `Web search failed: ${error.message}`,
      suggestion: "Check your internet connection or try again later",
    };
  }
}

module.exports = { definition, execute };
