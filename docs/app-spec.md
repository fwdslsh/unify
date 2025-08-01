# Unify Static Site Generator - Complete Application Specification

## Overview

Unify is a modern, lightweight static site generator designed for frontend developers who want to build maintainable static sites with component-based architecture. It uses familiar Apache SSI syntax and modern HTML templating to eliminate the need to copy and paste headers, footers, and navigation across multiple pages.

## Target Users

- Frontend developers familiar with HTML, CSS, and basic web development
- Content creators who need a simple static site generator
- Developers who want framework-free, pure HTML/CSS output
- Teams needing component-based architecture without JavaScript frameworks

## Core Functionality

### Primary Purpose

Transform source HTML/Markdown files with includes, and layouts into a complete static website ready for deployment.

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

**`--layouts, -l <directory>`**

- **Purpose:** Specify layouts directory (relative to source or absolute path)
- **Default:** `.layouts`
- **Used by:** All commands
- **Note:** Must be relative to source directory or absolute path with read access. Does not get copied to output directory.

**`--components, -c <directory>`**

- **Purpose:** Specify components directory (relative to source or absolute path)
- **Default:** `.components`
- **Used by:** All commands
- **Note:** Must be relative to source directory or absolute path with read access. Does not get copied to output directory.

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

### File Types Handled

#### HTML Files (`.html`)

- **Processing:** Include resolution, layout application, asset tracking
- **Output:** Processed HTML with includes resolved
- **Components:** Files in `.components/` directory are treated as partials (not directly copied to output)
- **Layout Support:** Automatic layout or based on `data-layout` property on the pages root element

#### Markdown Files (`.md`)

- **Processing:** YAML frontmatter extraction, Markdown to HTML conversion with table support and code highlighting,  include resolution, layout application, DOM templating if HTML is included in file
- **Output:** HTML files with same name
- **Layout Support:** Automatic layout or based on frontmatter `layout` property

#### Static Assets

- **Types:** CSS, JS, images, fonts, etc.
- **Processing:** Asset tracking, referenced assets only, copied as-is without modification
- **Output:** Copied to output directory maintaining relative paths

### Include System

#### Apache SSI-Style Comments

**Virtual Includes:**

```html
<!--#include virtual="/path/from/source/root.html" -->
```

- Path relative to source directory root (cannot traverse past src root)
- Leading `/` optional but recommended
- Case-sensitive

**File Includes:**

```html
<!--#include file="relative/path/from/current/file.html" -->
```

- Path relative to current file's directory
- Supports `../` for parent directories
- Case-sensitive
- Not recommended

#### DOM Elements (Advanced)

**Include Element:**

```html
<include src="/components/header.html"></include>
```

- Path relative to source directory root (cannot traverse past src root)
- Leading `/` optional but recommended
- Case-insensitive

**Slot Element:**

```html
<slot name="content">Default content here</slot>
```

- Added to layout files as content placeholders
  - Each layout is required to have exactly one unnamed slot that works as the primary content placeholder
- Slot can optionally provide default content
- Slot can optionally provide a name attribute
  - Pages can override the content by providing templates that target the slot

**Template Element:**

```html
<template target="content">
  <p>
    Content to replace the default
  </p>
</template>
```

- Contained in pages to provide content to layout slots
- No template element is needed on the page to provide content to the layout's default slot

### Layout System

#### Page Files

- Located in the source directory (defaults: `src`)
- Can be HTML or Markdown files
- HTML files should contain one root content element
  - This element can be any valid HTML element (ie: `<div>`, `<article>`, `<section>`, etc.)
  - This element can provide a `data-layout` attribute to specify a layout
  - This element _can_ be a template element with no target attribute to denote it replaces the layout's default slot
- Markdown files can include frontmatter to specify a layout
- Pages may contain any number of  `<include>`, `<script>`, `<style>`, or `<template>` tags in their root
  - May contain only one `<template>` element without a `target` attribute per page

#### Layout Files

- Located in layouts directory (default: `.layouts/`)
- Standard HTML with one or more slots
- Main content slot should be unnamed and is replaced by the page contents
- When specifying the path to a layout:
  - If path starts with `/` it is resolved as relative to the source folder.
  - If it does not start with `/` it is relative to the layouts folder.
  - File extension is optional, assumed to be html.

#### Layout Application

- If a `default.html` file exists in the layouts directory, it is automatically applied to all pages, unless they already contain an `<html>` element in their content or the specify a different layout to use.
- HTML pages can use a `data-layout="custom"` attribute
- Markdown pages can specify `layout: custom` frontmatter property to specify a layout

