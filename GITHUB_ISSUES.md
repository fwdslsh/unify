# GitHub Issues for Code Review Findings

This file contains all 25 issues identified in the comprehensive code review.
Copy each issue and create it in GitHub, or use a batch import tool.

**Reference Documents:**
- Full Analysis: [CODE_REVIEW_REPORT.md](CODE_REVIEW_REPORT.md)
- Implementation Guide: [ACTION_ITEMS.md](ACTION_ITEMS.md)

---

## Critical Priority Issues (2)

### Issue 1: Replace synchronous file operations in async code

**Priority:** Critical
**Labels:** `bug`, `performance`, `critical`
**Estimated Effort:** 1-2 hours

**Description:**

Multiple locations in the codebase use synchronous file operations (`fs.readFileSync()`, `require('fs').existsSync()`) within async functions, which blocks the event loop and degrades performance.

**Affected Files:**
- `src/core/unified-html-processor.js:58` - `fsSync.existsSync()`
- `src/core/file-processor.js:1727` - `fs.readFileSync()`
- `src/core/file-processor.js:1757` - `fs.readFileSync()`

**Current Code Example:**
```javascript
// unified-html-processor.js:58
const fsSync = require('fs');  // ❌ CommonJS require in ES module
const exists = fsSync.existsSync(c);  // ❌ Blocking sync operation
```

**Impact:**
- Blocks the event loop during file I/O operations
- Degrades performance, especially with large builds
- Defeats the purpose of using async functions
- Can cause freezing in watch mode

**Solution:**
Replace with async equivalents:
```javascript
import fs from 'fs/promises';
const exists = await fs.access(c).then(() => true).catch(() => false);
```

**Testing:**
```bash
bun test test/unit/include-processor.test.js
bun test test/unit/layout-discovery.test.js
```

**References:**
- CODE_REVIEW_REPORT.md - Section 2.1, Issue #1
- ACTION_ITEMS.md - Task 1.1

---

### Issue 2: Refactor massive 462-line build() function

**Priority:** Critical
**Labels:** `refactor`, `maintainability`, `critical`, `technical-debt`
**Estimated Effort:** 4-6 hours

**Description:**

The `build()` function in `src/core/file-processor.js` is 462 lines long (lines 169-631) and handles 10 different responsibilities, violating the Single Responsibility Principle and making the code extremely difficult to test and maintain.

**Location:** `src/core/file-processor.js:169-631`

**Function Responsibilities:**
1. Configuration initialization
2. Path resolution and validation
3. Directory cleanup
4. Dependency and asset tracking initialization
5. File scanning and categorization
6. Layout discovery
7. Content file processing
8. Asset copying
9. Sitemap generation
10. Error aggregation and reporting

**Impact:**
- Violates Single Responsibility Principle
- Extremely difficult to test individual phases
- Hard to understand control flow
- Difficult to maintain and extend
- High cognitive load for developers

**Solution:**

Extract into focused, testable phases:

```javascript
export async function build(options = {}) {
  let context = await initializeBuildContext(options);
  context = await validateAndPrepare(context);
  context = await discoverFiles(context);
  context = await processFiles(context);
  context = await copyAssets(context);
  context = await generateSitemap(context);
  return createBuildResult(context);
}
```

Create new file: `src/core/build-phases/index.js` with separate functions for each phase.

**Benefits:**
- Each phase is testable independently
- Clear separation of concerns
- Easier to understand control flow
- Can add phases without modifying existing code
- Reduces cognitive load

**Testing:**
```bash
bun test test/unit/build-phases/
bun test test/integration/build-workflow.test.js
```

**References:**
- CODE_REVIEW_REPORT.md - Section 2.1, Issue #2
- ACTION_ITEMS.md - Task 1.2

---

## High Priority Issues (6)

### Issue 3: Eliminate 95% duplicate HTML processing functions

**Priority:** High
**Labels:** `refactor`, `code-quality`, `DRY`
**Estimated Effort:** 2-3 hours

**Description:**

Two nearly identical functions exist for processing HTML content at:
- `src/core/file-processor.js:1211-1305`
- `src/core/file-processor.js:1436-1535`

The functions differ only in minor parameters and error handling, resulting in ~95% code duplication.

**Impact:**
- Code duplication violates DRY principle
- Maintenance burden (bugs must be fixed in two places)
- Increases test surface area unnecessarily

**Solution:**

Create a unified HTML processing function:

