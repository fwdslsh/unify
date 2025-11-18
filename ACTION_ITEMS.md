# Action Items & Implementation Guide

**Generated:** November 18, 2025
**Source:** Comprehensive Code Review Report

This document provides actionable tasks with implementation examples for addressing issues identified in the code review.

---

## Quick Priority Matrix

| Priority | Count | Time Required | Impact |
|----------|-------|---------------|--------|
| CRITICAL | 2 | 6-8 hours | Performance, Maintainability |
| HIGH | 6 | 12-15 hours | Code Quality, Security |
| MEDIUM | 10 | 15-20 hours | Reliability, Testing |
| LOW | 5 | 5-8 hours | Developer Experience |

---

## Phase 1: Critical Fixes (Do First!)

### ✅ Task 1.1: Replace Synchronous File Operations
**Priority:** CRITICAL
**Time:** 1-2 hours
**Files:** `src/core/unified-html-processor.js`, `src/core/file-processor.js`

**Current Code:**
```javascript
// unified-html-processor.js:58
const fsSync = require('fs');
const exists = fsSync.existsSync(c);
```

**Fixed Code:**
```javascript
// Use async fs/promises
import fs from 'fs/promises';

// Replace existsSync
const exists = await fs.access(c)
  .then(() => true)
  .catch(() => false);

// Or create a utility function
async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
```

**Affected Locations:**
- `src/core/unified-html-processor.js:58` - `fsSync.existsSync()`
- `src/core/file-processor.js:1727` - `fs.readFileSync()`
- `src/core/file-processor.js:1757` - `fs.readFileSync()`

**Testing:**
```bash
# Run tests to ensure no regressions
bun test test/unit/include-processor.test.js
bun test test/unit/layout-discovery.test.js
```

---

### ✅ Task 1.2: Refactor Massive build() Function
**Priority:** CRITICAL
**Time:** 4-6 hours
**File:** `src/core/file-processor.js:169-631`

**Strategy:**
Break the 462-line function into 6 focused phases:

```javascript
// src/core/build-phases/index.js

/**
 * Phase 1: Initialize build context
 */
export async function initializeBuildContext(options) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();

  let buildCache = null;
  if (config.cache !== false) {
    buildCache = createBuildCache(config.cacheDir || ".unify-cache");
    await buildCache.initialize();
  }

  return {
    config,
    startTime,
    buildCache,
    sourceRoot: path.resolve(config.source),
    outputRoot: path.resolve(config.output)
  };
}

/**
 * Phase 2: Validate and prepare directories
 */
export async function validateAndPrepare(context) {
  const { config, sourceRoot, outputRoot } = context;

  // Validate source exists
  try {
    await fs.access(sourceRoot);
  } catch (error) {
    throw new UnifyError(
      `Source directory not found: ${sourceRoot}`,
      null, null,
      [
        "Check that the source path is correct",
        "Verify the directory exists and is accessible"
      ]
    );
  }

  // Clean if requested
  if (config.clean) {
    logger.info(`Cleaning output directory: ${outputRoot}`);
    await cleanOutputDirectory(outputRoot);
  }

  // Ensure output exists
  await fs.mkdir(outputRoot, { recursive: true });

  return context;
}

/**
 * Phase 3: Discover and categorize files
 */
export async function discoverFiles(context) {
  const { config, sourceRoot } = context;

  const dependencyTracker = new DependencyTracker();
  const assetTracker = new AssetTracker();
  const fileClassifier = new FileClassifier();
  const layoutDiscovery = new LayoutDiscovery();

  const sourceFiles = await scanDirectory(sourceRoot);
  logger.info(`Found ${sourceFiles.length} source files`);

  const contentFiles = categorizeContentFiles(
    sourceFiles,
    sourceRoot,
    config,
    fileClassifier
  );

  return {
    ...context,
    dependencyTracker,
    assetTracker,
    fileClassifier,
    layoutDiscovery,
    contentFiles
  };
}

/**
 * Phase 4: Process content files
 */
export async function processFiles(context) {
  const { contentFiles, config, sourceRoot, outputRoot } = context;

  const errors = [];
  let processed = 0;

  for (const file of contentFiles) {
    try {
      await processFile(file, config, context);
      processed++;
    } catch (error) {
      errors.push({ file, error: error.message });
    }
  }

  return {
    ...context,
    processed,
    errors
  };
}

/**
 * Phase 5: Copy assets
 */
export async function copyAssets(context) {
  const { assetTracker, config, sourceRoot, outputRoot } = context;

  const assets = await assetTracker.getReferencedAssets();
  await copyReferencedAssets(assets, sourceRoot, outputRoot, config);

  return context;
}

/**
 * Phase 6: Generate sitemap
 */
export async function generateSitemap(context) {
  const { config, outputRoot } = context;

  if (config.baseUrl) {
    const sitemapPath = path.join(outputRoot, 'sitemap.xml');
    await generateSitemapFile(outputRoot, config.baseUrl, sitemapPath);
  }

  return context;
}

/**
 * Main build function - now much cleaner!
 */
export async function build(options = {}) {
  try {
    let context = await initializeBuildContext(options);
    context = await validateAndPrepare(context);
    context = await discoverFiles(context);
    context = await processFiles(context);
    context = await copyAssets(context);
    context = await generateSitemap(context);

    const duration = Date.now() - context.startTime;

    if (context.errors.length > 0) {
      throw new BuildError(
        `${context.errors.length} file(s) failed to process`,
        context.errors
      );
    }

    return {
      processed: context.processed,
      duration,
      errors: context.errors,
      dependencyTracker: context.dependencyTracker,
      assetTracker: context.assetTracker,
      buildCache: context.buildCache
    };
  } catch (error) {
    if (error.formatForCLI) {
      logger.error(error.formatForCLI());
    } else {
      logger.error("Build failed:", error.message);
    }
    throw error;
  }
}
```

