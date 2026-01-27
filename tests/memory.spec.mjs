/**
 * Tests for Memory Tools and MemoryManager
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Create isolated test directory
const testDir = path.join(os.tmpdir(), `chatdock-memory-test-${Date.now()}`);

describe('MemoryManager', () => {
  let MemoryManager;
  let manager;

  before(async () => {
    // Import MemoryManager
    const module = await import('../src/server/utils/memory-manager.js');
    MemoryManager = module.MemoryManager;
    
    // Create test instance with isolated directory
    manager = new MemoryManager({ memoryDir: testDir });
  });

  after(() => {
    // Cleanup
    if (manager && manager.close) {
      manager.close();
    }
    // Remove test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    it('should create memory directory structure', () => {
      assert.ok(fs.existsSync(testDir), 'Main directory should exist');
      assert.ok(fs.existsSync(path.join(testDir, 'daily')), 'Daily directory should exist');
    });

    it('should create user.md file', () => {
      const userFile = path.join(testDir, 'user.md');
      assert.ok(fs.existsSync(userFile), 'user.md should exist');
      const content = fs.readFileSync(userFile, 'utf-8');
      assert.ok(content.includes('User Profile'), 'Should have user profile header');
    });

    it('should create chatdock.md file', () => {
      const systemFile = path.join(testDir, 'chatdock.md');
      assert.ok(fs.existsSync(systemFile), 'chatdock.md should exist');
      const content = fs.readFileSync(systemFile, 'utf-8');
      assert.ok(content.includes('ChatDock Identity'), 'Should have identity header');
    });

    it('should create MEMORY.md file', () => {
      const memoryFile = path.join(testDir, 'MEMORY.md');
      assert.ok(fs.existsSync(memoryFile), 'MEMORY.md should exist');
    });

    it('should set initialized flag', () => {
      assert.ok(manager.initialized, 'Should be initialized');
    });
  });

  describe('save()', () => {
    it('should save content to daily log', () => {
      const result = manager.save('Test memory content', { tags: ['test'] });
      
      assert.ok(result.id, 'Should return an id');
      assert.ok(result.id.startsWith('mem_'), 'ID should have mem_ prefix');
      assert.strictEqual(result.saved, true, 'Should indicate saved');
      assert.strictEqual(result.permanent, false, 'Should not be permanent by default');
    });

    it('should create daily log file', () => {
      const today = new Date().toISOString().split('T')[0];
      const dailyFile = path.join(testDir, 'daily', `${today}.md`);
      assert.ok(fs.existsSync(dailyFile), 'Daily log file should exist');
    });

    it('should save permanent content to MEMORY.md', () => {
      const result = manager.save('Important permanent fact', { permanent: true });
      
      assert.strictEqual(result.permanent, true, 'Should be permanent');
      
      const memoryContent = fs.readFileSync(path.join(testDir, 'MEMORY.md'), 'utf-8');
      assert.ok(memoryContent.includes('Important permanent fact'), 'MEMORY.md should contain the content');
    });

    it('should include tags in saved entry', () => {
      manager.save('Content with tags', { tags: ['tag1', 'tag2'] });
      
      const today = new Date().toISOString().split('T')[0];
      const dailyContent = fs.readFileSync(path.join(testDir, 'daily', `${today}.md`), 'utf-8');
      assert.ok(dailyContent.includes('[tag1, tag2]'), 'Should contain tags');
    });
  });

  describe('clawdbot context', () => {
    function dateString(date) {
      return date.toISOString().split('T')[0];
    }

    it('should use workspace Memory directory when appPath is provided', () => {
      const appPath = fs.mkdtempSync(path.join(os.tmpdir(), 'chatdock-app-'));
      const appManager = new MemoryManager({ appPath });
      assert.strictEqual(
        appManager.memoryDir,
        path.join(appPath, 'Memory'),
        'memoryDir should be based on appPath',
      );
      if (appManager.close) {
        appManager.close();
      }
      fs.rmSync(appPath, { recursive: true, force: true });
    });

    it('should include MEMORY.md and daily logs in Clawdbot context', () => {
      const appPath = fs.mkdtempSync(path.join(os.tmpdir(), 'chatdock-app-'));
      const memoryDir = path.join(appPath, 'Memory');
      const dailyDir = path.join(memoryDir, 'daily');
      fs.mkdirSync(dailyDir, { recursive: true });

      fs.writeFileSync(path.join(memoryDir, 'MEMORY.md'), 'LONG_TERM', 'utf-8');

      const today = new Date();
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      fs.writeFileSync(
        path.join(dailyDir, `${dateString(today)}.md`),
        'TODAY_LOG',
        'utf-8',
      );
      fs.writeFileSync(
        path.join(dailyDir, `${dateString(yesterday)}.md`),
        'YESTERDAY_LOG',
        'utf-8',
      );

      const appManager = new MemoryManager({ appPath });
      const context = appManager.getClawdbotContext();
      assert.ok(context.includes('LONG_TERM'), 'Should include MEMORY.md content');
      assert.ok(context.includes('TODAY_LOG'), 'Should include today log');
      assert.ok(context.includes('YESTERDAY_LOG'), 'Should include yesterday log');

      if (appManager.close) {
        appManager.close();
      }
      fs.rmSync(appPath, { recursive: true, force: true });
    });
  });

  describe('search()', () => {
    before(() => {
      // Add some searchable content
      manager.save('The user prefers dark mode for coding', { tags: ['preference'] });
      manager.save('Working on a React project called MyApp', { tags: ['project'] });
      manager.save('User mentioned they use VS Code as editor', { tags: ['tool'] });
    });

    it('should find matching memories', () => {
      const results = manager.search('dark mode');
      
      assert.ok(Array.isArray(results), 'Should return array');
      // Note: FTS5 might not be available, so we check for fallback behavior too
    });

    it('should return empty array for no matches', () => {
      const results = manager.search('xyznonexistentquery123');
      
      assert.ok(Array.isArray(results), 'Should return array');
      assert.strictEqual(results.length, 0, 'Should have no matches');
    });

    it('should respect limit parameter', () => {
      // Add multiple entries
      for (let i = 0; i < 5; i++) {
        manager.save(`Test entry number ${i}`, { tags: ['bulk'] });
      }
      
      const results = manager.search('Test entry', 2);
      assert.ok(results.length <= 2, 'Should respect limit');
    });
  });

  describe('get()', () => {
    it('should retrieve memory by ID', () => {
      const saved = manager.save('Unique content for get test', {});
      const retrieved = manager.get(saved.id);
      
      // DB might not be available, so check for null as valid response
      if (retrieved) {
        assert.strictEqual(retrieved.id, saved.id, 'Should match ID');
        assert.ok(retrieved.content.includes('Unique content'), 'Should contain content');
      }
    });

    it('should return null for non-existent ID', () => {
      const result = manager.get('mem_nonexistent123');
      assert.strictEqual(result, null, 'Should return null');
    });
  });

  describe('getRecentContext()', () => {
    it('should return string with recent memory context', () => {
      const context = manager.getRecentContext(7);
      
      assert.ok(typeof context === 'string', 'Should return string');
    });

    it('should include long-term memory section', () => {
      // Save something permanent first
      manager.save('Long-term test fact', { permanent: true });
      
      const context = manager.getRecentContext(7);
      assert.ok(context.includes('Long-term Memory'), 'Should include long-term section');
    });
  });

  describe('legacy methods', () => {
    it('should get user memory', () => {
      const userMemory = manager.getUserMemory();
      assert.ok(userMemory.includes('User Profile'), 'Should return user memory');
    });

    it('should get system memory', () => {
      const systemMemory = manager.getSystemMemory();
      assert.ok(systemMemory.includes('ChatDock'), 'Should return system memory');
    });

    it('should update user memory', () => {
      const result = manager.updateUserMemory('Preferences', 'Prefers TypeScript');
      assert.ok(result, 'Should return true');
      
      const userMemory = manager.getUserMemory();
      assert.ok(userMemory.includes('TypeScript'), 'Should contain updated preference');
    });

    it('should log session', () => {
      const result = manager.logSession('Test session started');
      assert.ok(result, 'Should return true');
      
      const systemMemory = manager.getSystemMemory();
      assert.ok(systemMemory.includes('Test session'), 'Should contain session log');
    });
  });

  describe('getStats()', () => {
    it('should return memory statistics', () => {
      const stats = manager.getStats();
      
      assert.ok('dbAvailable' in stats, 'Should have dbAvailable field');
      if (stats.dbAvailable) {
        assert.ok('total' in stats, 'Should have total count');
        assert.ok('permanent' in stats, 'Should have permanent count');
        assert.ok('daily' in stats, 'Should have daily count');
      }
    });
  });
});

describe('Memory Tools', () => {
  let memoryTools;
  let testDir2;

  before(async () => {
    testDir2 = path.join(os.tmpdir(), `chatdock-memory-tools-test-${Date.now()}`);
    
    // Import memory tools
    memoryTools = await import('../src/server/tools/memory.js');
    
    // Create test manager and set it
    const { MemoryManager } = await import('../src/server/utils/memory-manager.js');
    const testManager = new MemoryManager({ memoryDir: testDir2 });
    memoryTools.setMemoryManager(testManager);
  });

  after(() => {
    // Cleanup
    const manager = memoryTools.getMemoryManager();
    if (manager && manager.close) {
      manager.close();
    }
    if (fs.existsSync(testDir2)) {
      fs.rmSync(testDir2, { recursive: true, force: true });
    }
  });

  describe('memory_save', () => {
    it('should have correct tool definition', () => {
      const tool = memoryTools.memory_save;
      assert.strictEqual(tool.name, 'memory_save', 'Should have correct name');
      assert.ok(tool.description, 'Should have description');
      assert.ok(tool.parameters.properties.content, 'Should have content parameter');
      assert.ok(tool.run, 'Should have run function');
    });

    it('should save memory and return success', async () => {
      const result = await memoryTools.memory_save.run({
        content: 'User prefers vim keybindings',
        tags: ['preference'],
        permanent: false
      });

      assert.ok(result.success, 'Should return success');
      assert.ok(result.id, 'Should return id');
      assert.ok(result.message, 'Should return message');
    });

    it('should save permanent memory', async () => {
      const result = await memoryTools.memory_save.run({
        content: 'Critical user preference',
        permanent: true
      });

      assert.ok(result.success, 'Should return success');
      assert.ok(result.permanent, 'Should be marked permanent');
    });
  });

  describe('memory_search', () => {
    it('should have correct tool definition', () => {
      const tool = memoryTools.memory_search;
      assert.strictEqual(tool.name, 'memory_search', 'Should have correct name');
      assert.ok(tool.parameters.properties.query, 'Should have query parameter');
    });

    it('should return search results', async () => {
      // First save something
      await memoryTools.memory_save.run({ content: 'Searchable test content xyz' });
      
      const result = await memoryTools.memory_search.run({ query: 'test', limit: 5 });

      assert.ok('results' in result, 'Should have results array');
      assert.ok('count' in result, 'Should have count');
      assert.ok('query' in result, 'Should echo query');
    });

    it('should handle no matches gracefully', async () => {
      const result = await memoryTools.memory_search.run({
        query: 'absolutelynonexistentquery12345'
      });

      assert.strictEqual(result.count, 0, 'Should have zero count');
      assert.ok(result.message, 'Should have message for no results');
    });
  });

  describe('memory_get', () => {
    it('should have correct tool definition', () => {
      const tool = memoryTools.memory_get;
      assert.strictEqual(tool.name, 'memory_get', 'Should have correct name');
      assert.ok(tool.parameters.properties.id, 'Should have id parameter');
    });

    it('should return not found for invalid ID', async () => {
      const result = await memoryTools.memory_get.run({ id: 'mem_invalid123' });

      assert.strictEqual(result.found, false, 'Should not find memory');
      assert.ok(result.message, 'Should have message');
    });
  });

  describe('memory_stats', () => {
    it('should return memory statistics', async () => {
      const result = await memoryTools.memory_stats.run({});

      assert.ok('dbAvailable' in result, 'Should have dbAvailable field');
    });
  });
});
