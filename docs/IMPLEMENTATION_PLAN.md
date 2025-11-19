# Unify v2.0 Implementation Plan - Direct Migration

**Status**: No users, no backward compatibility required
**Approach**: Clean break - implement simplified spec directly
**Timeline**: 2-3 weeks of focused development

---

## Implementation Checklist

### Week 1: Core Feature Removal & Simplification

#### Day 1-2: Remove SSI Include System

**Delete files/functions**:
```bash
# Remove SSI-specific processing (if separate)
# Check src/core/include-processor.js for SSI functions
```

**File**: `src/core/include-processor.js`

```javascript
// DELETE these functions:
- processSSIIncludes()
- processVirtualInclude()
- processFileInclude()
- parseSSIComment()

// KEEP these functions:
- processIncludeElements()
- processSlotInjection()
- resolveIncludePath()
```

**File**: `src/core/file-processor.js`

```javascript
// REMOVE SSI processing call
export async function processFile(filePath, options) {
  let html = await Bun.file(filePath).text();

  // DELETE:
  // html = await processSSIIncludes(html, context);

  // KEEP:
  html = await processIncludeElements(html, context);
  html = await processSlotInjection(html, context);

  return html;
}
```

**Tests to delete**:
```bash
rm test/unit/ssi-includes.test.js  # If exists
# Remove SSI tests from test/unit/include-processor.test.js
```

✅ **Validation**: Build examples with only `<include>` syntax

---

#### Day 3-4: Simplify Layout Discovery

**File**: `src/core/layout-discovery.js` - Complete rewrite

**DELETE entirely**:
```javascript
// All of these:
- resolveShortLayoutName()
- searchLayoutHierarchy()
- extractLinkLayoutElement()
- discoverNamedLayout()
- resolveLayoutShortName()
- searchIncludesDirectory()
```

**REPLACE with**:

```javascript
import { resolve, dirname, join } from 'node:path';
import { exists } from 'node:fs/promises';

/**
 * Simplified layout discovery - only 2 methods:
 * 1. Explicit data-layout attribute
 * 2. Auto-discovery of _layout.html
 */
export async function discoverLayout(filePath, html, options) {
  // Method 1: Check for explicit data-layout attribute
  const explicitLayout = extractDataLayoutAttribute(html);
  if (explicitLayout) {
    return resolveLayoutPath(explicitLayout, filePath, options);
  }

  // Method 2: Auto-discover _layout.html
  return autoDiscoverLayout(filePath, options);
}

/**
 * Extract data-layout attribute from HTML
 * Matches: <html data-layout="..."> or <div data-layout="...">
 */
function extractDataLayoutAttribute(html) {
  const match = html.match(/data-layout=["']([^"']+)["']/);
  return match ? match[1] : null;
}

/**
 * Resolve layout path - unified resolution rules
 */
function resolveLayoutPath(layoutPath, currentFilePath, options) {
  // Absolute: /layouts/blog.html → src/layouts/blog.html
  if (layoutPath.startsWith('/')) {
    return join(options.source, layoutPath);
  }

  // Relative: ./custom.html → relative to current file
  const currentDir = dirname(currentFilePath);
  return resolve(currentDir, layoutPath);
}

/**
 * Auto-discover _layout.html by walking up directory tree
 */
async function autoDiscoverLayout(filePath, options) {
  let dir = dirname(filePath);
  const sourceRoot = resolve(options.source);

  while (dir.startsWith(sourceRoot)) {
    const layoutPath = join(dir, '_layout.html');

    if (await exists(layoutPath)) {
      return layoutPath;
    }

    // Move up one directory
    const parent = dirname(dir);
    if (parent === dir) break;  // Reached filesystem root
    dir = parent;
  }

  return null;  // No layout found
}
```

**Delete tests**:
```bash
rm test/unit/layout-discovery-short-names.test.js  # If exists
```

**Update tests**:
```javascript
// test/unit/layout-discovery-new-spec.test.js
// Remove tests for:
- Short name resolution
- <link rel="layout"> extraction
- _*.layout.html pattern matching
- Search hierarchy beyond simple auto-discovery

// Keep tests for:
- data-layout attribute extraction
- Absolute path resolution
- Relative path resolution
- Auto-discovery of _layout.html
```

✅ **Validation**: Layouts work with only `data-layout` or auto-discovery

---

#### Day 5: Unify Path Resolution

**Create**: `src/utils/path-resolver.js` (new file)

