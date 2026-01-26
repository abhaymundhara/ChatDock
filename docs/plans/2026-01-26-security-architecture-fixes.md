# Security + Architecture Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden remote access with auth + confirmation, unify config/ports/prompt, remove command-injection risks, and clean workflow gaps.

**Architecture:** Add auth middleware with optional IP allowlist and bearer token; introduce confirmation nonce store for tool execution; standardize userData/appPath config; move shared model selection logic; align prompt pipeline; replace shell interpolation with safe process spawning and native fetch.

**Tech Stack:** Electron, Node.js (node:test), Express.

---

### Task 1: Add API key storage + auth utility helpers

**Files:**
- Create: `src/server/utils/auth.js`
- Modify: `src/server/utils/settings-store.js`
- Modify: `tests/settings-store.spec.mjs`
- Create: `tests/auth.spec.mjs`

**Step 1: Write the failing tests**

`tests/settings-store.spec.mjs`
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSettings } from '../src/server/utils/settings-store.js';

test('mergeSettings applies defaults', () => {
  const merged = mergeSettings({});
  assert.equal(merged.hotkey, 'CommandOrControl+Shift+Space');
  assert.equal(merged.temperature, 0.7);
  assert.ok(typeof merged.systemPrompt === 'string');
  assert.ok('apiKey' in merged);
});
```

`tests/auth.spec.mjs`
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeIp,
  parseAllowedIps,
  isIpAllowed,
  getBearerToken,
  isAuthorized
} from '../src/server/utils/auth.js';

test('normalizeIp strips ipv6 prefix', () => {
  assert.equal(normalizeIp('::ffff:127.0.0.1'), '127.0.0.1');
});

test('parseAllowedIps handles empty', () => {
  assert.deepEqual(parseAllowedIps(''), []);
});

test('isIpAllowed allows when list empty', () => {
  assert.equal(isIpAllowed('10.0.0.1', []), true);
});

test('isIpAllowed supports cidr', () => {
  const list = parseAllowedIps('10.0.0.0/24');
  assert.equal(isIpAllowed('10.0.0.42', list), true);
  assert.equal(isIpAllowed('10.0.1.1', list), false);
});

test('isAuthorized checks bearer token', () => {
  assert.equal(isAuthorized(getBearerToken('Bearer abc'), 'abc'), true);
  assert.equal(isAuthorized(getBearerToken('Bearer wrong'), 'abc'), false);
});
```

**Step 2: Run tests to verify they fail**

Run:
```
node --test tests/settings-store.spec.mjs tests/auth.spec.mjs
```
Expected: FAIL because `apiKey` and auth helpers don’t exist yet.

**Step 3: Write minimal implementation**

`src/server/utils/settings-store.js`
```js
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULTS = {
  hotkey: 'CommandOrControl+Shift+Space',
  systemPrompt: '',
  temperature: 0.7,
  apiKey: ''
};

function mergeSettings(partial) {
  return { ...DEFAULTS, ...(partial || {}) };
}

function getSettingsPath(userDataPath) {
  return path.join(userDataPath, 'settings.json');
}

function loadSettings(userDataPath) {
  try {
    const raw = fs.readFileSync(getSettingsPath(userDataPath), 'utf-8');
    return mergeSettings(JSON.parse(raw));
  } catch {
    return mergeSettings({});
  }
}

function saveSettings(userDataPath, settings) {
  const merged = mergeSettings(settings);
  fs.writeFileSync(getSettingsPath(userDataPath), JSON.stringify(merged, null, 2));
  return merged;
}

function ensureApiKey(userDataPath) {
  const existing = loadSettings(userDataPath);
  if (existing.apiKey) return existing.apiKey;
  const apiKey = crypto.randomBytes(32).toString('hex');
  saveSettings(userDataPath, { ...existing, apiKey });
  return apiKey;
}

module.exports = { DEFAULTS, mergeSettings, loadSettings, saveSettings, getSettingsPath, ensureApiKey };
```

