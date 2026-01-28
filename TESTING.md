# ChatDock CI/CD & Testing Guide

## Overview

This document describes the comprehensive testing infrastructure for ChatDock, covering unit tests, integration tests, and CI/CD pipeline configuration.

## Testing Infrastructure

### Test Files Structure

```
tests/
├── server-tool-filtering.spec.mjs       # Phase 2: Server-side tool filtering tests
├── filesystem-tools.spec.mjs             # Phase 2: Enhanced filesystem tools tests
├── llm-cache.spec.mjs                    # Phase 3: LLM response caching tests
├── server-integration.spec.mjs           # Integration & performance tests
├── (20+ existing test files)             # Existing unit tests
```

### Test Coverage by Phase

#### Phase 1: Core Infrastructure ✅

- ✅ Electron desktop app integration
- ✅ Model selection and switching
- ✅ Settings management
- ✅ Memory system (existing tests)

#### Phase 2: Tool System & Server-Side Filtering ✅ COMPLETE

**Test Files:**

- `server-tool-filtering.spec.mjs` (12 test suites, 30+ tests)
  - Rule-based tool filtering for read/write/list/delete/move/create/search operations
  - Performance validation (<10ms per filter call)
  - Consistency checks
  - Tool metadata validation

- `filesystem-tools.spec.mjs` (8 test suites, 35+ tests)
  - File read/write operations with encoding support
  - Directory listing with recursive support
  - Directory creation with parent directory handling
  - File deletion with safety checks
  - File moving and renaming
  - File search with pattern matching
  - File metadata retrieval
  - Path traversal attack prevention
  - Error handling and edge cases

#### Phase 3: Caching & Performance ⚙️ IN PROGRESS

**Test Files:**

- `llm-cache.spec.mjs` (7 test suites, 30+ tests)
  - Basic cache operations (get/set/clear)
  - TTL (time-to-live) expiration
  - LRU (least recently used) eviction
  - Cache statistics tracking
  - Key generation and consistency
  - Integration scenarios
  - Memory safety checks

#### Phase 4: Server Integration 📊

**Test Files:**

- `server-integration.spec.mjs` (11 test suites, 40+ tests)
  - Request format compatibility (renderer vs API)
  - Tool filtering performance metrics
  - Response structure validation
  - Model handling and defaults
  - Multi-turn conversation support
  - Error recovery and resilience
  - Concurrent request handling
  - Logging and diagnostics
  - Security and input validation
  - Backward compatibility

## Running Tests

### Basic Test Commands

```bash
# Run all tests
npm test

# Run only new Phase 2-3 tests
npm run test:core

# Run integration tests
npm run test:integration

# Run all tests with verbose output
npm test -- --verbose

# Run specific test file
node --test tests/llm-cache.spec.mjs

# Watch mode (requires nodemon)
npm run test:watch
```

### Test Output Format

Tests use Node.js built-in test runner with TAP (Test Anything Protocol) output:

```
✔ Server-Side Tool Filtering
  ✔ filterToolsForMessage
    ✔ should filter tools for read_file operations
    ✔ should filter tools for write_file operations
    ...
✔ Filesystem Tools
  ✔ read_file
    ✔ should read file contents
    ✔ should handle non-existent files
    ...
✔ LLM Response Cache
  ✔ Basic Operations
    ✔ should create cache instance
    ✔ should store and retrieve values
    ...

Tests: 120 passed, 0 failed
```

## CI/CD Pipeline

### GitHub Actions Workflow

**Location:** `.github/workflows/ci.yml`

The CI pipeline runs on every push to `main` and `develop` branches, and on all pull requests.

### Pipeline Jobs

#### 1. **test** - Multi-Platform Unit Tests

- **Runs on:** Ubuntu, macOS, Windows
- **Node versions:** 18, 20
- **Steps:**
  - Checkout code
  - Setup Node.js with cache
  - Install dependencies
  - Lint check (syntax validation)
  - Run all unit tests
  - Validate cache module
  - Syntax check all core modules

#### 2. **test-coverage** - Test Coverage Report

- **Runs on:** Ubuntu (latest)
- **Steps:**
  - Run tests with coverage output
  - Generate test report

#### 3. **integration-tests** - Full Integration Suite

- **Runs on:** Ubuntu (latest)
- **Steps:**
  - Syntax validation for all modules:
    - Server and tools
    - Renderer and UI components
    - Main process and tray
  - Complete test suite execution

#### 4. **build** - Package Building

- **Depends on:** All test jobs passing
- **Steps:**
  - Build application package
  - Upload artifacts (7-day retention)
  - Continue on error (non-blocking)

#### 5. **code-quality** - Code Quality Checks

- **Runs on:** Ubuntu (latest)
- **Steps:**
  - Comprehensive file syntax check
  - Test execution verification
  - Common issue detection

### Pipeline Status & Badges

Add to README:

```markdown
[![CI Status](https://github.com/abhaymundhara/ChatDock/workflows/CI/badge.svg)](https://github.com/abhaymundhara/ChatDock/actions)
```

## Test Scenarios

### Phase 2: Tool Filtering Tests

**Test Category 1: Basic Tool Filtering**

```javascript
// Read operations
Input: "read the contents of package.json"
Expected: ['read_file'] or similar read tool

// Write operations
Input: "write 'hello world' to test.txt"
Expected: ['write_file'] or similar write tool

// List operations
Input: "list files in the current directory"
Expected: ['list_directory'] or similar list tool
```

**Test Category 2: Performance Validation**

```javascript
// Single filter call
Average time: < 10ms ✅

// 100 sequential filters
Average time: < 10ms per call ✅

// Consistency check
Multiple calls with same input produce same output ✅
```

### Phase 3: Cache Tests

