const https = require("https");
const http = require("http");

/**
 * fetch-webpage.js
 * Fetch webpage content and convert to clean text
 * Cross-platform: macOS, Windows, Linux
 * Simplified HTML to text conversion
 */

const definition = {
  type: "function",
  function: {
    name: "fetch_webpage",
    description:
      "Fetch content from a URL and convert to readable text. Removes HTML tags, scripts, styles. Best for reading articles, documentation, or extracting data from websites.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to fetch (must start with http:// or https://)",
        },
        max_length: {
          type: "number",
          description:
            "Maximum content length in characters (default: 5000, max: 10000)",
        },
      },
      required: ["url"],
    },
  },
};

function fetchURL(url, maxLength = 5000) {
  return new Promise((resolve, reject) => {
    // Validate URL
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      reject(new Error("URL must start with http:// or https://"));
      return;
    }

    const protocol = url.startsWith("https://") ? https : http;

    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ChatDock/1.0)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeout: 15000, // 15 second timeout
    };

    protocol
      .get(url, options, (res) => {
        // Follow redirects
        if (res.statusCode === 301 || res.statusCode === 302) {
          if (res.headers.location) {
            fetchURL(res.headers.location, maxLength)
              .then(resolve)
              .catch(reject);
            return;
          }
        }

        // Check status code
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        let data = "";
        let size = 0;
        const maxSize = maxLength * 3; // Allow 3x for HTML overhead

        res.on("data", (chunk) => {
          size += chunk.length;

          // Prevent memory issues with huge pages
          if (size > maxSize) {
            res.destroy();
            reject(new Error("Page too large (exceeds 30KB limit)"));
            return;
          }

          data += chunk;
        });

        res.on("end", () => {
          try {
            // Convert HTML to text
            let text = htmlToText(data);

            // Trim to max length
            if (text.length > maxLength) {
              text = text.substring(0, maxLength) + "... [truncated]";
            }

            resolve({
              content: text,
              size: text.length,
              originalSize: data.length,
            });
          } catch (err) {
            reject(new Error(`Failed to process content: ${err.message}`));
          }
        });
      })
      .on("error", (err) => {
        reject(new Error(`Fetch failed: ${err.message}`));
      })
      .on("timeout", () => {
        reject(new Error("Fetch timed out (15s limit)"));
      });
  });
}

// Convert HTML to readable text
function htmlToText(html) {
  let text = html;

  // Remove scripts and styles
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // Remove comments
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  // Convert common HTML entities
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  // Add newlines for block elements
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/div>/gi, "\n");
  text = text.replace(/<\/h[1-6]>/gi, "\n\n");
  text = text.replace(/<\/li>/gi, "\n");

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Clean up whitespace
  text = text.replace(/\n\s*\n/g, "\n\n"); // Remove multiple blank lines
  text = text.replace(/  +/g, " "); // Remove multiple spaces
  text = text.trim();

  return text;
}

async function execute(args) {
  try {
    const { url, max_length = 5000 } = args;

    if (!url) {
      return {
        success: false,
        error: "URL is required",
      };
    }

    // Validate max_length
    const limit = Math.min(Math.max(1000, max_length || 5000), 10000);

    // Fetch content
    const result = await fetchURL(url, limit);

    return {
      success: true,
      url,
      content: result.content,
      size: result.size,
      truncated: result.size === limit,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch webpage: ${error.message}`,
      url: args.url,
    };
  }
}

module.exports = { definition, execute };
