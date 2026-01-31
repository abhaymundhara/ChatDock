const fs = require("node:fs");
const path = require("node:path");

const SKILL_MANIFEST = "skill.json";
const ALLOWED_REQUIRED_CAPS = ["read_file", "write_file", "os_action"];

function sanitizeFilename(raw) {
  if (!raw) return "";
  return raw.replace(/^["'`]/, "").replace(/["'`]+$/, "").replace(/[.,!?]+$/, "");
}

function extractFilename(message) {
  const quoted = message.match(/["'`](.+?)["'`]/);
  if (quoted && quoted[1]) {
    return sanitizeFilename(quoted[1]);
  }

  const saveAs = message.match(/\bsave\s+(?:it\s+)?(?:as|to)\s+([^\s]+)\b/i);
  if (saveAs && saveAs[1]) {
    return sanitizeFilename(saveAs[1]);
  }

  const openRead = message.match(/\b(?:open|read)\s+([^\s]+)\b/i);
  if (openRead && openRead[1] && openRead[1].includes(".")) {
    return sanitizeFilename(openRead[1]);
  }

  const token = message.match(/([\w./-]+\.[A-Za-z0-9]{1,8})/);
  if (token && token[1]) {
    return sanitizeFilename(token[1]);
  }

  return "";
}

function buildPlanBase(goal, steps, assumptions = []) {
  return {
    goal,
    steps,
    assumptions,
    requires_user_confirmation: true
  };
}

const writeAndSaveDocSkill = {
  id: "write_and_save_doc",
  name: "Write and save doc",
  description: "Drafts requested content and saves it to a file in the workspace (or a specified path).",
  match: (userMessage) => {
    const msg = userMessage.toLowerCase();
    const hasWrite = /\b(write|draft|create|compose)\b/.test(msg);
    const hasSave = /\bsave\b/.test(msg);
    return hasWrite && hasSave ? 0.9 : 0;
  },
  buildPlan: async (userMessage, context) => {
    const assumptions = [];
    let filename = extractFilename(userMessage);

    if (!filename) {
      filename = "document.md";
      assumptions.push("No filename specified; defaulting to document.md in the workspace.");
    }

    if (!path.extname(filename)) {
      filename = `${filename}.md`;
      assumptions.push("No file extension specified; using .md.");
    }

    const content = context?.generateContent
      ? await context.generateContent(userMessage, {
          skillId: "write_and_save_doc",
          filename
        })
      : "";

    const goal = `Write the requested content and save it as ${filename}.`;
    const steps = [
      {
        id: 1,
        type: "write_file",
        description: `Create ${filename} with content: ${content}`
      }
    ];

    return buildPlanBase(goal, steps, assumptions);
  }
};

const openAndSummarizeSkill = {
  id: "open_and_summarize_resource",
  name: "Open and summarize resource",
  description: "Opens a file and summarizes its contents.",
  match: (userMessage) => {
    const msg = userMessage.toLowerCase();
    const hasSummary = /\b(summarize|summary)\b/.test(msg);
    const filename = extractFilename(userMessage);
    const hasOpen = /\b(open|read)\b/.test(msg);
    if (hasSummary && filename) {
      return hasOpen ? 0.95 : 0.85;
    }
    return 0;
  },
  buildPlan: (userMessage) => {
    const filename = extractFilename(userMessage);
    const goal = `Open ${filename} and summarize its contents.`;
    const steps = [
      {
        id: 1,
        type: "read_file",
        description: `Read ${filename} to summarize it.`
      },
      {
        id: 2,
        type: "analyze_content",
        description: "Summarize the content from step 1."
      }
    ];
    return buildPlanBase(goal, steps);
  }
};

const organizeWorkspaceSkill = {
  id: "organize_workspace_files",
  name: "Organize workspace files",
  description: "Organizes workspace or project files by type using OS commands.",
  match: (userMessage) => {
    const msg = userMessage.toLowerCase();
    const hasOrganize = /\b(organize|clean up|cleanup|tidy)\b/.test(msg);
    const hasScope = /\b(workspace|project|folder|files)\b/.test(msg);
    return hasOrganize && hasScope ? 0.8 : 0;
  },
  buildPlan: (userMessage, context) => {
    const assumptions = [];
    const projectSlug = context?.currentProjectSlug;
    const baseRoot = context?.workspaceRoot || ".";
    const projectsDir = context?.projectsDir || baseRoot;
    const targetRoot = projectSlug
      ? path.join(projectsDir, projectSlug)
      : baseRoot;

    if (!projectSlug) {
      assumptions.push("No active project was detected; using the workspace root.");
    }

    const goal = `Organize files in ${projectSlug ? `project "${projectSlug}"` : "the workspace"}.`;
    const steps = [
      {
        id: 1,
        type: "os_action",
        description: `Run command: find "${targetRoot}" -maxdepth 1 -type f`
      },
      {
        id: 2,
        type: "os_action",
        description: `Run command: mkdir -p "${targetRoot}/docs" "${targetRoot}/assets" "${targetRoot}/misc"`
      },
      {
        id: 3,
        type: "os_action",
        description: `Run command: find "${targetRoot}" -maxdepth 1 -type f \\( -name "*.md" -o -name "*.txt" \\) -exec mv {} "${targetRoot}/docs/" \\;`
      },
      {
        id: 4,
        type: "os_action",
        description: `Run command: find "${targetRoot}" -maxdepth 1 -type f \\( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.gif" -o -name "*.svg" \\) -exec mv {} "${targetRoot}/assets/" \\;`
      },
      {
        id: 5,
        type: "os_action",
        description: `Run command: find "${targetRoot}" -maxdepth 1 -type f -exec mv {} "${targetRoot}/misc/" \\;`
      }
    ];

    return buildPlanBase(goal, steps, assumptions);
  }
};

const SKILLS = [
  writeAndSaveDocSkill,
  openAndSummarizeSkill,
  organizeWorkspaceSkill
];

function validateSkillManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") {
    return { valid: false, errors: ["Skill manifest is missing or invalid."] };
  }

  if (!manifest.name || typeof manifest.name !== "string") {
    errors.push("Skill manifest must include a name.");
  }

  if (!manifest.version || typeof manifest.version !== "string") {
    errors.push("Skill manifest must include a version.");
  }

  if (!Array.isArray(manifest.requiredCaps)) {
    errors.push("Skill manifest must include requiredCaps as an array.");
  } else {
    const invalidCaps = manifest.requiredCaps.filter(
      (cap) => !ALLOWED_REQUIRED_CAPS.includes(cap)
    );
    if (invalidCaps.length) {
      errors.push(
        `Invalid requiredCaps values: ${invalidCaps.join(", ")}. Allowed: ${ALLOWED_REQUIRED_CAPS.join(", ")}.`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

function loadInstalledSkills(skillsDir) {
  if (!skillsDir || !fs.existsSync(skillsDir)) return [];

  const entries = [];
  const dirs = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const dir of dirs) {
    const manifestPath = path.join(skillsDir, dir, SKILL_MANIFEST);
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const manifest = JSON.parse(raw);
      const validation = validateSkillManifest(manifest);
      if (!validation.valid) continue;
      entries.push({
        id: dir,
        name: manifest.name,
        version: manifest.version,
        requiredCaps: manifest.requiredCaps || [],
        description: manifest.description || "",
        source: "installed",
        manifestPath
      });
    } catch {
      continue;
    }
  }

  return entries;
}

function findMatchingSkill(userMessage, context) {
  let bestSkill = null;
  let bestScore = 0;

  for (const skill of SKILLS) {
    const result = skill.match(userMessage, context);
    const score = typeof result === "boolean" ? (result ? 1 : 0) : Number(result) || 0;
    if (score > bestScore) {
      bestScore = score;
      bestSkill = skill;
    }
  }

  if (!bestSkill || bestScore < 0.5) {
    return null;
  }

  return bestSkill;
}

function getAllSkills(options = {}) {
  const base = SKILLS.map(({ id, name, description }) => ({
    id,
    name,
    description,
    source: "builtin",
    version: null,
    requiredCaps: []
  }));
  const installed = loadInstalledSkills(options.skillsDir);
  return base.concat(installed);
}

module.exports = {
  findMatchingSkill,
  getAllSkills,
  loadInstalledSkills,
  validateSkillManifest,
  ALLOWED_REQUIRED_CAPS,
  SKILL_MANIFEST
};