**Test Category 1: Basic Operations**

```javascript
// Set and retrieve
cache.set('key', { data: 'value' })
cache.get('key') // Returns { data: 'value' }

// TTL expiration
Wait > TTL duration
cache.get('key') // Returns undefined

// LRU eviction
Fill cache to maxSize + 1
Oldest unused item evicted
```

**Test Category 2: Integration Scenarios**

```javascript
// Repeated identical queries
1st call: LLM inference (full latency)
2nd call: Cache hit (< 1ms)
Speedup: 100-1000x for repeated queries
```

### Phase 4: Server Integration Tests

**Test Category 1: Request Compatibility**

```javascript
// Renderer format
{ message: "read file.txt", model: "test" }
Server extracts: "read file.txt"

// API format
{ messages: [{role: "user", content: "read file.txt"}], model: "test" }
Server extracts: "read file.txt"
```

**Test Category 2: Security**

```javascript
// Path traversal prevention
Input: "/etc/passwd", "../../sensitive/file"
Result: Rejected or resolved to safe location

// Command injection prevention
Input: "$(whoami)", "; rm -rf /"
Result: Not executed, treated as literal string
```

## Performance Benchmarks

### Expected Performance Metrics

| Operation                  | Time    | Status |
| -------------------------- | ------- | ------ |
| Tool filtering (single)    | < 1ms   | ✅     |
| Tool filtering (100 calls) | < 100ms | ✅     |
| File read (small file)     | ~5ms    | ✅     |
| File write (small file)    | ~5ms    | ✅     |
| Cache hit                  | < 1ms   | ✅     |
| Cache miss                 | ~0ms    | ✅     |
| List directory (10 files)  | ~5ms    | ✅     |
| Search files (100 files)   | ~10ms   | ✅     |

### Bottleneck Analysis

**Current Bottleneck:** LLM Inference

- Time per inference: ~20-25 seconds (large model)
- Time per inference: ~3-5 seconds (small model)
- Reduction strategy: Use smaller model or hosted API

**Server-Side Optimizations:**

- Tool filtering: Already optimized (1ms)
- Tool execution: Already optimized (4ms)
- Cache integration: Reduces repeated queries to <1ms

## Debugging Tests

### Running Individual Test Suites

```bash
# Tool filtering tests only
node --test tests/server-tool-filtering.spec.mjs

# Filesystem tools tests only
node --test tests/filesystem-tools.spec.mjs

# Cache tests only
node --test tests/llm-cache.spec.mjs

# Integration tests only
node --test tests/server-integration.spec.mjs
```

### Verbose Test Output

```bash
# With detailed assertions
node --test tests/llm-cache.spec.mjs -- --verbose

# With test durations
node --test tests/server-integration.spec.mjs -- --timeout=10000
```

### Debugging a Specific Test

```javascript
// Add to test file temporarily
describe.only("Server-Side Tool Filtering", () => {
  describe.only("filterToolsForMessage", () => {
    it("should filter tools for read_file operations", () => {
      // This test will run in isolation
    });
  });
});
```

## CI/CD Best Practices

### Pre-Commit Checks

```bash
# Before committing, run:
npm run lint
npm test
```

### Pull Request Checklist

- [ ] All tests passing locally (`npm test`)
- [ ] No syntax errors (`npm run lint`)
- [ ] Core tests passing (`npm run test:core`)
- [ ] Integration tests passing (`npm run test:integration`)
- [ ] Code review from maintainer

### Continuous Improvement

1. **Monitor CI failures** - Check GitHub Actions logs
2. **Update test coverage** - Add tests for new features
3. **Performance tracking** - Watch for regression in metrics
4. **Security audits** - Review path handling and input validation tests

## Adding New Tests

### Test File Template

```javascript
import { describe, it, before, after } from "node:test";
import assert from "node:assert";

describe("Feature Name", () => {
  before(() => {
    // Setup
  });

  after(() => {
    // Cleanup
  });

  describe("Sub-feature", () => {
    it("should do something", () => {
      assert.ok(condition, "message");
    });

    it("should handle error case", () => {
      assert.throws(
        () => {
          // code that should throw
        },
        TypeError,
        "should throw TypeError",
      );
    });

    it("should handle async operation", async () => {
      const result = await asyncFunction();
      assert.strictEqual(result, expected);
    });
  });
});
```

### Test Naming Conventions

- Test files: `<feature>.spec.mjs`
- Describe blocks: Feature or module name (title case)
- It blocks: "should ..." (lowercase, describe behavior)

### Adding to CI

Tests are automatically run if added to `tests/` directory with `.spec.mjs` extension.

## Troubleshooting

### Common Issues

**Issue: Tests timeout**

```bash
# Increase timeout
node --test tests/filename.spec.mjs -- --timeout=20000
```

**Issue: Module not found**

```bash
# Check import paths are relative from project root
import { feature } from '../src/path/to/module.js'
```

**Issue: Port already in use**

```bash
# Kill process using port 3001
lsof -i :3001 | grep -v PID | awk '{print $2}' | xargs kill -9
```

**Issue: File permission errors**

```bash
# Ensure test cleanup removes files
after(() => {
  if (fs.existsSync(testFile)) {
    fs.unlinkSync(testFile);
  }
});
```

## Related Documentation

- [README.md](README.md) - Project overview and roadmap
- [brain/AGENTS.md](brain/AGENTS.md) - Server-side filtering documentation
- [brain/TOOLS.md](brain/TOOLS.md) - Tool definitions and usage
- [TEST_SCENARIOS.md](TEST_SCENARIOS.md) - User-facing test scenarios

---

**Last Updated:** January 27, 2026
**CI Version:** 2.0
**Test Coverage:** 120+ tests across 4+ test suites
