# Migration Guide: Unify v1 → v2 (Simplified Spec)

This document outlines the migration from the current complex specification to the simplified v2 spec.

## Overview

**Goal**: Simplify Unify by removing redundant features while maintaining core functionality and improving usability.

**Impact**: Breaking changes for some users, but clearer mental model and better maintainability.

**Timeline**: Recommend phased migration over 2-3 releases with deprecation warnings.

---

## Breaking Changes Summary

| Feature | v1 Status | v2 Status | Migration Path |
|---------|-----------|-----------|----------------|
| SSI includes (`<!--#include-->`) | Supported | **REMOVED** | Use `<include>` elements |
| Short layout names (`data-layout="blog"`) | Supported | **REMOVED** | Use explicit paths |
| `<link rel="layout">` | Supported | **REMOVED** | Use `data-layout` attribute |
| Frontmatter head synthesis | Documented | **REMOVED** | Use full HTML documents |
| `_*.layout.html` naming | Supported | **REMOVED** | Use `_layout.html` only |
| Complex path resolution | Multiple rules | **UNIFIED** | All paths use same rules |

---

## Phase 1: Deprecation Warnings (v1.9)

**Goal**: Warn users about upcoming changes without breaking existing sites.

### 1.1 Add Deprecation Warnings

**File**: `src/core/include-processor.js`

```javascript
// Add warnings for SSI includes
export function processSSIInclude(html, context) {
  // After detecting SSI include
  console.warn(
    `⚠️  DEPRECATION: SSI includes (<!--#include-->) will be removed in v2.0.\n` +
    `   Use <include> elements instead.\n` +
    `   File: ${context.filePath}\n` +
    `   Migration: https://unify.github.io/migration`
  );

  // Continue processing normally
  return processInclude(html, context);
}
```

**File**: `src/core/layout-discovery.js`

```javascript
// Warn about short names
export function resolveLayoutPath(layoutRef, context) {
  if (!layoutRef.includes('/') && !layoutRef.includes('.')) {
    // This is a short name like "blog"
    console.warn(
      `⚠️  DEPRECATION: Short layout names will be removed in v2.0.\n` +
      `   Found: "${layoutRef}"\n` +
      `   Use explicit path instead: "/layouts/${layoutRef}.html"\n` +
      `   File: ${context.filePath}`
    );
  }

  // Continue with existing resolution
  return resolveShortName(layoutRef, context);
}

// Warn about <link rel="layout">
export function extractLayoutFromLinkElement(html, context) {
  console.warn(
    `⚠️  DEPRECATION: <link rel="layout"> will be removed in v2.0.\n` +
    `   Use data-layout attribute instead.\n` +
    `   File: ${context.filePath}\n` +
    `   Replace: <html data-layout="${layoutPath}">`
  );

  return extractLayoutLink(html, context);
}
```

**File**: `src/core/markdown-processor.js`

```javascript
// Warn about complex frontmatter head
export function processFrontmatter(frontmatter, context) {
  if (frontmatter.head) {
    console.warn(
      `⚠️  DEPRECATION: Frontmatter head synthesis (head.meta, head.script, etc.) will be removed in v2.0.\n` +
      `   Only title, description, and layout will be supported.\n` +
      `   For custom head elements, use a full HTML document instead.\n` +
      `   File: ${context.filePath}`
    );
  }

  // Continue processing
  return processFrontmatterHead(frontmatter, context);
}
```

### 1.2 Add Migration Documentation

Create `docs/MIGRATION_FROM_V1.md` with examples:

```markdown
# Migrating from v1 to v2

## SSI Includes → `<include>` Elements

### Before (v1):
```html
<!--#include virtual="/components/header.html" -->
<!--#include file="sidebar.html" -->
```

### After (v2):
```html
<include src="/components/header.html"></include>
<include src="./sidebar.html"></include>
```

**Migration script**:
```bash
# Find all SSI includes
grep -r "<!--#include" src/

# Manual replacement required (context-dependent)
```

## Short Layout Names → Explicit Paths

### Before (v1):
```html
<div data-layout="blog">...</div>
```

### After (v2):
```html
<div data-layout="/layouts/blog.html">...</div>
```

**Migration script**:
```bash
# Find short names
grep -r 'data-layout="[^/]*"' src/

# Replace with explicit paths
```