**Benefits:**
- Each phase is testable independently
- Clear separation of concerns
- Easier to understand control flow
- Can add phases without modifying existing code
- Reduces cognitive load

**Testing:**
```bash
# Test each phase individually
bun test test/unit/build-phases/
bun test test/integration/build-workflow.test.js
```

---

### ✅ Task 1.3: Remove console.* Calls
**Priority:** HIGH
**Time:** 30 minutes
**Files:** Multiple (24 occurrences)

**Find All:**
```bash
# Find all console.* calls
grep -rn "console\." src/
```

**Replace Pattern:**
```javascript
// BEFORE
console.log(info);
console.error(`Error: ${error.message}`);
console.warn('Warning message');
console.debug('Debug info');

// AFTER
logger.info(info);
logger.error(`Error: ${error.message}`);
logger.warn('Warning message');
logger.debug('Debug info');
```

**Automated Fix:**
```bash
# Use sed to replace (backup first!)
find src -name "*.js" -exec sed -i.bak \
  -e 's/console\.log(/logger.info(/g' \
  -e 's/console\.error(/logger.error(/g' \
  -e 's/console\.warn(/logger.warn(/g' \
  -e 's/console\.debug(/logger.debug(/g' \
  {} +

# Verify changes
git diff src/
```

**Testing:**
```bash
# Ensure tests don't rely on console output
bun test 2>&1 | grep -i "console"
```

---

### ✅ Task 1.4: Fix Unhandled Promise
**Priority:** MEDIUM
**Time:** 30 minutes
**File:** `src/core/file-watcher.js:148`

**Current Code:**
```javascript
setTimeout(() => {
  if (this.isWatching) {
    logger.info('Attempting to restart file watcher...');
    this.setupWatcher(config);  // ❌ Unhandled promise
  }
}, 1000);
```

**Fixed Code:**
```javascript
setTimeout(async () => {
  if (this.isWatching) {
    logger.info('Attempting to restart file watcher...');
    try {
      await this.setupWatcher(config);
      logger.success('File watcher restarted successfully');
    } catch (err) {
      logger.error('Failed to restart file watcher:', err.message);
      // Could add exponential backoff retry here
    }
  }
}, 1000);
```

