# Unify v0.6.0 - Deprecated Code and Functionality Analysis

## Executive Summary

After a comprehensive review of the Unify codebase against the official v0.6.0 specification, I've identified significant deprecated functionality that exists in the implementation but is **NOT** specified in the v0.6.0 app-spec or features that are missing from the spec. This analysis systematically reviews all areas of the codebase to identify what should be removed to achieve true spec compliance.

## Methodology

This analysis compared the actual codebase implementation against the official [v0.6.0 app-spec.md](/docs/app-spec.md) to identify:

1. **CLI Options** not mentioned in the spec
2. **Template Systems** not specified as supported
3. **Core Processing Features** not documented in spec
4. **Test Files** testing non-spec functionality
5. **Utility Functions** supporting deprecated features

---

## 🚨 CRITICAL FINDINGS

### 1. **The `init` Command System** - COMPLETELY MISSING

**Status**: ❌ **NOT IN V0.6.0 SPEC**  
**Scope**: Entire command with supporting infrastructure
**Action**: Update the spec with complete details about the `init` command and how it works. This includes pulling starter kits from a known list of GitHub repositories.

**What exists but isn't in the spec:**

- **CLI Support**: `init` listed as valid command in `args-parser.js:97`
- **Template argument**: `--template` option parsing
- **Repository Service**: Entire GitHub API integration (`/src/utils/repository-service.js`)
- **Package Reading**: npm package.json parsing (`/src/utils/package-reader.js`)
- **Starter Templates**: KNOWN_STARTERS array and template fetching

### 2. **Build Cache System** - COMPLETELY MISSING

**Status**: ❌ **NOT IN V0.6.0 SPEC**  
**Scope**: Entire caching infrastructure
**Action**: Update the spec to include details about the caching system, how it should work and what the expected behavior is.
**What exists but isn't in the spec:**

- **Build Cache Class**: Full caching system (`/src/core/build-cache.js`)
- **Cache Functions**: `createBuildCache()`, `clearCacheOnRestart()`
- **Cache Directory**: `.unify-cache` directory creation
- **Hash-based Tracking**: File modification tracking

### 3. **DOM Mode Processing** - DEPRECATED (Already Partially Removed)

**Status**: ❌ **NOT IN V0.6.0 SPEC** (include functionality removed but structure remains)  
**Scope**: Legacy template processing system
**Action**: Completely remove from codebase and remove related tests

**What exists but shouldn't:**

- **`shouldUseDOMMode()`**: Always returns `false` but still called
- **`processDOMMode()`**: Entire function (362-520+ lines)
- **`hasDOMTemplating()`**: Template detection for old system
- **Layout directory support**: `.layouts` directory (marked deprecated in code)
- **Components directory**: `.components` directory support

**Code to Remove:**

```javascript
// unified-html-processor.js
- shouldUseDOMMode() function (lines 350-352)
- processDOMMode() function (lines 362-520+)
- hasDOMTemplating() function (lines 517-520)
- All calls to these functions and related tests
```

---

## 🔧 CLI OPTIONS: Deprecated Flags and Arguments

### Explicitly Deprecated Options (Still Parsed)

**`--fail-on`** (Replaced by `--fail-level`)

- **Location**: `args-parser.js:420-450`
- **Status**: Backwards compatibility wrapper
- **Action**: Can be removed - users should migrate to `--fail-level`

**`--verbose` / `-V`**

- **Location**: `args-parser.js:460-470`
- **Status**: ❌ **NOT IN V0.6.0 SPEC** (replaced by `--log-level`)
- **Action**: Should be removed - users should migrate to `--log-level debug`

### Legacy Internal Options (Never Exposed)

**`layouts: null`**

- **Location**: `args-parser.js:88`
- **Status**: Dead code, never used
- **Action**: Remove

**`failOn: null`**

- **Location**: `args-parser.js:91`
- **Status**: Dead code, mapped to `failLevel`
- **Action**: Remove

### Incorrectly Documented Options

**`--base-url`**

- **Status**: **IN SPEC** but should be removed
- **Note**: Spec shows `--base-url` for sitemap, implementation parses it
- **Action**: Remove all references to base-url in code and tests, it is not longer needed. remove any reference to it in the app-spec as well.

**`--no-sitemap`**

- **Status**: ❌ **NOT IN V0.6.0 SPEC** (spec only mentions sitemap generation, not disabling)
- **Action**: Remove this option and all related code and tests. Update the app-spec to remove all references to sitemap generation.

---

## 📄 SPECIFICATION INCONSISTENCIES

### Documentation Errors in app-spec.md

The official v0.6.0 specification contains internal inconsistencies:

**`data-slot` vs `data-target` Confusion:**

- **Lines 1073-1074**: Uses old `data-slot="name"` syntax
- **Lines 1081, 1083**: References `data-slot="default"`
- **Correct Syntax**: Should be `data-target="name"` (used elsewhere in spec)
- **Action**: Update app-spec to use the correct syntax consistently

**Template Element Syntax:**

- **Line 989**: Shows `<template slot="header">` (old syntax)
- **Line 1000**: Shows `<template slot="header">` (old syntax)
- **Correct Syntax**: Should be `<template data-target="header">`
- **Action**: Update app-spec to use the correct syntax consistently and also ensure the app spec is clear about using data-target with template and other elements. It should be easy to understand how they differ and why you would use one approach over the other.

