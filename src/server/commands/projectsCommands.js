const fs = require("node:fs");
const path = require("node:path");

function handleProjectsCommands(userMsg, state) {
  const normalizedMsg = userMsg.trim().toLowerCase();
  const { PROJECTS_DIR } = state;

  // 1. Create Project
  if (normalizedMsg.startsWith("create project") || normalizedMsg.startsWith("new project")) {
    const prefix = normalizedMsg.startsWith("create project") ? "create project" : "new project";
    const nameArg = userMsg.trim().slice(prefix.length).trim();

    if (!nameArg) {
      return {
        handled: true,
        response: "Please provide a project name, e.g. 'create project jarvis'."
      };
    }

    const slug = nameArg.toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    const projectPath = path.join(PROJECTS_DIR, slug);

    if (fs.existsSync(projectPath)) {
      return { handled: true, response: `A project called '${nameArg}' already exists.` };
    }

    try {
      fs.mkdirSync(projectPath, { recursive: true });
      const config = {
        name: nameArg,
        slug: slug,
        createdAt: new Date().toISOString(),
        description: ""
      };
      fs.writeFileSync(path.join(projectPath, "project.json"), JSON.stringify(config, null, 2), "utf-8");
      
      return { handled: true, response: `Created a new project called '${nameArg}' in your workspace.` };
    } catch (err) {
      throw err;
    }
  }

  // 2. List Projects
  if (normalizedMsg === "list projects" || normalizedMsg === "show projects") {
    try {
      if (!fs.existsSync(PROJECTS_DIR)) {
        fs.mkdirSync(PROJECTS_DIR, { recursive: true });
      }

      const dirs = fs.readdirSync(PROJECTS_DIR).filter(d => fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory());
      
      if (dirs.length === 0) {
        return { handled: true, response: "You don't have any projects yet. You can create one with 'create project <name>'." };
      }

      const projects = dirs.map(slug => {
        const configPath = path.join(PROJECTS_DIR, slug, "project.json");
        if (fs.existsSync(configPath)) {
          try {
            const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
            return { name: config.name, slug: config.slug, date: config.createdAt.split('T')[0] };
          } catch (e) {
            return { name: slug, slug: slug, date: null };
          }
        }
        return { name: slug, slug: slug, date: null };
      });

      let responseMsg = "**Here are your projects:**\n\n";
      responseMsg += projects.map(p => {
        let line = `- ${p.name}`;
        if (p.date) line += ` (created ${p.date})`;
        if (state.currentProjectSlug === p.slug) line += " **(current)**";
        return line;
      }).join("\n");

      return { handled: true, response: responseMsg };
    } catch (err) {
      throw err;
    }
  }

  // 3. Switch Project
  if (normalizedMsg.startsWith("switch project") || normalizedMsg.startsWith("use project")) {
    const prefix = normalizedMsg.startsWith("switch project") ? "switch project" : "use project";
    const nameOrSlug = userMsg.trim().slice(prefix.length).trim();

    if (!nameOrSlug) {
      return {
        handled: true,
        response: "Please specify which project to switch to, e.g. 'switch project jarvis'. You can say 'list projects' to see available projects."
      };
    }

    try {
      const dirs = fs.readdirSync(PROJECTS_DIR).filter(d => fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory());
      let matchedSlug = null;
      let matchedName = null;

      for (const slug of dirs) {
        if (slug.toLowerCase() === nameOrSlug.toLowerCase()) {
          matchedSlug = slug;
          const configPath = path.join(PROJECTS_DIR, slug, "project.json");
          if (fs.existsSync(configPath)) {
            try {
              const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
              matchedName = config.name;
            } catch (e) { matchedName = slug; }
          } else { matchedName = slug; }
          break;
        }

        const configPath = path.join(PROJECTS_DIR, slug, "project.json");
        if (fs.existsSync(configPath)) {
          try {
            const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
            if (config.name.toLowerCase() === nameOrSlug.toLowerCase()) {
              matchedSlug = slug;
              matchedName = config.name;
              break;
            }
          } catch (e) {}
        }
      }

      if (!matchedSlug) {
        return { handled: true, response: `I couldn't find a project called '${nameOrSlug}' in your workspace.` };
      }

      return {
        handled: true,
        response: `Switched to project '${matchedName}'.`,
        newState: {
          ...state,
          currentProjectSlug: matchedSlug
        }
      };
    } catch (err) {
      throw err;
    }
  }

  // 4. Current Project Info
  if (normalizedMsg === "current project" || normalizedMsg === "project info") {
    if (!state.currentProjectSlug) {
      return {
        handled: true,
        response: "You are not currently in any project. You can create one with 'create project <name>' or switch to an existing one with 'switch project <name>'."
      };
    }

    try {
      const projectPath = path.join(PROJECTS_DIR, state.currentProjectSlug);
      const configPath = path.join(projectPath, "project.json");
      let config = { name: state.currentProjectSlug, slug: state.currentProjectSlug, createdAt: "Unknown", description: "(no description set)" };

      if (fs.existsSync(configPath)) {
        try {
          config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        } catch (e) {}
      }

      const response = `**Current Project:** ${config.name}\n` +
                       `**Slug:** ${config.slug}\n` +
                       `**Created:** ${config.createdAt}\n` +
                       `**Description:** ${config.description || "(no description set)"}`;

      return { handled: true, response };
    } catch (err) {
      throw err;
    }
  }

  // 5. Set Project Description
  if (normalizedMsg.startsWith("set project description") || normalizedMsg.startsWith("update project description")) {
    if (!state.currentProjectSlug) {
      return {
        handled: true,
        response: "You are not currently in any project. Switch to a project first with 'switch project <name>' before setting its description."
      };
    }

    const prefix = normalizedMsg.startsWith("set project description") ? "set project description" : "update project description";
    const newDescription = userMsg.trim().slice(prefix.length).trim();

    if (!newDescription) {
      return {
        handled: true,
        response: "Please provide a description, e.g. 'set project description AI assistant for my local machine'."
      };
    }

    try {
      const projectPath = path.join(PROJECTS_DIR, state.currentProjectSlug);
      const configPath = path.join(projectPath, "project.json");
      let config = { 
        name: state.currentProjectSlug, 
        slug: state.currentProjectSlug, 
        createdAt: new Date().toISOString(), 
        description: "" 
      };

      if (fs.existsSync(configPath)) {
        try {
          config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        } catch (e) {}
      }

      config.description = newDescription;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

      return {
        handled: true,
        response: `Updated the description for the current project to: ${newDescription}`
      };
    } catch (err) {
      throw err;
    }
  }

  // 6. Delete Project (Initiation)
  if (normalizedMsg.startsWith("delete project") || normalizedMsg.startsWith("remove project")) {
    const prefix = normalizedMsg.startsWith("delete project") ? "delete project" : "remove project";
    const nameOrSlug = userMsg.trim().slice(prefix.length).trim();

    if (!nameOrSlug) {
      return {
        handled: true,
        response: "Please specify which project to delete, e.g. 'delete project jarvis'. You can say 'list projects' to see available projects."
      };
    }

    try {
      const dirs = fs.readdirSync(PROJECTS_DIR).filter(d => fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory());
      let matchedSlug = null;
      let matchedName = null;

      for (const slug of dirs) {
        if (slug.toLowerCase() === nameOrSlug.toLowerCase()) {
          matchedSlug = slug;
          const configPath = path.join(PROJECTS_DIR, slug, "project.json");
          if (fs.existsSync(configPath)) {
            try {
              const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
              matchedName = config.name;
            } catch (e) { matchedName = slug; }
          } else { matchedName = slug; }
          break;
        }

        const configPath = path.join(PROJECTS_DIR, slug, "project.json");
        if (fs.existsSync(configPath)) {
          try {
            const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
            if (config.name.toLowerCase() === nameOrSlug.toLowerCase()) {
              matchedSlug = slug;
              matchedName = config.name;
              break;
            }
          } catch (e) {}
        }
      }

      if (!matchedSlug) {
        return { handled: true, response: `I couldn't find a project called '${nameOrSlug}' in your workspace.` };
      }

      return {
        handled: true,
        response: `Are you sure you want to permanently delete the project '${matchedName}' and all its files? If yes, type: 'confirm delete project ${nameOrSlug}'.`,
        newState: {
          ...state,
          pendingProjectDeletionSlug: matchedSlug
        }
      };
    } catch (err) {
      throw err;
    }
  }

  // 7. Confirm Delete Project
  if (normalizedMsg.startsWith("confirm delete project")) {
    const nameOrSlug = userMsg.trim().slice("confirm delete project".length).trim();

    if (!nameOrSlug) {
      return {
        handled: true,
        response: "Please specify which project to confirm deletion for, e.g. 'confirm delete project jarvis'."
      };
    }

    try {
      const dirs = fs.readdirSync(PROJECTS_DIR).filter(d => fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory());
      let matchedSlug = null;
      let matchedName = null;

      for (const slug of dirs) {
        if (slug.toLowerCase() === nameOrSlug.toLowerCase()) {
          matchedSlug = slug;
          const configPath = path.join(PROJECTS_DIR, slug, "project.json");
          if (fs.existsSync(configPath)) {
            try {
              const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
              matchedName = config.name;
            } catch (e) { matchedName = slug; }
          } else { matchedName = slug; }
          break;
        }

        const configPath = path.join(PROJECTS_DIR, slug, "project.json");
        if (fs.existsSync(configPath)) {
          try {
            const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
            if (config.name.toLowerCase() === nameOrSlug.toLowerCase()) {
              matchedSlug = slug;
              matchedName = config.name;
              break;
            }
          } catch (e) {}
        }
      }

      if (!matchedSlug || state.pendingProjectDeletionSlug !== matchedSlug) {
        return { 
          handled: true, 
          response: `There is no pending delete operation for project '${nameOrSlug}'. You can start one with 'delete project ${nameOrSlug}'.` 
        };
      }

      const projectPath = path.join(PROJECTS_DIR, matchedSlug);
      const resolvedPath = path.resolve(projectPath);
      if (!resolvedPath.startsWith(path.resolve(PROJECTS_DIR))) {
        throw new Error("Sandbox violation");
      }

      // Execute recursive deletion
      fs.rmSync(projectPath, { recursive: true, force: true });

      const newState = { ...state, pendingProjectDeletionSlug: null };
      if (state.currentProjectSlug === matchedSlug) {
        newState.currentProjectSlug = null;
      }

      return {
        handled: true,
        response: `The project '${matchedName}' has been deleted from your workspace.`,
        newState
      };
    } catch (err) {
      throw err;
    }
  }

  return { handled: false };
}

module.exports = { handleProjectsCommands };

