# GitHub Copilot Instructions for Unify CLI

## Project Overview
Unify CLI is a **Bun-native static site generator** that emphasizes Apache SSI-style includes and high-performance HTML processing. This project is built exclusively for the Bun runtime and leverages Bun's native APIs for optimal performance.

## Vendor Documentation

Ensure that all code adheres to the vendor documentation provided in the `.vendor/` directory. This includes following best practices and utilizing Bun's built-in features effectively.

## Core Architecture

### Central Processing Pipeline
The build system follows a unified processing pipeline:
1. **Unified HTML Processor** (`src/core/unified-html-processor.js`) - Central entry point for all HTML processing
2. **Include Processor** (`src/core/include-processor.js`) - Handles Apache SSI-style includes with recursive processing
3. **Dependency Tracker** (`src/core/dependency-tracker.js`) - Bidirectional mapping for incremental builds
4. **Asset Tracker** (`src/core/asset-tracker.js`) - Tracks asset references across HTML and CSS files
5. **File Processor** (`src/core/file-processor.js`) - Orchestrates the complete build workflow

### Key Concepts

#### SSI Include System
- **Apache SSI Syntax**: `<!--#include file="header.html" -->` (relative to current file)
- **Virtual Includes**: `<!--#include virtual="/includes/nav.html" -->` (relative to source root)
- **Modern DOM Syntax**: `<include src="/.components/button.html" />` (alternative syntax)
- **Circular Dependency Detection**: Uses Set-based tracking with helpful error messages
- **Max Depth**: 10-level limit prevents runaway recursion

#### Layout & Templating System
- **Layout Attribute**: `<div data-layout="base.html">` specifies layout files
- **Slot System**: `<slot name="content">` for content injection
- **Template Targets**: `<template target="title">Page Title</template>` for metadata
- **Layout Resolution**: Supports both absolute paths and relative to `.layouts` directory

#### Asset Processing
- **Asset Reference Tracking**: Scans HTML/CSS for all asset references (images, styles, scripts, fonts)
- **Smart Copying**: Only copies assets that are actually referenced
- **CSS Deep Scanning**: Extracts asset references from CSS files (`url()`, `@font-face`, `@import`)
- **Component Asset Inlining**: Styles and scripts from components are inlined appropriately

#### Build Cache System
- **File Hashing**: Uses Bun's native crypto for fast file hashing
- **Dependency Caching**: Tracks dependencies for incremental rebuilds
- **Change Detection**: Compares file modification times and content hashes

### Bun-Specific Optimizations

#### Runtime Features
Always assume these Bun features are available:
- **HTMLRewriter**: Used for high-performance DOM processing
- **Bun.serve**: Native HTTP server for dev mode
- **fs.watch**: Native file watching for live reload
- **Crypto**: Native hashing for build cache

#### Performance Patterns
- **Async/Await Everywhere**: All file operations use async patterns
- **Concurrent Processing**: Asset copying and HTML processing run concurrently
- **Minimal Dependencies**: Leverages Bun's built-in APIs over external packages

## File Organization Patterns

### Source Structure Conventions
```
src/
├── index.html              # Main content pages
├── about.html
├── .components/            # Reusable components (NOT copied to output)
│   ├── header.html
│   └── button.html
├── .layouts/               # Layout templates (NOT copied to output)
│   ├── base.html
│   └── article.html
├── css/                    # Static assets (copied to output)
├── images/
└── js/
```

### Test Organization
- **Unit Tests**: `test/unit/` - Test individual components and utilities
- **Integration Tests**: `test/integration/` - Test complete workflows and interactions
- **Fixtures**: `test/fixtures/` - Reusable test data and helper functions
- **Temp Helpers**: All tests use `createTempDirectory()` and `cleanupTempDirectory()` patterns

## Development Patterns

### Error Handling
```javascript
// Use custom error types with helpful suggestions
import { IncludeNotFoundError, CircularDependencyError } from '../utils/errors.js';

throw new IncludeNotFoundError(includePath, filePath, [resolvedPath]);
```

### File Processing
```javascript
// Always use absolute paths for file operations
const resolvedPath = path.resolve(sourceRoot, relativePath);
await fs.readFile(resolvedPath, 'utf-8');
```

### Logging
```javascript
import { logger } from '../utils/logger.js';
logger.debug(`Processing HTML: ${path.relative(sourceRoot, filePath)}`);
```

