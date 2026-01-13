---
title: unify build Command - unify Documentation
description: Complete reference for the unify build command including all options, flags, examples, and advanced usage patterns for building static sites.
---

# `unify build` Command

The `unify build` command transforms your source files into a production-ready static website. It processes HTML and Markdown files, applies layouts and components using DOM Cascade, handles assets, and outputs a complete site ready for deployment.

> **📋 Command Overview**
>
> `build` is the default command - you can run `unify` without any arguments to build your site.

## Basic Usage

```bash
# Default build (source: src/, output: dist/)
unify build
unify              # Same as 'unify build'

# Custom directories
unify build --source content --output public
unify build -s src -o dist

# Clean build
unify build --clean
```

## Command Syntax

```bash
unify [build] [options]
```

### Default Behavior

- **Source directory:** `src/` (or current directory if no src/ exists)
- **Output directory:** `dist/`
- **File discovery:** Processes all HTML and Markdown files
- **Asset copying:** Copies `assets/**` automatically
- **Layout discovery:** Automatically applies layouts

## Directory Options

### `--source, -s <directory>`

Specify the source directory containing your site files.

```bash
# Use different source directory
unify build --source content
unify build -s website

# Absolute path
unify build --source /home/user/mysite/src
```

> **⚠️ Directory Validation**
>
> The source directory must exist and be readable. Unify will exit with an error if the directory is not found.

### `--output, -o <directory>`

Specify the output directory for generated files.

```bash
# Custom output directory
unify build --output public
unify build -o build

# Multiple builds to different outputs
unify build -o dist/staging
unify build -o dist/production --minify
```

## File Processing Options

### `--copy <glob>` (repeatable)

Add files to the copy set using glob patterns. Use this for additional files beyond automatic asset detection.

```bash
# Copy specific file types
unify build --copy "docs/**/*.pdf" --copy "config/*.json"

# Copy entire directories
unify build --copy "public/**" --copy "downloads/**"

# Complex patterns
unify build --copy "**/*.{txt,xml,ico}"
```

### `--ignore <glob>` (repeatable)

Ignore paths for both rendering and copying using ripgrep-style glob patterns.

```bash
# Ignore draft content
unify build --ignore "**/drafts/**" --ignore "**/*.draft.md"

# Ignore by file type
unify build --ignore "**/*.{tmp,log,cache}"

# Negation patterns (include exceptions)
unify build --ignore "temp/**" --ignore "!temp/keep/**"
```

### `--ignore-render <glob>` (repeatable)

Ignore paths only in the rendering pipeline - files may still be copied if they match copy rules.

```bash
# Don't render raw data files, but allow copying
unify build --ignore-render "data/**/*.json" --copy "data/**/*.json"
```

### `--ignore-copy <glob>` (repeatable)

Ignore paths only in the copy pipeline - files may still be rendered if they're renderable.

```bash
# Render source files but don't copy them
unify build --ignore-copy "src/**/*.md"
```

### `--render <glob>` (repeatable)

Force rendering of matching files even if they're normally ignored.

```bash
# Render experimental content
unify build --render "experiments/**"

# Override .gitignore for specific files
unify build --render "hidden/**/*.html"
```

## Layout Options

### `--default-layout <value>` (repeatable)

Set default layouts for files matching glob patterns or globally.

#### Global Layout

```bash
# Set global fallback layout
unify build --default-layout "_base.html"
unify build --default-layout "layouts/site.html"
```

#### Pattern-Based Layouts

```bash
# Blog posts use blog layout
unify build --default-layout "blog/**=_post.html"

# Docs use docs layout
unify build --default-layout "docs/**=_docs.html"

# Multiple patterns (later takes precedence)
unify build \
  --default-layout "_base.html" \
  --default-layout "blog/**=_post.html" \
  --default-layout "docs/**=_docs.html"
```

### Layout Resolution Order

1. **Page-declared layout** (frontmatter `layout` or `data-unify`)
2. **Last matching `--default-layout` pattern**
3. **Global `--default-layout` filename**
4. **Auto-discovery:** `_layout.html` in directory tree
5. **Fallback:** `_includes/layout.html`
6. **No layout:** Basic HTML5 wrapper

## Build Behavior Options

### `--clean`

Clean the output directory before building.

```bash
# Remove existing output files
unify build --clean

# Useful for CI/CD to ensure clean builds
unify build --clean --minify
```

### `--pretty-urls`

Generate pretty URLs by creating directory structures.

```bash
# Enable pretty URLs
unify build --pretty-urls

# about.html becomes about/index.html
# blog.html becomes blog/index.html
```

#### Pretty URL Transformations

- `about.html` → `about/index.html`
- `contact.html` → `contact/index.html`
- `index.html` → `index.html` (unchanged)
- Links are automatically normalized: `./about.html` → `/about/`

