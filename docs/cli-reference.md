# CLI Reference

Complete reference for all Unify CLI commands and options implementing DOM Cascade v1.

## Application

`unify` - Modern static site generator with area-based composition

## Commands

### `unify [command] [options]`

If no command is specified, Unify defaults to `build`.

### `unify build [options]`

Build your static site from source files using DOM Cascade v1.

**Examples:**
```bash
# Basic build
unify build

# Build with custom directories
unify build --source content --output public

# Build with pretty URLs and minification
unify build --pretty-urls --minify --clean

# Production build with security checks
unify build --fail-on security --minify
```

### `unify serve [options]`

Start development server with live reload and incremental builds.

**Examples:**
```bash
# Start dev server on default port 3000
unify serve

# Custom port and host for external access
unify serve --port 8080 --host 0.0.0.0

# Serve from custom directories
unify serve --source content --output tmp
```

### `unify watch [options]`

Watch files and rebuild on changes without serving.

**Examples:**
```bash
# Watch and rebuild
unify watch

# Watch with custom directories
unify watch --source src --output dist
```

### `unify init [template]`

Initialize a new project by downloading a starter template from GitHub.

**Examples:**
```bash
# Initialize with default template
unify init

# Initialize with specific template
unify init blog
unify init docs
unify init portfolio
```

## Global Options

### Directory Options

#### `--source, -s <directory>`
Source directory containing your site files.
- **Default:** current directory
- **Example:** `--source content`
- **Validation:** Must be existing directory

#### `--output, -o <directory>`
Output directory for generated static files.
- **Default:** `dist`
- **Example:** `--output public`
- **Behavior:** Created if doesn't exist

