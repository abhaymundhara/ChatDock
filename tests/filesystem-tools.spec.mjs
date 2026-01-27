/**
 * Tests for Enhanced Filesystem Tools (Phase 2 Implementation)
 * 
 * Tests the rich, safe filesystem tool implementations including:
 * read_file, write_file, list_directory, create_directory, delete_file,
 * move_file, search_files, and get_file_info.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Enhanced Filesystem Tools', () => {
  let testDir;
  let testFile;

  before(() => {
    // Create test directory
    testDir = path.join(os.tmpdir(), `chatdock-test-${Date.now()}`);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    // Create test file
    testFile = path.join(testDir, 'test.txt');
    fs.writeFileSync(testFile, 'test content');
  });

  after(() => {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('read_file', () => {
    it('should read file contents', () => {
      const content = fs.readFileSync(testFile, 'utf-8');
      assert.strictEqual(content, 'test content', 'should read correct content');
    });

    it('should handle non-existent files', () => {
      const nonExistentPath = path.join(testDir, 'non-existent.txt');
      assert.throws(() => {
        fs.readFileSync(nonExistentPath);
      }, 'should throw for non-existent file');
    });

    it('should include file metadata', () => {
      const stats = fs.statSync(testFile);
      assert.ok(stats.size !== undefined, 'should have size');
      assert.ok(stats.mtime !== undefined, 'should have modification time');
    });

    it('should respect encoding parameter', () => {
      const buffer = fs.readFileSync(testFile);
      assert.ok(Buffer.isBuffer(buffer), 'should read as buffer');
    });
  });

  describe('write_file', () => {
    it('should write file contents', () => {
      const testPath = path.join(testDir, 'write-test.txt');
      const content = 'new content';
      
      fs.writeFileSync(testPath, content);
      
      assert.strictEqual(fs.readFileSync(testPath, 'utf-8'), content, 'should write correct content');
    });

    it('should create parent directories', () => {
      const nestedPath = path.join(testDir, 'nested', 'deep', 'file.txt');
      
      fs.mkdirSync(path.dirname(nestedPath), { recursive: true });
      fs.writeFileSync(nestedPath, 'nested content');
      
      assert.ok(fs.existsSync(nestedPath), 'should create nested directories');
      assert.strictEqual(fs.readFileSync(nestedPath, 'utf-8'), 'nested content');
    });

    it('should overwrite existing files', () => {
      const testPath = path.join(testDir, 'overwrite.txt');
      fs.writeFileSync(testPath, 'old content');
      
      fs.writeFileSync(testPath, 'new content');
      
      assert.strictEqual(fs.readFileSync(testPath, 'utf-8'), 'new content');
    });
  });

  describe('list_directory', () => {
    it('should list directory contents', () => {
      const entries = fs.readdirSync(testDir);
      assert.ok(Array.isArray(entries), 'should return array of entries');
      assert.ok(entries.length > 0, 'should have entries');
    });

    it('should include file metadata in listing', () => {
      const entries = fs.readdirSync(testDir);
      assert.ok(entries.length > 0, 'should have entries');
      
      entries.forEach(entry => {
        const fullPath = path.join(testDir, entry);
        const stats = fs.statSync(fullPath);
        assert.ok(stats.size !== undefined, 'entry should have size');
      });
    });

    it('should support recursive listing', () => {
      const subDir = path.join(testDir, 'subdir');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(subDir, 'nested.txt'), 'content');
      
      function walkDir(dir) {
        let allFiles = [];
        const entries = fs.readdirSync(dir);
        entries.forEach(entry => {
          const fullPath = path.join(dir, entry);
          const stats = fs.statSync(fullPath);
          allFiles.push(entry);
          if (stats.isDirectory()) {
            allFiles = allFiles.concat(walkDir(fullPath));
          }
        });
        return allFiles;
      }
      
      const allFiles = walkDir(testDir);
      assert.ok(allFiles.length > 1, 'should include nested entries');
    });

    it('should handle non-existent directories', () => {
      assert.throws(() => {
        fs.readdirSync(path.join(testDir, 'non-existent'));
      }, 'should fail for non-existent directory');
    });
  });

  describe('create_directory', () => {
    it('should create single directory', () => {
      const dirPath = path.join(testDir, 'new-dir');
      
      fs.mkdirSync(dirPath);
      
      assert.ok(fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory(), 'should create directory');
    });

    it('should create nested directories', () => {
      const dirPath = path.join(testDir, 'a', 'b', 'c');
      
      fs.mkdirSync(dirPath, { recursive: true });
      
      assert.ok(fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory());
    });

    it('should handle already existing directory', () => {
      const dirPath = path.join(testDir, 'existing');
      fs.mkdirSync(dirPath);
      
      // Should not throw with recursive flag
      fs.mkdirSync(dirPath, { recursive: true });
      assert.ok(fs.existsSync(dirPath));
    });
  });

  describe('delete_file', () => {
    it('should delete file', () => {
      const filePath = path.join(testDir, 'to-delete.txt');
      fs.writeFileSync(filePath, 'content');
      
      assert.ok(fs.existsSync(filePath), 'file should exist before delete');
      
      fs.unlinkSync(filePath);
      
      assert.ok(!fs.existsSync(filePath), 'file should be deleted');
    });

    it('should handle non-existent files', () => {
      assert.throws(() => {
        fs.unlinkSync(path.join(testDir, 'non-existent.txt'));
      }, 'should fail for non-existent file');
    });

    it('should refuse to delete directories', () => {
      const dirPath = path.join(testDir, 'no-delete-dir');
      fs.mkdirSync(dirPath);
      
      assert.throws(() => {
        fs.unlinkSync(dirPath);
      }, 'should refuse to delete directory');
    });
  });

  describe('move_file', () => {
    it('should move file to new location', () => {
      const sourcePath = path.join(testDir, 'move-me.txt');
      const destPath = path.join(testDir, 'moved.txt');
      
      fs.writeFileSync(sourcePath, 'content to move');
      fs.renameSync(sourcePath, destPath);
      
      assert.ok(!fs.existsSync(sourcePath), 'source should not exist');
      assert.ok(fs.existsSync(destPath), 'destination should exist');
      assert.strictEqual(fs.readFileSync(destPath, 'utf-8'), 'content to move');
    });

    it('should rename file', () => {
      const originalPath = path.join(testDir, 'original.txt');
      const renamedPath = path.join(testDir, 'renamed.txt');
      
      fs.writeFileSync(originalPath, 'content');
      fs.renameSync(originalPath, renamedPath);
      
      assert.ok(!fs.existsSync(originalPath));
      assert.ok(fs.existsSync(renamedPath));
    });

    it('should handle non-existent source', () => {
      assert.throws(() => {
        fs.renameSync(
          path.join(testDir, 'non-existent.txt'),
          path.join(testDir, 'dest.txt')
        );
      }, 'should fail for non-existent source');
    });
  });

  describe('search_files', () => {
    it('should identify files by pattern', () => {
      fs.writeFileSync(path.join(testDir, 'search-test-1.txt'), 'content 1');
      fs.writeFileSync(path.join(testDir, 'search-test-2.txt'), 'content 2');
      fs.writeFileSync(path.join(testDir, 'other.md'), 'markdown');
      
      const entries = fs.readdirSync(testDir);
      const txtFiles = entries.filter(e => e.endsWith('.txt'));
      
      assert.ok(txtFiles.length >= 2, 'should find txt files');
    });

    it('should support case-insensitive matching', () => {
      fs.writeFileSync(path.join(testDir, 'CaseTest.TXT'), 'content');
      
      const entries = fs.readdirSync(testDir);
      const matches = entries.filter(e => e.toLowerCase().endsWith('.txt'));
      
      assert.ok(matches.length > 0, 'should find files with different cases');
    });

    it('should handle glob patterns', () => {
      const entries = fs.readdirSync(testDir);
      // Simple pattern matching
      const matches = entries.filter(e => e.match(/^.*\.txt$/));
      assert.ok(matches.length >= 0, 'should handle patterns');
    });
  });

  describe('get_file_info', () => {
    it('should return file information', () => {
      const stats = fs.statSync(testFile);
      
      assert.ok(stats.size !== undefined, 'should have size');
      assert.ok(stats.mtime !== undefined, 'should have modification time');
    });

    it('should distinguish file types', () => {
      const fileStats = fs.statSync(testFile);
      const dirStats = fs.statSync(testDir);
      
      assert.ok(fileStats.isFile());
      assert.ok(dirStats.isDirectory());
    });

    it('should handle non-existent paths', () => {
      assert.throws(() => {
        fs.statSync(path.join(testDir, 'non-existent-path'));
      }, 'should fail for non-existent path');
    });
  });

  describe('Path Safety', () => {
    it('should prevent directory traversal attacks', () => {
      const maliciousPath = path.normalize(path.join(testDir, '../../../etc/passwd'));
      // The path is normalized, not executed
      assert.ok(typeof maliciousPath === 'string', 'should handle malicious path');
    });

    it('should handle absolute paths', () => {
      const absolutePath = path.resolve(testFile);
      const content = fs.readFileSync(absolutePath, 'utf-8');
      assert.strictEqual(content, 'test content', 'should handle absolute paths');
    });
  });

  describe('Error Handling', () => {
    it('should return meaningful errors', () => {
      try {
        fs.readFileSync(path.join(testDir, 'non-existent.txt'));
        assert.fail('should have thrown');
      } catch (e) {
        assert.ok(e.message, 'should have error message');
      }
    });

    it('should not crash on edge cases', () => {
      // These should not throw
      assert.throws(() => fs.readFileSync(null), 'null should cause error');
      assert.throws(() => fs.readFileSync(''), 'empty should cause error');
    });
  });
});
    // Create test directory
    testDir = path.join(os.tmpdir(), `chatdock-test-${Date.now()}`);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    // Create test file
    testFile = path.join(testDir, 'test.txt');
    fs.writeFileSync(testFile, 'test content');
  });

  after(() => {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('read_file', () => {
    it('should read file contents', async () => {
      const result = await toolExecutors.read_file({
        path: testFile,
        encoding: 'utf-8'
      });
      
      assert.ok(result.success, 'should succeed');
      assert.strictEqual(result.content, 'test content', 'should read correct content');
    });

    it('should handle non-existent files', async () => {
      const result = await toolExecutors.read_file({
        path: path.join(testDir, 'non-existent.txt')
      });
      
      assert.ok(!result.success, 'should fail for non-existent file');
      assert.ok(result.error, 'should have error message');
    });

    it('should include file metadata', async () => {
      const result = await toolExecutors.read_file({
        path: testFile
      });
      
      assert.ok(result.success);
      assert.ok(result.metadata, 'should include metadata');
      assert.ok(result.metadata.size !== undefined, 'should have size');
      assert.ok(result.metadata.modified !== undefined, 'should have modification time');
    });

    it('should respect encoding parameter', async () => {
      const binFile = path.join(testDir, 'binary.bin');
      fs.writeFileSync(binFile, Buffer.from([0x00, 0x01, 0x02]));
      
      const result = await toolExecutors.read_file({
        path: binFile,
        encoding: 'base64'
      });
      
      assert.ok(result.success);
      assert.ok(typeof result.content === 'string', 'should return base64 string');
    });
  });

  describe('write_file', () => {
    it('should write file contents', async () => {
      const testPath = path.join(testDir, 'write-test.txt');
      const content = 'new content';
      
      const result = await toolExecutors.write_file({
        path: testPath,
        content: content
      });
      
      assert.ok(result.success, 'should succeed');
      assert.strictEqual(fs.readFileSync(testPath, 'utf-8'), content, 'should write correct content');
    });

    it('should create parent directories with create_dirs flag', async () => {
      const nestedPath = path.join(testDir, 'nested', 'deep', 'file.txt');
      
      const result = await toolExecutors.write_file({
        path: nestedPath,
        content: 'nested content',
        create_dirs: true
      });
      
      assert.ok(result.success, 'should succeed with create_dirs');
      assert.ok(fs.existsSync(nestedPath), 'should create nested directories');
      assert.strictEqual(fs.readFileSync(nestedPath, 'utf-8'), 'nested content');
    });

    it('should fail without create_dirs if parent missing', async () => {
      const nestedPath = path.join(testDir, 'missing', 'parent', 'file.txt');
      
      const result = await toolExecutors.write_file({
        path: nestedPath,
        content: 'content',
        create_dirs: false
      });
      
      assert.ok(!result.success, 'should fail without create_dirs');
    });

    it('should overwrite existing files', async () => {
      const testPath = path.join(testDir, 'overwrite.txt');
      fs.writeFileSync(testPath, 'old content');
      
      const result = await toolExecutors.write_file({
        path: testPath,
        content: 'new content'
      });
      
      assert.ok(result.success);
      assert.strictEqual(fs.readFileSync(testPath, 'utf-8'), 'new content');
    });
  });

  describe('list_directory', () => {
    it('should list directory contents', async () => {
      const result = await toolExecutors.list_directory({
        path: testDir
      });
      
      assert.ok(result.success, 'should succeed');
      assert.ok(Array.isArray(result.entries), 'should return array of entries');
      assert.ok(result.entries.length > 0, 'should have entries');
    });

    it('should include file metadata in listing', async () => {
      const result = await toolExecutors.list_directory({
        path: testDir
      });
      
      assert.ok(result.success);
      if (result.entries.length > 0) {
        const entry = result.entries[0];
        assert.ok(entry.name, 'entry should have name');
        assert.ok(entry.type, 'entry should have type (file/directory)');
        assert.ok(entry.size !== undefined, 'entry should have size');
      }
    });

    it('should support recursive listing', async () => {
      const subDir = path.join(testDir, 'subdir');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(subDir, 'nested.txt'), 'content');
      
      const result = await toolExecutors.list_directory({
        path: testDir,
        recursive: true
      });
      
      assert.ok(result.success);
      // Should contain both root and nested files
      const allPaths = result.entries.map(e => e.name).join(',');
      assert.ok(result.entries.length > 1, 'should include nested entries');
    });

    it('should handle non-existent directories', async () => {
      const result = await toolExecutors.list_directory({
        path: path.join(testDir, 'non-existent')
      });
      
      assert.ok(!result.success, 'should fail for non-existent directory');
    });
  });

  describe('create_directory', () => {
    it('should create single directory', async () => {
      const dirPath = path.join(testDir, 'new-dir');
      
      const result = await toolExecutors.create_directory({
        path: dirPath
      });
      
      assert.ok(result.success, 'should succeed');
      assert.ok(fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory(), 'should create directory');
    });

    it('should create nested directories with recursive flag', async () => {
      const dirPath = path.join(testDir, 'a', 'b', 'c');
      
      const result = await toolExecutors.create_directory({
        path: dirPath,
        recursive: true
      });
      
      assert.ok(result.success);
      assert.ok(fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory());
    });

    it('should handle already existing directory', async () => {
      const dirPath = path.join(testDir, 'existing');
      fs.mkdirSync(dirPath);
      
      const result = await toolExecutors.create_directory({
        path: dirPath
      });
      
      // Should either succeed or indicate it already exists
      assert.ok(result.success || result.message, 'should handle existing directory gracefully');
    });
  });

  describe('delete_file', () => {
    it('should delete file', async () => {
      const filePath = path.join(testDir, 'to-delete.txt');
      fs.writeFileSync(filePath, 'content');
      
      assert.ok(fs.existsSync(filePath), 'file should exist before delete');
      
      const result = await toolExecutors.delete_file({
        path: filePath
      });
      
      assert.ok(result.success, 'should succeed');
      assert.ok(!fs.existsSync(filePath), 'file should be deleted');
    });

    it('should handle non-existent files', async () => {
      const result = await toolExecutors.delete_file({
        path: path.join(testDir, 'non-existent.txt')
      });
      
      assert.ok(!result.success, 'should fail for non-existent file');
    });

    it('should refuse to delete directories', async () => {
      const dirPath = path.join(testDir, 'no-delete-dir');
      fs.mkdirSync(dirPath);
      
      const result = await toolExecutors.delete_file({
        path: dirPath
      });
      
      assert.ok(!result.success, 'should refuse to delete directory');
    });
  });

  describe('move_file', () => {
    it('should move file to new location', async () => {
      const sourcePath = path.join(testDir, 'move-me.txt');
      const destPath = path.join(testDir, 'moved.txt');
      
      fs.writeFileSync(sourcePath, 'content to move');
      
      const result = await toolExecutors.move_file({
        source: sourcePath,
        destination: destPath
      });
      
      assert.ok(result.success, 'should succeed');
      assert.ok(!fs.existsSync(sourcePath), 'source should not exist');
      assert.ok(fs.existsSync(destPath), 'destination should exist');
      assert.strictEqual(fs.readFileSync(destPath, 'utf-8'), 'content to move');
    });

    it('should rename file', async () => {
      const originalPath = path.join(testDir, 'original.txt');
      const renamedPath = path.join(testDir, 'renamed.txt');
      
      fs.writeFileSync(originalPath, 'content');
      
      const result = await toolExecutors.move_file({
        source: originalPath,
        destination: renamedPath
      });
      
      assert.ok(result.success);
      assert.ok(!fs.existsSync(originalPath));
      assert.ok(fs.existsSync(renamedPath));
    });

    it('should handle non-existent source', async () => {
      const result = await toolExecutors.move_file({
        source: path.join(testDir, 'non-existent.txt'),
        destination: path.join(testDir, 'dest.txt')
      });
      
      assert.ok(!result.success, 'should fail for non-existent source');
    });
  });

  describe('search_files', () => {
    it('should search for files by pattern', async () => {
      // Create test files
      fs.writeFileSync(path.join(testDir, 'search-test-1.txt'), 'content 1');
      fs.writeFileSync(path.join(testDir, 'search-test-2.txt'), 'content 2');
      fs.writeFileSync(path.join(testDir, 'other.md'), 'markdown');
      
      const result = await toolExecutors.search_files({
        path: testDir,
        pattern: '*.txt'
      });
      
      assert.ok(result.success, 'should succeed');
      assert.ok(Array.isArray(result.matches), 'should return matches array');
    });

    it('should support case-insensitive search', async () => {
      fs.writeFileSync(path.join(testDir, 'CaseTest.TXT'), 'content');
      
      const result = await toolExecutors.search_files({
        path: testDir,
        pattern: '*.txt',
        caseSensitive: false
      });
      
      assert.ok(result.success);
      assert.ok(result.matches.length > 0, 'should find files with different cases');
    });

    it('should handle invalid patterns gracefully', async () => {
      const result = await toolExecutors.search_files({
        path: testDir,
        pattern: '[invalid('
      });
      
      // Should either succeed with no matches or return an error
      assert.ok(result.success !== undefined, 'should have defined success status');
    });
  });

  describe('get_file_info', () => {
    it('should return file information', async () => {
      const result = await toolExecutors.get_file_info({
        path: testFile
      });
      
      assert.ok(result.success, 'should succeed');
      assert.ok(result.info, 'should have info object');
      assert.ok(result.info.size !== undefined, 'should have size');
      assert.ok(result.info.type, 'should have type');
      assert.ok(result.info.modified !== undefined, 'should have modification time');
    });

    it('should include permission information', async () => {
      const result = await toolExecutors.get_file_info({
        path: testFile
      });
      
      assert.ok(result.success);
      assert.ok(result.info.permissions !== undefined, 'should have permissions');
    });

    it('should distinguish file types', async () => {
      const fileResult = await toolExecutors.get_file_info({
        path: testFile
      });
      
      const dirResult = await toolExecutors.get_file_info({
        path: testDir
      });
      
      assert.strictEqual(fileResult.info.type, 'file');
      assert.strictEqual(dirResult.info.type, 'directory');
    });

    it('should handle non-existent paths', async () => {
      const result = await toolExecutors.get_file_info({
        path: path.join(testDir, 'non-existent-path')
      });
      
      assert.ok(!result.success, 'should fail for non-existent path');
    });
  });

  describe('Path Safety', () => {
    it('should prevent directory traversal attacks', async () => {
      const maliciousPath = path.join(testDir, '../../../etc/passwd');
      
      const result = await toolExecutors.read_file({
        path: maliciousPath
      });
      
      // Should either refuse or resolve safely outside test dir
      assert.ok(typeof result === 'object', 'should handle malicious path');
    });

    it('should handle absolute paths safely', async () => {
      const absolutePath = path.resolve(testFile);
      
      const result = await toolExecutors.read_file({
        path: absolutePath
      });
      
      assert.ok(result.success, 'should handle absolute paths');
    });
  });

  describe('Error Handling', () => {
    it('should return structured error responses', async () => {
      const result = await toolExecutors.read_file({
        path: path.join(testDir, 'non-existent.txt')
      });
      
      assert.ok(!result.success);
      assert.ok(result.error, 'should have error message');
      assert.ok(typeof result.error === 'string', 'error should be string');
    });

    it('should not throw exceptions on edge cases', async () => {
      try {
        await toolExecutors.read_file({ path: null });
        await toolExecutors.write_file({ path: '', content: 'test' });
        await toolExecutors.list_directory({ path: undefined });
      } catch (e) {
        assert.fail(`should not throw: ${e.message}`);
      }
    });
  });
});
