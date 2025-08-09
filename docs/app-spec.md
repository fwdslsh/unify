# Unify Static Site Generator - Complete Application Specification (Updated)

## Overview

Unify is a modern, lightweight static site generator designed for frontend developers who want to build maintainable static sites with component-based architecture. It uses familiar Apache SSI syntax and modern HTML templating to eliminate the need to copy and paste headers, footers, and navigation across multiple pages.

## Target Users

- Frontend developers familiar with HTML, CSS, and basic web development
- Content creators who need a simple static site generator
- Developers who want framework-free, pure HTML/CSS output
- Teams needing component-based architecture without JavaScript frameworks

## Core Functionality

### Primary Purpose

Transform source HTML/Markdown files with includes and layouts into a complete static website ready for deployment.

### Key Features

- Apache SSI-style includes (`<!--#include file="header.html" -->`)
- Modern DOM templating with `<template>`, `<slot>`, and `<include>` elements
- Markdown processing with YAML frontmatter

### Additional Features

- Live development server with auto-reload
- Automatic sitemap.xml generation
- Incremental builds with smart dependency tracking
- Asset tracking and copying
- Security-first design with path traversal prevention

## Command Line Interface

### Application Name

`unify`

### Main Commands

#### 1. `build` (Default Command)

Builds the static site from source files to output directory.

**Syntax:**

```bash
unify [build] [options]
unify            # Defaults to build command
```

**Workflow:**

1. Validates source and output directories
2. Scans source directory for all files (HTML, Markdown, assets)
3. Processes includes and dependencies
4. Applies layouts to HTML and Markdown pages
5. Processes DOM templating elements
6. Copies referenced assets to output
7. Generates sitemap.xml (if enabled)
8. Reports build summary

**Expected Output:**

- Complete static website in output directory
- Sitemap.xml file at root
- All referenced assets copied with directory structure preserved
- Success message with file count and build time
- Exit code 0 on success, 1 on recoverable errors, 2 on fatal errors

#### 2. `serve`

Starts development server with live reload functionality.

**Syntax:**

```bash
unify serve [options]
```

**Workflow:**

1. Performs initial build
2. Starts HTTP server on specified port/host
3. Enables live reload via Server-Sent Events
4. Starts file watcher for source directory
5. Rebuilds incrementally on file changes
6. Notifies browser of changes via SSE
7. Runs until manually stopped (Ctrl+C)

**Expected Output:**

- HTTP server serving built files
- Live reload endpoint at `/__events`
- Console messages for server status, file changes, and rebuild events
- Browser auto-refresh on source file changes

#### 3. `watch`

Watches files and rebuilds on changes without serving.

**Syntax:**

```bash
unify watch [options]
```

**Workflow:**

1. Performs initial build and reports stats
2. Starts file watcher for source directory
3. Rebuilds incrementally on file changes
4. Logs change events and rebuild status
5. Runs until manually stopped

**Expected Output:**

- Initial build output
- Continuous logging of file changes and rebuild events
- Updated files in output directory on changes

### Command Line Options

#### Directory Options

**`--source, -s <directory>`**

- **Purpose:** Specify source directory containing site files
- **Default:** `src`
- **Validation:** Must be existing directory
- **Used by:** All commands

**`--output, -o <directory>`**

- **Purpose:** Specify output directory for generated files
- **Default:** `dist`
- **Validation:** Must be in a writable location
- **Behavior:** Created if doesn't exist
- **Used by:** All commands

**`--assets, -a <pattern>`**

- **Purpose:** Specify additional assets glob pattern to copy recursively
- **Default:** `null` (no additional assets)
- **Used by:** All commands
- **Format:** Glob pattern like `"./assets/**/*.*"` or `"./static/**/*"`
- **Behavior:** Copies matching files to output directory preserving relative paths
- **Note:** Use quotes around patterns with special characters

> **Removed:** `--layouts`, `--components` (replaced by conventions)

#### Build Options

**`--pretty-urls`**

- **Purpose:** Generate pretty URLs (about.{html,md} -> about/index.html)
- **Default:** `false`
- **Used by:** All commands
- **Effect:** Creates directory structure for clean URLs

**`--base-url <url>`**

- **Purpose:** Base URL for sitemap.xml generation
- **Default:** `https://example.com`
- **Used by:** All commands
- **Format:** Full URL with protocol

**`--clean`**

- **Purpose:** Clean output directory before (initial) build
- **Default:** `false`
- **Used by:** All commands

**`--perfection`**

- **Purpose:** Fail entire build if any single page fails to build
- **Default:** `false`
- **Used by:** `build` command, `watch` and `serve` ignore this option
- **Behavior:** Exit with code 1 if any file processing fails

