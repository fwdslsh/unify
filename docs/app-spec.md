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
- **Scoped Styles for Components**: Use the `@scope` rule and CSS nesting to encapsulate styles for specific components or layouts, ensuring maintainable and isolated styling.

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

**`--copy <pattern>`**

- **Purpose:** Specify additional files to copy using glob patterns
- **Default:** `null` (no additional files copied beyond automatic asset detection)
- **Used by:** All commands
- **Format:** Glob pattern like `"./docs/**/*.*"` or `"./config/*.json"`
- **Behavior:** Copies matching files to output directory preserving relative paths
- **Note:** Use quotes around patterns with special characters. The `src/assets` directory is automatically copied if it exists.

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

**`--fail-on <level>`**

- **Purpose:** Fail entire build if errors of specified level or higher occur
- **Default:** `null` (only fail on fatal build errors)
- **Valid levels:** `warning`, `error`
- **Used by:** `build` command, `watch` and `serve` ignore this option
- **Behavior:** Controls when the build process should exit with error code 1

Examples:
- `--fail-on warning`: Fail on any warning or error
- `--fail-on error`: Fail only on errors (not warnings)
- No flag: Only fail on fatal build errors (default behavior)

**`--no-sitemap`**

- **Purpose:** Disable sitemap.xml generation
- **Default:** `false` (sitemap enabled by default)
- **Used by:** All Commands

**`--minify`**

- **Purpose:** Enable HTML minification for production builds
- **Default:** `false`
- **Used by:** All commands
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

- **Asset Reference Tracking:** Only referenced assets are copied to output
- **Automatic `src/assets` Copying:** The `src/assets` directory is automatically copied to `dist/assets` if it exists, preserving folder structure
- **Additional File Copying:** Use `--copy` option to copy additional files with glob patterns
- **Underscore Prefix Convention:** Files and folders starting with `_` are non-emitting and only used for processing (partials, layouts, etc.)

### Include System

#### DOM Include

```html
<include src="/_includes/header.html"></include>
```

Resolution:

1. Leading `/` → from `src/` root.
2. Else → relative to including file.

#### Apache SSI

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

Slot/template injection applies to both HTML and Markdown files using standard web platform semantics.

#### Layout Authoring

Layouts must declare insertion points with standard `<slot>` elements (named and default). `<slot>` elements are kept in normal light DOM (not inside an actual shadow root) so that **their children render as fallback when a layout is opened directly in a browser** (outside Unify). This matches platform behavior: the `<slot>` element's children act as fallback when nothing is assigned. ([MDN: slot element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/slot), [JavaScript.info: Shadow DOM slots](https://javascript.info/slots-composition))

When a layout file is viewed directly in a browser (not processed by Unify), **named and unnamed `<slot>`s display their fallback children**. This relies on standard browser behavior for `<slot>` fallback content rendered outside of a shadow tree.

#### Page Projection Syntax

Pages may provide named projections using either:

- **`<template slot="name">`** (inert/hidden in raw page view; compiled by Unify)
- **Elements with `slot="name"`** (visible in raw page view)

**`<template slot="name">…</template>` behavior:**

- Hidden when the uncompiled page is opened in a browser (since `<template>` is inert and not rendered)
- Unify consumes `template.content` and injects it into `<slot name="name">`
- The `<template>` wrapper is removed from output (only its content appears where slotted)

**`<any-element slot="name">…</any-element>` behavior:**

