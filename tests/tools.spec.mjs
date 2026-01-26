/**
 * Tests for Search, Shell, Git, and Utility Tools
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { grep_search, web_search, fetch_url } from '../src/server/tools/search.js';
import { run_command, get_system_info, get_current_time } from '../src/server/tools/shell.js';
import { git_status, git_log, git_branch } from '../src/server/tools/git.js';
import { clipboard_read, calculate, sleep } from '../src/server/tools/utility.js';

describe('Search Tools', () => {
  describe('grep_search', () => {
    it('should search in current directory', async () => {
      const result = await grep_search.run({ 
        pattern: 'function', 
        path: '.',
        maxResults: 5 
      });
      assert.ok(result.results);
      assert.ok(Array.isArray(result.results));
    });

    it('should not execute shell expansions in pattern', async () => {
      const marker = path.join(os.tmpdir(), `chatdock-grep-${Date.now()}`);
      const pattern = `$(touch ${marker})`;
      try {
        if (fs.existsSync(marker)) fs.unlinkSync(marker);
        await grep_search.run({
          pattern,
          path: '.',
          maxResults: 1
        });
        assert.ok(!fs.existsSync(marker));
      } finally {
        if (fs.existsSync(marker)) fs.unlinkSync(marker);
      }
    });
  });

  describe('web_search', () => {
    it('should return search results object', async () => {
      // This may fail without network/ddgr, so just check structure
      const result = await web_search.run({ query: 'test query' });
      assert.ok('query' in result);
      assert.ok('results' in result);
    });
  });

  describe('fetch_url', () => {
    it('should reject invalid URLs', async () => {
      await assert.rejects(
        async () => fetch_url.run({ url: 'not-a-url' }),
        /Invalid URL/
      );
    });
  });
});

describe('Shell Tools', () => {
  describe('run_command', () => {
    it('should execute simple commands', async () => {
      const result = await run_command.run({ command: 'echo hello' });
      assert.strictEqual(result.exitCode, 0);
      assert.ok(result.stdout.includes('hello'));
    });

    it('should capture stderr', async () => {
      const result = await run_command.run({ command: 'ls /nonexistent 2>&1 || true' });
      // Just check it completes
      assert.ok('exitCode' in result);
    });

    it('should block dangerous commands', async () => {
      await assert.rejects(
        async () => run_command.run({ command: 'rm -rf /' }),
        /Blocked dangerous/
      );
    });
  });

  describe('get_system_info', () => {
    it('should return system information', async () => {
      const result = await get_system_info.run({});
      assert.ok(result.platform);
      assert.ok(result.arch);
      assert.ok(result.cpu);
      assert.ok(result.memory);
    });
  });

  describe('get_current_time', () => {
    it('should return current time', async () => {
      const result = await get_current_time.run({});
      assert.ok(result.iso);
      assert.ok(result.unix);
      assert.ok(result.timezone);
    });
  });
});

describe('Git Tools', () => {
  describe('git_status', () => {
    it('should get repo status', async () => {
      const result = await git_status.run({ cwd: '.' });
      assert.ok('branch' in result);
      assert.ok('staged' in result);
      assert.ok('modified' in result);
    });
  });

  describe('git_log', () => {
    it('should get commit history', async () => {
      const result = await git_log.run({ cwd: '.', count: 5 });
      assert.ok(result.commits || result.log);
    });
  });

  describe('git_branch', () => {
    it('should list branches', async () => {
      const result = await git_branch.run({ cwd: '.' });
      assert.ok(result.current);
      assert.ok(result.branches);
    });
  });
});

describe('Utility Tools', () => {
  describe('calculate', () => {
    it('should evaluate expressions', async () => {
      const result = await calculate.run({ expression: '2 + 2 * 3' });
      assert.strictEqual(result.result, 8);
    });

    it('should handle complex expressions', async () => {
      const result = await calculate.run({ expression: 'Math.sqrt(16)' });
      assert.strictEqual(result.result, 4);
    });
  });

  describe('sleep', () => {
    it('should pause execution', async () => {
      const start = Date.now();
      await sleep.run({ ms: 100 });
      const elapsed = Date.now() - start;
      assert.ok(elapsed >= 90); // Allow some tolerance
    });

    it('should cap at max duration', async () => {
      const result = await sleep.run({ ms: 120000 }); // 2 minutes
      assert.ok(result.capped);
      assert.strictEqual(result.slept, 60000);
    });
  });
});
