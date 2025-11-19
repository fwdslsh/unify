# Comprehensive V2 E2E Test Fixtures

This directory contains comprehensive end-to-end test fixtures based on the v2 specification.

## Structure

- `input/` - Source files that will be processed
- `expected/` - Expected output files after processing
- Test validates that processing `input/` produces output matching `expected/`

## Features Tested

### 1. Include System (`<include>` elements)
- ✅ Absolute paths (`/components/nav.html`)
- ✅ Relative paths (`./sidebar.html`, `../shared/footer.html`)
- ✅ Nested includes (components including other components)
- ✅ Slot injection with `data-slot` attributes
- ✅ Markdown includes (`.md` files auto-processed)

### 2. Layout System
- ✅ Auto-discovery of `_layout.html`
- ✅ Explicit layout with `data-layout` attribute
- ✅ Layout chains (nested layouts)
- ✅ Named slots (`data-slot="title"`, `data-slot="sidebar"`)
- ✅ Default slot for content without `data-slot`
- ✅ Fallback content when no slot provided

### 3. File Processing
- ✅ HTML fragments (no `<html>` tag)
- ✅ Full HTML documents with DOCTYPE
- ✅ Markdown files with frontmatter
- ✅ Head element merging
- ✅ Asset copying (files without `_` prefix)

### 4. Path Resolution
- ✅ Absolute paths from source root (`/`)
- ✅ Relative paths from current file
- ✅ Path normalization
- ✅ Security (no path traversal)

### 5. Conventions
- ✅ Files starting with `_` not copied to output
- ✅ Directories starting with `_` not copied to output
- ✅ Directory structure preservation

## Known Output

All expected output files are hand-crafted based on the v2 specification to verify
correct behavior. Any differences between actual output and expected output indicate
bugs in the implementation.