**Better Approach with Exponential Backoff:**
```javascript
async restartWatcherWithBackoff(config, attempt = 0) {
  const maxAttempts = 3;
  const delay = Math.min(1000 * Math.pow(2, attempt), 10000);

  if (attempt >= maxAttempts) {
    logger.error('Max restart attempts reached, giving up');
    return;
  }

  setTimeout(async () => {
    if (!this.isWatching) return;

    try {
      logger.info(`Attempting to restart file watcher (attempt ${attempt + 1}/${maxAttempts})...`);
      await this.setupWatcher(config);
      logger.success('File watcher restarted successfully');
    } catch (err) {
      logger.error(`Restart attempt ${attempt + 1} failed:`, err.message);
      await this.restartWatcherWithBackoff(config, attempt + 1);
    }
  }, delay);
}
```

---

### ✅ Task 1.5: Fix Weak Client ID Generation
**Priority:** MEDIUM
**Time:** 15 minutes
**File:** `src/server/dev-server.js:292`

**Current Code:**
```javascript
const client = {
  id: Math.random().toString(36).substr(2, 9),  // ❌ Weak
  controller,
  connected: Date.now(),
  active: true
};
```

**Fixed Code:**
```javascript
import crypto from 'crypto';

const client = {
  id: crypto.randomUUID(),  // ✅ Cryptographically secure
  controller,
  connected: Date.now(),
  active: true
};
```

**Alternative (if UUID seems overkill):**
```javascript
import crypto from 'crypto';

function generateClientId() {
  return crypto.randomBytes(16).toString('hex');
}

const client = {
  id: generateClientId(),
  controller,
  connected: Date.now(),
  active: true
};
```

---

## Phase 2: High Priority Improvements

### ✅ Task 2.1: Eliminate Duplicate HTML Processing
**Priority:** HIGH
**Time:** 2-3 hours
**File:** `src/core/file-processor.js`

**Strategy:**
Create a unified HTML processing function:

```javascript
/**
 * Unified HTML processing function
 */
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

  try {
    // Common processing logic
    const processed = await processIncludes(
      content,
      filePath,
      sourceRoot,
      dependencyTracker
    );

    const withLayout = await applyLayout(
      processed,
      filePath,
      sourceRoot,
      layoutDiscovery,
      config
    );

    const withLinks = transformLinks(withLayout, config);

    return {
      content: withLinks,
      dependencies: dependencyTracker.getFileDependencies(filePath),
      error: null
    };
  } catch (error) {
    if (errorMode === 'throw') {
      throw error;
    }
    return {
      content: null,
      dependencies: [],
      error
    };
  }
}

// Usage in different contexts
async function processPageFile(file, config, context) {
  return await processHtmlContent({
    content: await fs.readFile(file, 'utf-8'),
    filePath: file,
    sourceRoot: context.sourceRoot,
    config,
    dependencyTracker: context.dependencyTracker,
    layoutDiscovery: context.layoutDiscovery,
    errorMode: 'throw'
  });
}

async function processIncludeFile(file, config, context) {
  return await processHtmlContent({
    content: await fs.readFile(file, 'utf-8'),
    filePath: file,
    sourceRoot: context.sourceRoot,
    config,
    dependencyTracker: context.dependencyTracker,
    layoutDiscovery: context.layoutDiscovery,
    errorMode: 'collect'
  });
}
```

---

### ✅ Task 2.2: Remove globalThis Usage
**Priority:** HIGH
**Time:** 3-4 hours
**File:** `src/core/file-processor.js`

**Current Pattern:**
```javascript
// Set global
globalThis.UNIFY_BUILD_CONFIG = config;

// Access global
if (globalThis.UNIFY_BUILD_CONFIG?.prettyUrls) {
  // ...
}
```

**Solution 1: Pass config explicitly**
```javascript
// Modify function signatures to accept config
export async function processFile(file, config, context) {
  // No global access needed
  if (config.prettyUrls) {
    // ...
  }
}

// Update all call sites
await processFile(file, context.config, context);
```