```javascript
import { resolve, dirname, join } from 'node:path';

/**
 * Unified path resolution for ALL contexts:
 * - Includes (<include src="...">)
 * - Layouts (data-layout="...")
 * - Assets (href="...", src="...")
 *
 * Rules:
 * 1. Absolute paths (start with /) → resolve from source root
 * 2. Relative paths → resolve from current file's directory
 */
export function resolvePath(path, currentFilePath, options) {
  // Absolute: /components/nav.html
  if (path.startsWith('/')) {
    return join(options.source, path);
  }

  // Relative: ./sidebar.html or ../shared/footer.html
  const currentDir = dirname(currentFilePath);
  return resolve(currentDir, path);
}

/**
 * Security: Validate path is within source directory
 */
export function validatePath(resolvedPath, options) {
  const sourceRoot = resolve(options.source);
  const normalizedPath = resolve(resolvedPath);

  if (!normalizedPath.startsWith(sourceRoot)) {
    throw new Error(
      `Security: Path outside source directory\n` +
      `  Attempted: ${resolvedPath}\n` +
      `  Must be within: ${sourceRoot}`
    );
  }

  return normalizedPath;
}

/**
 * Combined resolve + validate
 */
export function resolveAndValidate(path, currentFilePath, options) {
  const resolved = resolvePath(path, currentFilePath, options);
  return validatePath(resolved, options);
}
```

**Update all modules to use unified resolution**:

```javascript
// src/core/include-processor.js
import { resolveAndValidate } from '../utils/path-resolver.js';

export async function processIncludeElements(html, context) {
  // ...
  const includePath = resolveAndValidate(
    srcAttribute,
    context.filePath,
    context.options
  );
  // ...
}

// src/core/layout-discovery.js
import { resolveAndValidate } from '../utils/path-resolver.js';

function resolveLayoutPath(layoutPath, currentFilePath, options) {
  return resolveAndValidate(layoutPath, currentFilePath, options);
}

// src/core/asset-tracker.js
import { resolveAndValidate } from '../utils/path-resolver.js';

export function resolveAssetPath(assetPath, currentFilePath, options) {
  return resolveAndValidate(assetPath, currentFilePath, options);
}
```

**Add tests**:
```javascript
// test/unit/path-resolution.test.js (new file)
import { resolvePath, validatePath } from '../../src/utils/path-resolver.js';

test('absolute paths resolve from source root', () => {
  const result = resolvePath(
    '/components/nav.html',
    '/project/src/blog/post.html',
    { source: '/project/src' }
  );
  expect(result).toBe('/project/src/components/nav.html');
});

test('relative paths resolve from current file directory', () => {
  const result = resolvePath(
    './sidebar.html',
    '/project/src/blog/post.html',
    { source: '/project/src' }
  );
  expect(result).toBe('/project/src/blog/sidebar.html');
});

test('validates paths within source directory', () => {
  expect(() => {
    validatePath(
      '/etc/passwd',
      { source: '/project/src' }
    );
  }).toThrow(/outside source directory/);
});
```

✅ **Validation**: All path resolution uses same logic

---

### Week 2: Simplify Frontmatter & Documentation

#### Day 6-7: Simplify Frontmatter Processing

**File**: `src/core/markdown-processor.js`

```javascript
// BEFORE: Complex head synthesis
export function processFrontmatter(frontmatter) {
  // Process head.meta array
  // Process head.link array
  // Process head.script with JSON-LD
  // Process head.style inline/href
  // ... lots of code ...
}

// AFTER: Simple synthesis
export function processFrontmatter(frontmatter) {
  const headElements = [];

  // Only support: title, description, layout
  if (frontmatter.title) {
    headElements.push(`<title>${escapeHtml(frontmatter.title)}</title>`);
  }

  if (frontmatter.description) {
    headElements.push(
      `<meta name="description" content="${escapeHtml(frontmatter.description)}">`
    );
  }

  return {
    headElements,
    layout: frontmatter.layout || null,
    // Content already converted by markdown-it
  };
}

// DELETE these functions entirely:
- synthesizeHeadMeta()
- synthesizeHeadLink()
- synthesizeHeadScript()
- synthesizeHeadStyle()
- processJsonLd()
- validateFrontmatterSchema()
```

**Update tests**:
```javascript
// test/unit/frontmatter-head-synthesis.test.js
// DELETE all tests for:
- head.meta array
- head.link array
- head.script array
- head.style array

// KEEP only tests for:
- title synthesis
- description synthesis
- layout key
```

✅ **Validation**: Frontmatter only processes title/description/layout

---

#### Day 8-9: Update All Documentation

**Delete files**:
```bash
# Remove old spec
rm docs/app-spec.md

# Rename new spec as canonical
mv docs/simplified-spec.md docs/app-spec.md
```

**Update files**:

