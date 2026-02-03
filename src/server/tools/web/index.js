/**
 * Web Tools Plugin
 * Provides web scraping and HTTP operations
 */

// Tool definitions
const tools = [
  {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Fetch content from a URL",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL to fetch",
          },
          method: {
            type: "string",
            description: "HTTP method (GET, POST, etc.)",
            enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
          },
          headers: {
            type: "object",
            description: "HTTP headers",
          },
          body: {
            type: "string",
            description: "Request body (for POST/PUT/PATCH)",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scrape_page",
      description: "Scrape and extract content from a web page",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL to scrape",
          },
          selector: {
            type: "string",
            description: "CSS selector to extract specific elements",
          },
        },
        required: ["url"],
      },
    },
  },
];

// Tool executors
const executors = {
  async fetch_url({ url, method = "GET", headers = {}, body }) {
    try {
      const options = {
        method,
        headers: {
          "User-Agent": "ChatDock/1.0",
          ...headers,
        },
      };

      if (body && ["POST", "PUT", "PATCH"].includes(method)) {
        options.body = body;
      }

      const response = await fetch(url, options);
      const contentType = response.headers.get("content-type") || "";

      let content;
      if (contentType.includes("application/json")) {
        content = await response.json();
      } else {
        content = await response.text();
      }

      return {
        success: true,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        content,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  },

  async scrape_page({ url, selector }) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "ChatDock/1.0" },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const html = await response.text();

      // If selector provided, we'd need a DOM parser like cheerio
      // For now, return full HTML
      if (selector) {
        return {
          success: false,
          error:
            "Selector-based scraping not yet implemented. Install cheerio to enable.",
        };
      }

      return {
        success: true,
        html,
        url,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

// Plugin metadata
module.exports = {
  name: "Web Tools",
  description: "Web scraping and HTTP operations",
  version: "1.0.0",
  category: "web",
  tools,
  executors,
  metadata: {
    specialists: ["web"], // Which specialists can use this plugin
    tags: ["web", "http", "scraping", "fetch"],
  },
};
