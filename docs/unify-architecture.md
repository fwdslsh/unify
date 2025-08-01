# Unify Architecture

This document provides a detailed technical overview of the DOMpile static site generator implementation.

## Overview

DOMpile is a modern static site generator that processes HTML files with Apache SSI-style includes, markdown content, and provides live development features. It transforms templates with include statements into complete, standalone HTML files while offering incremental builds, asset tracking, and automatic sitemap generation.

## Core Design Principles

- **Minimal Dependencies**: Leverages Node.js built-in modules where possible

- **ESM-First**: Native ES module support for modern JavaScript environments

- **Cross-Platform**: Compatible with Node.js, Deno, and Bun

- **Multi-Format Support**: HTML, Markdown, and static assets

- **Apache SSI Compatible**: Uses familiar `<!--#include -->` syntax

- **Live Development**: Built-in dev server with live reload

- **SEO Optimized**: Automatic sitemap generation

## System Architecture

### Build Mode Architecture
```
Source Files → Include Processor → Static Files → Output
     ↓              ↓                 ↓           ↓
Dependencies → Dependency Tracker → File Processor → Assets → Complete Site
     ↓              ↓                 ↓              ↓           ↓
  Markdown → Markdown Processor → Layout System → Sitemap → sitemap.xml
```

### Development Mode Architecture  
```
Initial Build → File Watcher → Selective Rebuild → SSE Broadcast → Browser Reload
     ↓              ↓              ↓                 ↓              ↓
Dependency Tracker → Change Analysis → Targeted Updates → Live Reload Script
```

## Module Structure

### Core Modules

```
src/
├── cli/
│   └── args-parser.js       # Command-line argument parsing

├── core/
│   ├── include-processor.js   # HTML include expansion logic
│   ├── file-processor.js     # File system operations and build logic
│   ├── dependency-tracker.js # Include dependency mapping
│   ├── asset-tracker.js      # Asset reference tracking
│   ├── markdown-processor.js # Markdown processing with frontmatter
│   ├── file-watcher.js       # File watching and incremental builds
│   └── sitemap-generator.js  # XML sitemap generation

├── server/
│   ├── dev-server.js         # Development HTTP server

├── utils/
│   ├── path-resolver.js      # Path resolution utilities
│   ├── logger.js             # Logging utilities
│   └── errors.js             # Custom error classes

├── bin/
│   └── cli.js               # Main CLI entry point
```

## Core Processing Flow

### Include Processing (`src/core/include-processor.js`)
- Regex-based SSI directive parsing: `/<!--#include\s+(virtual|file)="([^"]+)"\s*-->/gi`
- **File includes**: `<!--#include file="header.html" -->` (relative to current file)
- **Virtual includes**: `<!--#include virtual="/includes/nav.html" -->` (relative to source root)
- Recursive processing with circular dependency detection using Set-based tracking
- 10-level depth limit prevents runaway recursion
- Security: Path traversal prevention, files must be within source tree

### Dependency Tracking (`src/core/dependency-tracker.js`)
- Bidirectional mapping: `includesInPage` (page → includes) and `pagesByInclude` (include → pages)
- Change impact analysis: when partial changes, rebuild only dependent pages
- Handles nested dependencies: if A includes B and B includes C, change to C rebuilds pages using A

### Markdown Processing (`src/core/markdown-processor.js`)
- Uses markdown-it for HTML conversion with gray-matter for frontmatter
- Template-based layout system with variable substitution
- Automatic table of contents generation from headings
- Anchor link generation for all headings (h1-h6)
- Include processing support within markdown content

### Asset Tracking (`src/core/asset-tracker.js`)
- Tracks asset references in HTML content using regex patterns
- Only copies assets that are actually referenced in processed content
- Supports CSS, JS, images, fonts, and other media types
- Prevents copying unused assets to output directory

### Sitemap Generation (`src/core/sitemap-generator.js`)
- Automatic XML sitemap generation following sitemaps.org standards
- URL extraction from all processed HTML and markdown files
- SEO metadata support: priority, changefreq, lastmod
- Pretty URL support for markdown files
- Frontmatter integration for custom sitemap settings

## Development Server Components

### File Watching (`src/core/file-watcher.js`)
- Chokidar-based with debouncing (100ms delay)
- Selective rebuild logic: 
  - Main page change → rebuild that page only
  - Partial change → rebuild all dependent pages via dependency tracker
  - Asset change → copy file to output
- Ignores: output directory, node_modules, .git, hidden files

### Live Reload (`src/server/live-reload.js`)
- Server-Sent Events on `/__events` endpoint
- Script injection only during development (not in static build output)
- Connection management with cleanup on client disconnect
- Broadcasts reload reason for debugging