```javascript
async function processHtmlContent(options) {
  const {
    content,
    filePath,
    sourceRoot,
    config,
    dependencyTracker,
    layoutDiscovery,
    errorMode = 'throw' // 'throw' | 'collect'
  } = options;

  // Unified processing logic
}
```

**References:**
- CODE_REVIEW_REPORT.md - Section 2.2, Issue #3
- ACTION_ITEMS.md - Task 2.1

---

### Issue 4: Replace all console.* calls with logger

**Priority:** High
**Labels:** `code-quality`, `logging`, `good-first-issue`
**Estimated Effort:** 30 minutes

**Description:**

24 instances of direct `console.log()`, `console.error()`, and `console.warn()` calls exist throughout the codebase instead of using the centralized logger.

**Impact:**
- Inconsistent log formatting
- Can't control log levels in production
- Pollutes test output
- Makes debugging harder

**Current Pattern:**
```javascript
console.log(info);  // ❌
console.error(`Processing failed: ${e.message}`);  // ❌
```

**Solution:**
```javascript
logger.info(info);  // ✅
logger.error(`Processing failed: ${e.message}`);  // ✅
```

**Find All:**
```bash
grep -rn "console\." src/
```

**Automated Fix:**
```bash
find src -name "*.js" -exec sed -i.bak \
  -e 's/console\.log(/logger.info(/g' \
  -e 's/console\.error(/logger.error(/g' \
  -e 's/console\.warn(/logger.warn(/g' \
  -e 's/console\.debug(/logger.debug(/g' \
  {} +
```

**References:**
- CODE_REVIEW_REPORT.md - Section 2.2, Issue #4
- ACTION_ITEMS.md - Task 1.3

---

### Issue 5: Remove global state via globalThis

**Priority:** High
**Labels:** `refactor`, `architecture`, `testability`
**Estimated Effort:** 3-4 hours

**Description:**

Build configuration is stored in `globalThis.UNIFY_BUILD_CONFIG` and accessed from unrelated functions, creating hidden dependencies and breaking encapsulation.

**Locations:**
- `src/core/file-processor.js:172` - Sets global state
- `src/core/file-processor.js:1318-1319` - Accesses global state

**Current Code:**
```javascript
// Set global
globalThis.UNIFY_BUILD_CONFIG = config;

// Access in unrelated function
if (globalThis.UNIFY_BUILD_CONFIG?.prettyUrls) {
  // ...
}
```

**Impact:**
- Breaks encapsulation
- Makes testing difficult (shared state between tests)
- Prevents concurrent builds
- Hidden dependencies

**Solution:**

Use dependency injection or pass config explicitly through the call chain, or create a BuildContext class.

**References:**
- CODE_REVIEW_REPORT.md - Section 2.2, Issue #5
- ACTION_ITEMS.md - Task 2.2

---

### Issue 6: Fix unhandled promise in file watcher

**Priority:** High
**Labels:** `bug`, `async`, `error-handling`
**Estimated Effort:** 30 minutes

**Description:**

The file watcher's restart logic doesn't await the async `setupWatcher()` call, leading to unhandled promise rejections on failure.

**Location:** `src/core/file-watcher.js:148`

**Current Code:**
```javascript
setTimeout(() => {
  if (this.isWatching) {
    logger.info('Attempting to restart file watcher...');
    this.setupWatcher(config);  // ❌ Async function not awaited
  }
}, 1000);
```

**Impact:**
- Unhandled promise rejection if setupWatcher fails
- Silent failures in production
- Difficult to debug watcher issues

**Solution:**
```javascript
setTimeout(async () => {
  if (this.isWatching) {
    logger.info('Attempting to restart file watcher...');
    try {
      await this.setupWatcher(config);
      logger.success('File watcher restarted successfully');
    } catch (err) {
      logger.error('Failed to restart watcher:', err.message);
    }
  }
}, 1000);
```

**Better Approach:** Implement exponential backoff retry logic (see ACTION_ITEMS.md for example).

**References:**
- CODE_REVIEW_REPORT.md - Section 2.2, Issue #6
- ACTION_ITEMS.md - Task 1.4

---

### Issue 7: Use crypto.randomUUID() for SSE client IDs

**Priority:** High
**Labels:** `security`, `enhancement`
**Estimated Effort:** 15 minutes

**Description:**

SSE client IDs are generated using `Math.random()` which is not cryptographically secure and could lead to ID collisions.

**Location:** `src/server/dev-server.js:292`

