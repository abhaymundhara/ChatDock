/**
 * Tests for File System Tools
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { 
  read_file, 
  list_directory, 
  find_file, 
  glob, 
  file_info 
} from '../src/server/tools/file-read.js';

import {
  write_file,
  edit_file,
  append_file,
  delete_file,
  rename_file,
  create_directory,
  undo_last_edit
} from '../src/server/tools/file-write.js';

const TEST_DIR = path.join(os.tmpdir(), 'chatdock-test-' + Date.now());

describe('File Read Tools', () => {
  before(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.writeFileSync(path.join(TEST_DIR, 'test.txt'), 'Hello World\nLine 2');
    fs.mkdirSync(path.join(TEST_DIR, 'subdir'));
    fs.writeFileSync(path.join(TEST_DIR, 'subdir', 'nested.js'), 'const x = 1;');
  });

  after(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('read_file', () => {
    it('should read file content', async () => {
      const result = await read_file.run({ path: path.join(TEST_DIR, 'test.txt') });
      assert.strictEqual(result, 'Hello World\nLine 2');
    });

    it('should throw on non-existent file', async () => {
      await assert.rejects(
        async () => read_file.run({ path: '/nonexistent/file.txt' }),
        /File not found/
      );
    });

    it('should throw on directory', async () => {
      await assert.rejects(
        async () => read_file.run({ path: TEST_DIR }),
        /directory/i
      );
    });
  });

  describe('list_directory', () => {
    it('should list directory contents', async () => {
      const result = await list_directory.run({ path: TEST_DIR });
      assert.ok(Array.isArray(result));
      assert.ok(result.some(e => e.name === 'test.txt'));
      assert.ok(result.some(e => e.name === 'subdir'));
    });

    it('should identify types correctly', async () => {
      const result = await list_directory.run({ path: TEST_DIR });
      const file = result.find(e => e.name === 'test.txt');
      const dir = result.find(e => e.name === 'subdir');
      assert.strictEqual(file.type, 'file');
      assert.strictEqual(dir.type, 'directory');
    });

    it('should list recursively', async () => {
      const result = await list_directory.run({ path: TEST_DIR, recursive: true });
      const subdir = result.find(e => e.name === 'subdir');
      assert.ok(subdir.children);
      assert.ok(subdir.children.some(c => c.name === 'nested.js'));
    });
  });

  describe('find_file', () => {
    it('should find files by name', async () => {
      const result = await find_file.run({ name: 'test', directory: TEST_DIR });
      assert.ok(result.some(f => f.name === 'test.txt'));
    });

    it('should find nested files', async () => {
      const result = await find_file.run({ name: 'nested', directory: TEST_DIR });
      assert.ok(result.some(f => f.name === 'nested.js'));
    });
  });

  describe('glob', () => {
    it('should find files by pattern', async () => {
      const result = await glob.run({ pattern: '*.txt', cwd: TEST_DIR });
      assert.ok(Array.isArray(result));
    });

    it('should find JS files', async () => {
      const result = await glob.run({ pattern: '*.js', cwd: TEST_DIR });
      assert.ok(result.some(f => f.includes('nested.js')));
    });
  });

  describe('file_info', () => {
    it('should return file metadata', async () => {
      const result = await file_info.run({ path: path.join(TEST_DIR, 'test.txt') });
      assert.strictEqual(result.type, 'file');
      assert.ok(result.size > 0);
      assert.ok(result.created);
      assert.ok(result.modified);
    });
  });
});

describe('File Write Tools', () => {
  const WRITE_TEST_DIR = path.join(os.tmpdir(), 'chatdock-write-test-' + Date.now());

  before(() => {
    fs.mkdirSync(WRITE_TEST_DIR, { recursive: true });
  });

  after(() => {
    fs.rmSync(WRITE_TEST_DIR, { recursive: true, force: true });
  });

  describe('write_file', () => {
    it('should create a new file', async () => {
      const filePath = path.join(WRITE_TEST_DIR, 'new.txt');
      const result = await write_file.run({ path: filePath, content: 'Hello' });
      
      assert.ok(result.created);
      assert.ok(fs.existsSync(filePath));
      assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), 'Hello');
    });

    it('should create backup when overwriting', async () => {
      const filePath = path.join(WRITE_TEST_DIR, 'overwrite.txt');
      fs.writeFileSync(filePath, 'Original');
      
      const result = await write_file.run({ path: filePath, content: 'New' });
      
      assert.ok(result.overwritten);
      assert.ok(result.backupCreated);
    });
  });

  describe('edit_file', () => {
    it('should edit specific lines', async () => {
      const filePath = path.join(WRITE_TEST_DIR, 'edit.txt');
      fs.writeFileSync(filePath, 'Line 1\nLine 2\nLine 3');
      
      await edit_file.run({
        path: filePath,
        edits: [{ startLine: 2, endLine: 2, content: 'Modified Line 2' }]
      });
      
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(content.includes('Modified Line 2'));
    });
  });

  describe('append_file', () => {
    it('should append to file', async () => {
      const filePath = path.join(WRITE_TEST_DIR, 'append.txt');
      fs.writeFileSync(filePath, 'Start');
      
      await append_file.run({ path: filePath, content: 'Appended' });
      
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(content.includes('Appended'));
    });
  });

  describe('create_directory', () => {
    it('should create directory', async () => {
      const dirPath = path.join(WRITE_TEST_DIR, 'newdir');
      await create_directory.run({ path: dirPath });
      assert.ok(fs.existsSync(dirPath));
    });
  });

  describe('rename_file', () => {
    it('should rename file', async () => {
      const oldPath = path.join(WRITE_TEST_DIR, 'old.txt');
      const newPath = path.join(WRITE_TEST_DIR, 'renamed.txt');
      fs.writeFileSync(oldPath, 'content');
      
      await rename_file.run({ oldPath, newPath });
      
      assert.ok(!fs.existsSync(oldPath));
      assert.ok(fs.existsSync(newPath));
    });
  });

  describe('delete_file', () => {
    it('should delete file and create backup', async () => {
      const filePath = path.join(WRITE_TEST_DIR, 'todelete.txt');
      fs.writeFileSync(filePath, 'delete me');
      
      const result = await delete_file.run({ path: filePath, createBackup: true });
      
      assert.ok(!fs.existsSync(filePath));
      assert.ok(result.backupPath);
    });
  });
});