- Visible in raw view (because it's not inside `<template>`)
- Unify moves that element's subtree into `<slot name="name">`
- The original element is removed from its original position in the compiled output and appears in the slot position

Reference: `slot` is a standard global attribute assigning nodes to a `<slot name="…">`; elements without a `slot` attribute map to the **unnamed** slot. ([MDN: slot global attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/slot))

#### Default Slot Semantics

Content without a `slot` attribute is assigned to the default `<slot>` in document order. If the layout has no default slot, Unify warns or errors based on configuration.

#### Fallback Content

If no page content is assigned to a given named slot, Unify **emits the fallback children of that `<slot>`** as the compiled output, preserving author order and whitespace. This mirrors standard slot fallback rules.

#### Processing Model

1. **Collect Layout**: Parse the layout DOM. If a `<template shadowrootmode>` exists (experimental), use its children as the slot tree; otherwise use the layout's top-level content.

2. **Collect Page Projections**: Build two maps:
   - **Named projections**: For each `<template slot="X">`, take `template.content` (fragment). For each non-template `[slot="X"]`, take the element node (subtree).
   - **Default projection**: all top-level nodes **without** a `slot` attribute.

3. **Assign & Compose** (mirror platform behavior):
   - For each `<slot name="X">` in the layout, append all assigned nodes for `X` in document order (multiple assignees allowed)
   - For the **unnamed** `<slot>`, append the default projection in document order
   - If a slot has **no assigned nodes**, output its **fallback children** as authored

4. **Node relocation semantics**:
   - `<template slot="X">`: remove the template after consuming its `content`; inject only the fragment
   - Non-template `[slot="X"]`: remove the original element from its source position and inject it in the slot's position

5. **Output**: Emit a single, flat HTML document with projected content in place of `<slot>` elements

#### Experimental: Declarative Shadow DOM Flavored Layouts

**Experimental:** Layouts may be authored with `<template shadowrootmode="…">` for familiarity with Declarative Shadow DOM. **Unify does not ship a shadow root**; it uses the template's children as the layout's slot tree during compilation. ([MDN: Using shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM), [web.dev: Declarative Shadow DOM](https://web.dev/articles/declarative-shadow-dom), [GitHub: declarative-shadow-dom](https://github.com/mfreed7/declarative-shadow-dom/blob/master/README.md))

```html
<template shadowrootmode="open">
  <!-- layout content with <slot> and fallback -->
  <slot name="sidebar">Default sidebar content</slot>
  <slot>Main content area</slot>
</template>
```

#### Validation & Warnings

- **Unmatched slot names** in pages: warn (configurable to error)
- **Multiple assignments** to the same slot: allowed; preserve document order (aligns with platform behavior)
- **Missing default slot** when page has un-slotted content: warn/error per config

**Example:**

```html
<!-- Page content -->
<template slot="sidebar">Sidebar content</template>
<aside slot="footer">Footer content (visible in raw view)</aside>
<main>Main content</main>
```

```html
<!-- Layout content -->
<body>
  <slot name="sidebar">Default sidebar fallback</slot>
  <slot>Default main content</slot>
  <slot name="footer">Default footer fallback</slot>
</body>
```

**Raw File Behavior:**

- **Open a page directly**: default content is visible; named slot content is hidden if authored inside `<template>`
- **Open a layout directly**: all slot fallback is visible, since `<slot>` outside a shadow tree displays its children

**Rationale:**

- This ensures component-based, reusable layouts for all page types, and matches developer expectations for slot/template behavior using web platform standards
- Override precedence is explicit and predictable
- Source order of assigned nodes is preserved for accessibility and meaningful reading order

### Overrides

**Layout override precedence:**

- For HTML files: `data-layout` attribute takes precedence over frontmatter and discovered layout chain.
- For Markdown files: frontmatter `layout` key takes precedence over discovered layout chain.
- If no override is found, the nearest layout is discovered by climbing the directory tree, then falling back to `_includes/_layout.html` if present.
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

### Build Performance

- Incremental builds for changed files only
- Smart dependency tracking to minimize rebuilds
- Asset copying only for referenced files
- Streaming file operations (no full-site memory loading)

### Development Server

- File change debouncing (100ms)
- Selective rebuild based on dependency analysis
- Efficient live reload via Server-Sent Events
- Memory-efficient file watching

### Scalability

- Handle projects with 1000+ pages
- Handle page that are over 5MB
- Efficient processing of large asset collections

## Migration Guide: Template Target to Slot Attributes

### Backward Compatibility

The legacy `<template target="…">` syntax has been removed in favor of standard web platform `slot` attributes.

### Migration Steps

Replace the old syntax:

```html
<template target="sidebar">…</template>
```

with either:

```html
<template slot="sidebar">…</template>  <!-- hidden in raw view -->
```

or:

```html
<aside slot="sidebar">…</aside>        <!-- visible in raw view -->
```

### Optional CLI Migration Tool

A future `unify migrate slots` command may be added to automatically rewrite `<template target="X">` → `<template slot="X">`.

## Compatibility Requirements

### Bun Support

- Minimum version: Bun 1.2.19
- ESM modules only
- Built-in test runner support
- Compiled to executable for deployment

### Cross-Platform

- Windows, macOS, Linux support
- Path handling respects OS conventions
- Line ending normalization

## Configuration

- No configuration required for layouts/components.
- Convention over configuration.

## Success Criteria


### Functional Requirements

- All three commands (build, serve, watch) work correctly
- Include system processes Apache SSI and DOM elements
- Markdown processing with frontmatter and layouts
- Live reload functionality in development server
- Sitemap generation for SEO
- Security validation prevents path traversal
- Error handling with helpful messages

### Performance

- Incremental builds complete in <1 second for single file changes
- Initial builds complete in <5 seconds for typical sites (<100 pages)
- Memory usage remains <100MB for typical projects
- File watching responds to changes within 200ms
- Can support files over 5MB

### Usability Requirements

- Zero configuration required for basic usage
- Clear error messages with actionable suggestions
- Intuitive CLI with helpful defaults
- Comprehensive help documentation

### Reliability Requirements

- Graceful handling of missing includes
- Robust error recovery during builds
- Cross-platform compatibility