**Current Code:**
```javascript
const client = {
  id: Math.random().toString(36).substr(2, 9),  // ❌ Weak randomness
  controller,
  connected: Date.now(),
  active: true
};
```

**Impact:**
- Potential ID collisions (birthday paradox)
- Security risk if IDs are predictable
- Not cryptographically secure

**Solution:**
```javascript
import crypto from 'crypto';

const client = {
  id: crypto.randomUUID(),  // ✅ Proper UUID generation
  controller,
  connected: Date.now(),
  active: true
};
```

**References:**
- CODE_REVIEW_REPORT.md - Section 2.2, Issue #7
- ACTION_ITEMS.md - Task 1.5

---

### Issue 8: Extract magic numbers to constants file

**Priority:** High
**Labels:** `refactor`, `maintainability`, `good-first-issue`
**Estimated Effort:** 1-2 hours

**Description:**

Magic numbers are scattered throughout the codebase without explanation, making it hard to understand their purpose and difficult to adjust thresholds.

**Examples:**
- `src/server/dev-server.js:71` - `idleTimeout: 255` (no explanation why 255)
- `src/core/include-processor.js` - `10` level depth limit (hardcoded)
- Various timeout values without named constants

**Impact:**
- Hard to understand intent
- Difficult to tune or configure
- No central place to adjust thresholds

**Solution:**

Create `src/utils/build-constants.js`:

```javascript
export const BUILD_CONSTANTS = {
  MAX_INCLUDE_DEPTH: 10,
  SSE_IDLE_TIMEOUT_SECONDS: 255,
  WATCHER_DEBOUNCE_MS: 100,
  REBUILD_TIMEOUT_MS: 5000,
  DEFAULT_PORT: 3000,
  DEFAULT_HOSTNAME: '127.0.0.1'
};

export const FILE_PATTERNS = {
  HTML: /\.html?$/i,
  MARKDOWN: /\.md$/i,
  CSS: /\.css$/i,
  // ...
};
```

**References:**
- CODE_REVIEW_REPORT.md - Section 2.2, Issue #8
- ACTION_ITEMS.md - Task 2.3

---

## Medium Priority Issues (10)

### Issue 9: Add unit tests for build-cache.js

**Priority:** Medium
**Labels:** `testing`, `enhancement`
**Estimated Effort:** 2-3 hours

**Description:**

The `BuildCache` class (`src/core/build-cache.js`) has no dedicated unit tests despite being a critical component for build performance.

**Missing Test Coverage:**
- Hash generation and comparison
- Cache initialization and loading
- Dirty file detection
- Cache invalidation
- Cache persistence

**Solution:**

Create `test/unit/build-cache.test.js` with comprehensive test coverage.

**References:**
- CODE_REVIEW_REPORT.md - Section 2.3, Issue #9
- ACTION_ITEMS.md - Task 2.4

---

### Issue 10: Implement symlink security validation

**Priority:** Medium
**Labels:** `security`, `enhancement`
**Estimated Effort:** 2-3 hours

**Description:**

The codebase doesn't validate or handle symbolic links, which could lead to path traversal, infinite loops, or unexpected file inclusion.

**Security Risks:**
- Path traversal via symlinks pointing outside source directory
- Infinite loops if symlinks create cycles
- Unexpected file inclusion

**Solution:**

Add symlink detection and validation to `src/utils/path-resolver.js`:

```javascript
async function isSymlink(filePath);
async function resolveAndValidateSymlink(filePath, sourceRoot);
async function detectCircularSymlinks(filePath, visited);
```

Create `test/unit/symlink-security.test.js` with security tests.

**References:**
- CODE_REVIEW_REPORT.md - Section 2.3, Issue #10
- CODE_REVIEW_REPORT.md - Section 5.2, Security Issue #2
- ACTION_ITEMS.md - Task 2.5

---

### Issue 11: Extract repeated error handling pattern

**Priority:** Medium
**Labels:** `refactor`, `DRY`, `error-handling`
**Estimated Effort:** 2-3 hours

**Description:**

The same try-catch pattern with error formatting appears 15+ times throughout the codebase:

```javascript
try {
  // operation
} catch (error) {
  if (error.formatForCLI) {
    logger.error(error.formatForCLI());
  } else {
    logger.error("Operation failed:", error.message);
  }
  throw error;
}
```

**Solution:**

Extract to utility function:

```javascript
export async function withErrorHandling(operation, context) {
  try {
    return await operation();
  } catch (error) {
    if (error.formatForCLI) {
      logger.error(error.formatForCLI());
    } else {
      logger.error(`${context} failed:`, error.message);
    }
    throw error;
  }
}
```

**References:**
- CODE_REVIEW_REPORT.md - Section 2.3, Issue #11

---

### Issue 12: Add JSDoc comments to all exported functions

**Priority:** Medium
**Labels:** `documentation`, `good-first-issue`
**Estimated Effort:** 1-2 hours

**Description:**

Some utility functions in the codebase are missing JSDoc comments, which affects developer experience and IDE autocomplete.

**Solution:**

Add comprehensive JSDoc comments to all exported functions, including:
- Function description
- Parameter types and descriptions
- Return type and description
- Examples where helpful

**References:**
- CODE_REVIEW_REPORT.md - Section 2.4, Issue #12

---

### Issue 13: Add TypeScript definition files

**Priority:** Medium
**Labels:** `enhancement`, `typescript`, `developer-experience`
**Estimated Effort:** 3-4 hours

**Description:**

The project lacks TypeScript definition files (`.d.ts`), limiting TypeScript adoption and IDE support.

**Solution:**

Create `.d.ts` files for all public APIs, or consider converting the entire codebase to TypeScript.

**Benefits:**
- Better IDE autocomplete and IntelliSense
- Type checking for users
- Improved developer experience

**References:**
- CODE_REVIEW_REPORT.md - Section 2.4, Issue #13

---

### Issue 14: Add Content Security Policy headers to dev server

**Priority:** Medium
**Labels:** `security`, `enhancement`, `dev-server`
**Estimated Effort:** 30 minutes

**Description:**

The development server doesn't set security headers like Content-Security-Policy, X-Content-Type-Options, or X-Frame-Options.

**Location:** `src/server/dev-server.js`

**Solution:**

```javascript
return new Response(content, {
  headers: {
    'Content-Type': contentType,
    'Content-Security-Policy': "default-src 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  }
});
```

**Note:** This is low priority as it only affects the dev server, not production output.

**References:**
- CODE_REVIEW_REPORT.md - Section 5.2, Security Issue #3

---

### Issue 15: Review RegEx patterns for potential ReDoS

**Priority:** Medium
**Labels:** `security`, `performance`
**Estimated Effort:** 2-3 hours

**Description:**

Complex regex patterns in `src/core/include-processor.js` could be exploited with crafted input to cause Regular Expression Denial of Service (ReDoS).

**Solution:**

- Review all regex patterns for catastrophic backtracking
- Add input length limits
- Consider timeout protection for regex operations
- Add tests with pathological input

**References:**
- CODE_REVIEW_REPORT.md - Section 5.2, Security Issue #4

---

### Issue 16: Add rate limiting to development server

**Priority:** Medium
**Labels:** `security`, `enhancement`, `dev-server`
**Estimated Effort:** 1-2 hours

**Description:**

The development server has no rate limiting, making it vulnerable to abuse during development.

**Solution:**

Implement simple rate limiting for SSE connections and file requests to prevent accidental DoS during development.

**References:**
- CODE_REVIEW_REPORT.md - Section 5.4

---

### Issue 17: Create SECURITY.md with vulnerability reporting process

**Priority:** Medium
**Labels:** `documentation`, `security`, `good-first-issue`
**Estimated Effort:** 30 minutes

**Description:**

The repository lacks a SECURITY.md file to guide security vulnerability reporting.

**Solution:**

Create `.github/SECURITY.md` with:
- Supported versions
- How to report vulnerabilities
- Security update policy
- Contact information

**References:**
- CODE_REVIEW_REPORT.md - Section 5.4

---

### Issue 18: Create ADR (Architecture Decision Records) directory

**Priority:** Medium
**Labels:** `documentation`, `architecture`
**Estimated Effort:** 2-3 hours

**Description:**

The project lacks Architecture Decision Records explaining key design choices.

**Missing ADRs:**
- Why Bun-only vs Node.js compatibility?
- Why Apache SSI syntax vs custom syntax?
- Why RegEx-based parsing vs AST?
- Why convention-based architecture?

**Solution:**

Create `docs/adr/` directory with ADR files for major architectural decisions.

**Template:**
```markdown
# ADR-001: Bun-Native Implementation

## Status
Accepted

## Context
[Describe the decision context]

## Decision
[Describe the decision made]

## Consequences
[Describe positive and negative consequences]
```