**Solution 2: Use context object**
```javascript
// Create a BuildContext class
export class BuildContext {
  constructor(config) {
    this.config = config;
    this.dependencyTracker = new DependencyTracker();
    this.assetTracker = new AssetTracker();
    this.buildCache = null;
  }

  async initialize() {
    if (this.config.cache !== false) {
      this.buildCache = createBuildCache(this.config.cacheDir);
      await this.buildCache.initialize();
    }
  }
}

// Usage
const context = new BuildContext(config);
await context.initialize();
await processFile(file, context);
```

---

### ✅ Task 2.3: Extract Magic Numbers to Constants
**Priority:** MEDIUM
**Time:** 1-2 hours

**Create constants file:**
```javascript
// src/utils/build-constants.js

/**
 * Build and processing constants for Unify
 */

export const BUILD_CONSTANTS = {
  // Include processing
  MAX_INCLUDE_DEPTH: 10,
  INCLUDE_TIMEOUT_MS: 5000,

  // Server configuration
  DEFAULT_PORT: 3000,
  DEFAULT_HOSTNAME: '127.0.0.1',
  SSE_IDLE_TIMEOUT_SECONDS: 255, // Maximum allowed by Bun.serve
  SSE_KEEPALIVE_INTERVAL_MS: 30000,

  // File watching
  WATCHER_DEBOUNCE_MS: 100,
  WATCHER_REBUILD_TIMEOUT_MS: 5000,
  WATCHER_MAX_RESTART_ATTEMPTS: 3,
  WATCHER_RESTART_DELAY_MS: 1000,

  // Build caching
  CACHE_DIR_DEFAULT: '.unify-cache',
  HASH_ALGORITHM: 'sha256',

  // File processing
  MAX_FILE_SIZE_MB: 100,
  CHUNK_SIZE_BYTES: 64 * 1024, // 64KB chunks

  // Asset handling
  ASSET_COPY_CONCURRENCY: 5,

  // Error handling
  MAX_ERROR_STACK_TRACE_LINES: 10
};

export const FILE_PATTERNS = {
  HTML: /\.html?$/i,
  MARKDOWN: /\.md$/i,
  CSS: /\.css$/i,
  JS: /\.js$/i,
  IMAGE: /\.(png|jpe?g|gif|svg|webp)$/i,
  FONT: /\.(woff2?|ttf|eot|otf)$/i
};

export const DIRECTORY_CONVENTIONS = {
  PARTIALS: ['_includes', '_layouts', '_components', 'includes', 'layouts', 'components'],
  ASSETS: ['assets', 'static', 'public'],
  IGNORE: ['node_modules', '.git', 'dist', 'build']
};
```

**Usage:**
```javascript
// Before
if (depth > 10) {
  throw new MaxDepthExceededError(filePath, depth, 10);
}

// After
import { BUILD_CONSTANTS } from '../utils/build-constants.js';

if (depth > BUILD_CONSTANTS.MAX_INCLUDE_DEPTH) {
  throw new MaxDepthExceededError(
    filePath,
    depth,
    BUILD_CONSTANTS.MAX_INCLUDE_DEPTH
  );
}
```

---

### ✅ Task 2.4: Add build-cache.js Tests
**Priority:** MEDIUM
**Time:** 2-3 hours