[... more examples ...]
```

### 1.3 Add `--strict` Flag for Testing

```javascript
// src/cli.js
if (options.strict) {
  // Treat deprecation warnings as errors
  process.exitCode = 1;
}
```

**Usage**:
```bash
unify build --strict  # Fail if deprecated features used
```

### 1.4 Update Documentation

**README.md**: Add prominent notice
```markdown
## ⚠️ Upcoming Breaking Changes in v2.0

Unify v2.0 will simplify the feature set. See [Migration Guide](docs/MIGRATION_TO_V2.md).

Key changes:
- SSI includes removed (use `<include>`)
- Short layout names removed (use explicit paths)
- Frontmatter head synthesis simplified

**Action required**: Run `unify build --strict` to check for deprecated features.
```

**Release**: v1.9 with deprecation warnings

---

## Phase 2: Remove Deprecated Features (v2.0-beta)

**Goal**: Actually remove deprecated code, provide migration tools.

### 2.1 Remove SSI Include Processing

**Delete or comment out**:
- `src/core/include-processor.js` - SSI processing functions
- Related tests in `test/unit/include-processor.test.js`

**Keep**:
- `<include>` element processing
- Slot injection
- All security checks

**Changes**:

```javascript
// src/core/file-processor.js

// REMOVE:
import { processSSIIncludes } from './include-processor.js';

// UPDATE processFile():
export async function processFile(filePath, options) {
  let html = await Bun.file(filePath).text();

  // REMOVE these lines:
  // html = await processSSIIncludes(html, context);

  // KEEP:
  html = await processIncludeElements(html, context);
  html = await processSlotInjection(html, context);

  return html;
}
```

### 2.2 Simplify Layout Discovery

**File**: `src/core/layout-discovery.js`

```javascript
// BEFORE: Complex discovery with 5 methods
export async function discoverLayout(filePath, options) {
  // 1. Check <link rel="layout">
  // 2. Check data-layout attribute
  // 3. Check frontmatter layout key
  // 4. Auto-discovery of _layout.html
  // 5. Short name resolution
  // 6. Search _includes/
}

// AFTER: Simple discovery with 2 methods
export async function discoverLayout(filePath, options) {
  const html = await Bun.file(filePath).text();
  const context = { filePath, options };

  // Method 1: Explicit data-layout attribute
  const explicitLayout = extractDataLayoutAttribute(html);
  if (explicitLayout) {
    return resolveLayoutPath(explicitLayout, context);
  }

  // Method 2: Auto-discovery
  return autoDiscoverLayout(filePath, options);
}

// Simplified path resolution
function resolveLayoutPath(layoutPath, context) {
  // Absolute: /layouts/blog.html → src/layouts/blog.html
  if (layoutPath.startsWith('/')) {
    return join(context.options.source, layoutPath);
  }

  // Relative: ./custom.html → relative to current file
  return resolve(dirname(context.filePath), layoutPath);
}

// Auto-discovery: just search for _layout.html
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
    if (parent === dir) break;  // Reached root
    dir = parent;
  }

  return null;  // No layout found
}
```

**Delete**:
- Short name resolution code
- `<link rel="layout">` extraction
- Search hierarchy for named layouts
- `_*.layout.html` pattern matching

**Update tests**: Remove tests for deleted features, add tests for new simplified logic.

### 2.3 Simplify Frontmatter Processing

**File**: `src/core/markdown-processor.js`

```javascript
// BEFORE: Complex head synthesis
export function processFrontmatter(frontmatter) {
  // Process head.meta array
  // Process head.link array
  // Process head.script with JSON-LD
  // Process head.style inline/href
}

// AFTER: Simple synthesis
export function processFrontmatter(frontmatter) {
  const headElements = [];

  // Only support title, description, layout
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
    content: convertMarkdownToHtml(frontmatter.content)
  };
}
```

**Delete**:
- `head.meta` array processing
- `head.link` array processing
- `head.script` array processing
- `head.style` array processing
- Related validation code

**Update documentation**: Remove complex frontmatter examples, document HTML alternative.

### 2.4 Unify Path Resolution

**Create**: `src/utils/path-resolver.js`

```javascript
/**
 * Unified path resolution for all contexts (includes, layouts, assets)
 *
 * Rules:
 * 1. Absolute paths (start with /) → resolve from source root
 * 2. Relative paths → resolve from current file's directory
 */
export function resolvePath(path, context) {
  const { filePath, options } = context;

  // Absolute: /components/nav.html
  if (path.startsWith('/')) {
    return join(options.source, path);
  }

  // Relative: ./sidebar.html or ../shared/footer.html
  const currentDir = dirname(filePath);
  return resolve(currentDir, path);
}