```bash
# Update these to v2 syntax only:
docs/include-syntax.md      # Remove SSI section
docs/layouts-slots-templates.md  # Remove short names, link elements
docs/cli-reference.md       # Update examples
docs/getting-started.md     # Update tutorial
README.md                   # Update examples
```

**For each doc file**:

1. **Find and replace**:
   - `<!--#include` → `<include`
   - `data-layout="blog"` → `data-layout="/layouts/blog.html"`
   - `<link rel="layout"` → `data-layout attribute`

2. **Remove sections**:
   - SSI syntax explanations
   - Short layout name resolution
   - Complex frontmatter head examples

3. **Add clarity**:
   - "One way to include: `<include>`"
   - "Two layout methods: auto-discovery + explicit"
   - "Simple frontmatter: title, description, layout"

**Example update** for `docs/include-syntax.md`:

```markdown
# Include System

## Syntax

Use `<include>` elements to include other files:

```html
<include src="/components/header.html"></include>
<include src="./sidebar.html"></include>
```

## Path Resolution

- **Absolute** (`/`): From source root
  - `<include src="/components/nav.html">` → `src/components/nav.html`

- **Relative** (`.` or `..`): From current file
  - `<include src="./footer.html">` → same directory
  - `<include src="../shared/header.html">` → parent directory

## Slot Injection

[... keep existing slot documentation ...]

~~## SSI Syntax~~ *(REMOVED)*
```

✅ **Validation**: All docs reference only v2 features

---

### Week 3: Testing & Polish

#### Day 10-11: Clean Up Test Suite

**Delete test files**:
```bash
# Remove tests for deleted features
rm test/unit/ssi-includes.test.js
rm test/unit/layout-discovery-short-names.test.js

# Update these to remove complex frontmatter tests:
# test/unit/frontmatter-head-synthesis.test.js
# Keep only: title, description, layout tests
```

**Update failing tests**:

Currently failing tests from our analysis:
- 17 frontmatter head synthesis tests → Delete 11, keep 6
- Other tests should pass with simplified implementation

**Add validation tests**:

```javascript
// test/integration/v2-validation.test.js (new file)

test('should reject SSI syntax with clear error', async () => {
  const html = '<!--#include virtual="/header.html" -->';

  // Expect SSI comments to be treated as regular HTML comments
  const result = await build({ html });
  expect(result).not.toContain('header content');
  // SSI comment should remain as-is (ignored)
});

test('data-layout with short name fails gracefully', async () => {
  // Short name without path separator
  const html = '<div data-layout="blog">...</div>';

  // Should try to find file named literally "blog"
  // Will fail with "layout not found" error
  await expect(build({ html })).rejects.toThrow(/layout.*not found/i);
});

test('complex frontmatter head is ignored', async () => {
  const markdown = `---
title: "Test"
head:
  meta:
    - name: "robots"
---
Content`;

  const result = await build({ markdown });

  // Should have title
  expect(result).toContain('<title>Test</title>');

  // Should NOT have robots meta (head.meta ignored)
  expect(result).not.toContain('name="robots"');
});
```

**Run full suite**:
```bash
bun test

# Expected results:
# - Fewer total tests (~500-520 vs 561)
# - All tests pass
# - No deprecated feature tests
```

✅ **Validation**: Clean test suite, all tests pass

---

#### Day 12-13: Update Examples

**File**: `example/src/` directory

Update all example files to use v2 syntax:

```bash
# Find all SSI includes in examples
grep -r "<!--#include" example/

# Replace with <include> elements
# Manual edit required - context dependent
```

**Example updates**:

```html
<!-- example/src/index.html - BEFORE -->
<!--#include virtual="/_includes/header.html" -->
<main>...</main>
<!--#include virtual="/_includes/footer.html" -->

<!-- example/src/index.html - AFTER -->
<include src="/_includes/header.html"></include>
<main>...</main>
<include src="/_includes/footer.html"></include>
```

**Build and verify**:
```bash
bun run build
bun run serve

# Open http://localhost:3000
# Verify all pages render correctly
```

✅ **Validation**: Examples work with v2 syntax

---

#### Day 14: Final Validation & Release

**Build executables**:
```bash
bun run build:linux
bun run build:macos
bun run build:windows

# Test each binary works
./unify-linux build --source example/src --output /tmp/test-dist
```

**Documentation checklist**:
- [ ] README.md has only v2 examples
- [ ] All docs/ files reference v2 syntax
- [ ] No mentions of removed features
- [ ] Getting started tutorial works
- [ ] CLI reference is accurate

