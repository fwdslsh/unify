# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**unify** (`@fwdslsh/unify` v0.6.0) - A Bun-native static site generator implementing the DOM Cascade specification for area-based composition. Produces framework-free HTML/CSS output with zero runtime dependencies.

## Development Commands

```bash
# Install dependencies (Bun >=1.2.0 required)
bun install

# Run tests - Test suite has 425+ tests with 93%+ coverage
bun test                                    # All tests with coverage (~3 minutes)
CLAUDECODE=1 bun test --coverage           # Coverage report (required for development)
bun test tests/unit                        # Unit tests only
bun test tests/integration                 # Integration tests only
bun test -t "pattern"                      # Match test name pattern
bun test tests/unit/core/html-rewriter-utils.test.js  # Single test file

# Build examples
bun run build                              # Build example/src → example/dist
bun run build:advanced                     # Advanced example with custom layouts
bun run example                            # Build and serve with pretty URLs

# Development server
bun run serve                              # Dev server with live reload (port 3000)  
bun run watch                              # Watch mode with auto-rebuild

# Create executables
bun run build:linux                        # Linux x64 binary
bun run build:macos                        # macOS ARM64 binary
bun run build:windows                      # Windows x64 binary

# Direct CLI usage
bun src/cli.js build --source src --output dist
bun src/cli.js serve --source src --port 3000
bun src/cli.js watch --source src --output dist
bun src/cli.js init                        # Initialize new project
```

## Core Architecture

### Processing Pipeline

```
Source Files → File Classifier → HTML Processor → Asset Tracker → Output
      ↓              ↓                ↓              ↓            ↓
   HTML/MD    Fragment Detection   DOM Cascade   Referenced Assets  dist/
      ↓              ↓                ↓              ↓
Dependency Map  Layout Discovery   Area Matching   Smart Copying
```

### DOM Cascade Implementation (v1)

The core composition system implementing the DOM Cascade specification:

1. **`data-unify` attribute**: Imports fragments/layouts into pages
2. **Area matching**: CSS class-based targeting (`.unify-hero`, `.unify-content`)
3. **Head merging**: Automatic deduplication and ordering of `<head>` elements
4. **Attribute merging**: Page attributes override layout (except IDs for stability)

### Key Processing Components

- **HTML Processor** (`src/core/html-processor.js`): Main orchestrator for DOM composition and processing
- **HTML Rewriter Utils** (`src/core/html-rewriter-utils.js`): Core DOM manipulation utilities (96% test coverage)
- **File Classifier** (`src/core/file-classifier.js`): Identifies fragments, layouts, and processing strategy
- **Path Validator** (`src/core/path-validator.js`): Security-focused path traversal prevention (100% test coverage)

### DOM Cascade Components (v1 Compliance)
- **Area Matcher** (`src/core/cascade/area-matcher.js`): Handles `.unify-*` class matching (100% test coverage)
- **Head Merger** (`src/core/cascade/head-merger.js`): Merges and deduplicates head elements (100% test coverage) 
- **Attribute Merger** (`src/core/cascade/attribute-merger.js`): Page-wins attribute merging (100% test coverage)
- **Landmark Matcher** (`src/core/cascade/landmark-matcher.js`): Fallback matching by semantic HTML5 elements
- **Ordered Fill Matcher** (`src/core/cascade/ordered-fill-matcher.js`): Sequential content placement fallback

### Supporting Systems
- **Dependency Tracker** (`src/core/dependency-tracker.js`): Bidirectional dependency mapping for incremental builds
- **Asset Tracker** (`src/core/asset-tracker.js`): Tracks and copies referenced assets intelligently
- **Markdown Processor** (`src/core/markdown-processor.js`): YAML frontmatter processing and head synthesis
- **File Watcher** (`src/core/file-watcher.js`): Bun's native fs.watch with intelligent rebuilds
- **Security Scanner** (`src/core/security-scanner.js`): Additional security validation layer

## CLI Options

### Build Options
- `-s, --source <path>`: Source directory (default: current)
- `-o, --output <path>`: Output directory (default: dist)
- `--clean`: Clean output directory before build
- `--minify`: Enable HTML minification
- `--pretty-urls`: Generate pretty URLs (page.html → page/index.html)
- `--fail-on <level>`: Set error level to fail build (error|warning|none)

### Development
- `-p, --port <port>`: Dev server port (default: 3000)
- `--host <host>`: Dev server host (default: localhost)
- `--verbose`: Enable verbose logging
- `--log-level <level>`: Set log level (debug|info|warn|error)

### Debug Environment Variables
- `DEBUG=1`: Show stack traces for errors
- `CLAUDECODE=1`: Claude Code environment flag
- `LOG_LEVEL=debug`: Verbose logging output

## DOM Cascade Specification Conformance