**Create test file:**
```javascript
// test/unit/build-cache.test.js

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { BuildCache } from '../../src/core/build-cache.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('BuildCache', () => {
  let testCacheDir;
  let buildCache;

  beforeEach(async () => {
    // Create temporary cache directory
    testCacheDir = path.join(os.tmpdir(), `unify-test-cache-${Date.now()}`);
    buildCache = new BuildCache(testCacheDir);
    await buildCache.initialize();
  });

  afterEach(async () => {
    // Cleanup
    await fs.rm(testCacheDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('should create cache directory', async () => {
      const exists = await fs.access(testCacheDir)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it('should only initialize once', async () => {
      const result1 = await buildCache.initialize();
      const result2 = await buildCache.initialize();
      expect(buildCache.isInitialized).toBe(true);
    });
  });

  describe('file hashing', () => {
    it('should generate consistent hash for same content', async () => {
      const testFile = path.join(testCacheDir, 'test.txt');
      await fs.writeFile(testFile, 'test content');

      const hash1 = await buildCache.hashFile(testFile);
      const hash2 = await buildCache.hashFile(testFile);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    });

    it('should generate different hash for different content', async () => {
      const file1 = path.join(testCacheDir, 'test1.txt');
      const file2 = path.join(testCacheDir, 'test2.txt');

      await fs.writeFile(file1, 'content 1');
      await fs.writeFile(file2, 'content 2');

      const hash1 = await buildCache.hashFile(file1);
      const hash2 = await buildCache.hashFile(file2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('change detection', () => {
    it('should detect when file has changed', async () => {
      const testFile = path.join(testCacheDir, 'test.txt');
      await fs.writeFile(testFile, 'original content');

      // First check - file is new
      const changed1 = await buildCache.hasFileChanged(testFile);
      expect(changed1).toBe(true);

      // Update cache
      await buildCache.updateFileHash(testFile);

      // Second check - file hasn't changed
      const changed2 = await buildCache.hasFileChanged(testFile);
      expect(changed2).toBe(false);

      // Modify file
      await fs.writeFile(testFile, 'modified content');

      // Third check - file has changed
      const changed3 = await buildCache.hasFileChanged(testFile);
      expect(changed3).toBe(true);
    });
  });

  describe('cache persistence', () => {
    it('should save and load cache', async () => {
      const testFile = path.join(testCacheDir, 'test.txt');
      await fs.writeFile(testFile, 'test content');

      await buildCache.updateFileHash(testFile);
      await buildCache.saveCache();

      // Create new cache instance
      const newCache = new BuildCache(testCacheDir);
      await newCache.initialize();

      // Should load existing cache
      const changed = await newCache.hasFileChanged(testFile);
      expect(changed).toBe(false);
    });
  });
});
```

---

### ✅ Task 2.5: Implement Symlink Validation
**Priority:** MEDIUM
**Time:** 2-3 hours

**Add to path-resolver.js:**
```javascript
/**
 * Check if a path is a symbolic link
 */
export async function isSymlink(filePath) {
  try {
    const stats = await fs.lstat(filePath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Resolve symlink and validate it stays within source
 */
export async function resolveAndValidateSymlink(filePath, sourceRoot) {
  if (!await isSymlink(filePath)) {
    return filePath;
  }

  try {
    const realPath = await fs.realpath(filePath);

    // Validate resolved path is within source
    if (!isPathWithinDirectory(realPath, sourceRoot)) {
      throw new PathTraversalError(
        `Symlink ${filePath} points outside source directory: ${realPath}`,
        sourceRoot
      );
    }

    logger.debug(`Resolved symlink: ${filePath} -> ${realPath}`);
    return realPath;
  } catch (error) {
    if (error instanceof PathTraversalError) {
      throw error;
    }
    throw new FileSystemError('symlink resolution', filePath, error);
  }
}

/**
 * Detect circular symlinks
 */
export async function detectCircularSymlinks(filePath, visited = new Set()) {
  if (visited.has(filePath)) {
    throw new CircularDependencyError(
      filePath,
      Array.from(visited)
    );
  }

  if (!await isSymlink(filePath)) {
    return;
  }

  visited.add(filePath);
  const realPath = await fs.realpath(filePath);
  await detectCircularSymlinks(realPath, visited);
}
```