### `--minify`

Enable HTML minification for production builds.

```bash
# Production build with minification
unify build --minify

# Combined with other production flags
unify build --clean --minify --pretty-urls
```

## Quality Control Options

### `--fail-level <level>`

Fail the build if errors of the specified level or higher occur.

```bash
# Fail on any warning or error
unify build --fail-level warning

# Fail only on errors (not warnings)
unify build --fail-level error
```

#### Available Levels

- **`warning`:** Fail on warnings and errors
- **`error`:** Fail only on errors

### `--fail-on <types>`

Fail build on specific issue types (comma-separated).

```bash
# Fail on security issues
unify build --fail-on security

# Fail on specific linter rules
unify build --fail-on U001,U002,U004

# Fail on multiple issue types
unify build --fail-on security,warning,U002
```

#### Available Issue Types

- **`security`:** Security warnings (XSS, content injection, etc.)
- **`warning`:** All warning-level issues
- **`error`:** All error-level issues
- **DOM Cascade linter rules:** `U001`, `U002`, `U003`, `U004`, `U005`, `U006`, `U008`

> **🔒 CI/CD Security**
>
> Always use `--fail-on security` in production CI/CD pipelines to prevent deployment of potentially vulnerable sites.

## Control Options

### `--auto-ignore <boolean>`

Control automatic ignoring of referenced layouts, components, and `.gitignore` files.

```bash
# Disable automatic ignoring
unify build --auto-ignore=false

# Manual control (when auto-ignore is false)
unify build --auto-ignore=false --ignore="_*" --ignore=".*"
```

#### When `auto-ignore=true` (default)

- Files referenced as layouts are ignored
- Files referenced as components/includes are ignored
- `.gitignore` patterns are respected

### `--dry-run`

Show what would be built without actually building.

```bash
# Preview build decisions
unify build --dry-run

# Debug file classification
unify build --dry-run --log-level debug
```

#### Dry Run Output Example

```
[EMIT]    src/index.html
          reason: renderable(html); layout=_layout.html
[EMIT]    src/blog/post.md  
          reason: renderable(md); layout=blog/_post.html
[COPY]    assets/images/hero.jpg
          reason: referenced in src/index.html
[COPY]    assets/css/styles.css
          reason: implicit assets/**

# Debug-level output (with --log-level debug)
[SKIP]    src/.DS_Store
          reason: non-renderable(.DS_Store)
[IGNORED] src/_layout.html
          reason: auto-ignore (used as layout)
```

## Global Options

### `--log-level <level>`

Set logging verbosity for build output.

```bash
# Quiet build (errors only)
unify build --log-level error

# Verbose build details
unify build --log-level debug

# Trace every operation (very verbose)
unify build --log-level trace
```

#### Available Levels

- **`error`:** Only errors
- **`warn`:** Warnings and errors
- **`info`:** General information (default)
- **`debug`:** Detailed debugging information
- **`trace`:** Extremely verbose tracing

## Common Usage Patterns

### Development Builds

```bash
# Quick development build
unify build

# Development with clean slate
unify build --clean

# Debug build issues
unify build --dry-run --log-level debug
```

### Production Builds

```bash
# Basic production build
unify build --clean --minify --pretty-urls

# Secure production build for CI/CD
unify build --clean --minify --pretty-urls --fail-on security

# Strict production build
unify build \
  --clean \
  --minify \
  --pretty-urls \
  --fail-on security,warning
```

### Content Management Workflows

```bash
# Blog build with drafts excluded
unify build --ignore "**/drafts/**" --default-layout "blog/**=_post.html"

# Documentation build
unify build \
  --default-layout "_docs.html" \
  --default-layout "api/**=_api.html" \
  --copy "docs/**/*.{pdf,zip}"

# Multi-site build
unify build --source sites/main --output dist/main
unify build --source sites/blog --output dist/blog
```

### Asset Management

```bash
# Copy additional assets
unify build --copy "public/**" --copy "downloads/**/*.pdf"

# Exclude development assets
unify build --ignore-copy "assets/src/**" --copy "assets/dist/**"

# Force include hidden files
unify build --render "experiments/**" --copy "config/.env.example"
```

## Build Process Details

### Build Workflow

1. **Directory validation:** Verify source and output directories
2. **File discovery:** Scan source directory for all files
3. **Classification:** Determine render vs copy for each file
4. **Dependency tracking:** Build layout and component dependency graph
5. **Processing:** Render HTML/Markdown files with DOM Cascade
6. **Asset copying:** Copy referenced and specified assets
7. **Output generation:** Write processed files to output directory
8. **Summary reporting:** Display build statistics and timing

### File Classification Logic