`src/server/utils/auth.js`
```js
function getBearerToken(headerValue) {
  if (!headerValue) return '';
  const match = String(headerValue).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function normalizeIp(ip) {
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

function parseAllowedIps(envValue) {
  if (!envValue) return [];
  return envValue
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .map(entry => {
      if (entry.includes('/')) {
        const [base, bits] = entry.split('/');
        return { type: 'cidr', base: normalizeIp(base), bits: Number(bits) };
      }
      return { type: 'ip', value: normalizeIp(entry) };
    });
}

function ipToInt(ip) {
  const parts = ip.split('.').map(n => Number(n));
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function isIpAllowed(ip, allowedList) {
  if (!allowedList || allowedList.length === 0) return true;
  const normalized = normalizeIp(ip);
  for (const entry of allowedList) {
    if (entry.type === 'ip') {
      if (normalized === entry.value) return true;
    } else if (entry.type === 'cidr') {
      const ipInt = ipToInt(normalized);
      const baseInt = ipToInt(entry.base);
      if (ipInt === null || baseInt === null) continue;
      const mask = entry.bits === 0 ? 0 : (~0 << (32 - entry.bits)) >>> 0;
      if ((ipInt & mask) === (baseInt & mask)) return true;
    }
  }
  return false;
}

function isAuthorized(token, apiKey) {
  if (!apiKey) return false;
  return token === apiKey;
}

function createAuthMiddleware({ apiKey, allowedIps }) {
  const allowedList = parseAllowedIps(allowedIps || '');
  return (req, res, next) => {
    if (req.path === '/health') return next();
    const ip = normalizeIp(req.ip || req.socket?.remoteAddress || '');
    if (!isIpAllowed(ip, allowedList)) {
      return res.status(403).json({ error: 'IP not allowed' });
    }
    const token = getBearerToken(req.headers?.authorization);
    if (!isAuthorized(token, apiKey)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return next();
  };
}

module.exports = {
  getBearerToken,
  normalizeIp,
  parseAllowedIps,
  isIpAllowed,
  isAuthorized,
  createAuthMiddleware
};
```

**Step 4: Run tests to verify they pass**

Run:
```
node --test tests/settings-store.spec.mjs tests/auth.spec.mjs
```
Expected: PASS.

**Step 5: Commit**
```
git add src/server/utils/settings-store.js src/server/utils/auth.js tests/settings-store.spec.mjs tests/auth.spec.mjs
git commit -m "feat: add api key defaults and auth helpers"
```

---

### Task 2: Wire API key + auth headers into main/preload/renderer

**Files:**
- Modify: `src/main/main.js`
- Modify: `src/renderer/preload.js`
- Modify: `src/renderer/ace-interface.html`
- Modify: `tests/server-launch.spec.mjs`
- Modify: `tests/preload.spec.mjs`

**Step 1: Write the failing tests**

`tests/server-launch.spec.mjs`
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServerEnv } from '../src/main/main.js';

test('server env includes port/model/base', () => {
  const env = buildServerEnv({ port: 3456, model: 'm1', base: 'http://127.0.0.1:11434', apiKey: 'k1', host: '0.0.0.0', userDataPath: '/tmp/user', appPath: '/tmp/app' });
  assert.equal(env.CHAT_SERVER_PORT, '3456');
  assert.equal(env.OLLAMA_MODEL, 'm1');
  assert.equal(env.OLLAMA_BASE, 'http://127.0.0.1:11434');
  assert.equal(env.CHATDOCK_API_KEY, 'k1');
  assert.equal(env.CHAT_SERVER_HOST, '0.0.0.0');
  assert.equal(env.CHATDOCK_USER_DATA, '/tmp/user');
  assert.equal(env.CHATDOCK_APP_PATH, '/tmp/app');
});
```

`tests/preload.spec.mjs`
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getChatBase, getAuthHeaders } from '../src/renderer/preload.js';

test('preload exposes chat base url', () => {
  const base = getChatBase({ port: 3001 });
  assert.equal(base, 'http://127.0.0.1:3001');
});

test('preload provides auth headers', () => {
  const headers = getAuthHeaders({ apiKey: 'secret' });
  assert.equal(headers.Authorization, 'Bearer secret');
});
```

**Step 2: Run tests to verify they fail**

Run:
```
node --test tests/server-launch.spec.mjs tests/preload.spec.mjs
```
Expected: FAIL because new args/functions don’t exist yet.

**Step 3: Write minimal implementation**

`src/main/main.js` (update helpers + env setup)
```js
const { loadSettings, saveSettings, ensureApiKey } = require("../server/utils/settings-store");
// ...
function buildServerEnv({ port, model, base, apiKey, host, userDataPath, appPath }) {
  return {
    ...process.env,
    CHAT_SERVER_PORT: String(port),
    CHAT_SERVER_HOST: host,
    OLLAMA_MODEL: model,
    OLLAMA_BASE: base,
    CHATDOCK_API_KEY: apiKey,
    CHATDOCK_USER_DATA: userDataPath,
    CHATDOCK_APP_PATH: appPath
  };
}

async function boot() {
  const port = await findAvailablePort(DEFAULT_PORT);
  const userDataPath = app.getPath("userData");
  const appPath = app.getAppPath();
  const apiKey = ensureApiKey(userDataPath);
  const host = process.env.CHAT_SERVER_HOST || "0.0.0.0";

  process.env.CHAT_SERVER_PORT = String(port);
  process.env.CHAT_SERVER_HOST = host;

  startServer({ port, model: DEFAULT_MODEL, base: DEFAULT_BASE, apiKey, host, userDataPath, appPath });
  // ...
}

function startServer({ port, model, base, apiKey, host, userDataPath, appPath }) {
  const env = buildServerEnv({ port, model, base, apiKey, host, userDataPath, appPath });
  if (app && typeof app.getPath === "function") {
    env.USER_DATA_PATH = app.getPath("userData");
  }
  // ...
}
```