**`--no-sitemap`**

- **Purpose:** Disable sitemap.xml generation
- **Default:** `false` (sitemap enabled by default)
- **Used by:** All Commands

**`--minify`**

- **Purpose:** Enable HTML minification for production builds
- **Default:** `false`
- **Used by:**  All commands
- **Behavior:** Removes whitespace and does basic optimization on HTML output

#### Server Options

**`--port, -p <number>`**

- **Purpose:** Development server port
- **Default:** `3000`
- **Validation:** Integer between 1-65535
- **Used by:** `serve` command only

**`--host <hostname>`**

- **Purpose:** Development server host
- **Default:** `localhost`
- **Used by:** `serve` command only
- **Examples:** `0.0.0.0` for external access

#### Global Options

**`--help, -h`**

- **Purpose:** Display help information
- **Behavior:** Shows usage, commands, options, and examples
- **Exit:** Code 0 after displaying help

**`--version, -v`**

- **Purpose:** Display version number
- **Format:** `unify v{version}`
- **Exit:** Code 0 after displaying version

**`--verbose`**

- **Purpose:** Enable Debug level messages to be included in console output

## File Processing Rules

## Directory Structure Conventions

```
project/
├── src/                      # Source root
│   ├── _includes/            # Shared partials/layouts (non-emitting; not copied)
│   ├── section/
│   │   ├── _layout.html      # Layout for this folder (wraps descendants)
│   │   ├── _partial.html     # Non-emitting partial
│   │   └── page.html         # Page
│   ├── index.html            # Page
│   └── about/
│       ├── _layout.html      # About-specific layout
│       ├── _cta.html         # Partial
│       └── index.html        # Page
└── dist/                     # Output
```

- Any file or folder starting with `_` is **non-emitting** by convention.
- `src/_includes/` is a conventional home for shared partials/layouts. Its contents are not copied to `dist/` unless referenced as non-HTML assets.

## File Processing Rules

### HTML Files (`.html`, `.htm`)
- Pages: `.htm(l)` files not starting with `_` are emitted as pages.
- Partials: `.htm(l)` files starting with `_` are non-emitting partials.
- Layouts: Files starting with `_` and ending with `layout.html` or `layout.htm` provide folder-scoped layouts.

### Markdown Files (`.md`)
- Processed with frontmatter extraction and Markdown→HTML conversion.
- Layout discovery or override applies.

### Static Assets
- Copied only if referenced.
- Underscore-prefixed assets are non-emitting unless explicitly referenced.

### Include System

#### DOM Include
```html
<include src="/components/header.html"></include>
```
Resolution:
1. Leading `/` → from `src/` root.
2. Else → relative to including file.

#### Apache SSI (unchanged)
```html
<!--#include file="relative.html" -->
<!--#include virtual="/absolute.html" -->
```
- `file` = relative to current file.
- `virtual` = from `src/` root.

### Layout System

#### Discovery
1. Nearest layout file that matches the naming pattern in page's folder.
2. Climb to `src/` root.
3. Apply layouts as nested wrappers.
4. Optional: if `src/_includes/_layout.html` exists and no folder layout found, use it.
5. Else: render page content as-is.

#### Layout Naming Convention
Layout files must:
- Start with underscore (`_`)
- End with `layout.html` or `layout.htm`

Valid layout filenames:
- `_layout.html`, `_layout.htm` (standard)
- `_custom.layout.html`, `_blog.layout.htm` (extended pattern)
- `_documentation.layout.html`, `_admin-panel.layout.htm` (complex naming)

#### Fallback Layout
- `src/_includes/_layout.html` serves as the fallback layout when no folder-scoped layout is found

### Slots & Templates
- `<slot>` elements in layouts; unnamed = default slot.
- Pages use `<template target="name">` for named slots.

### Overrides
- `data-layout` accepts relative paths or absolute-from-`src` paths.

## Dependency Tracking
- Tracks pages ↔ partials/layouts/includes.
- Rebuild dependents on change.

## Live Reload
- Changes to `_layout.html`, underscore partials, or `src/_includes/` trigger dependent rebuilds and browser reload.

## Error Handling
- Missing override layout: recoverable error + fallback.
- Warn if non-underscore `.htm(l)` file is only ever included.

## Security Requirements
- Path traversal prevention.
- Absolute paths resolve from `src/` root.
- Underscore folders/files are non-emitting by convention.

## Performance Requirements
(Unchanged)

## Compatibility Requirements
(Unchanged)

## Configuration
- No configuration required for layouts/components.
- Convention over configuration.

## Success Criteria
(Unchanged, except layout/component management updated to match this spec)