#### `--copy <glob>` (repeatable)
Adds paths to the copy set beyond automatic asset detection.
- **Default:** `null` (only copies assets/** and referenced assets)
- **Format:** Ripgrep/gitignore-style glob patterns
- **Example:** `--copy "docs/**/*.pdf" --copy "config/*.json"`
- **Behavior:** Copies matching files preserving relative paths
- **Note:** `assets/**` is implicitly copied unless excluded

#### `--ignore <glob>` (repeatable)
Ignore paths for both rendering and copying.
- **Default:** `null` (respects .gitignore by default)
- **Format:** Ripgrep/gitignore-style glob patterns
- **Example:** `--ignore "**/drafts/**" --ignore "!important/**"`
- **Behavior:** Last flag wins when patterns overlap
- **Note:** Applies to both render and copy pipelines

#### `--ignore-render <glob>` (repeatable)
Ignore paths only in the render/emitting pipeline.
- **Default:** `null`
- **Format:** Ripgrep/gitignore-style glob patterns
- **Behavior:** Files won't be rendered but may still be copied

#### `--ignore-copy <glob>` (repeatable)
Ignore paths only in the copy pipeline.
- **Default:** `null`
- **Format:** Ripgrep/gitignore-style glob patterns
- **Behavior:** Files won't be copied but may still be rendered

#### `--render <glob>` (repeatable)
Force rendering of matching files even if otherwise ignored.
- **Default:** `null`
- **Format:** Ripgrep/gitignore-style glob patterns
- **Example:** `--render "experiments/**"`
- **Behavior:** Overrides ignore rules for rendering
- **Precedence:** Render wins if file matches both render and copy rules

#### `--default-layout <value>` (repeatable)
Set default layouts for files matching glob patterns.
- **Default:** `null`
- **Format:** 
  - Filename only: `_layout.html` (global fallback)
  - Key-value: `blog/**=_post.html` (pattern-specific)
- **Example:** `--default-layout "_base.html" --default-layout "blog/**=_post.html"`
- **Behavior:** Last matching rule wins

#### `--dry-run`
Show file classification decisions without writing output.
- **Default:** `false`
- **Behavior:** Shows EMIT, COPY, SKIP, and IGNORED classifications
- **Output:** Explains layout resolution and processing decisions
- **Debug:** SKIP and IGNORED only shown with `--log-level=debug`

#### `--auto-ignore <boolean>`
Control automatic ignoring of layouts, components, and .gitignore.
- **Default:** `true`
- **Values:** `true` or `false`
- **Behavior:** When true, automatically ignores:
  - Files specified as layouts
  - Files referenced as includes
  - Files listed in .gitignore

### Build Options

#### `--pretty-urls`
Generate pretty URLs (page.html → page/index.html).
- **Default:** `false`
- **Example:** `--pretty-urls`
- **Effect:** Creates directory structure for clean URLs
- **Link Normalization:** Transforms HTML links to match structure

#### `--clean`
Clean output directory before build.
- **Default:** `false`
- **Example:** `--clean`

#### `--fail-level <level>`
Fail build if errors of specified level or higher occur.
- **Default:** `null` (only fail on fatal build errors)
- **Valid levels:** `warning`, `error`
- **Used by:** `build` command only
- **Example:** `--fail-level warning`

#### `--fail-on <types>`
Fail build on specific issue types (comma-separated).
- **Default:** `null`
- **Valid types:** `security`, `warning`, `error`, `U001`, `U002`, `U003`, `U004`, `U005`, `U006`, `U008`
- **Used by:** `build` command only
- **Examples:**
  - `--fail-on security`
  - `--fail-on security,warning,U002`
- **Security Integration:** Essential for CI/CD pipelines
- **Linting Integration:** Implements DOM Cascade v1 linter rules

#### `--minify`
Enable HTML minification for production builds.
- **Default:** `false`
- **Example:** `--minify`
- **Behavior:** Removes whitespace and optimizes HTML output

### Server Options

#### `--port, -p <number>`
Development server port.
- **Default:** `3000`
- **Range:** `1-65535`
- **Used by:** `serve` command only
- **Example:** `--port 8080`

#### `--host <hostname>`
Development server host.
- **Default:** `localhost`
- **Used by:** `serve` command only
- **Example:** `--host 0.0.0.0` (for external access)

### Global Options

#### `--help, -h`
Display help information and exit.
- **Behavior:** Shows usage, commands, options, and examples
- **Exit code:** 0

#### `--version, -v`
Display version number and exit.
- **Format:** `unify v{version}`
- **Exit code:** 0

#### `--log-level <level>`
Set logging verbosity level.
- **Default:** `info`
- **Valid levels:** `error`, `warn`, `info`, `debug`, `trace`
- **Example:** `--log-level debug`
- **Behavior:** Controls console output verbosity

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Build error or failed validation |
| `2` | Fatal error or invalid usage |

## Environment Variables

### `DEBUG`
Enable debug mode with detailed output and stack traces.
- **Example:** `DEBUG=1 unify build`
- **Effect:** Shows detailed processing information

### `LOG_LEVEL`
Override log level via environment.
- **Example:** `LOG_LEVEL=debug unify build`
- **Values:** `error`, `warn`, `info`, `debug`, `trace`

### `UNIFY_DEBUG`
Additional debug information for troubleshooting.
- **Example:** `UNIFY_DEBUG=1 unify build`

### `CLAUDECODE`
Claude Code environment flag for specialized behavior.
- **Example:** `CLAUDECODE=1 unify test --coverage`

## File Processing Precedence

Unify uses a three-tier precedence system:

### Tier 1: Explicit Overrides (Highest Priority)
- `--render <pattern>` → Forces rendering even if ignored
- `--auto-ignore=false` → Disables automatic ignoring

### Tier 2: Ignore Rules (Medium Priority)
- `--ignore <pattern>` → Ignores for both render and copy
- `--ignore-render <pattern>` → Render ignore only
- `--ignore-copy <pattern>` → Copy ignore only
- `.gitignore` patterns (when `--auto-ignore=true`)

### Tier 3: Default Behavior (Lowest Priority)
- Renderables (`.html`, `.md`) are emitted
- Assets matching `assets/**` or `--copy` patterns are copied
- Files starting with `_` are ignored (unless in `--copy`)

**Resolution:** Higher tiers always win. Within same tier, last pattern wins.

## Advanced Usage

### Production Build Pipeline

```bash
# Complete production build
unify build \
  --source src \
  --output dist \
  --clean \
  --pretty-urls \
  --minify \
  --fail-on security,warning \
  --copy "static/**" \
  --ignore "**/drafts/**"
```

### Development Workflow

```bash
# Development with live reload
unify serve --host 0.0.0.0 --port 3000

# File watching without server
unify watch --log-level debug

# Test build classification
unify build --dry-run --log-level debug
```

### CI/CD Integration

```bash
# Security-focused production build
NODE_ENV=production unify build \
  --minify \
  --fail-on security \
  --clean

# Development build with warnings
unify build --fail-level warning
```

### Asset Management

```bash
# Copy additional files beyond automatic detection
unify build \
  --copy "docs/**/*.pdf" \
  --copy "config/*.json" \
  --ignore-copy "assets/raw/**"

# Force render experimental content
unify build \
  --render "experiments/**" \
  --ignore "**/node_modules/**"
```

## DOM Cascade Integration

### Layout Configuration

```bash
# Set default layouts for different sections
unify build \
  --default-layout "_base.html" \
  --default-layout "blog/**=_post.html" \
  --default-layout "docs/**=_doc.html"
```

### Linter Integration

```bash
# Fail on specific DOM Cascade linter rules
unify build --fail-on U001,U002,U004

# Enable all DOM Cascade warnings
unify build --fail-on warning --log-level debug
```

## Error Handling

### Common Error Patterns

**Source directory not found:**
```
Error: Source directory not found: src
Suggestions:
  • Create source directory: mkdir src
  • Specify different source: --source content
  • Check current working directory
```

**Layout not found:**
```
Warning: Layout not found for short name 'blog'
  Searched: _blog.layout.html, _includes/blog.layout.html
Suggestions:
  • Create layout file: src/_blog.layout.html
  • Use full path: data-unify="/_layouts/blog.html"
  • Check layout naming conventions
```

**Security validation failure:**
```
[SECURITY] Path traversal attempt detected: ../../../etc/passwd
Build failed due to security issues (use --fail-on security)
```

### Debugging Commands

```bash
# Verbose output with classification details
unify build --dry-run --log-level debug

# Security-focused debug
DEBUG=1 unify build --fail-on security

# Full trace logging
unify build --log-level trace
```

## Performance Tips

### Large Sites

```bash
# Optimize for large projects
unify build \
  --ignore "node_modules/**" \
  --ignore-copy "**/*.psd" \
  --copy "assets/images/**/*.{jpg,png,webp}"
```

### Development Speed

```bash
# Minimal logging for faster builds
LOG_LEVEL=warn unify serve

# Serve from faster storage
unify serve --output /tmp/dev-build
```

## Integration Examples

### npm scripts

```json
{
  "scripts": {
    "build": "unify build --pretty-urls --minify",
    "build:prod": "unify build --clean --minify --fail-on security",
    "dev": "unify serve --host 0.0.0.0",
    "preview": "unify build && python -m http.server -d dist 8080",
    "test:build": "unify build --dry-run --log-level debug"
  }
}
```

### GitHub Actions

```yaml
- name: Build site with security checks
  run: |
    unify build \
      --clean \
      --pretty-urls \
      --minify \
      --fail-on security \
      --copy "static/**"
```

### Docker Integration

```bash
# Build in container
docker run --rm \
  -v $(pwd):/workspace \
  -w /workspace \
  fwdslsh/unify:cli \
  build --source src --output dist --pretty-urls

# Development server in container
docker run --rm \
  -p 3000:3000 \
  -v $(pwd):/workspace \
  -w /workspace \
  fwdslsh/unify:cli \
  serve --host 0.0.0.0
```

## See Also

- [Getting Started Guide](getting-started.md)
- [Include System Documentation](include-syntax.md)
- [Application Specification](app-spec.md)
- [DOM Cascade Specification](dom-spec.md)
- [Docker Usage Guide](docker-usage.md)