### Testing Patterns
```javascript
// Standard test setup pattern
beforeEach(async () => {
  tempDir = await createTempDirectory();
  sourceDir = path.join(tempDir, 'src');
  outputDir = path.join(tempDir, 'dist');
});

afterEach(async () => {
  await cleanupTempDirectory(tempDir);
});
```

## Security Considerations

### Path Traversal Prevention
```javascript
// Always validate paths are within source root
const relativePath = path.relative(sourceRoot, resolvedPath);
if (relativePath.startsWith('../')) {
  throw new PathTraversalError(assetPath);
}
```

### Request Validation (Dev Server)
- Check for null bytes, excessive URL length
- Validate MIME types for security headers
- Implement early security checks before processing

## CLI Architecture

### Command Structure
- **Build Command**: `unify build --source src --output dist`
- **Serve Command**: `unify serve --port 3000 --live-reload`
- **Flag Patterns**: Support both long (`--source`) and short (`-s`) flags

### Exit Code Conventions
- `0`: Success
- `1`: Build errors (file not found, circular dependencies)
- `2`: CLI argument errors (unknown commands, invalid flags)

## Testing Guidelines

### Test Naming
- Integration tests: `component-assets.test.js`, `live-reload.test.js`
- Unit tests: `include-processor.test.js`, `asset-tracker.test.js`
- Feature tests: `bun-features.test.js`

### Fixture Patterns
```javascript
// Use createTestStructure for complex test setups
await createTestStructure(sourceDir, {
  'index.html': '<h1>Test</h1>',
  '.components/header.html': '<header>Site Header</header>',
  'css/main.css': 'body { margin: 0; }'
});
```

### Assertion Patterns
```javascript
// Check for content presence and structure
expect(result.includes('Site Header')).toBeTruthy();
expect(result.processed).toBe(2); // Number of files processed
expect(result.errors.length).toBe(0); // No build errors
```

## Performance Expectations

### Build Performance
- Large sites (1000+ pages): Should complete in < 30 seconds
- Include processing: < 10ms per include on average
- Asset copying: Only copy referenced assets
- Memory usage: Minimal through streaming and efficient data structures

### Dev Server Performance
- Live reload: < 100ms response time for file changes
- Security validation: Early request filtering
- Static file serving: Leverage Bun.serve for optimal performance

## Common Patterns

### Incremental Builds
```javascript
// Use dependency tracking for efficient rebuilds
const affectedPages = dependencyTracker.getAffectedPages(changedFile);
for (const page of affectedPages) {
  await processHtmlFile(page, sourceRoot, outputRoot, dependencyTracker, assetTracker);
}
```

### Component Processing
```javascript
// Components with assets are inlined appropriately
// Styles -> <head>, Scripts -> end of <body>
// For SSI includes: inline where included (Apache SSI behavior)
// For DOM includes: move to appropriate locations
```

### Build Configuration
```javascript
const DEFAULT_OPTIONS = {
  source: 'src',
  output: 'dist',
  components: '.components',
  layouts: '.layouts',
  clean: true,
  prettyUrls: false,
  baseUrl: 'https://example.com'
};
```

## Debugging Tips

### Common Issues
- **Build Cache Problems**: Clear cache when file dependencies aren't detected properly
- **Path Resolution**: Always use absolute paths, be careful with Windows path separators
- **Circular Dependencies**: The system detects these automatically with helpful error messages
- **Asset References**: Check both HTML and CSS files for asset references

### Logging Levels
- Use `logger.debug()` for detailed processing information
- Use `logger.warn()` for recoverable issues (missing optional includes)
- Use `logger.error()` for build-breaking problems

## Code Style

### Import Patterns
```javascript
// Use ES modules exclusively
import fs from 'fs/promises';
import { logger } from '../utils/logger.js';
import { processIncludes } from './include-processor.js';
```

### Async Patterns
```javascript
// Prefer async/await over promises
const content = await fs.readFile(filePath, 'utf-8');
const processed = await processIncludes(content, filePath, sourceRoot);
```

### Error Messages
- Include file paths in error messages
- Provide actionable suggestions when possible
- Use relative paths in user-facing messages for clarity

This project prioritizes **performance**, **security**, and **developer experience**. When contributing, focus on maintaining these principles while leveraging Bun's native capabilities for optimal performance.