### Dependency Tracking

- Bidirectional mapping: pages ↔ includes
- Change impact analysis for incremental builds
- Circular dependency detection (10-level depth limit)
- Smart rebuilding of affected files only
- Live reload with full page refresh for all file changes (CSS-only reloads not supported)

### Component Asset Processing

Currently, both SSI-style includes (`<!--#include -->`) and DOM-style includes (`<include>`) inline component content as-is without extracting or relocating `<style>` and `<script>` elements. Component styles and scripts remain embedded within the component content at the location where they are included.

#### Current Behavior

**Example Component** (`/.components/button.html`):

```html
<style>
  .btn { background: blue; color: white; }
</style>
<button class="btn">Click Me</button>
```

**Page with SSI Include:**

```html
<div>
  <!--#include virtual="/.components/button.html" -->
</div>
```

**Final Output:**

```html
<div>
  <style>
    .btn { background: blue; color: white; }
  </style>
  <button class="btn">Click Me</button>
</div>
```

**Note:** The style remains inline within the component content, not moved to the `<head>` section.

#### Planned Enhancement

Future versions may include automatic extraction and relocation of component assets:

- **Style Elements:** When using an `<include />` element, extracted from components and moved to `<head>` section
- **Script Elements:** When using an `<include />` element, extracted from components and moved to end of `<body>` section  
- **Deduplication:** Identical style/script blocks deduplicated when same component included multiple times
- **Component Isolation:** Components remain self-contained with their styling using CSS scoping

### Live Reload System

The development server provides live reload functionality that automatically refreshes the browser when source files change.

#### Reload Triggers

- **Page Files:** Changes to `.html` and `.md` files trigger full page reload
- **Component Files:** Changes to files in the components directory trigger full page reload
- **Layout Files:** Changes to files in the layouts directory trigger full page reload
- **Asset Files:** Changes to CSS, JavaScript, and other static assets trigger full page reload
- **Include Dependencies:** Changes to any file that is included by another file trigger full rebuild of dependent pages with updated content

#### File Addition and Deletion Handling

The watch system properly handles file lifecycle events:

**File Additions:**

- **New Content Files:** Newly created `.html` and `.md` files are detected and built into the output directory
- **New Component Files:** Newly created component files trigger rebuilds of any pages that reference them (even if they had missing include errors before)
- **New Asset Files:** Newly added CSS, JS, images, and other assets are detected, analyzed for references, and copied to output if referenced by any page
- **Directory Creation:** Files added to newly created directories are properly detected and processed

**File Deletions:**

- **Content File Removal:** Deleted `.html` and `.md` files are removed from the output directory
- **Component File Removal:** Deleted component files trigger rebuilds of dependent pages, which will show "Include not found" messages
- **Asset File Removal:** Deleted assets are removed from the output directory
- **Dependency Cleanup:** All tracking data for deleted files is properly cleaned up

**Rapid Changes:** The system handles rapid sequences of file additions and deletions without losing events, using debounced processing to batch changes efficiently.

#### Rebuild Guarantees

When component or include files change during development:

1. **Dependency Detection:** The build system tracks which pages depend on which includes
2. **Complete Rebuild:** Dependent pages are fully rebuilt from source, ensuring all includes are re-processed
3. **Content Synchronization:** The final HTML output reflects the latest version of all included content
4. **Browser Notification:** After successful rebuild, all connected browsers receive reload notifications

**Critical Requirement:** Component changes must result in complete page reconstruction, not just cache invalidation. The served HTML must contain the updated component content before the browser reload is triggered.

#### Technical Implementation

- **Server-Sent Events (SSE):** Live reload uses SSE for efficient real-time communication
- **File Watching:** Native file system watching with recursive directory monitoring
- **Incremental Builds:** Only changed files and their dependencies are rebuilt
- **Broadcast System:** All connected browser instances receive reload notifications
- **Endpoint:** Live reload endpoint available at `/__live-reload`

#### Browser Integration

- **Automatic Injection:** Live reload client script is automatically injected into served HTML pages
- **Connection Management:** Robust reconnection handling for interrupted connections
- **Visual Feedback:** Console logging of connection status and reload events

## Error Handling and Exit Codes

### Exit Codes

- **0:** Success
- **1:** Recoverable errors (missing includes, validation warnings)
- **2:** Fatal errors (invalid arguments, file system errors)

### Error Types

#### Validation Errors

- Invalid CLI arguments
- Port out of range (1-65535)
- Unknown commands or options
- **Behavior:** Display error with suggestions, exit code 1

#### File System Errors