**Code checklist**:
- [ ] No SSI processing code
- [ ] No short name resolution
- [ ] No complex frontmatter head
- [ ] Unified path resolution everywhere
- [ ] All tests pass
- [ ] Examples build successfully

**Git cleanup**:
```bash
# Create v2 branch
git checkout -b v2-simplified

# Commit all changes
git add -A
git commit -m "refactor: Implement simplified v2 spec

- Remove SSI include processing
- Simplify layout discovery (2 methods only)
- Simplify frontmatter (title, description, layout)
- Unify path resolution across all contexts
- Update all documentation
- Update all examples
- Clean up test suite

Breaking changes:
- SSI includes no longer supported (use <include>)
- Short layout names no longer supported (use explicit paths)
- <link rel='layout'> no longer supported (use data-layout)
- Complex frontmatter head no longer supported (use HTML documents)

Total diff: ~2000 lines removed, cleaner architecture"

# Push
git push origin v2-simplified
```

**Release**:
```bash
# Tag as v2.0.0
git tag v2.0.0
git push origin v2.0.0

# GitHub release with:
# - Release notes from simplified-spec.md
# - Executables for Linux, macOS, Windows
# - Migration notes (though no users)
```

✅ **Done**: v2.0.0 released

---

## Quick Reference: What to Delete

### Files to Delete Entirely

```bash
# Documentation
rm docs/app-spec.md  # Old complex spec
rm docs/MIGRATION_TO_V2.md  # Not needed, no users

# Tests (if they exist as separate files)
rm test/unit/ssi-includes.test.js
rm test/unit/layout-discovery-short-names.test.js
```

### Functions to Delete

**In `src/core/include-processor.js`**:
- `processSSIIncludes()`
- `processVirtualInclude()`
- `processFileInclude()`
- `parseSSIComment()`

**In `src/core/layout-discovery.js`** (or rewrite entire file):
- `resolveShortLayoutName()`
- `searchLayoutHierarchy()`
- `extractLinkLayoutElement()`
- `discoverNamedLayout()`
- `searchIncludesDirectory()`

**In `src/core/markdown-processor.js`**:
- `synthesizeHeadMeta()`
- `synthesizeHeadLink()`
- `synthesizeHeadScript()`
- `synthesizeHeadStyle()`
- `processJsonLd()`

**In `src/core/unified-html-processor.js`**:
- Any `<link rel="layout">` processing

### Tests to Delete/Update

Delete:
- All SSI include tests
- All short layout name tests
- Complex frontmatter head tests (keep only title/description/layout)

Update:
- Remove 11/17 failing frontmatter tests
- Update layout discovery tests for simplified logic
- Update path resolution tests for unified behavior

---

## Success Criteria

✅ **All of these must be true**:

1. `bun test` - all tests pass (~500-520 tests)
2. `bun run build` - examples build without errors
3. `bun run serve` - examples serve and display correctly
4. `grep -r "SSI" src/` - no SSI processing code
5. `grep -r "shortName" src/` - no short name resolution
6. `grep -r "synthesizeHead" src/` - no complex head synthesis
7. All docs reference only v2 syntax
8. Executables build for all platforms

---

## Estimated Impact

### Code Changes
- **Lines removed**: ~2,000 (SSI, short names, complex frontmatter)
- **Lines added**: ~500 (unified path resolver, simplified logic)
- **Net reduction**: ~1,500 lines (-18%)

### Test Changes
- **Tests removed**: ~60 (deprecated features)
- **Tests updated**: ~40 (simplified assertions)
- **Tests added**: ~15 (v2 validation)
- **Net reduction**: ~45 tests (-8%)

### Documentation Changes
- **Files deleted**: 2 (old spec, migration guide)
- **Files updated**: 8 (all docs)
- **Sections removed**: ~30 (SSI, short names, complex examples)
- **Clarity improvement**: Significant (one way to do things)

---

## Timeline

| Week | Days | Focus | Deliverable |
|------|------|-------|-------------|
| 1 | 1-2 | Remove SSI | No SSI code |
| 1 | 3-4 | Simplify layouts | 2 methods only |
| 1 | 5 | Unify paths | One resolution logic |
| 2 | 6-7 | Simplify frontmatter | Title/desc/layout only |
| 2 | 8-9 | Update docs | v2 syntax everywhere |
| 3 | 10-11 | Clean tests | All tests pass |
| 3 | 12-13 | Update examples | Examples work |
| 3 | 14 | Release | v2.0.0 shipped |

**Total**: 14 working days (~3 weeks)

With focus, could compress to **1.5-2 weeks** by parallelizing doc updates and test cleanup.

---

This plan is **executable immediately** - no user migration concerns, no deprecation periods, just clean implementation of the simplified spec. 🚀
