/**
 * Tests for Orchestrator Core
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { 
  Orchestrator, 
  OllamaClient, 
  ToolRegistry, 
  SkillLoader, 
  PromptBuilder 
} from '../src/server/orchestrator/index.js';

describe('OllamaClient', () => {
  const client = new OllamaClient();

  it('should have default baseUrl', () => {
    assert.strictEqual(client.baseUrl, 'http://127.0.0.1:11434');
  });

  it('should perform health check', async () => {
    const result = await client.healthCheck();
    assert.ok(typeof result.ok === 'boolean');
  });

  it('should list models', async () => {
    const models = await client.listModels();
    assert.ok(Array.isArray(models));
  });
});

describe('ToolRegistry', () => {
  const registry = new ToolRegistry();

  before(async () => {
    await registry.discover();
  });

  it('should discover tools from directory', () => {
    assert.ok(registry.count() > 0, 'Should have discovered some tools');
  });

  it('should register a tool manually', () => {
    registry.register({
      name: 'test_tool',
      description: 'A test tool',
      run: async () => 'test result'
    });
    assert.ok(registry.has('test_tool'));
  });

  it('should execute a registered tool', async () => {
    const result = await registry.execute('test_tool');
    assert.strictEqual(result, 'test result');
  });

  it('should throw on unknown tool', async () => {
    await assert.rejects(
      async () => registry.execute('nonexistent_tool'),
      /Tool not found/
    );
  });

  it('should search tools by keyword', () => {
    const results = registry.search('file');
    assert.ok(Array.isArray(results));
  });

  it('should return tool definitions', () => {
    const defs = registry.getDefinitions();
    assert.ok(Array.isArray(defs));
    assert.ok(defs.every(d => d.name && d.description !== undefined));
  });

  it('should return Ollama format', () => {
    const format = registry.getOllamaFormat();
    assert.ok(Array.isArray(format));
    assert.ok(format.every(t => t.type === 'function' && t.function));
  });
});

describe('SkillLoader', () => {
  const loader = new SkillLoader();

  it('should load without errors', async () => {
    await loader.load();
    // No assertion needed, just shouldn't throw
  });

  it('should parse frontmatter correctly', () => {
    const content = `---
name: Test Skill
description: A test skill
---
# Instructions
Do something`;

    const { frontmatter, body } = loader.parseFrontmatter(content);
    assert.strictEqual(frontmatter.name, 'Test Skill');
    assert.ok(body.includes('# Instructions'));
  });

  it('should activate and deactivate skills', () => {
    loader.skills.set('test', { name: 'test', content: 'test content', triggers: [] });
    loader.activate('test');
    assert.ok(loader.activeSkills.has('test'));
    loader.deactivate('test');
    assert.ok(!loader.activeSkills.has('test'));
  });
});

describe('PromptBuilder', () => {
  const builder = new PromptBuilder();

  it('should build a basic prompt', () => {
    const prompt = builder.build();
    assert.ok(prompt.includes('ChatDock'));
  });

  it('prompt references task_write for planning', () => {
    const prompt = builder.build();
    assert.ok(prompt.includes('task_write'));
    assert.ok(!prompt.includes('todo_write'));
  });

  it('should include tools in prompt', () => {
    const prompt = builder.build({
      tools: [{ name: 'test', description: 'test tool', parameters: {} }]
    });
    assert.ok(prompt.includes('Available Tools'));
    assert.ok(prompt.includes('test'));
  });

  it('should include thinking instructions for deep mode', () => {
    const prompt = builder.build({ thinkingMode: 'deep' });
    assert.ok(prompt.includes('Extended Thinking'));
  });

  it('should include context', () => {
    const prompt = builder.build({
      context: { cwd: '/home/user', gitBranch: 'main' }
    });
    assert.ok(prompt.includes('/home/user'));
    assert.ok(prompt.includes('main'));
  });

  it('should honor CHATDOCK_APP_PATH when provided', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chatdock-brain-'));
    const brainDir = path.join(tmp, 'brain');
    fs.mkdirSync(brainDir, { recursive: true });
    fs.writeFileSync(path.join(brainDir, 'AGENTS.md'), 'TEST_BRAIN_MARKER');
    process.env.CHATDOCK_APP_PATH = tmp;
    const envBuilder = new PromptBuilder();
    const prompt = envBuilder.build();
    assert.ok(prompt.includes('TEST_BRAIN_MARKER'));
  });
});

describe('Orchestrator', () => {
  it('should create with default options', () => {
    const orch = new Orchestrator();
    assert.ok(orch.ollama);
    assert.ok(orch.tools);
    assert.ok(orch.skills);
    assert.strictEqual(orch.state, 'idle');
  });

  it('should track state changes', () => {
    const states = [];
    const orch = new Orchestrator({
      onStateChange: ({ to }) => states.push(to)
    });
    
    orch.setState('analyzing');
    orch.setState('executing');
    
    assert.deepStrictEqual(states, ['analyzing', 'executing']);
  });

  it('should manage conversation history', () => {
    const orch = new Orchestrator();
    orch.conversationHistory.push({ role: 'user', content: 'hello' });
    
    const history = orch.getHistory();
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].content, 'hello');
    
    orch.clearHistory();
    assert.strictEqual(orch.getHistory().length, 0);
  });
});

describe('Workflow Enforcement', () => {
  const orchestrator = new Orchestrator();

  it('requires task_write before any non-planning tool', () => {
    const violation = orchestrator.getWorkflowViolation(
      [{ function: { name: 'tool_finder' } }],
      { hasTaskPlan: false, hasToolFinder: false }
    );
    assert.ok(violation);
    assert.strictEqual(violation.type, 'task_write_required');
  });

  it('requires tool_finder before non-planning tools', () => {
    const violation = orchestrator.getWorkflowViolation(
      [{ function: { name: 'read_file' } }],
      { hasTaskPlan: true, hasToolFinder: false }
    );
    assert.ok(violation);
    assert.strictEqual(violation.type, 'tool_finder_required');
  });

  it('rejects tool_finder bundled with execution tools', () => {
    const violation = orchestrator.getWorkflowViolation(
      [
        { function: { name: 'tool_finder' } },
        { function: { name: 'read_file' } }
      ],
      { hasTaskPlan: true, hasToolFinder: false }
    );
    assert.ok(violation);
    assert.strictEqual(violation.type, 'tool_finder_only');
  });
});
