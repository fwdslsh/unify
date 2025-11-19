# GitHub Issues for v2 Migration

This file contains issue templates for the v2 migration implementation plan. You can either:

1. **Automated creation**: Run `GITHUB_TOKEN=ghp_your_token bun scripts/create-v2-issues.js`
2. **Manual creation**: Copy each issue below and create manually in GitHub

---

## Issue 1: [v2] Week 1 Day 1-2: Remove SSI Include System

**Labels**: `v2-migration`, `breaking-change`, `refactor`
**Milestone**: `v2.0.0`

### Description

## Goal
Remove all SSI include processing code from the codebase.

## Tasks

### Code Deletion
- [ ] Delete SSI-specific functions from `src/core/include-processor.js`:
  - `processSSIIncludes()`
  - `processVirtualInclude()`
  - `processFileInclude()`
  - `parseSSIComment()`
- [ ] Remove SSI processing call from `src/core/file-processor.js`

### Test Cleanup
- [ ] Delete `test/unit/ssi-includes.test.js` (if exists)
- [ ] Remove SSI tests from `test/unit/include-processor.test.js`

### Validation
- [ ] Build examples with only `<include>` syntax
- [ ] Run `bun test` - all tests pass
- [ ] No SSI code remains: `grep -r "SSI" src/` returns no matches

