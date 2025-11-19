#!/bin/bash

# Script to create GitHub issues from code review findings
# Usage: ./create-issues.sh
# Requires: GitHub CLI (gh) to be installed and authenticated

set -e

REPO="fwdslsh/unify"

echo "Creating GitHub issues for Unify code review findings..."
echo "Repository: $REPO"
echo ""

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) is not installed."
    echo "Install from: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "Error: Not authenticated with GitHub CLI."
    echo "Run: gh auth login"
    exit 1
fi

echo "Creating issues..."
echo ""

# Critical Priority Issues

echo "[1/23] Creating: Replace synchronous file operations in async code"
gh issue create \
  --repo "$REPO" \
  --title "Replace synchronous file operations in async code" \
  --label "bug,performance,critical" \
  --body "**Priority:** Critical
**Estimated Effort:** 1-2 hours

Multiple locations in the codebase use synchronous file operations (\`fs.readFileSync()\`, \`require('fs').existsSync()\`) within async functions, which blocks the event loop and degrades performance.

**Affected Files:**
- \`src/core/unified-html-processor.js:58\` - \`fsSync.existsSync()\`
- \`src/core/file-processor.js:1727\` - \`fs.readFileSync()\`
- \`src/core/file-processor.js:1757\` - \`fs.readFileSync()\`

**Current Code Example:**
\`\`\`javascript
// unified-html-processor.js:58
const fsSync = require('fs');  // ❌ CommonJS require in ES module
const exists = fsSync.existsSync(c);  // ❌ Blocking sync operation
\`\`\`

**Impact:**
- Blocks the event loop during file I/O operations
- Degrades performance, especially with large builds
- Defeats the purpose of using async functions
- Can cause freezing in watch mode

**Solution:**
Replace with async equivalents:
\`\`\`javascript
import fs from 'fs/promises';
const exists = await fs.access(c).then(() => true).catch(() => false);
\`\`\`

**Testing:**
\`\`\`bash
bun test test/unit/include-processor.test.js
bun test test/unit/layout-discovery.test.js
\`\`\`

**References:**
- [CODE_REVIEW_REPORT.md - Section 2.1, Issue #1](CODE_REVIEW_REPORT.md)
- [ACTION_ITEMS.md - Task 1.1](ACTION_ITEMS.md)"

echo "[2/23] Creating: Refactor massive 462-line build() function"
gh issue create \
  --repo "$REPO" \
  --title "Refactor massive 462-line build() function" \
  --label "refactor,maintainability,critical,technical-debt" \
  --body "**Priority:** Critical
**Estimated Effort:** 4-6 hours

The \`build()\` function in \`src/core/file-processor.js\` is 462 lines long (lines 169-631) and handles 10 different responsibilities, violating the Single Responsibility Principle.

**Location:** \`src/core/file-processor.js:169-631\`

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
- High cognitive load for developers

**Solution:**
Extract into focused, testable phases. See [ACTION_ITEMS.md - Task 1.2](ACTION_ITEMS.md) for detailed implementation.

**References:**
- [CODE_REVIEW_REPORT.md - Section 2.1, Issue #2](CODE_REVIEW_REPORT.md)
- [ACTION_ITEMS.md - Task 1.2](ACTION_ITEMS.md)"

# High Priority Issues

echo "[3/23] Creating: Eliminate 95% duplicate HTML processing functions"
gh issue create \
  --repo "$REPO" \
  --title "Eliminate 95% duplicate HTML processing functions" \
  --label "refactor,code-quality,DRY" \
  --body "**Priority:** High
**Estimated Effort:** 2-3 hours

Two nearly identical functions exist for processing HTML content:
- \`src/core/file-processor.js:1211-1305\`
- \`src/core/file-processor.js:1436-1535\`

The functions differ only in minor parameters and error handling, resulting in ~95% code duplication.

**Impact:**
- Code duplication violates DRY principle
- Maintenance burden (bugs must be fixed in two places)
- Increases test surface area unnecessarily

**Solution:**
Create a unified \`processHtmlContent(options)\` function. See [ACTION_ITEMS.md - Task 2.1](ACTION_ITEMS.md) for implementation.

**References:**
- [CODE_REVIEW_REPORT.md - Section 2.2, Issue #3](CODE_REVIEW_REPORT.md)
- [ACTION_ITEMS.md - Task 2.1](ACTION_ITEMS.md)"

echo "[4/23] Creating: Replace all console.* calls with logger"
gh issue create \
  --repo "$REPO" \
  --title "Replace all console.* calls with logger" \
  --label "code-quality,logging,good-first-issue" \
  --body "**Priority:** High
**Estimated Effort:** 30 minutes

24 instances of direct \`console.log()\`, \`console.error()\`, and \`console.warn()\` calls exist throughout the codebase instead of using the centralized logger.

**Impact:**
- Inconsistent log formatting
- Can't control log levels in production
- Pollutes test output

**Find All:**
\`\`\`bash
grep -rn \"console\.\" src/
\`\`\`

**Solution:**
Replace all \`console.*\` with \`logger.*\`:
\`\`\`bash
find src -name \"*.js\" -exec sed -i.bak \\
  -e 's/console\.log(/logger.info(/g' \\
  -e 's/console\.error(/logger.error(/g' \\
  -e 's/console\.warn(/logger.warn(/g' \\
  {} +
\`\`\`

**References:**
- [CODE_REVIEW_REPORT.md - Section 2.2, Issue #4](CODE_REVIEW_REPORT.md)
- [ACTION_ITEMS.md - Task 1.3](ACTION_ITEMS.md)"

echo "[5/23] Creating: Remove global state via globalThis"
gh issue create \
  --repo "$REPO" \
  --title "Remove global state via globalThis" \
  --label "refactor,architecture,testability" \
  --body "**Priority:** High
**Estimated Effort:** 3-4 hours

Build configuration is stored in \`globalThis.UNIFY_BUILD_CONFIG\` and accessed from unrelated functions, creating hidden dependencies.

**Locations:**
- \`src/core/file-processor.js:172\` - Sets global state
- \`src/core/file-processor.js:1318-1319\` - Accesses global state

**Impact:**
- Breaks encapsulation
- Makes testing difficult (shared state between tests)
- Prevents concurrent builds
- Hidden dependencies

**Solution:**
Use dependency injection or create a BuildContext class. See [ACTION_ITEMS.md - Task 2.2](ACTION_ITEMS.md).

**References:**
- [CODE_REVIEW_REPORT.md - Section 2.2, Issue #5](CODE_REVIEW_REPORT.md)
- [ACTION_ITEMS.md - Task 2.2](ACTION_ITEMS.md)"

echo "[6/23] Creating: Fix unhandled promise in file watcher"
gh issue create \
  --repo "$REPO" \
  --title "Fix unhandled promise in file watcher" \
  --label "bug,async,error-handling" \
  --body "**Priority:** High
**Estimated Effort:** 30 minutes

The file watcher's restart logic doesn't await the async \`setupWatcher()\` call.

**Location:** \`src/core/file-watcher.js:148\`

**Impact:**
- Unhandled promise rejection if setupWatcher fails
- Silent failures in production

**Solution:**
Add try-catch and await the async call. Consider implementing exponential backoff retry logic.

**References:**
- [CODE_REVIEW_REPORT.md - Section 2.2, Issue #6](CODE_REVIEW_REPORT.md)
- [ACTION_ITEMS.md - Task 1.4](ACTION_ITEMS.md)"

echo "[7/23] Creating: Use crypto.randomUUID() for SSE client IDs"
gh issue create \
  --repo "$REPO" \
  --title "Use crypto.randomUUID() for SSE client IDs" \
  --label "security,enhancement" \
  --body "**Priority:** High
**Estimated Effort:** 15 minutes

SSE client IDs are generated using \`Math.random()\` which is not cryptographically secure.

**Location:** \`src/server/dev-server.js:292\`

**Current Code:**
\`\`\`javascript
id: Math.random().toString(36).substr(2, 9),  // ❌ Weak
\`\`\`

**Solution:**
\`\`\`javascript
import crypto from 'crypto';
id: crypto.randomUUID(),  // ✅ Cryptographically secure
\`\`\`

**References:**
- [CODE_REVIEW_REPORT.md - Section 2.2, Issue #7](CODE_REVIEW_REPORT.md)
- [ACTION_ITEMS.md - Task 1.5](ACTION_ITEMS.md)"

echo "[8/23] Creating: Extract magic numbers to constants file"
gh issue create \
  --repo "$REPO" \
  --title "Extract magic numbers to constants file" \
  --label "refactor,maintainability,good-first-issue" \
  --body "**Priority:** High
**Estimated Effort:** 1-2 hours

Magic numbers are scattered throughout the codebase without explanation.

**Examples:**
- \`src/server/dev-server.js:71\` - \`idleTimeout: 255\`
- \`src/core/include-processor.js\` - \`10\` level depth limit
- Various timeout values

**Solution:**
Create \`src/utils/build-constants.js\` with named constants. See [ACTION_ITEMS.md - Task 2.3](ACTION_ITEMS.md) for example.

**References:**
- [CODE_REVIEW_REPORT.md - Section 2.2, Issue #8](CODE_REVIEW_REPORT.md)
- [ACTION_ITEMS.md - Task 2.3](ACTION_ITEMS.md)"

# Medium Priority Issues

echo "[9/23] Creating: Add unit tests for build-cache.js"
gh issue create \
  --repo "$REPO" \
  --title "Add unit tests for build-cache.js" \
  --label "testing,enhancement" \
  --body "**Priority:** Medium
**Estimated Effort:** 2-3 hours

The \`BuildCache\` class has no dedicated unit tests despite being critical for performance.

**Missing Coverage:**
- Hash generation and comparison
- Cache initialization and loading
- Dirty file detection
- Cache invalidation

**Solution:**
Create \`test/unit/build-cache.test.js\`. See [ACTION_ITEMS.md - Task 2.4](ACTION_ITEMS.md) for template.

**References:**
- [CODE_REVIEW_REPORT.md - Section 2.3, Issue #9](CODE_REVIEW_REPORT.md)"

echo "[10/23] Creating: Implement symlink security validation"
gh issue create \
  --repo "$REPO" \
  --title "Implement symlink security validation" \
  --label "security,enhancement" \
  --body "**Priority:** Medium
**Estimated Effort:** 2-3 hours

The codebase doesn't validate or handle symbolic links.

**Security Risks:**
- Path traversal via symlinks
- Infinite loops if symlinks create cycles
- Unexpected file inclusion

**Solution:**
Add to \`src/utils/path-resolver.js\`:
- \`isSymlink()\`
- \`resolveAndValidateSymlink()\`
- \`detectCircularSymlinks()\`

**References:**
- [CODE_REVIEW_REPORT.md - Section 5.2, Security Issue #2](CODE_REVIEW_REPORT.md)
- [ACTION_ITEMS.md - Task 2.5](ACTION_ITEMS.md)"

echo "[11/23] Creating: Extract repeated error handling pattern"
gh issue create \
  --repo "$REPO" \
  --title "Extract repeated error handling pattern" \
  --label "refactor,DRY,error-handling" \
  --body "**Priority:** Medium
**Estimated Effort:** 2-3 hours

The same try-catch pattern with error formatting appears 15+ times.

**Solution:**
Create \`withErrorHandling(operation, context)\` utility function.

**References:**
- [CODE_REVIEW_REPORT.md - Section 2.3, Issue #11](CODE_REVIEW_REPORT.md)"

echo "[12/23] Creating: Add JSDoc comments to all exported functions"
gh issue create \
  --repo "$REPO" \
  --title "Add JSDoc comments to all exported functions" \
  --label "documentation,good-first-issue" \
  --body "**Priority:** Medium
**Estimated Effort:** 1-2 hours

Some utility functions are missing JSDoc comments.

**Solution:**
Add comprehensive JSDoc to all exported functions with parameter types, return types, and examples.

**References:**
- [CODE_REVIEW_REPORT.md - Section 2.4, Issue #12](CODE_REVIEW_REPORT.md)"

echo "[13/23] Creating: Add TypeScript definition files"
gh issue create \
  --repo "$REPO" \
  --title "Add TypeScript definition files" \
  --label "enhancement,typescript,developer-experience" \
  --body "**Priority:** Medium
**Estimated Effort:** 3-4 hours

The project lacks TypeScript definition files.

**Benefits:**
- Better IDE autocomplete
- Type checking for users
- Improved developer experience

**Solution:**
Create \`.d.ts\` files for all public APIs.

**References:**
- [CODE_REVIEW_REPORT.md - Section 2.4, Issue #13](CODE_REVIEW_REPORT.md)"

echo "[14/23] Creating: Add Content Security Policy headers to dev server"
gh issue create \
  --repo "$REPO" \
  --title "Add Content Security Policy headers to dev server" \
  --label "security,enhancement,dev-server" \
  --body "**Priority:** Medium
**Estimated Effort:** 30 minutes

The development server doesn't set security headers.

**Location:** \`src/server/dev-server.js\`

**Solution:**
Add CSP, X-Content-Type-Options, and X-Frame-Options headers.

**References:**
- [CODE_REVIEW_REPORT.md - Section 5.2, Security Issue #3](CODE_REVIEW_REPORT.md)"

echo "[15/23] Creating: Review RegEx patterns for potential ReDoS"
gh issue create \
  --repo "$REPO" \
  --title "Review RegEx patterns for potential ReDoS" \
  --label "security,performance" \
  --body "**Priority:** Medium
**Estimated Effort:** 2-3 hours

Complex regex patterns could be exploited with crafted input.

**Solution:**
- Review all regex for catastrophic backtracking
- Add input length limits
- Add timeout protection

**References:**
- [CODE_REVIEW_REPORT.md - Section 5.2, Security Issue #4](CODE_REVIEW_REPORT.md)"

echo "[16/23] Creating: Add rate limiting to development server"
gh issue create \
  --repo "$REPO" \
  --title "Add rate limiting to development server" \
  --label "security,enhancement,dev-server" \
  --body "**Priority:** Medium
**Estimated Effort:** 1-2 hours

The development server has no rate limiting.

**Solution:**
Implement simple rate limiting for SSE connections and file requests.

**References:**
- [CODE_REVIEW_REPORT.md - Section 5.4](CODE_REVIEW_REPORT.md)"

echo "[17/23] Creating: Create SECURITY.md with vulnerability reporting process"
gh issue create \
  --repo "$REPO" \
  --title "Create SECURITY.md with vulnerability reporting process" \
  --label "documentation,security,good-first-issue" \
  --body "**Priority:** Medium
**Estimated Effort:** 30 minutes

The repository lacks a SECURITY.md file.

**Solution:**
Create \`.github/SECURITY.md\` with:
- Supported versions
- How to report vulnerabilities
- Security update policy

**References:**
- [CODE_REVIEW_REPORT.md - Section 5.4](CODE_REVIEW_REPORT.md)"

echo "[18/23] Creating: Create ADR (Architecture Decision Records) directory"
gh issue create \
  --repo "$REPO" \
  --title "Create ADR (Architecture Decision Records) directory" \
  --label "documentation,architecture" \
  --body "**Priority:** Medium
**Estimated Effort:** 2-3 hours

The project lacks Architecture Decision Records.

**Missing ADRs:**
- Why Bun-only vs Node.js compatibility?
- Why Apache SSI syntax?
- Why RegEx-based parsing vs AST?

**Solution:**
Create \`docs/adr/\` with ADR files for major decisions.

**References:**
- [CODE_REVIEW_REPORT.md - Section 4.2](CODE_REVIEW_REPORT.md)"

# Low Priority Issues

echo "[19/23] Creating: Set up code coverage reporting"
gh issue create \
  --repo "$REPO" \
  --title "Set up code coverage reporting" \
  --label "ci-cd,testing,enhancement" \
  --body "**Priority:** Low
**Estimated Effort:** 1 hour

The project lacks automated code coverage reporting.

**Solution:**
- Add coverage reporting to CI
- Add coverage badge to README
- Set minimum coverage threshold

**References:**
- [CODE_REVIEW_REPORT.md - Section 7.1](CODE_REVIEW_REPORT.md)"

echo "[20/23] Creating: Add linting and formatting checks to CI"
gh issue create \
  --repo "$REPO" \
  --title "Add linting and formatting checks to CI" \
  --label "ci-cd,code-quality,enhancement" \
  --body "**Priority:** Low
**Estimated Effort:** 1-2 hours

The CI pipeline doesn't run linting or formatting checks.

**Solution:**
Add ESLint, Prettier, and pre-commit hooks.

**References:**
- [CODE_REVIEW_REPORT.md - Section 10](CODE_REVIEW_REPORT.md)"

echo "[21/23] Creating: Add dependency vulnerability scanning"
gh issue create \
  --repo "$REPO" \
  --title "Add dependency vulnerability scanning" \
  --label "security,ci-cd,enhancement" \
  --body "**Priority:** Low
**Estimated Effort:** 30 minutes

The project lacks automated dependency vulnerability scanning.

**Solution:**
- Enable Dependabot
- Add npm audit to CI

**References:**
- [CODE_REVIEW_REPORT.md - Section 10](CODE_REVIEW_REPORT.md)"

echo "[22/23] Creating: Add tests for large file handling"
gh issue create \
  --repo "$REPO" \
  --title "Add tests for large file handling" \
  --label "testing,performance" \
  --body "**Priority:** Low
**Estimated Effort:** 2-3 hours

No tests exist for handling large files.

**Solution:**
Add tests for:
- Large HTML files (10MB+)
- Large markdown files
- Memory usage
- Performance degradation

**References:**
- [CODE_REVIEW_REPORT.md - Section 3.3](CODE_REVIEW_REPORT.md)"

echo "[23/23] Creating: Add performance benchmarks"
gh issue create \
  --repo "$REPO" \
  --title "Add performance benchmarks" \
  --label "performance,testing,enhancement" \
  --body "**Priority:** Low
**Estimated Effort:** 3-4 hours

The project lacks performance benchmarks.

**Solution:**
Create \`test/performance/benchmarks.test.js\` with:
- Build time benchmarks
- Include processing performance
- Memory usage tracking

**References:**
- [CODE_REVIEW_REPORT.md - Section 3.3](CODE_REVIEW_REPORT.md)"

echo ""
echo "✅ Successfully created 23 issues!"
echo ""
echo "View issues at: https://github.com/$REPO/issues"