**Add tests:**
```javascript
// test/unit/symlink-security.test.js

describe('symlink security', () => {
  it('should detect symlinks pointing outside source', async () => {
    // Create test structure with symlink
    const testDir = await createTestDir();
    const outsideFile = '/tmp/outside.txt';
    const symlinkPath = path.join(testDir, 'badlink');

    await fs.writeFile(outsideFile, 'outside');
    await fs.symlink(outsideFile, symlinkPath);

    await expect(
      resolveAndValidateSymlink(symlinkPath, testDir)
    ).rejects.toThrow(PathTraversalError);
  });

  it('should allow symlinks within source', async () => {
    const testDir = await createTestDir();
    const targetFile = path.join(testDir, 'target.txt');
    const symlinkPath = path.join(testDir, 'link');

    await fs.writeFile(targetFile, 'content');
    await fs.symlink(targetFile, symlinkPath);

    const resolved = await resolveAndValidateSymlink(symlinkPath, testDir);
    expect(resolved).toBe(targetFile);
  });

  it('should detect circular symlinks', async () => {
    const testDir = await createTestDir();
    const link1 = path.join(testDir, 'link1');
    const link2 = path.join(testDir, 'link2');

    await fs.symlink(link2, link1);
    await fs.symlink(link1, link2);

    await expect(
      detectCircularSymlinks(link1)
    ).rejects.toThrow(CircularDependencyError);
  });
});
```

---

## Phase 3: Medium Priority Tasks

### Checklist

- [ ] Add security tests for edge cases
- [ ] Improve test coverage for error handling paths
- [ ] Add performance benchmarks
- [ ] Document layout discovery algorithm
- [ ] Document dependency tracking strategy
- [ ] Create ADR directory with initial decisions
- [ ] Add TypeScript definition files
- [ ] Implement rate limiting for dev server
- [ ] Add SECURITY.md file
- [ ] Set up code coverage reporting

---

## Phase 4: Long-term Improvements

### Plugin System Design

```javascript
// src/core/plugin-manager.js

export class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.hooks = new Map();
  }

  /**
   * Register a plugin
   */
  register(name, plugin) {
    if (this.plugins.has(name)) {
      throw new Error(`Plugin ${name} already registered`);
    }

    this.plugins.set(name, plugin);

    // Initialize plugin
    if (plugin.initialize) {
      plugin.initialize({
        registerHook: this.registerHook.bind(this),
        logger
      });
    }
  }

  /**
   * Register a hook handler
   */
  registerHook(hookName, handler) {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }
    this.hooks.get(hookName).push(handler);
  }

  /**
   * Run a hook
   */
  async runHook(hookName, context) {
    const handlers = this.hooks.get(hookName) || [];

    let result = context;
    for (const handler of handlers) {
      result = await handler(result);
    }

    return result;
  }
}

// Example plugin
export const customProcessorPlugin = {
  name: 'custom-processor',

  initialize({ registerHook, logger }) {
    registerHook('before:process:file', async (context) => {
      logger.info('Custom processing:', context.file);
      return context;
    });

    registerHook('after:process:file', async (context) => {
      // Custom post-processing
      return context;
    });
  }
};

// Usage
const pluginManager = new PluginManager();
pluginManager.register('custom-processor', customProcessorPlugin);

// In build process
await pluginManager.runHook('before:process:file', { file, content });
```

---

## Testing Strategy

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test test/unit/build-cache.test.js

# Run with coverage
bun test --coverage

# Run in watch mode
bun test --watch
```

### Before Committing

```bash
# 1. Run all tests
bun test

# 2. Check for console.* calls
grep -r "console\." src/ && echo "❌ Found console calls" || echo "✅ No console calls"

# 3. Run example build
bun run build

# 4. Check for large functions
find src -name "*.js" -exec wc -l {} \; | awk '{if($1>200) print $2, $1}'
```

---

## Deployment Checklist

Before deploying fixes to production:

- [ ] All tests pass
- [ ] No console.* calls in src/
- [ ] No TODO/FIXME comments
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version bumped appropriately
- [ ] GitHub release created
- [ ] NPM package published
- [ ] Docker image published

---

## Getting Help

If you encounter issues while implementing these fixes:

1. **Check existing tests** - They often show correct usage patterns
2. **Review documentation** - docs/ directory has detailed guides
3. **Check git history** - `git blame` and `git log` show context
4. **Create an issue** - fwdslsh/unify issues for questions
5. **Refer to code review** - CODE_REVIEW_REPORT.md has detailed analysis

---

**Last Updated:** November 18, 2025
**Maintained By:** Unify Development Team