### Removed But Still Referenced

**Include Tag Processing:**

- **Spec**: Mentions Apache SSI includes as "legacy but supported"
- **Reality**: All `<include>` tag processing was removed (not SSI includes)
- **Status**: SSI includes (`<!--#include -->`) are still supported, DOM includes (`<include>`) are not
- **Action**: Ensure the spec is clear that Unify will continue to support SSi include syntax for importing fragments to be compatible with that Apache feature

---

## 🧪 OBSOLETE TEST FILES

### Tests for Completely Deprecated Features

**DOM Mode Tests (Partially Obsolete):**

```
/test/integration/dom-mode-includes.test.js  # Tests removed <include> tags
```

### Tests for Deprecated CLI Options

**Verbose Mode Tests:**

- Multiple test files test `--verbose` behavior
- Should be updated to test `--log-level debug` instead

**Legacy Fail-On Tests:**

- Tests should migrate from `--fail-on` to `--fail-level`

---

## 🛠️ UTILITY FUNCTIONS: Deprecated Support Functions

### Path Resolution

**`resolveIncludePath()`**

- **Location**: `/src/utils/path-resolver.js:40`
- **Status**: No longer used (include functionality removed)
- **Import**: Still imported in removed functions
- **Action**: Remove function and imports

### HTML Processing

**Layout Directory Support:**

- **Location**: `unified-html-processor.js:364`
- **Code**: `layoutsDir: '.layouts', // Deprecated but kept for compatibility`
- **Status**: Explicitly marked deprecated in code
- **Action**: Remove support

**Component Directory Support:**

- **Location**: `unified-html-processor.js:365`
- **Code**: `componentsDir: '.components'`
- **Status**: Not mentioned in v0.6.0 spec
- **Action**: Remove support and related tests

---

## 📊 IMPACT ASSESSMENT

### High Impact (Breaking Changes)

- **`--verbose` removal**: Users must migrate to `--log-level debug`

### Medium Impact (Cleanup)

- **DOM mode removal**: Code cleanup, no user-facing impact (already disabled)
- **Deprecated CLI options**: Backwards compatibility impact

### Low Impact (Internal)

- **Utility function removal**: Internal cleanup
- **Test file removal**: Development impact only

---

## 🎯 RECOMMENDED REMOVAL PLAN

### Phase 1: App Spec

1. **Document init command completely**

   - Include detailed information about the init command in the app spec

2. **Document build cache system**

   - Include information about build caching in the app spec

### Phase 2: DOM Mode Cleanup

3. **Remove DOM mode infrastructure**
   - Delete shouldUseDOMMode(), processDOMMode(), hasDOMTemplating()
   - Remove layout/component directory support
   - Clean up unified-html-processor.js

### Phase 3: CLI Option Cleanup

4. **Remove deprecated CLI options**
   - Remove --verbose (migrate to --log-level)
   - Remove --fail-on (migrate to --fail-level)
   - Remove --no-sitemap (or document in spec)

### Phase 4: Utility Cleanup

5. **Remove orphaned utility functions**
   - Remove resolveIncludePath()
   - Clean up path-resolver imports

### Phase 5: Test Cleanup

6. **Remove obsolete test files**
   - Delete tests for removed functionality
   - Update tests to use new CLI options

---

## ⚠️ MIGRATION GUIDANCE FOR USERS

### Removed Features

- **`--verbose`** → Use `--log-level debug`
- **`--fail-on error`** → Use `--fail-level error`

### Template System Changes

- **`<include>`** tags → Use `data-import` with Cascading Imports
- **`data-slot`** attributes → Use `data-target` attributes
- **`.layouts/`** directory → Use `_layout.html` files with automatic discovery

---

## 📋 IMPLEMENTATION CHECKLIST


### Functions to Remove

- [ ] `shouldUseDOMMode()` - unified-html-processor.js
- [ ] `processDOMMode()` - unified-html-processor.js
- [ ] `hasDOMTemplating()` - unified-html-processor.js
- [ ] `resolveIncludePath()` - path-resolver.js

### CLI Code to Remove

- [ ] `--verbose` flag parsing
- [ ] `--fail-on` flag parsing
- [ ] `--no-sitemap` flag

### Tests to Update

- [ ] Update verbose tests to use `--log-level debug`
- [ ] Update fail-on tests to use `--fail-level`
- [ ] Remove DOM mode include tests

---

## 🎉 EXPECTED OUTCOME

After implementing this removal plan:

1. **100% Spec Compliance**: Codebase will match v0.6.0 specification exactly
2. **Reduced Complexity**: ~1000+ lines of deprecated code removed
3. **Clear Architecture**: Only features in spec will be implemented
4. **Better Maintainability**: No deprecated code paths to maintain
5. **Improved Performance**: No unused DOM mode or caching overhead
6  **More Robust App Spec**: App spec will contain additional information about the init command and build caching

---

_Analysis completed on 2024-12-24_  
_Based on Unify v0.6.0 app-spec.md_  
_Total files analyzed: 50+ core files, 80+ test files_