**References:**
- CODE_REVIEW_REPORT.md - Section 4.2

---

## Low Priority Issues (5)

### Issue 19: Set up code coverage reporting

**Priority:** Low
**Labels:** `ci-cd`, `testing`, `enhancement`
**Estimated Effort:** 1 hour

**Description:**

The project lacks automated code coverage reporting and tracking.

**Solution:**

- Add coverage reporting to CI (e.g., Codecov, Coveralls)
- Add coverage badge to README
- Set minimum coverage threshold
- Track coverage trends over time

**Testing:**
```bash
bun test --coverage
```

**References:**
- CODE_REVIEW_REPORT.md - Section 7.1

---

### Issue 20: Add linting and formatting checks to CI

**Priority:** Low
**Labels:** `ci-cd`, `code-quality`, `enhancement`
**Estimated Effort:** 1-2 hours

**Description:**

The CI pipeline doesn't run linting or formatting checks.

**Solution:**

Add to `.github/workflows/test.yml`:
- ESLint for code quality
- Prettier for formatting
- Pre-commit hooks with Husky
- Commit message linting (commitlint)

**References:**
- CODE_REVIEW_REPORT.md - Section 10

---

### Issue 21: Add dependency vulnerability scanning

**Priority:** Low
**Labels:** `security`, `ci-cd`, `enhancement`
**Estimated Effort:** 30 minutes

**Description:**

The project lacks automated dependency vulnerability scanning.

**Solution:**

- Enable Dependabot for automated dependency updates
- Add npm audit to CI pipeline
- Set up security alerts

**References:**
- CODE_REVIEW_REPORT.md - Section 10

---

### Issue 22: Add tests for large file handling

**Priority:** Low
**Labels:** `testing`, `performance`
**Estimated Effort:** 2-3 hours

**Description:**

No tests exist for handling large files (multi-MB HTML/markdown files).

**Solution:**

Add tests for:
- Large HTML files (10MB+)
- Large markdown files with many includes
- Memory usage during processing
- Performance degradation with file size

**References:**
- CODE_REVIEW_REPORT.md - Section 3.3

---

### Issue 23: Add performance benchmarks

**Priority:** Low
**Labels:** `performance`, `testing`, `enhancement`
**Estimated Effort:** 3-4 hours

**Description:**

The project lacks performance benchmarks and regression testing.

**Solution:**

Create `test/performance/benchmarks.test.js` with:
- Build time benchmarks for various site sizes
- Include processing performance
- Watch mode performance
- Memory usage tracking
- Performance regression tests in CI

**References:**
- CODE_REVIEW_REPORT.md - Section 3.3

---

## Enhancement Ideas (Not Issues Yet)

### Future: Plugin System for Extensibility

**Priority:** Enhancement
**Labels:** `enhancement`, `architecture`, `long-term`
**Estimated Effort:** 15-20 hours

**Description:**

Design and implement a plugin system to make build phases pluggable and allow users to extend functionality without modifying core code.

**See:** ACTION_ITEMS.md - Phase 4 for detailed design.

**References:**
- CODE_REVIEW_REPORT.md - Section 6.3

---

### Future: Configuration Schema Validation

**Priority:** Enhancement
**Labels:** `enhancement`, `validation`
**Estimated Effort:** 5-8 hours

**Description:**

Add JSON schema for configuration validation and support `.unifyrc.js` config files.

**References:**
- CODE_REVIEW_REPORT.md - Section 6.3

---

## Summary Statistics

| Priority | Count | Total Effort |
|----------|-------|--------------|
| Critical | 2 | 6-8 hours |
| High | 6 | 12-15 hours |
| Medium | 10 | 15-20 hours |
| Low | 5 | 8-12 hours |
| **Total** | **23** | **41-55 hours** |

---

## How to Create These Issues

### Option 1: Manual Creation
Copy each issue section and create it manually in GitHub Issues.

### Option 2: Using GitHub CLI (if available)
```bash
# Example for Issue 1
gh issue create \
  --title "Replace synchronous file operations in async code" \
  --body "$(cat ISSUE_1_CONTENT.md)" \
  --label "bug,performance,critical"
```

### Option 3: Batch Import
Use a tool like GitHub's issue import API or a third-party tool to batch create issues.

---

**Generated:** November 18, 2025
**Source:** CODE_REVIEW_REPORT.md comprehensive analysis
**Review Branch:** claude/code-review-audit-011f4LGSZoTZ1porXdkrXMJC