- Source directory doesn't exist
- Permission denied
- Path traversal attempts
- **Behavior:** Display error with context, exit code 2

#### Build Errors

- Circular dependencies
- Include file not found
- Layout processing failures
- **Behavior:** Default to continuing build of other files when one fails, unless `--perfection` flag is used
- **Recovery:** Failed includes become error comments in output, build continues
- **Build Process:** Builds occur in temporary location and are copied to output directory once completed

#### Security Errors

- Path traversal attempts (`../../../etc/passwd`)
- Access outside source boundaries
- **Behavior:** Immediate failure, exit code 2

### Error Output Format

- Should contain the error message and one or more suggestions.

```
Error: {error message}

Suggestions:
  * {suggestion 1}
  ... 
```

### Debug Mode

- Activated via `UNIFY_DEBUG` environment variable or `--verbose` CLI argument
- Shows stack traces for all errors
- Detailed file processing logs

## Output and Logging

### Standard Output

#### Build Command

```
unify v{version}

Building static site...
- Processed 15 files
- Generated sitemap.xml with 8 pages
- Copied 12 assets
Build completed successfully! (1.2s)
```

#### Serve Command

```
unify v{version}

Building static site...
- Build completed successfully!
🚀 Development server started
📁 Serving: /path/to/output
🌐 Local: http://localhost:3000
- Live reload: enabled
```

#### Watch Command

```
unify v{version}

Starting file watcher...
Building static site...
- Processed 15 files
- Generated sitemap.xml with 8 pages
- Copied 12 assets
Build completed successfully! (1.2s)
- Initial build completed
- Watching for changes...
- Changed: src/index.html
- Rebuilding...
- Rebuild completed (0.3s)
```

### Logging Levels

- **Debug:** Debug messages
- **Info:** General status messages
- **Success:** Successful operations
- **Warning:** Non-fatal issues
- **Error:** Fatal problems

## Security Requirements

### Path Validation

- All file operations must be within source directory boundaries, except absolute paths for includes
- Path traversal prevention for all user inputs
- Validation function: `isPathWithinDirectory()` if it is not, it should validate the the user has read access to the specified directory.
- Absolute paths that resolve outside of the source directory should produce a warning in the build output.

### Input Sanitization

- CLI arguments validated against expected patterns
- File paths normalized before processing
- No injection vulnerabilities in template processing

### Output Security

- Static HTML/CSS/JS output only
- No client-side template execution
- No server-side code generation

### Development Server Security

- Serves only files from output directory
- MIME type validation
- Request path validation
- No directory traversal in URLs

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
- Minimal memory footprint during builds

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

### Default Behavior

- No configuration files required
- Convention over configuration
- Sensible defaults for all options

### Directory Structure Conventions

```
project/
├── src/                    # Source files (--source)
│   ├── .components/        # Reusable components (--components)
│   ├── .layouts/           # Page layouts (--layouts)
│   ├── index.html          # Page files
│   ├── about.md            # Markdown content
│   └── assets/             # Static assets
└── dist/                   # Output directory (--output)
```

### File Naming Conventions

- Layouts: Located in `.layouts/` directory
- Components: Located in `.components/` directory
- Pages: All other `.html` and `.md` files located under `src`

## Integration Points

### Package Managers

- npm global installation: `npm install -g @unify/cli`
- npx usage: `npx @unify/cli`
- Package registry: `@unify/cli`

### Development Tools

- VS Code extension support
- Docker container support
- CI/CD pipeline integration
- Vite HTML preprocessor integration (experimental, may be moved to separate project)

### Deployment

- Static hosting (Netlify, Vercel, GitHub Pages)
- CDN deployment
- Traditional web servers

## Success Criteria

### Functional Requirements

- - All three commands (build, serve, watch) work correctly
- - Include system processes Apache SSI and DOM elements
- - Markdown processing with frontmatter and layouts
- - Live reload functionality in development server
- - Sitemap generation for SEO
- - Security validation prevents path traversal
- - Error handling with helpful messages

### Performance

- - Incremental builds complete in <1 second for single file changes
- - Initial builds complete in <5 seconds for typical sites (<100 pages)
- - Memory usage remains <100MB for typical projects
- - File watching responds to changes within 200ms
- - Can support files over 5MB

### Usability Requirements

- - Zero configuration required for basic usage
- - Clear error messages with actionable suggestions
- - Intuitive CLI with helpful defaults
- - Comprehensive help documentation

### Reliability Requirements

- - Graceful handling of missing includes
- - Robust error recovery during builds
- - Cross-platform compatibility