1. **Check renderability:** `.html`, `.md` files are renderable
2. **Apply explicit overrides:** `--render` forces EMIT
3. **Apply ignore rules:** Check `--ignore*` patterns and `.gitignore`
4. **Apply defaults:** Renderables → EMIT, assets → COPY
5. **Resolve conflicts:** If both renderable and copyable, render wins

## Performance Considerations

### Build Cache

Unify uses an intelligent build cache to speed up subsequent builds:

- **Cache location:** `.unify-cache/` directory
- **Hash-based:** SHA-256 file hashes for change detection
- **Dependency tracking:** Rebuilds dependents when includes change
- **Automatic management:** Cache is updated during builds

### Optimization Tips

- **Use specific glob patterns:** Avoid overly broad patterns like `**/*`
- **Leverage the cache:** Don't clean unnecessarily during development
- **Minimize ignored files:** Large ignore lists can slow file discovery
- **Profile with debug logging:** Use `--log-level debug` to identify bottlenecks

## Exit Codes

| Code | Meaning | Description |
|------|---------|-------------|
| `0` | Success | Build completed successfully |
| `1` | Build Error | Recoverable errors or failed quality checks |
| `2` | Usage Error | Invalid command line arguments or configuration |

## Error Handling

### Common Build Errors

#### Missing Source Directory
```
Error: Source directory 'src' does not exist
Solution: Create the directory or specify --source with existing directory
```

#### Layout Not Found
```
Warning: Layout '_blog.html' not found for 'post.md'
Solution: Create the layout file or adjust layout references
```

#### Circular Dependencies
```
Error: Circular import detected: layout.html → blog.html → layout.html
Solution: Refactor layouts to break the circular dependency
```

### Security Warnings
```
[SECURITY] XSS Risk: Event handler detected in <meta> tag (src/page.html:15)
[SECURITY] JavaScript URL: Potential XSS vector in href attribute (src/nav.html:8)
```

## Environment Variables

- **`DEBUG=1`:** Show stack traces for errors
- **`CLAUDECODE=1`:** Claude Code environment flag
- **`LOG_LEVEL=debug`:** Override log level via environment

> **⚠️ Common Pitfalls**
>
> - **Overly broad patterns:** `--copy "**/*"` can cause performance issues
> - **Pattern order matters:** Later flags override earlier ones
> - **Missing quotation marks:** Always quote glob patterns with special characters
> - **Path separators:** Use forward slashes in patterns on all platforms
> - **Case sensitivity:** Patterns are case-sensitive on Linux/macOS

## Integration Examples

### npm Scripts

```json
{
  "scripts": {
    "build": "unify build",
    "build:prod": "unify build --clean --minify --pretty-urls --fail-on security",
    "build:staging": "unify build --clean --pretty-urls",
    "preview": "unify build --dry-run",
    "debug": "unify build --log-level debug"
  }
}
```

### Make/Makefile

```makefile
.PHONY: build clean production

build:
	unify build

clean:
	rm -rf dist/
	unify build --clean

production: clean
	unify build --clean --minify --pretty-urls --fail-on security
```

### CI/CD Pipeline (GitHub Actions)

```yaml
- name: Build site
  run: unify build --clean --minify --pretty-urls --fail-on security
  
- name: Check build output
  run: |
    if [ ! -f "dist/index.html" ]; then
      echo "Build failed: index.html not found"
      exit 1
    fi
```

## Advanced Configuration

### Complex Multi-Pattern Example

```bash
# Comprehensive build with multiple rules
unify build \
  --source website \
  --output public \
  --clean \
  --pretty-urls \
  --minify \
  --default-layout "_base.html" \
  --default-layout "blog/**=_post.html" \
  --default-layout "docs/**=_docs.html" \
  --copy "assets/**" \
  --copy "downloads/**/*.{pdf,zip}" \
  --copy "public/**/*.{txt,xml,json}" \
  --ignore "**/drafts/**" \
  --ignore "**/*.{tmp,log,cache}" \
  --ignore-copy "assets/src/**" \
  --render "experiments/**/*.html" \
  --fail-on security,U001,U002 \
  --log-level info
```

> **✅ Best Practices**
>
> - **Use `--dry-run`** to preview complex build configurations
> - **Start simple** and add options as needed
> - **Test builds locally** before deploying to CI/CD
> - **Use `--fail-on security`** in production pipelines
> - **Document build scripts** for team collaboration
> - **Monitor build times** and optimize bottlenecks

## Next Steps

Now that you understand the build command:

- [Learn about the development server](/unify/docs/cli-serve)
- [Explore watch mode for continuous builds](/unify/docs/cli-watch)
- [Set up configuration files](/unify/docs/configuration)
- [Deploy your built site](/unify/docs/deployment)