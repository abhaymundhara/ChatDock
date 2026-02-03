/**
 * GitHub Skill
 * Interact with GitHub repositories
 */

// Node 18+ global fetch used

// Tool definitions
const tools = [
  {
    type: "function",
    function: {
      name: "github_search_repos",
      description: "Search for GitHub repositories",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query (e.g., 'language:javascript stars:>1000')",
          },
          sort: {
            type: "string",
            enum: ["stars", "forks", "updated"],
            description: "Sort by (default: best match)",
          },
          limit: {
            type: "number",
            description: "Number of results (max 30, default 10)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_get_repo",
      description: "Get information about a GitHub repository",
      parameters: {
        type: "object",
        properties: {
          owner: {
            type: "string",
            description: "Repository owner (username or organization)",
          },
          repo: {
            type: "string",
            description: "Repository name",
          },
        },
        required: ["owner", "repo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_list_issues",
      description: "List issues for a repository",
      parameters: {
        type: "object",
        properties: {
          owner: {
            type: "string",
            description: "Repository owner",
          },
          repo: {
            type: "string",
            description: "Repository name",
          },
          state: {
            type: "string",
            enum: ["open", "closed", "all"],
            description: "Issue state (default: open)",
          },
          limit: {
            type: "number",
            description: "Number of issues (max 30, default 10)",
          },
        },
        required: ["owner", "repo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_get_file",
      description: "Get contents of a file from a repository",
      parameters: {
        type: "object",
        properties: {
          owner: {
            type: "string",
            description: "Repository owner",
          },
          repo: {
            type: "string",
            description: "Repository name",
          },
          path: {
            type: "string",
            description: "File path in repository (e.g., 'README.md', 'src/index.js')",
          },
          branch: {
            type: "string",
            description: "Branch name (default: main/master)",
          },
        },
        required: ["owner", "repo", "path"],
      },
    },
  },
];

// Helper function to get GitHub token from config
function getGitHubToken(context) {
  return context?.config?.github?.token || null;
}

// Helper function to make GitHub API requests
async function githubRequest(endpoint, token = null) {
  const headers = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "ChatDock",
  };

  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  const response = await fetch(`https://api.github.com${endpoint}`, { headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `GitHub API error: ${response.status}`);
  }

  return await response.json();
}

// Tool executors
const executors = {
  async github_search_repos({ query, sort, limit = 10 }) {
    try {
      const token = getGitHubToken(arguments[0].__context);
      const params = new URLSearchParams({
        q: query,
        per_page: Math.min(limit, 30),
      });

      if (sort) params.append("sort", sort);

      const data = await githubRequest(`/search/repositories?${params}`, token);

      return {
        success: true,
        total_count: data.total_count,
        repositories: data.items.map((repo) => ({
          name: repo.full_name,
          description: repo.description,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          language: repo.language,
          url: repo.html_url,
          updated: repo.updated_at,
        })),
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async github_get_repo({ owner, repo }) {
    try {
      const token = getGitHubToken(arguments[0].__context);
      const data = await githubRequest(`/repos/${owner}/${repo}`, token);

      return {
        success: true,
        repository: {
          name: data.full_name,
          description: data.description,
          stars: data.stargazers_count,
          forks: data.forks_count,
          watchers: data.watchers_count,
          language: data.language,
          open_issues: data.open_issues_count,
          default_branch: data.default_branch,
          created: data.created_at,
          updated: data.updated_at,
          url: data.html_url,
          topics: data.topics,
          license: data.license?.name,
        },
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async github_list_issues({ owner, repo, state = "open", limit = 10 }) {
    try {
      const token = getGitHubToken(arguments[0].__context);
      const params = new URLSearchParams({
        state,
        per_page: Math.min(limit, 30),
      });

      const data = await githubRequest(`/repos/${owner}/${repo}/issues?${params}`, token);

      return {
        success: true,
        count: data.length,
        issues: data.map((issue) => ({
          number: issue.number,
          title: issue.title,
          state: issue.state,
          author: issue.user.login,
          labels: issue.labels.map((l) => l.name),
          comments: issue.comments,
          created: issue.created_at,
          updated: issue.updated_at,
          url: issue.html_url,
        })),
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async github_get_file({ owner, repo, path, branch }) {
    try {
      const token = getGitHubToken(arguments[0].__context);
      const ref = branch ? `?ref=${branch}` : "";
      const data = await githubRequest(`/repos/${owner}/${repo}/contents/${path}${ref}`, token);

      if (data.type !== "file") {
        return { success: false, error: "Path is not a file" };
      }

      // Decode base64 content
      const content = Buffer.from(data.content, "base64").toString("utf-8");

      return {
        success: true,
        file: {
          path: data.path,
          name: data.name,
          size: data.size,
          content,
          url: data.html_url,
          sha: data.sha,
        },
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

// Plugin metadata
module.exports = {
  name: "GitHub",
  description: "Interact with GitHub repositories",
  version: "1.0.0",
  category: "github",
  tools,
  executors,
  metadata: {
    tags: ["github", "git", "repository", "code"],
    note: "Works without token (60 req/hour). Add token in config for 5000 req/hour.",
  },
};