## Reference
See [IMPLEMENTATION_PLAN.md](../blob/main/docs/IMPLEMENTATION_PLAN.md#day-1-2-remove-ssi-include-system)

## Estimated Time
2 days

---

## Issue 2: [v2] Week 1 Day 3-4: Simplify Layout Discovery

**Labels**: `v2-migration`, `breaking-change`, `refactor`
**Milestone**: `v2.0.0`

### Description

## Goal
Reduce layout discovery from 5 methods to 2 (explicit + auto-discovery).

## Tasks

### Code Rewrite
- [ ] Completely rewrite `src/core/layout-discovery.js`
- [ ] Delete functions:
  - `resolveShortLayoutName()`
  - `searchLayoutHierarchy()`
  - `extractLinkLayoutElement()`
  - `discoverNamedLayout()`
  - `searchIncludesDirectory()`
- [ ] Implement simplified functions:
  - `discoverLayout()` - main entry point
  - `extractDataLayoutAttribute()` - find data-layout attr
  - `resolveLayoutPath()` - unified path resolution
  - `autoDiscoverLayout()` - walk up tree for _layout.html

### Test Updates
- [ ] Delete `test/unit/layout-discovery-short-names.test.js`
- [ ] Update `test/unit/layout-discovery-new-spec.test.js`:
  - Remove short name tests
  - Remove `<link rel="layout">` tests
  - Remove `_*.layout.html` pattern tests
  - Keep data-layout and auto-discovery tests

### Validation
- [ ] Layouts work with only `data-layout` or auto-discovery
- [ ] Run `bun test` - all tests pass
- [ ] No short name code: `grep -r "shortName" src/` returns no matches

## Reference
See [IMPLEMENTATION_PLAN.md](../blob/main/docs/IMPLEMENTATION_PLAN.md#day-3-4-simplify-layout-discovery)

## Estimated Time
2 days

---

## Issue 3: [v2] Week 1 Day 5: Unify Path Resolution

**Labels**: `v2-migration`, `refactor`, `enhancement`
**Milestone**: `v2.0.0`

### Description

## Goal
Create unified path resolution logic used across all contexts (includes, layouts, assets).

## Tasks

### New Module
- [ ] Create `src/utils/path-resolver.js` with functions:
  - `resolvePath()` - absolute vs relative resolution
  - `validatePath()` - security check (within source dir)
  - `resolveAndValidate()` - combined helper

### Update Existing Modules
- [ ] Update `src/core/include-processor.js` to use unified resolver
- [ ] Update `src/core/layout-discovery.js` to use unified resolver
- [ ] Update `src/core/asset-tracker.js` to use unified resolver

### New Tests
- [ ] Create `test/unit/path-resolution.test.js` with tests for:
  - Absolute path resolution (`/components/nav.html`)
  - Relative path resolution (`./sidebar.html`, `../footer.html`)
  - Security validation (reject paths outside source)

### Validation
- [ ] All path resolution uses same logic
- [ ] Run `bun test` - all tests pass
- [ ] Security tests pass

## Reference
See [IMPLEMENTATION_PLAN.md](../blob/main/docs/IMPLEMENTATION_PLAN.md#day-5-unify-path-resolution)

## Estimated Time
1 day

---

## Issue 4: [v2] Week 2 Day 6-7: Simplify Frontmatter Processing

**Labels**: `v2-migration`, `breaking-change`, `refactor`
**Milestone**: `v2.0.0`

### Description

## Goal
Simplify frontmatter to only support title, description, and layout (remove complex head synthesis).

## Tasks

### Code Simplification
- [ ] Update `src/core/markdown-processor.js`:
  - Simplify `processFrontmatter()` to only handle title, description, layout
  - Delete functions:
    - `synthesizeHeadMeta()`
    - `synthesizeHeadLink()`
    - `synthesizeHeadScript()`
    - `synthesizeHeadStyle()`
    - `processJsonLd()`
    - `validateFrontmatterSchema()`

### Test Updates
- [ ] Update `test/unit/frontmatter-head-synthesis.test.js`:
  - Delete tests for `head.meta` array
  - Delete tests for `head.link` array
  - Delete tests for `head.script` array
  - Delete tests for `head.style` array
  - Keep only: title synthesis, description synthesis, layout key

### Validation
- [ ] Frontmatter only processes title/description/layout
- [ ] Run `bun test` - all tests pass
- [ ] No complex synthesis code: `grep -r "synthesizeHead" src/` returns no matches

## Reference
See [IMPLEMENTATION_PLAN.md](../blob/main/docs/IMPLEMENTATION_PLAN.md#day-6-7-simplify-frontmatter-processing)

## Estimated Time
2 days

---

## Issue 5: [v2] Week 2 Day 8-9: Update All Documentation

**Labels**: `v2-migration`, `documentation`
**Milestone**: `v2.0.0`

### Description

## Goal
Update all documentation to reflect v2 simplified syntax and remove references to deprecated features.

## Tasks

### File Management
- [ ] Delete `docs/app-spec.md` (old complex spec)
- [ ] Rename `docs/simplified-spec.md` to `docs/app-spec.md`

### Update Documentation Files
- [ ] `docs/include-syntax.md` - Remove SSI section, keep only `<include>`
- [ ] `docs/layouts-slots-templates.md` - Remove short names, link elements
- [ ] `docs/cli-reference.md` - Update examples to v2 syntax
- [ ] `docs/getting-started.md` - Update tutorial
- [ ] `README.md` - Update all examples

### Find & Replace Patterns
- [ ] Replace `<!--#include` → `<include`
- [ ] Replace `data-layout="blog"` → `data-layout="/layouts/blog.html"`
- [ ] Remove `<link rel="layout"` examples

### Remove Sections
- [ ] Delete SSI syntax explanations
- [ ] Delete short layout name resolution docs
- [ ] Delete complex frontmatter head examples

### Validation
- [ ] All docs reference only v2 features
- [ ] No SSI examples: `grep -r "<!--#include" docs/` returns no matches
- [ ] No short name examples in docs
- [ ] Getting started tutorial works end-to-end

## Reference
See [IMPLEMENTATION_PLAN.md](../blob/main/docs/IMPLEMENTATION_PLAN.md#day-8-9-update-all-documentation)

## Estimated Time
2 days

---

## Issue 6: [v2] Week 3 Day 10-11: Clean Up Test Suite

**Labels**: `v2-migration`, `testing`
**Milestone**: `v2.0.0`

### Description

## Goal
Remove tests for deleted features and ensure clean test suite with all passing tests.

## Tasks

### Delete Test Files
- [ ] `rm test/unit/ssi-includes.test.js` (if not already done)
- [ ] `rm test/unit/layout-discovery-short-names.test.js`
- [ ] Update `test/unit/frontmatter-head-synthesis.test.js` to keep only simple tests

### Add Validation Tests
- [ ] Create `test/integration/v2-validation.test.js` with tests for:
  - SSI comments treated as regular HTML comments (ignored)
  - Short layout names fail gracefully with "not found" error
  - Complex frontmatter `head.*` properties ignored

### Expected Test Count
- [ ] Original: ~561 tests
- [ ] After cleanup: ~500-520 tests
- [ ] Net reduction: ~45 tests

### Validation
- [ ] Run `bun test` - all tests pass
- [ ] No failing tests for deprecated features
- [ ] Test coverage maintained for core features

## Reference
See [IMPLEMENTATION_PLAN.md](../blob/main/docs/IMPLEMENTATION_PLAN.md#day-10-11-clean-up-test-suite)

## Estimated Time
2 days

---

## Issue 7: [v2] Week 3 Day 12-13: Update Examples

**Labels**: `v2-migration`, `examples`
**Milestone**: `v2.0.0`

### Description

## Goal
Update all example files to use v2 syntax and verify they build/serve correctly.

## Tasks

### Update Example Files
- [ ] Find all SSI includes: `grep -r "<!--#include" example/`
- [ ] Replace with `<include>` elements (context-dependent, manual)
- [ ] Update any short layout names to explicit paths
- [ ] Remove any `<link rel="layout">` usage

### Verify Examples Work
- [ ] Run `bun run build` - no errors
- [ ] Run `bun run serve` - starts successfully
- [ ] Open `http://localhost:3000` - all pages render correctly
- [ ] Check advanced example: `bun run build:advanced` works

### Test All Example Pages
- [ ] Homepage renders
- [ ] Navigation works
- [ ] Layouts applied correctly
- [ ] Components included correctly
- [ ] Markdown pages processed correctly

## Reference
See [IMPLEMENTATION_PLAN.md](../blob/main/docs/IMPLEMENTATION_PLAN.md#day-12-13-update-examples)

## Estimated Time
2 days

---

## Issue 8: [v2] Week 3 Day 14: Final Validation & Release

**Labels**: `v2-migration`, `release`
**Milestone**: `v2.0.0`

### Description

## Goal
Final validation, build executables, and release v2.0.0.

## Tasks

### Build Executables
- [ ] `bun run build:linux` - test binary works
- [ ] `bun run build:macos` - test binary works
- [ ] `bun run build:windows` - test binary works

### Documentation Checklist
- [ ] README.md has only v2 examples
- [ ] All docs/ files reference v2 syntax only
- [ ] No mentions of removed features
- [ ] Getting started tutorial works
- [ ] CLI reference is accurate

### Code Checklist
- [ ] No SSI processing code: `grep -r "SSI" src/` → no matches
- [ ] No short name resolution: `grep -r "shortName" src/` → no matches
- [ ] No complex frontmatter head: `grep -r "synthesizeHead" src/` → no matches
- [ ] All tests pass: `bun test` → ~500-520 pass
- [ ] Examples build: `bun run build` → success
- [ ] Examples serve: `bun run serve` → success

### Git & Release
- [ ] Commit all changes with descriptive message
- [ ] Tag as `v2.0.0`
- [ ] Push to repository
- [ ] Create GitHub release with:
  - Release notes from simplified-spec.md
  - Executables for Linux, macOS, Windows
  - Link to documentation
  - Breaking changes summary

### Success Criteria (All Must Pass)
- [ ] `bun test` - all tests pass
- [ ] `bun run build` - no errors
- [ ] `bun run serve` - works
- [ ] `grep -r "SSI" src/` - no matches
- [ ] `grep -r "shortName" src/` - no matches
- [ ] `grep -r "synthesizeHead" src/` - no matches
- [ ] `grep -r "<!--#include" docs/` - no matches
- [ ] Executables build for all platforms

## Reference
See [IMPLEMENTATION_PLAN.md](../blob/main/docs/IMPLEMENTATION_PLAN.md#day-14-final-validation--release)

## Estimated Time
1 day

---

## Creating Issues

### Option 1: Automated (Recommended)

```bash
GITHUB_TOKEN=ghp_your_token bun scripts/create-v2-issues.js
```

Get your GitHub token from: https://github.com/settings/tokens

### Option 2: Manual

1. Go to https://github.com/fwdslsh/unify/issues/new
2. Copy the title and description from each issue above
3. Add the labels and milestone
4. Create the issue
5. Repeat for all 8 issues
