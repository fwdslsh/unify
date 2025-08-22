# GitHub Copilot Instructions for Unify CLI

## Project Overview
Unify CLI is a **Bun-native static site generator** that emphasizes Apache SSI-style includes and high-performance HTML processing. This project is built exclusively for the Bun runtime and leverages Bun's native APIs for optimal performance.

**ALWAYS reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

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

### Test Validation Process
**CRITICAL - Always reference `docs/app-spec.md` for failing tests:**
- When a newly created test fails, **first check `docs/app-spec.md`** to determine the expected behavior
- **If the code behavior does not match the spec**: Update the code implementation to comply with the specification
- **If the test assertions are incorrect**: Update the test assertions to match the documented specification
- The application specification in `docs/app-spec.md` is the authoritative source of truth for expected behavior
- Never modify both code and tests simultaneously without first confirming against the spec

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

## Working Effectively

### Bootstrap, Build, and Test the Repository

**CRITICAL - Install Bun Runtime First:**
```bash
# Install Bun (required - DO NOT use npm/node)
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc  # REQUIRED: Must source to update PATH
bun --version     # Verify installation (should show 1.2.0+)
```

**Dependencies and Setup:**
```bash
cd /path/to/unify
bun install      # Install dependencies (~6 seconds)
```

**Run Tests - NEVER CANCEL:**
```bash
# Run complete test suite - NEVER CANCEL, takes ~2 minutes
# Use timeout 180+ seconds minimum
bun test

# Expected: ~349 pass, 4 fail (CSS asset tracking - known issue)
# Time: ~2 minutes - NEVER CANCEL THIS COMMAND
```

**Build Commands:**
```bash
# Basic build (example project) - very fast (~18ms)
bun run build

# Advanced build scenario - also fast (~22ms)  
bun run build:advanced

# Build executable - fast (~65ms)
bun build --compile --outfile unify-test src/cli.js

# Docker build CLI image - NEVER CANCEL, takes ~10 minutes
# Use timeout 600+ seconds minimum
docker build -f docker/Dockerfile.cli -t unify-cli-test .
```

**Development Server:**
```bash
# Start dev server with live reload (port 3000)
bun run serve

# Or directly with CLI
bun run src/cli.js serve --port 3000
```

### CLI Usage Validation
```bash
# Test CLI commands
bun run src/cli.js --version    # Should show: unify v0.4.3
bun run src/cli.js --help       # Show all commands and options
bun run src/cli.js build --source example/src --output /tmp/test-output
```

## Validation Requirements

**ALWAYS manually validate any changes by running through complete scenarios:**

### Basic Build Validation
```bash
# 1. Clean build from example
bun run src/cli.js build --source example/src --output /tmp/validate-output

# 2. Check output structure
ls -la /tmp/validate-output/  # Should show: *.html, css/, sitemap.xml

# 3. Verify HTML content includes processing
head -20 /tmp/validate-output/index.html  # Should contain navbar, layout applied

# 4. Verify assets copied correctly
ls -la /tmp/validate-output/css/  # Should contain main.css if referenced
```

### Dev Server Live Reload Validation
```bash
# 1. Start server in background
bun run serve &

# 2. Verify server responds
curl http://localhost:3000/  # Should return HTML content

# 3. Test live reload by changing a file in example/src/ 
# and verify browser receives reload event

# 4. Stop server
pkill -f "bun run serve"
```

### Component and Include Processing Validation
```bash
# 1. Build advanced example with custom components
bun run build:advanced

# 2. Verify components processed and content includes applied
grep "navigation" example/advanced/dist/index.html  # Should contain navigation references

# 3. Verify build completed without errors
# Advanced example uses custom component directories, components may be copied
ls -la example/advanced/dist/  # Should show built pages and assets
```

## Critical Timing and Timeout Values

**NEVER CANCEL these commands - use these timeout values:**

- **bun test**: 180 seconds minimum (typically ~2 minutes)
- **Docker builds**: 600 seconds minimum (typically ~10 minutes) 
- **bun install**: 60 seconds (typically ~6 seconds)
- **Basic builds**: 30 seconds (typically <100ms)
- **Executable builds**: 60 seconds (typically ~65ms)

## Common Tasks and Outputs

### Repository Structure
```bash
# Key directories you'll work with frequently:
ls /home/runner/work/unify/unify/
# Output: bin/ src/ test/ example/ docs/ docker/ package.json README.md

# Main entry point
ls bin/
# Output: cli.js

# Source code organization  
ls src/
# Output: cli/ core/ server/ utils/

# Test structure
ls test/
# Output: unit/ integration/ security/ performance/ fixtures/
```

### Package.json Scripts
```json
{
  "scripts": {
    "test": "bun test",
    "build": "bun run src/cli.js build --source example/src --output example/dist",
    "serve": "bun run src/cli.js serve --source example/src --port 3000",
    "build:executable": "bun run scripts/build-executables.js"
  }
}
```

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