### HTTP Server (`src/server/dev-server.js`)
- Node.js built-in HTTP module, no external server dependencies
- Static file serving with MIME type detection
- Security: path traversal prevention, files must be within output directory
- Directory listings for debugging
- Graceful shutdown handling

## CLI Commands and Options

### Supported Commands

- `build`: Generate static site from source files
- `watch`: Watch files and rebuild on changes (legacy)
- `serve`: Start development server with live reload

### Command Options

- `--source, -s`: Source directory (default: src)
- `--output, -o`: Output directory (default: dist)
- `--layouts, -l`: Layouts directory (default: .layouts, relative to source)
- `--components, -c`: Components directory (default: .components, relative to source)
- `--port, -p`: Server port for serve command (default: 3000)
- `--host`: Server host for serve command (default: localhost)
- `--pretty-urls`: Generate pretty URLs (about.md → about/index.html)
- `--base-url`: Base URL for sitemap.xml generation (default: https://example.com)
- `--clean`: Clean output directory before build
- `--no-sitemap`: Disable sitemap.xml generation

## Performance & Optimization

### Build Performance
- **Incremental builds**: Only rebuild files that have changed or are affected by changes
- **Smart asset copying**: Only copy assets that are referenced in content
- **Dependency tracking**: Efficient change impact analysis
- **Parallel processing capability**: Single-threaded currently, but architecture supports parallelization

### Memory Efficiency
- **Streaming operations**: No full-site loading into memory
- **Selective processing**: Process only what's needed during incremental builds
- **Asset reference tracking**: Prevents unnecessary file operations

## Security Features

### Path Traversal Prevention
- `isPathWithinDirectory()` validates all file paths against source/output boundaries
- Prevents `../` escapes from source directory
- CLI argument validation prevents injection attacks
- File serving restricted to output directory only

### Content Security
- HTML output is not sanitized (assumes trusted input)
- No client-side template execution
- Static output eliminates many web vulnerabilities

## Testing Architecture

### Test Coverage
- **Unit tests**: Core processing logic with temp file fixtures
- **Integration tests**: Complete build workflows
- **Security tests**: Path traversal and validation
- **CLI tests**: Argument parsing and command execution

### Test Organization
```
test/
├── unit/
│   ├── include-processor.test.js
│   ├── args-parser.test.js
│   └── path-resolver.test.js
├── integration/
│   ├── build-process.test.js
│   └── cli.test.js
└── fixtures/
    └── sample-sites/
```

## Error Handling Strategy

### Custom Error Classes
- `FileSystemError`: File operation failures with context
- `BuildError`: Build process failures with file locations  
- `PathTraversalError`: Security violations
- `CircularDependencyError`: Include cycle detection

### Graceful Degradation
- Missing includes become error comments in output
- Build continues on non-fatal errors with warnings
- Clear error messages with file paths and suggested fixes

## Future Architecture (v0.5+)

### DOM Mode Processor (Planned)
- Modern `<template>` and `<slot>` syntax
- Component-based architecture
- Template inheritance with `<template extends="...">`
- Data binding with frontmatter integration

### Enhanced SEO Features (Planned)
- Canonical URL generation and link rewriting
- Open Graph meta tag automation
- JSON-LD structured data support
- Dead link detection and reporting

## Dependencies

### Runtime Dependencies
- **chokidar**: Cross-platform file watching (single dependency)
- **markdown-it**: Markdown processing
- **gray-matter**: YAML frontmatter parsing

### Zero Client Dependencies
- Generated sites require no JavaScript frameworks
- Pure HTML/CSS output
- Optional live reload script only during development

## Cross-Platform Compatibility

### Node.js Support
- **Minimum Version**: Node.js 14+ (stable ESM support)
- **Built-in Modules**: `fs/promises`, `path`, `http`, `url`
- **No transpilation**: Direct ES module execution

### Alternative Runtime Support
- **Bun**: High Node.js API compatibility, faster execution
- **Deno**: Works with Node.js compatibility layer and explicit permissions

## Conclusion

DOMpile's architecture delivers a powerful yet simple static site generator that scales from small projects to large sites. The modular design, incremental build system, and live development features provide an excellent developer experience while generating fast, SEO-optimized static websites.

Key architectural strengths:
- **Performance**: Incremental builds and smart asset tracking
- **Developer Experience**: Live reload and comprehensive error handling  
- **SEO**: Automatic sitemap generation
- **Flexibility**: Multiple content formats with consistent processing
- **Security**: Path traversal prevention and input validation
- **Maintainability**: Clear module separation and comprehensive testing