### Fragment & Layout Discovery
- **Fragments**: Files prefixed with `_` (e.g., `_header.html`)
- **Layouts**: Discovered via:
  1. `data-unify="/path/to/layout.html"` on `<html>` or `<body>`
  2. YAML frontmatter `layout: name` in Markdown
  3. Directory-based layouts (`_includes/`, `_layouts/`)

### Area Matching Rules
- **Public areas**: Classes prefixed with `unify-` (e.g., `.unify-hero`, `.unify-content`)
- **Scope isolation**: Matching never crosses component boundaries
- **Precedence**: Area class match → landmark fallback → ordered fill
- **Documentation**: `<style data-unify-docs="v1">` blocks document public areas

### Head Merging
- **Title**: Page wins over layout
- **Meta/Link deduplication**: By name/property/rel attributes
- **CSS order**: Layout → components → page (CSS cascade principle)
- **Script deduplication**: External by src, inline by content hash

## Testing Strategy

### Test Structure (425+ Tests, 93%+ Coverage)
```
tests/
├── unit/           # Core logic tests (comprehensive coverage)
│   ├── cli/        # CLI argument parsing
│   ├── core/       # Processing components (heavily tested)
│   │   ├── cascade/    # DOM Cascade components (100% coverage)
│   │   ├── html-rewriter-utils.test.js    # 109 tests (96% coverage)
│   │   ├── path-validator-security-gaps.test.js  # 46 security tests
│   │   └── errors.test.js                 # Error handling (100% coverage)
│   ├── security/   # Security validation (path traversal prevention)
│   └── utils/      # Utilities and logging
└── helpers/        # Test utilities and DOM helpers
```

### Test Environment & Coverage Standards
- **CLAUDECODE=1** environment flag required for test-specific behavior
- **93.67% function coverage / 91.74% line coverage** achieved
- Coverage reporting via lcov format in `.coverage/` directory  
- Comprehensive DOM Cascade v1 specification compliance validation
- Security-focused testing with attack vector simulation
- **All security components have 100% function coverage**

## Configuration

### Config File (`unify.config.yaml`)
```yaml
source: .
output: dist
clean: true
verbose: false
```

### CLI Overrides
All config file options can be overridden via CLI arguments.

## Security Considerations

- **Path traversal prevention**: Comprehensive security with `PathValidator` class (100% test coverage)
  - Blocks `../../../etc/passwd`, URL-encoded attacks, null byte injection
  - Cross-platform protection (Windows/Unix path separators)
  - Legitimate layout path patterns allowed (`_layouts/`, `_includes/`, etc.)
- **Circular import detection**: Max depth of 10 levels for layout resolution
- **Input sanitization**: CLI arguments and paths sanitized before processing
- **Restricted serving**: Dev server limited to output directory only
- **Security logging**: All security violations logged with `[SECURITY]` prefix for monitoring

## Architecture Decisions

### Why Bun?
- Native ES modules without transpilation
- Built-in test runner and bundler
- Fast file I/O and watch capabilities
- HTMLRewriter API for DOM manipulation
- Single runtime for entire toolchain

### Why DOM Cascade?
- Familiar CSS-like mental model (layers, specificity, cascade)
- Works in browser for preview without build step
- Clear composition semantics with predictable behavior
- Progressive enhancement approach

## Knowledge Base

- **Application specification**: `./docs/app-spec.md`
- **DOM Cascade specification**: `./docs/dom-spec.md` (normative reference)
- **Example implementations**: `./tests/fixtures/` (DOM Cascade compliant)
- **Working documents**: `./_notes/` (temporary files, drafts)

## Important Implementation Notes

- **Test Validation**: When tests fail, check `docs/app-spec.md` and `docs/dom-spec.md` for expected behavior
- **Specification Conformance**: DOM composition behavior MUST conform to DOM Cascade v1
- **Fragment Detection**: Uses `_` prefix convention and `data-unify` attributes
- **Asset Handling**: Automatic discovery and copying of referenced assets
- **Incremental Builds**: Dependency tracking enables fast rebuilds

## Code Quality Standards

- **Test Coverage Requirements**: Maintain 95%+ coverage for new code
- **Security Testing**: All file path operations must have comprehensive security tests
- **DOM Cascade Compliance**: All composition behavior must pass specification compliance tests
- **Error Handling**: All error classes must have 100% test coverage
- **Performance**: Test suite should complete in under 200ms for development efficiency

## Development Workflow

- **Before Implementation**: Check existing test patterns in `tests/unit/core/` for consistency
- **DOM Manipulation**: Use `HTMLRewriterUtils` class for all HTML processing operations
- **Path Operations**: Always use `PathValidator` for security validation
- **Error Handling**: Use appropriate error classes from `src/core/errors.js`
- **Testing**: Follow the comprehensive test patterns established in the codebase