`src/renderer/preload.js`
```js
function getChatBase({ port }) {
  return `http://127.0.0.1:${port}`;
}

function getAuthHeaders({ apiKey }) {
  if (!apiKey) return {};
  return { Authorization: `Bearer ${apiKey}` };
}

if (contextBridge && typeof contextBridge.exposeInMainWorld === 'function') {
  contextBridge.exposeInMainWorld('__CHAT_BASE__', {
    get: () => getChatBase({ port: Number(process.env.CHAT_SERVER_PORT || 3001) })
  });
  contextBridge.exposeInMainWorld('__CHAT_AUTH__', {
    get: () => getAuthHeaders({ apiKey: process.env.CHATDOCK_API_KEY })
  });
  // ...
}

module.exports = { getChatBase, getAuthHeaders };
```

`src/renderer/ace-interface.html` (fetch helper)
```js
function getAuthHeaders() {
  const auth = window.__CHAT_AUTH__ && window.__CHAT_AUTH__.get ? window.__CHAT_AUTH__.get() : {};
  return auth || {};
}

async function loadModels() {
  try {
    const res = await fetch(`${CHAT_BASE}/models`, { headers: getAuthHeaders() });
    // ...
  } catch (e) { /* ... */ }
}
// apply getAuthHeaders() to all fetch() calls
```

**Step 4: Run tests to verify they pass**

Run:
```
node --test tests/server-launch.spec.mjs tests/preload.spec.mjs
```
Expected: PASS.

**Step 5: Commit**
```
git add src/main/main.js src/renderer/preload.js src/renderer/ace-interface.html tests/server-launch.spec.mjs tests/preload.spec.mjs
git commit -m "feat: wire api key env and auth headers"
```

---

### Task 3: Enforce auth + confirmation in server-orchestrator

**Files:**
- Create: `src/server/utils/confirmation-store.js`
- Modify: `src/server/server-orchestrator.js`
- Create: `tests/confirmation-store.spec.mjs`

**Step 1: Write the failing tests**

`tests/confirmation-store.spec.mjs`
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfirmationStore } from '../src/server/utils/confirmation-store.js';

test('confirmation store validates matching params', () => {
  const store = new ConfirmationStore({ ttlMs: 1000 });
  const { id } = store.issue('run_command', { cmd: 'ls' });
  const ok = store.verify(id, 'run_command', { cmd: 'ls' });
  assert.equal(ok, true);
});

test('confirmation store rejects mismatched params', () => {
  const store = new ConfirmationStore({ ttlMs: 1000 });
  const { id } = store.issue('run_command', { cmd: 'ls' });
  const ok = store.verify(id, 'run_command', { cmd: 'rm' });
  assert.equal(ok, false);
});
```

**Step 2: Run tests to verify they fail**

Run:
```
node --test tests/confirmation-store.spec.mjs
```
Expected: FAIL because confirmation store doesn’t exist.

**Step 3: Write minimal implementation**