// Security: Ensure resolved path is within source directory
export function validatePath(resolvedPath, options) {
  const sourceRoot = resolve(options.source);
  const normalizedPath = resolve(resolvedPath);

  if (!normalizedPath.startsWith(sourceRoot)) {
    throw new SecurityError(
      `Path traversal detected: ${resolvedPath}\n` +
      `Paths must be within source directory: ${sourceRoot}`
    );
  }

  return normalizedPath;
}
```

**Update all modules** to use `resolvePath`:
- `src/core/include-processor.js`
- `src/core/layout-discovery.js`
- `src/core/asset-tracker.js`

### 2.5 Update Tests

**Delete deprecated feature tests**:
```bash
# Remove SSI include tests
rm test/unit/ssi-includes.test.js

# Remove short name tests
# Edit test/unit/layout-discovery-short-names.test.js - delete file

# Remove frontmatter head synthesis tests (or mark as skipped)
# test/unit/frontmatter-head-synthesis.test.js - delete complex tests
```

**Update existing tests**:
```javascript
// test/unit/include-processing.test.js

// REMOVE:
test('should process SSI virtual includes', async () => {
  // ...
});

// KEEP:
test('should process <include> elements', async () => {
  // ...
});
```

**Add new tests for simplified behavior**:
```javascript
// test/unit/path-resolution.test.js

import { resolvePath } from '../../src/utils/path-resolver.js';

test('should resolve absolute paths from source root', () => {
  const context = {
    filePath: '/project/src/blog/post.html',
    options: { source: '/project/src' }
  };

  const result = resolvePath('/components/nav.html', context);
  expect(result).toBe('/project/src/components/nav.html');
});