`src/server/utils/confirmation-store.js`
```js
const crypto = require('node:crypto');

function stableStringify(value) {
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      return `[${value.map(stableStringify).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashPayload(tool, params) {
  const payload = `${tool}:${stableStringify(params)}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

class ConfirmationStore {
  constructor({ ttlMs = 2 * 60 * 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.store = new Map();
  }

  issue(tool, params) {
    const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + this.ttlMs;
    this.store.set(id, { hash: hashPayload(tool, params), expiresAt });
    return { id, expiresAt };
  }

  verify(id, tool, params) {
    const entry = this.store.get(id);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(id);
      return false;
    }
    const ok = entry.hash === hashPayload(tool, params);
    if (ok) this.store.delete(id);
    return ok;
  }
}

module.exports = { ConfirmationStore };
```

`src/server/server-orchestrator.js` (auth + confirmation)
```js
const { createAuthMiddleware } = require('./utils/auth');
const { ConfirmationStore } = require('./utils/confirmation-store');
// ...
const confirmationStore = new ConfirmationStore();

app.use(createAuthMiddleware({
  apiKey: process.env.CHATDOCK_API_KEY,
  allowedIps: process.env.CHATDOCK_ALLOWED_IPS || ''
}));

app.post('/tools/execute', async (req, res) => {
  const { name, params, confirmationId } = req.body;
  const tool = orchestrator.tools.get(name);
  if (!tool) return res.status(404).json({ error: `Tool not found: ${name}` });

  if (tool.requiresConfirmation) {
    if (!confirmationId) {
      const { id, expiresAt } = confirmationStore.issue(name, params);
      return res.json({ requiresConfirmation: true, confirmationId: id, expiresAt, tool: name, params });
    }
    const ok = confirmationStore.verify(confirmationId, name, params);
    if (!ok) return res.status(403).json({ error: 'Invalid or expired confirmation' });
  }
  const result = await orchestrator.tools.execute(name, params);
  res.json({ success: true, result });
});
```

**Step 4: Run tests to verify they pass**

Run:
```
node --test tests/confirmation-store.spec.mjs
```
Expected: PASS.

**Step 5: Commit**
```
git add src/server/utils/confirmation-store.js src/server/server-orchestrator.js tests/confirmation-store.spec.mjs
git commit -m "feat: enforce tool confirmations on server"
```

---

### Task 4: Unify port/host binding + userData paths + prompt pipeline

**Files:**
- Modify: `src/server/server-orchestrator.js`
- Modify: `src/server/server.js`
- Modify: `src/server/orchestrator/prompt-builder.js`

**Step 1: Write the failing test**

`tests/orchestrator.spec.mjs`
```js
import { it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PromptBuilder } from '../src/server/orchestrator/index.js';

it('PromptBuilder honors CHATDOCK_APP_PATH when provided', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chatdock-brain-'));
  const brainDir = path.join(tmp, 'brain');
  fs.mkdirSync(brainDir, { recursive: true });
  fs.writeFileSync(path.join(brainDir, 'AGENTS.md'), 'TEST_BRAIN_MARKER');
  process.env.CHATDOCK_APP_PATH = tmp;
  const builder = new PromptBuilder();
  const prompt = builder.build();
  assert.ok(prompt.includes('TEST_BRAIN_MARKER'));
});
```

**Step 2: Run tests to verify they fail**

Run:
```
node --test tests/orchestrator.spec.mjs
```
Expected: FAIL once the env usage is required.

**Step 3: Write minimal implementation**

`src/server/orchestrator/prompt-builder.js`
```js
class PromptBuilder {
  constructor(options = {}) {
    const appPath = process.env.CHATDOCK_APP_PATH || process.cwd();
    this.brainDir = options.brainDir || path.join(appPath, 'brain');
    this.basePrompt = this.loadBrain() || this.getDefaultBasePrompt();
    this.thinkingMode = options.thinkingMode || 'balanced';
  }
  // ...
}
```

`src/server/server-orchestrator.js`
```js
const PORT = Number(process.env.CHAT_SERVER_PORT || 3001);
const HOST = process.env.CHAT_SERVER_HOST || '0.0.0.0';
const USER_DATA = process.env.CHATDOCK_USER_DATA || process.env.USER_DATA_PATH || __dirname;

const LAST_MODEL_PATH = path.join(USER_DATA, 'last_model.txt');

const { PromptBuilder } = require('./orchestrator/prompt-builder');
const promptBuilder = new PromptBuilder();
const SYSTEM_PROMPT = promptBuilder.build();

// remove findAvailablePort loop; bind directly
server.listen(PORT, HOST);
```

`src/server/server.js`
```js
const HOST = process.env.CHAT_SERVER_HOST || '0.0.0.0';
const USER_DATA = process.env.CHATDOCK_USER_DATA || process.env.USER_DATA_PATH || __dirname;
const LAST_MODEL_PATH = path.join(USER_DATA, 'last_model.txt');

server.listen(PORT, HOST);
```

**Step 4: Run tests to verify they pass**

Run:
```
node --test tests/orchestrator.spec.mjs
```
Expected: PASS.

**Step 5: Commit**
```
git add src/server/orchestrator/prompt-builder.js src/server/server-orchestrator.js src/server/server.js
git commit -m "refactor: unify prompt path and server binding"
```

---

### Task 5: Move model selection to shared module

**Files:**
- Create: `src/shared/choose-model.js`
- Modify: `src/renderer/components/model-selection.js`
- Modify: `src/server/server-orchestrator.js`
- Modify: `src/server/server.js`
- Modify: `tests/model-selection.spec.mjs`

**Step 1: Write the failing test**

`tests/model-selection.spec.mjs`
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseModel } from '../src/shared/choose-model.js';

// (same tests as before)
```

**Step 2: Run tests to verify they fail**

Run:
```
node --test tests/model-selection.spec.mjs
```
Expected: FAIL because shared module doesn’t exist.

**Step 3: Write minimal implementation**

`src/shared/choose-model.js`
```js
function normalize(val) {
  if (!val) return '';
  return String(val).trim();
}

function chooseModel({ requested, last, available }) {
  const req = normalize(requested);
  if (req) return req;

  const lastModel = normalize(last);
  if (lastModel) return lastModel;

  if (Array.isArray(available) && available.length > 0) {
    const first = normalize(available[0]);
    return first || null;
  }

  return null;
}

module.exports = { chooseModel };
```

`src/renderer/components/model-selection.js`
```js
const { chooseModel } = require('../../shared/choose-model');
module.exports = { chooseModel };
```

Update server imports to use `../shared/choose-model`.

**Step 4: Run tests to verify they pass**

Run:
```
node --test tests/model-selection.spec.mjs
```
Expected: PASS.

**Step 5: Commit**
```
git add src/shared/choose-model.js src/renderer/components/model-selection.js src/server/server-orchestrator.js src/server/server.js tests/model-selection.spec.mjs
git commit -m "refactor: share model selection logic"
```

---

### Task 6: Replace shell interpolation in search/git tools

**Files:**
- Modify: `src/server/tools/search.js`
- Modify: `src/server/tools/git.js`
- Modify: `tests/tools.spec.mjs`

**Step 1: Write the failing test**

`tests/tools.spec.mjs` (existing test should fail; keep as red proof)
```js
// git_log test already fails due to shell pipe; leave in place as red
```

**Step 2: Run tests to verify they fail**

Run:
```
node --test tests/tools.spec.mjs
```
Expected: FAIL on `git_log`.

**Step 3: Write minimal implementation**

`src/server/tools/git.js`
```js
const { execFileSync } = require('node:child_process');
// ...
const args = ['log', '-n', String(count), `--format=${oneline ? '%h|%s|%an|%ar' : '%H%n%s%n%an <%ae>%n%ad%n%b%n---'}`];
const log = execFileSync('git', args, { cwd: dir, encoding: 'utf-8' });
```

`src/server/tools/search.js`
```js
const { spawn } = require('node:child_process');

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, opts);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => (stdout += d.toString()));
    child.stderr.on('data', d => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

// use runCmd for rg/grep/ddgr/curl with args arrays
```

**Step 4: Run tests to verify they pass**

Run:
```
node --test tests/tools.spec.mjs
```
Expected: PASS.

**Step 5: Commit**
```
git add src/server/tools/search.js src/server/tools/git.js tests/tools.spec.mjs
git commit -m "fix: remove shell interpolation in tools"
```

---

### Task 7: Fix Files/PageIndex paths, .gitignore, CI, and package manager hygiene

**Files:**
- Modify: `src/server/tools/files-api.js`
- Modify: `src/server/tools/pageindex.js`
- Modify: `.gitignore`
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`
- Delete: `bun.lock` (if choosing npm as canonical)

**Step 1: Write the failing tests**

No new tests required. Use existing tests as safety net.

**Step 2: Run tests to verify baseline**

Run:
```
npm test
```
Expected: current baseline (note pre-existing failures if any).

**Step 3: Write minimal implementation**

`src/server/tools/files-api.js`
```js
const os = require('node:os');
const REGISTRY_PATH = path.join(os.homedir(), '.chatdock', 'files', 'registry.json');
```

`src/server/tools/pageindex.js`
```js
const os = require('node:os');
const INDEX_DIR = path.join(os.homedir(), '.chatdock', 'pageindex');
```

`.gitignore`
```gitignore
config/last_model.txt
Documentation.MD
```

`.github/workflows/ci.yml`
```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: npm install
      - run: npm test
```

`README.md` (remove bun instructions if npm is canonical)
```md
# remove bun install/run examples
```

**Step 4: Run tests to verify they pass**

Run:
```
npm test
```
Expected: green except known pre-existing failures.

**Step 5: Commit**
```
git add src/server/tools/files-api.js src/server/tools/pageindex.js .gitignore .github/workflows/ci.yml README.md
rm bun.lock
git add -u
git commit -m "chore: fix paths and add CI"
```

---

## Baseline test note

Baseline tests currently fail before changes (glob test, platform path test, git log shell pipe). Keep this in mind; run targeted tests during TDD to confirm new behavior.