test('should resolve relative paths from current file', () => {
  const context = {
    filePath: '/project/src/blog/post.html',
    options: { source: '/project/src' }
  };

  const result = resolvePath('./sidebar.html', context);
  expect(result).toBe('/project/src/blog/sidebar.html');
});
```

### 2.6 Update Documentation

**Delete**:
- `docs/ssi-includes.md` (if exists)
- Complex frontmatter examples from all docs

**Update**:
- `docs/include-syntax.md` → Remove SSI section, keep only `<include>`
- `docs/layouts-slots-templates.md` → Remove short names, link element
- `docs/app-spec.md` → Replace with `docs/simplified-spec.md`
- `README.md` → Update examples to v2 syntax

**Add**:
- `docs/MIGRATION_FROM_V1.md` (detailed migration guide)
- `docs/simplified-spec.md` (new canonical spec)

### 2.7 Provide Migration Script

**Create**: `scripts/migrate-to-v2.js`

```javascript
#!/usr/bin/env bun
/**
 * Automated migration script for Unify v1 → v2
 *
 * Usage: bun scripts/migrate-to-v2.js [directory]
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function migrateFile(filePath) {
  let content = await readFile(filePath, 'utf8');
  let changes = [];

  // 1. SSI includes → <include> elements
  const ssiRegex = /<!--#include\s+(virtual|file)="([^"]+)"\s*-->/g;
  if (ssiRegex.test(content)) {
    content = content.replace(ssiRegex, (match, type, path) => {
      // Convert 'file' to relative path, 'virtual' to absolute
      const newPath = type === 'virtual' ? path : `./${path}`;
      changes.push(`SSI include → <include src="${newPath}">`);
      return `<include src="${newPath}"></include>`;
    });
  }

  // 2. Short layout names → explicit paths
  const shortLayoutRegex = /data-layout="([^/"]+)"/g;
  if (shortLayoutRegex.test(content)) {
    content = content.replace(shortLayoutRegex, (match, name) => {
      if (!name.includes('/') && !name.includes('.')) {
        changes.push(`Short layout "${name}" → "/layouts/${name}.html"`);
        return `data-layout="/layouts/${name}.html"`;
      }
      return match;
    });
  }

  // 3. <link rel="layout"> → data-layout attribute
  const linkLayoutRegex = /<link\s+rel="layout"\s+href="([^"]+)"\s*\/?>/g;
  if (linkLayoutRegex.test(content)) {
    content = content.replace(linkLayoutRegex, (match, href) => {
      changes.push(`<link rel="layout"> → data-layout="${href}"`);
      return `<!-- MIGRATION: Add data-layout="${href}" to <html> tag -->`;
    });
  }

  // Write back if changes made
  if (changes.length > 0) {
    await writeFile(filePath, content);
    console.log(`✓ ${filePath}`);
    changes.forEach(c => console.log(`  - ${c}`));
    return true;
  }

  return false;
}

async function migrateDirectory(dir) {
  let totalChanges = 0;

  const files = await readdir(dir, { withFileTypes: true, recursive: true });

  for (const file of files) {
    if (file.isFile() && /\.(html|md)$/.test(file.name)) {
      const filePath = join(file.path, file.name);
      if (await migrateFile(filePath)) {
        totalChanges++;
      }
    }
  }

  console.log(`\n✓ Migration complete: ${totalChanges} files changed`);
}

// Run migration
const dir = process.argv[2] || './src';
await migrateDirectory(dir);
```

**Usage**:
```bash
# Dry run (backup first!)
cp -r src src.backup

# Migrate
bun scripts/migrate-to-v2.js src

# Review changes
git diff src
```

**Release**: v2.0-beta

---

## Phase 3: Final Release (v2.0)

**Goal**: Stable release with all simplifications, comprehensive docs.

### 3.1 Final Testing

**Test suite validation**:
```bash
# All tests must pass
bun test

# Check test coverage
bun test --coverage

# Validate examples
bun run example
```

**Manual testing**:
- Build example sites
- Test all CLI commands
- Verify error messages
- Check live reload
- Test cross-platform executables

### 3.2 Documentation Review

**Checklist**:
- [ ] All docs updated to v2 syntax
- [ ] No references to removed features
- [ ] Migration guide complete with examples
- [ ] README reflects new simplicity
- [ ] Getting started tutorial updated
- [ ] API reference matches implementation

### 3.3 Release Notes

**Create**: `CHANGELOG.md` entry

```markdown
# v2.0.0 - Simplified Architecture

## Breaking Changes

### Removed Features

1. **SSI Includes**: Use `<include>` elements instead
   - Before: `<!--#include virtual="/header.html" -->`
   - After: `<include src="/header.html"></include>`

2. **Short Layout Names**: Use explicit paths
   - Before: `data-layout="blog"`
   - After: `data-layout="/layouts/blog.html"`

3. **`<link rel="layout">`**: Use `data-layout` attribute
   - Before: `<link rel="layout" href="...">`
   - After: `<html data-layout="...">`

4. **Complex Frontmatter Head**: Use full HTML documents
   - Only `title`, `description`, `layout` supported in frontmatter
   - For custom head elements, use full HTML document

5. **`_*.layout.html` Naming**: Use `_layout.html` only
   - Auto-discovery only finds `_layout.html`
   - For custom layouts, use explicit `data-layout` path

### Simplified Features

- **Unified Path Resolution**: All paths (includes, layouts, assets) use same rules
- **Two Layout Methods**: Auto-discovery + explicit override (down from 5 methods)
- **One Include Syntax**: `<include>` elements only
- **Clearer Conventions**: `_layout.html` for layouts, `_components/` for components

### Migration

See [Migration Guide](docs/MIGRATION_FROM_V1.md) for detailed instructions.

Automated migration tool:
```bash
bun scripts/migrate-to-v2.js src
```

### Improvements

- Reduced cognitive complexity
- Better error messages
- Faster builds (less code to execute)
- Clearer documentation
- Smaller binary size

## Upgrading from v1.x

1. Backup your project
2. Update to v2.0
3. Run migration script: `bun scripts/migrate-to-v2.js src`
4. Test: `unify build --clean`
5. Review changes: `git diff`
6. Update custom code/scripts as needed
```

**Release**: v2.0.0

---

## Code Removal Checklist

### Files to Delete

```bash
# SSI processing (if standalone)
rm src/core/ssi-processor.js

# Short name resolution (if standalone)
rm src/core/layout-short-names.js

# Complex frontmatter head
# (Simplify within markdown-processor.js, don't delete file)

# Deprecated tests
rm test/unit/ssi-includes.test.js
rm test/unit/layout-discovery-short-names.test.js
# Keep test/unit/frontmatter-head-synthesis.test.js but update to simple version
```

### Functions to Remove

**In `src/core/include-processor.js`**:
- `processSSIIncludes()`
- `processVirtualInclude()`
- `processFileInclude()`
- All SSI-related helpers

**In `src/core/layout-discovery.js`**:
- `resolveShortLayoutName()`
- `searchLayoutHierarchy()`
- `extractLinkLayoutElement()`
- `discoverNamedLayout()` (complex version)

**In `src/core/markdown-processor.js`**:
- `synthesizeHeadMeta()`
- `synthesizeHeadLink()`
- `synthesizeHeadScript()`
- `synthesizeHeadStyle()`
- `processJsonLd()`

**In `src/core/unified-html-processor.js`**:
- Any special handling for `<link rel="layout">`

### Configuration to Remove

**In `package.json`** (if exists):
```json
{
  "unify": {
    "ssiIncludes": true,           // Remove
    "shortLayoutNames": true,       // Remove
    "frontmatterHeadSynthesis": true // Remove
  }
}
```

---

## User Communication Strategy

### Announcement Timeline

**3 months before v2.0**:
- Blog post: "Simplifying Unify: What's Changing in v2.0"
- Tweet thread explaining rationale
- Email to npm package users (if tracking available)

**1 month before v2.0**:
- Release v1.9 with deprecation warnings
- Update docs with migration guide
- Create video tutorial on migration

**v2.0 release day**:
- Major announcement
- Release notes
- Updated documentation
- Migration support channel (Discord/GitHub Discussions)

### Support Resources

1. **Migration Guide**: Comprehensive docs with examples
2. **Automated Script**: `migrate-to-v2.js` for common cases
3. **GitHub Discussions**: Q&A for migration issues
4. **Example Projects**: Show before/after migration
5. **Changelog**: Clear list of breaking changes

---

## Testing Strategy

### Before Removal (v1.9)

```bash
# All tests pass
bun test  # 561 tests pass

# Deprecation warnings work
unify build  # Shows warnings for deprecated features

# Strict mode fails on deprecations
unify build --strict  # Exit code 1 if deprecated features found
```

### After Removal (v2.0)

```bash
# Reduced test count (removed deprecated feature tests)
bun test  # ~500-520 tests pass (fewer tests, simpler code)

# All features work
unify build
unify serve
unify watch

# Examples build successfully
bun run example
bun run build:advanced
```

### Regression Testing

**Test deprecated features no longer work**:
```javascript
// test/integration/removed-features.test.js

test('should reject SSI includes with clear error', async () => {
  const html = '<!--#include virtual="/header.html" -->';

  await expect(build({ html })).rejects.toThrow(
    /SSI includes are not supported in v2.0.*Use <include>/
  );
});

test('should reject short layout names', async () => {
  const html = '<div data-layout="blog">...</div>';

  await expect(build({ html })).rejects.toThrow(
    /Short layout names are not supported.*Use explicit path/
  );
});
```

---

## Rollback Plan

If v2.0 causes major issues:

### Option 1: Revert to v1.9

```bash
# Users can downgrade
npm install @fwdslsh/unify@1.9

# Or use v1.x binary
curl -O https://github.com/fwdslsh/unify/releases/download/v1.9.0/unify-linux
```

### Option 2: Extend v1.x Maintenance

- Continue v1.x branch with security fixes
- Give users more time to migrate
- Release v2.1 with improvements based on feedback

### Option 3: Provide Compatibility Shim

```javascript
// unify-v1-compat.js - temporary compatibility layer
export function enableV1Compatibility() {
  // Re-enable SSI processing
  // Re-enable short names
  // Log migration warnings
}
```

---

## Success Metrics

### Code Quality

- [ ] Lines of code reduced by >20%
- [ ] Cyclomatic complexity reduced
- [ ] Test count reduced but coverage maintained
- [ ] Binary size reduced

### User Experience

- [ ] Fewer support questions about "which include syntax to use"
- [ ] Faster onboarding (simpler docs)
- [ ] Positive feedback on simplified API
- [ ] Successful migrations (track GitHub issues)

### Performance

- [ ] Build times unchanged or faster
- [ ] Memory usage unchanged or lower
- [ ] Startup time unchanged or faster

---

## Summary

This migration simplifies Unify from a complex, feature-rich SSG to a focused, convention-based tool:

- **Removes**: 4 major features (SSI, short names, link layouts, complex frontmatter)
- **Simplifies**: Path resolution, layout discovery, frontmatter processing
- **Maintains**: Core functionality, performance, Bun-native benefits
- **Improves**: Usability, maintainability, documentation clarity

**Timeline**:
- v1.9 (deprecation warnings): 1-2 weeks
- v2.0-beta (removal + testing): 2-4 weeks
- v2.0 (final release): After community feedback

**Risk**: Some users may resist change, but clearer architecture benefits outweigh compatibility costs.
