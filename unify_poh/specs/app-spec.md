# Unify Static Site Generator - Complete Application Specification (Updated)

**Status**: v0 - References DOM Cascade v1

## Spec Roles

* **DOM Cascade (v1)** — *Normative* definition of composition behavior: layers, scopes, matching, replacement, attribute/head merge, and linter rules.
* **App Spec (v0)** — *Normative* definition of CLI, build pipeline, file layout, config, plugin points, design-time runner, and tooling UX.

**Single-source rule:** Any behavior that affects DOM merging MUST conform to **DOM Cascade v1**.

## Normative Reference

This document is a companion to **Unify DOM Cascade v1**. All DOM composition behavior is **normatively defined** in the DOM Cascade. This document references those rules and defines CLI, configuration, tooling, and UX around them.

## Overview

Unify is a modern, lightweight static site generator designed for frontend developers who want to build maintainable static sites with fragment-based architecture. It produces framework-free, pure HTML/CSS output and emphasizes authoring with standard HTML, CSS, and JS — no special build-time DSLs. Developers can preview layouts, fragments, and pages locally without complex tooling, while still benefiting from area-based composition and head merging using DOM Cascade.

## Conformance to DOM Cascade

The Unify compiler and design-time runner **MUST** implement the algorithm and semantics defined in **DOM Cascade v1** (sections: Layers & Scopes, Matching & Replacement, Head & Assets, Accessibility & IDs). In case of conflict, the DOM Cascade is the source of truth for DOM behavior.

## Target Users

- Frontend developers familiar with HTML/CSS/JS
- Content creators needing a simple static site generator
- Teams that want fragment-based architecture without a framework
- Developers who prefer convention-over-configuration with minimal setup

## Terminology

**Core Terms (imported from DOM Cascade v1):**
- **Area**: Public regions exposed by class selectors (e.g., `.unify-hero`)
- **Scope/Boundary**: Each layout body or imported component root
- **Layer order**: `layout → components → page`
- **Public contract**: Documented set of public selectors
- **Ordered fill**: Fallback matching mechanism
- **Landmark fallback**: Matching by unique semantic elements
- **Contract block**: `<style data-unify-docs>` documentation

App-spec reuses these terms by reference; definitions are normative in DOM Cascade v1.

## Composition Surface (Authoring Model)

**Normative Surface (see DOM Cascade v1):**
- `data-unify` (on `<html>`/`<body>` for layouts, any element for components)
- Public areas exposed via class selectors (e.g., `.unify-hero`) and documented in `<style data-unify-docs>` blocks

See **DOM Cascade v1 § Minimal Attribute Surface, Public Areas & Docs** for complete semantics.

## Special HTML Attributes & Elements

Unify processes specific data attributes and HTML elements during build to enable its fragment-based architecture:

### Data Attributes

- **`data-unify`** - Imports and composes layouts/components
  - On `<html>` or `<body>`: triggers layout mode with layout chaining
  - On any other element: triggers component mode with inline composition
  - Supports path resolution: absolute (`/layouts/base.html`), relative (`../shared/nav.html`), or short names (`blog` → `_blog.layout.html`)
  - Removed from final output

- **`data-layer`** - CSS layering hints for stylesheets (optional, future-compatible)
  - Used on `<link>` and `<style>` elements to align with CSS `@layer`
  - Provides hints to fragment consumers for CSS layer organization
  - No current functionality but forward-compatible for future features

### HTML Elements

**Public Areas** - Content regions exposed via class selectors (see DOM Cascade v1 § Public Areas)
  - Layout/component authors expose areas using classes like `.unify-hero`, `.unify-nav`
  - Page authors target these areas by using matching class names
  - Area matching follows DOM Cascade v1 precedence: Area → Landmark → Ordered fill
  - Class names must be unique per scope and use `unify-` prefix

- **`<head>`** - Document metadata merged globally across fragments
  - Content from layout `<head>` + page `<head>` is intelligently merged
  - Deduplication by element type: `<title>` (last wins), `<meta>` (by name/property), `<link>` (by rel+href)
  - Page head content takes precedence over layout/fragment head content

- **`<body>`** - Document body with class merging and content composition
  - `class` attributes are merged (not overwritten) across layout/fragments/page
  - Body content follows DOM Cascade v1 composition rules
  - Can have `data-unify` on `<body>` element for layout application

- **`<meta>`** - Metadata elements with smart deduplication
  - Deduplicated by `name`, `property`, or `http-equiv` attributes during head merge
  - Can be synthesized from Markdown frontmatter (`description` → `<meta name="description">`)
  - Page meta wins over fragment meta when conflicts occur

### Special Processing Rules

- **Attribute Removal**: `data-unify` and `data-layer` attributes are stripped from final output
- **Path Resolution**: All `data-unify` paths support both absolute/relative file paths and short name resolution
- **Nested Composition**: Layout and component imports work recursively
- **Area Matching**: Content replaces areas per DOM Cascade v1 matching precedence
- **Attribute Merging**: Host element attributes merge with page content per DOM Cascade v1 rules

## Core Functionality

### Terminology

- **Page**: A source file (HTML or Markdown) that generates a corresponding output file in the built site
- **Fragment**: A reusable HTML component or layout file that is imported and composed into pages but does not generate its own output file (typically prefixed with `_`)

### Primary Purpose

Transform source HTML/Markdown files with intelligent imports into a complete static website ready for deployment.

### Composition Engine

**Normative Incorporation**
The Unify composition engine **MUST** execute the **DOM Cascade v1** algorithm exactly (matching precedence, replacement semantics, attribute merge, scoping).

* Matching order: **Area** → **Landmark** → **Ordered fill**
* Replacement: keep host element; replace children; merge attributes (page wins; class union; host `id` stability with reference rewrite)
* Head merge and asset ordering per DOM Cascade v1

The app-spec does not restate these rules.

### Key Features

- **Area-based Composition** (`data-unify` + area classes): Unified mechanism for layout/component composition per DOM Cascade v1
- **Includes (Legacy)**: Apache SSI-style includes for backwards compatibility
- **Markdown**: YAML frontmatter support, head synthesis, and conversion to HTML

### Additional Features

- Live development server with auto-reload
- Incremental builds with smart dependency tracking
- Asset tracking and copying
- Security-first design with path traversal prevention

## Inter-Spec Versioning

* App-spec v0 targets **DOM Cascade v1.x**
* App-spec **MUST NOT** redefine cascade behavior; updates to cascade require bumping `dom_cascade.version`
* Patch/minor of DOM Cascade **MUST NOT** change normative behavior; major indicates breaking changes

## Security & Build Safety

Unify prioritizes security and provides mechanisms to prevent deployment of potentially unsafe content, especially important for CI/CD pipelines and production deployments.

### Security Warnings

During the build process, Unify performs security scans of all processed HTML content and displays clear warnings for potential security vulnerabilities. These warnings include:

**Warning Format:**

```text
[SECURITY] XSS Risk: Event handler detected in <meta> tag (src/page.html:15)
[SECURITY] JavaScript URL: Potential XSS vector in href attribute (src/components/nav.html:8)
[SECURITY] Content Injection: Unescaped content in <title> tag (src/blog/post.html:3)
```

**Security Tags:**

- All security-related warnings are prefixed with `[SECURITY]` for easy filtering in CI/CD systems
- Specific vulnerability types are identified (XSS Risk, JavaScript URL, Content Injection, etc.)
- File paths and line numbers are provided for quick remediation

### Build Failure on Security Issues

To prevent insecure applications from being deployed via automated pipelines, Unify provides build failure options:

**`--fail-on security`**

- Fails the build (exit code 1) when any security warnings are detected
- Essential for CI/CD pipelines that must not deploy potentially vulnerable sites
- Recommended for production deployments

**`--fail-on <level>`**

- Can be combined with security checks (e.g., `--fail-on warning` includes security warnings)
- Provides granular control over which issues should block deployment

### CI/CD Integration

**Example CI/CD Pipeline:**

```bash
# Development build (warnings only)
unify build --source src --output dist

# Production build (fail on security issues)
unify build --source src --output dist --fail-on security --minify
```

**Log Filtering:**

```bash
# Extract only security warnings for security team review
unify build 2>&1 | grep "\[SECURITY\]"

# Count security issues
unify build 2>&1 | grep -c "\[SECURITY\]"
```

### Security Best Practices

1. **Always use `--fail-on security` in production CI/CD pipelines**
2. **Review security warnings in development builds before deployment**
3. **Monitor security logs and address issues promptly**
4. **Use content security policies (CSP) as an additional layer of protection**
5. **Regularly audit and update content to maintain security standards**

### Supported Security Checks

- **Path Traversal**: Prevention of file access outside the source directory
- **XSS Prevention**: Detection of potentially dangerous event handlers and JavaScript URLs
- **Content Injection**: Identification of unescaped content in sensitive HTML elements
- **HTML Injection**: Detection of potential HTML injection vectors in processed content

## Command Line Interface

### Application Name

`unify`

### Main Commands

#### 1. `build` (Default Command)

Builds the static site from source files to output directory. **MUST** run DOM Cascade v1.

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
7. Reports build summary

**Expected Output:**

- Complete static website in output directory
- All referenced assets copied with directory structure preserved
- Success message with file count and build time
- Exit code 0 on success, 1 on recoverable errors, 2 on fatal errors

#### 2. `serve`

Starts development server with live reload functionality.

**Design-Time Parity**
The browser runner **MUST** produce DOM identical to the build output by executing **DOM Cascade v1**. Hot reload, dependency tracking, and error surfacing are app-spec concerns; DOM differences are not allowed.

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

Watches files and rebuilds on changes without serving. **MUST** run DOM Cascade v1 for each rebuild.

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

#### 4. `init`

Initializes a new Unify project by downloading and extracting a starter template from GitHub.

**Syntax:**

```bash
unify init [template]
```

**Parameters:**

- `template` (optional): Name of the starter template to use. If not provided, downloads the default starter.

**Workflow:**

1. Validates current directory (warns if not empty but continues)
2. Determines which repository to download based on template parameter
3. Checks if requested template exists on GitHub
4. Downloads tarball from GitHub API (`https://api.github.com/repos/fwdslsh/unify-starter[-template]`)
5. Extracts template files to current directory
6. Provides next steps guidance

**Available Templates:**

The following templates are known and validated:

- **Default** (no template specified): Downloads `fwdslsh/unify-starter`
- **basic**: Downloads `fwdslsh/unify-starter-basic`
- **blog**: Downloads `fwdslsh/unify-starter-blog`
- **docs**: Downloads `fwdslsh/unify-starter-docs`
- **portfolio**: Downloads `fwdslsh/unify-starter-portfolio`

**Expected Output:**

- Directory validation warning (if not empty)
- Download progress confirmation
- Success message with next steps:
  1. Review the generated files
  2. Run `unify build` to build your site
  3. Run `unify serve` to start the development server

**Error Handling:**

- **Template not found**: Provides list of available templates and suggestions
- **Network issues**: Provides troubleshooting guidance for connection problems
- **GitHub API issues**: Handles rate limiting and access denied scenarios
- **Extraction failures**: Reports extraction problems with helpful context

**Examples:**

```bash
# Initialize with default template
unify init

# Initialize with blog template
unify init blog

# Initialize with docs template  
unify init docs
```

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

**`--copy <glob>` (repeatable)**

- **Purpose:** Adds paths to the **copy** set. `assets/**` is implicitly copied unless excluded.
- **Default:** `null` (no additional files copied beyond automatic asset detection and implicit `assets/**`)
- **Used by:** All commands
- **Format:** Ripgrep/gitignore-style glob patterns like `"./docs/**/*.*"` or `"./config/*.json"`
- **Behavior:** Copies matching files to output directory preserving relative paths. This mirrors the familiar "public assets copied as-is" behavior seen in Astro/Vite.
- **Note:** Use quotes around patterns with special characters. The `src/assets` directory is automatically copied if it exists.

**`--ignore <glob>` (repeatable)**

- **Purpose:** Ignore paths for **both rendering and copying** (ripgrep/gitignore-style globs, `!` negation support)
- **Default:** `null` (respects `.gitignore` by default)
- **Used by:** All commands
- **Format:** Ripgrep/gitignore-style glob patterns like `"**/drafts/**"` or `"!important/**"`
- **Behavior:** **Last flag wins** when multiple patterns overlap. Applies to both render and copy pipelines.
- **Note:** Respects `.gitignore` by default for both render and copy operations.

**`--ignore-render <glob>` (repeatable)**

- **Purpose:** Ignore paths **only** in the render/emitting pipeline
- **Default:** `null`
- **Used by:** All commands
- **Format:** Ripgrep/gitignore-style glob patterns
- **Behavior:** Files matching this pattern will not be rendered/emitted but may still be copied if they match copy rules.

**`--ignore-copy <glob>` (repeatable)**

- **Purpose:** Ignore paths **only** in the copy pipeline
- **Default:** `null`
- **Used by:** All commands
- **Format:** Ripgrep/gitignore-style glob patterns
- **Behavior:** Files matching this pattern will not be copied but may still be rendered if they are renderable.

**`--render <glob>` (repeatable)**

- **Purpose:** Force **render/emitting** of matching files **even if** they would otherwise be ignored (by `.gitignore` or any `--ignore*` rule)
- **Default:** `null`
- **Used by:** All commands
- **Format:** Ripgrep/gitignore-style glob patterns like `"experiments/**"`
- **Behavior:** Useful for rendering "hidden" or experimental content. Precedence for a renderable file: `--render` overrides `--ignore-render`/`--ignore` → classify as **EMIT**. If a file matches both render and copy rules, **render wins** so raw source files don't leak.

**`--default-layout <value>` (repeatable)**

- **Purpose:** Set default layouts for files matching glob patterns or globally
- **Default:** `null`
- **Used by:** All commands
- **Format:** Accepts either:
  - **Filename** (e.g., `_layout.html`) → implicit `*` (global fallback)
  - **Key-value** `<ripgrep-glob>=<filename>` (e.g., `blog/**=_post.html`) → applies to matches
- **Behavior:** **Last one wins** across overlaps (glob rules applied in order, later flags take precedence).
- **Layout Resolution Precedence:**
  1. Page-declared layout
  2. Last-matching `--default-layout <glob=filename>`
  3. Last filename-only `--default-layout <filename>`
  4. Discovery fallback: `_layout.htm`, then `_layout.html`
  5. No layout, wrap in boilerplate DOCTYPE, html element if missing

**`--dry-run`**

- **Purpose:** Classify each discovered file and **explain** the decision without writing output
- **Default:** `false`
- **Used by:** All commands
- **Behavior:** Shows classification for each file:
  - `EMIT via <reason>` (e.g., "renderable(md); layout=blog/\_post.html")
  - `COPY via <reason>` (e.g., "implicit assets/**; matched --copy 'public/**'")
  - `SKIP via <reason>` (debug-level, e.g., "non-renderable(.db)")
  - `IGNORED via <rule>` (debug-level, e.g., ".gitignore", "--ignore '**/drafts/**'")
- **Output:** Also shows final layout after applying `--default-layout` rules & discovery. No actual output files are written. SKIP and IGNORED messages are only shown with `--log-level=debug`.

**`--auto-ignore <boolean>`**

- **Purpose:** Control automatic ignoring of referenced layouts, components, and `.gitignore` files
- **Default:** `true`
- **Used by:** All commands
- **Format:** `true` or `false`
- **Behavior:** When `true` (default), automatically ignores:
  - Files specified as layouts (via `--default-layout`, page frontmatter, or discovery)
  - Files referenced as includes (components, partials, fragments)
  - Files listed in `.gitignore`
- **When disabled (`false`):** Users must manually specify ignore rules; `.gitignore` is not respected; layout and include files may be emitted as standalone pages if not explicitly ignored.

#### Build Options

**`--pretty-urls`**

- **Purpose:** Generate pretty URLs (about.{html,md} -> about/index.html)
- **Default:** `false`
- **Used by:** All commands
- **Effect:** Creates directory structure for clean URLs and normalizes internal links
- **Link Normalization:** When enabled, transforms HTML links to match the pretty URL structure:
  - `./about.html` → `/about/`
  - `/blog.html` → `/blog/`
  - `../index.html` → `/`
  - Preserves query parameters and fragments: `./contact.html?form=1#section` → `/contact/?form=1#section`
  - External links, non-HTML links, and fragments are unchanged

**`--clean`**

- **Purpose:** Clean output directory before (initial) build
- **Default:** `false`
- **Used by:** All commands

**`--fail-level <level>`**

- **Purpose:** Fail entire build if errors of specified level or higher occur
- **Default:** `null` (only fail on fatal build errors)
- **Valid levels:** `warning`, `error`
- **Used by:** `build` command, `watch` and `serve` ignore this option
- **Behavior:** Controls when the build process should exit with error code 1

**`--fail-on <types>`**

- **Purpose:** Fail build on specific issue types (comma-separated)
- **Default:** `null` (only fail on fatal build errors)
- **Valid types:** `security`, `warning`, `error`, `U001`, `U002`, `U003`, `U004`, `U005`, `U006`, `U008`
- **Used by:** `build` command, `watch` and `serve` ignore this option
- **Behavior:**
  - `security`: Fails build when any security warnings are detected
  - `warning`: Includes all warning-level issues
  - `error`: Includes all error-level issues
  - `U001-U008`: DOM Cascade linter rules (see DOM Cascade v1 § Linter Rule Set)
  - Can be combined: `--fail-on security,warning,U002`
- **Security Integration:** Essential for CI/CD pipelines to prevent deployment of potentially vulnerable sites
- **Linting Integration:** The linter **MUST** implement DOM Cascade rules **U001, U002, U003, U004, U005, U006, U008** with the default severities specified in DOM Cascade v1

Examples:

- `--fail-level warning`: Fail on any warning or error
- `--fail-level error`: Fail only on errors (not warnings)
- `--fail-on security`: Fail only on security issues
- `--fail-on security,warning`: Fail on security issues and warnings
- No flag: Only fail on fatal build errors (default behavior)

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

**`--log-level <level>`**

- **Purpose:** Set logging verbosity level
- **Default:** `info`
- **Valid levels:** `error`, `warn`, `info`, `debug`, `trace`
- **Used by:** All commands
- **Behavior:** Controls logging output verbosity. Debug is chatty and should be opt-in. Trace is extremely verbose for deep troubleshooting. Keeps logging simple and aligned with common practice.

## Getting Started & Common Usage Patterns

### Basic Usage

For most projects, Unify works with zero configuration:

```bash
# Build your site
unify

# Develop with live reload
unify serve

# Watch for changes without serving
unify watch
```

### Common Patterns

#### 1. Simple Static Site

```bash
# Basic build with default settings
unify

# Clean build (remove old files first)
unify --clean

# Pretty URLs for SEO
unify --pretty-urls
```

#### 2. Blog or Documentation Site

```bash
# Ignore draft posts but render everything else
unify --ignore "**/drafts/**"

# Set a blog layout for all posts
unify --default-layout "blog/**=_post.html"

# Multiple layout rules (more specific last)
unify --default-layout "_base.html" --default-layout "blog/**=_post.html"
```

#### 3. Development Workflow

```bash
# See what gets built without actually building
unify --dry-run

# Debug build issues with verbose output
unify --dry-run --log-level=debug

# Serve with clean slate
unify serve --clean
```

#### 4. Asset Management

```bash
# Copy additional files beyond automatic asset detection
unify --copy "docs/**/*.pdf" --copy "config/*.json"

# Exclude certain assets from copying
unify --ignore-copy "assets/raw/**" --ignore-copy "**/*.psd"

# Force render experimental content that might be gitignored
unify --render "experiments/**"
```

#### 5. CI/CD and Production

```bash
# Production build with minification and security checks
unify --minify --fail-on security --clean

# Strict production build (fail on any warnings or security issues)
unify --minify --fail-on security,warning --clean

# Build with custom source/output directories
unify --source=content --output=public

# Disable auto-ignore for full control
unify --auto-ignore=false --ignore="_*" --ignore=".*"
```

### Troubleshooting Common Issues

#### File Not Appearing in Output

```bash
# Check what's happening to your file
unify --dry-run --log-level=debug | grep "your-file.html"

# Common causes:
# - File ignored by .gitignore (use --render to override)
# - File starts with _ (rename or use --auto-ignore=false)
# - File matched by --ignore pattern
```

#### Layout/Component Not Applied

```bash
# Check layout resolution
unify --dry-run | grep "layout\|component"

# Common causes:
# - Layout/component file not found in expected location
# - Typo in data-unify attribute
# - No automatic layout discovery file found
# - Area class mismatch between page and layout/component
```

#### Performance Issues

```bash
# Check for overly broad patterns
unify --dry-run  # Look for performance warnings

# Optimize patterns:
# ❌ --copy "**/*"           (too broad)
# ✅ --copy "assets/**/*.jpg" (specific)
```

## File Processing Semantics & Precedence

### Simplified Precedence Model

To reduce complexity, Unify uses a **three-tier precedence system**:

#### Tier 1: Explicit Overrides (Highest Priority)

- `--render <pattern>` → Forces files to be rendered even if they would normally be ignored
- `--auto-ignore=false` → Disables all automatic ignoring (.gitignore, \_ prefixed files and directories)

#### Tier 2: Ignore Rules (Medium Priority)

- `--ignore <pattern>` → Ignores files for both rendering and copying
- `--ignore-render <pattern>` → Ignores files only for rendering
- `--ignore-copy <pattern>` → Ignores files only for copying
- `.gitignore` patterns (when `--auto-ignore=true`)

#### Tier 3: Default Behavior (Lowest Priority)

- Renderables (`.html`, `.md`) are emitted as pages
- Non-renderables matching `assets/**` or `--copy` patterns are copied
- Files and directories starting with `_` are ignored (unless included in a `--copy` option)

**Resolution Order**: Higher tiers always win. Within the same tier, **last pattern wins** (ripgrep-style).

**Example**:

```bash
unify --ignore "blog/**" --render "blog/featured/**" --ignore-render "blog/featured/draft.md"
```

Result:

- `blog/featured/post.md` → **EMIT** (Tier 1 `--render` wins)
- `blog/featured/draft.md` → **IGNORED** (Tier 2 `--ignore-render` wins)
- `blog/other/post.md` → **IGNORED** (Tier 2 `--ignore` wins)

### Classification Algorithm

Unify processes files through the following algorithm:

1. **Determine renderability** based on file extensions and content-type (`.html`, `.md` are renderable)
2. **Apply Tier 1 overrides**: `--render` (if renderable) forces EMIT (overrides everything else)
3. **Apply Tier 2 ignore rules**: Check `--ignore*` patterns and `.gitignore`
4. **Apply Tier 3 defaults**:
   - Renderables become **EMIT**
   - Non-renderables matching `assets/**` or any `--copy` pattern → **COPY**
5. **Conflict resolution**: If a file is both copy-eligible and renderable, **render wins**

### Glob Pattern Rules

- **Format**: Ripgrep/gitignore-style patterns (`**`, `*`, `?`, negation with `!`)
- **Precedence**: Later flags override earlier ones when patterns overlap
- **Cross-platform**: Paths are automatically converted to POSIX-compatible format internally
- **Validation**: The tool provides helpful error messages for invalid glob patterns
- **Performance Warnings**: Warnings are displayed for overly broad patterns (e.g., `**/*`) that may impact performance
- **Collision Detection**: Warnings are shown when glob patterns conflict with other rules, including potential performance ramifications
- **Path Handling**:
  - Symlinks are not followed for security and predictability
  - Case sensitivity behavior is platform-specific (case-insensitive on Windows, case-sensitive on Linux/macOS)

### Auto-Ignored Files

Files are automatically added to the ignore list to prevent accidental emission (when `--auto-ignore=true`, which is the default):

1. **Layout Files**: Any file specified as a `default-layout` or layout (via `--default-layout`, page frontmatter, or discovery) is automatically ignored for rendering and copying
2. **Include Files**: Any file referenced as an include (components, partials, fragments) is automatically ignored for rendering and copying
3. **Detection**: The system detects these references during classification and excludes them from emission/copying
4. **Behavior**: This is implicit and requires no manual configuration
5. **Override**: Use `--auto-ignore=false` to disable this behavior and `.gitignore` respect

**Examples**:

- If `_layout.html` is set as a default layout, it's automatically ignored even if not in `--ignore`
- If `_includes/header.html` is referenced via `<include>` or SSI, it's automatically ignored
- Users don't need to manually ignore every include or layout file (unless `--auto-ignore=false`)

**Conflicting Rules Warning**: The tool will display warnings when conflicting ignore/copy rules are detected to help users understand rule interactions.

### Implicit Behaviors

- **`.gitignore` Respect**: Both render and copy operations respect `.gitignore` by default when `--auto-ignore=true` (like Eleventy)
- **Implicit Assets Copy**: `assets/**` is copied by default unless explicitly ignored
- **Underscore Exclusion**: Files and directories starting with `_` are excluded from output (see Underscore Prefix Exclusion Rules)
- **Auto-ignore Override**: Use `--auto-ignore=false` to disable `.gitignore` respect and automatic layout/include ignoring

### Dry Run Output Example

```
[EMIT]    src/posts/hello.md
          reason: renderable(md);
          layout match blog/**=_post.html (last wins)
[EMIT]    experiments/hidden.md
          reason: --render 'experiments/**' overrides .gitignore
[COPY]    assets/fonts/inter.woff2
          reason: implicit assets/** (not ignored)

# Debug-level output (only shown with --log-level=debug):
[SKIP]    src/posts/thumbs.db
          reason: non-renderable(.db)
          included by: --copy src/**/*.*
[IGNORED] src/posts/drafts/wip.md
          reason: --ignore '**/drafts/**'
[IGNORED] assets/private/key.pem
          reason: --ignore-copy 'assets/private/**'
```

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

### Underscore Prefix Exclusion Rules

**Files and directories with underscore prefix (`_`) are excluded from build output:**

- **`_` directories**: Entire directories starting with `_` (like `_includes/`, `_components/`) are non-emitting
- **`_` files**: Individual files starting with `_` (like `_layout.html`, `_partial.html`) are non-emitting
- **Exception**: Files inside `_` directories do NOT need additional `_` prefix to be excluded

**Examples:**

```
src/
├── _includes/
│   ├── layout.html           # ✅ Excluded (in _ directory)
│   ├── header.html           # ✅ Excluded (in _ directory)
│   └── _legacy.html          # ✅ Excluded (_ prefix redundant but allowed)
├── blog/
│   ├── _blog.layout.html     # ✅ Excluded (_ prefix required)
│   ├── _sidebar.html         # ✅ Excluded (_ prefix required)
│   ├── helper.html           # ❌ Included (no _ prefix, will be rendered as page)
│   └── post.html             # ✅ Included (intended page)
└── _drafts/
    ├── unfinished.html       # ✅ Excluded (in _ directory)
    └── notes.md              # ✅ Excluded (in _ directory)
```

**Key principle**: Use `_` prefix on files when you want to keep layouts/components in the same directory as pages but exclude them from output. Files in `_` directories are automatically excluded regardless of their individual naming.

## File Processing Rules


### HTML Files (`.html`, `.htm`)

See **DOM Cascade v1** for all DOM cascade, area/landmark/ordered fill, and merge rules. The app-spec only describes CLI, build, and implementation details. The build process **MUST** conform to DOM Cascade v1 specifications.

### Markdown Files (`.md`)

- Processed with frontmatter extraction and Markdown→HTML conversion
- Converted HTML follows DOM Cascade v1 composition rules with the layout
- Head synthesized from frontmatter and merged globally

### Link Normalization (Pretty URLs)

When the `--pretty-urls` option is enabled, Unify automatically normalizes HTML links during the build process to match the generated directory structure.

#### Link Transformation Rules

**HTML Page Links**: Links pointing to `.html` or `.htm` files are transformed to pretty URLs:

- `./about.html` → `/about/`
- `/blog.html` → `/blog/`
- `../index.html` → `/` (index.html becomes root)
- `docs/guide.html` → `/docs/guide/`

**Query Parameters and Fragments**: Preserved during transformation:

- `./contact.html?form=1` → `/contact/?form=1`
- `/blog.html#latest` → `/blog/#latest`
- `./about.html?tab=info#section` → `/about/?tab=info#section`

**Preserved Links**: The following links are NOT transformed:

- External URLs: `https://example.com`
- Email links: `mailto:test@example.com`
- Protocol links: `tel:+1234567890`, `ftp://example.com`
- Non-HTML files: `/assets/document.pdf`, `/styles.css`, `/script.js`
- Fragment-only links: `#section`, `#top`
- Data URLs: `data:image/png;base64,...`

#### Link Resolution Algorithm

1. **Parse href attribute** to extract path, query, and fragment components
2. **Check if transformation applies**:
   - Must be a relative or absolute path (not external URL)
   - Must end with `.html` or `.htm` extension
   - Must not be a fragment-only link
3. **Resolve path to source file**:
   - Relative paths resolved against current page location
   - Absolute paths resolved against source root
4. **Transform to pretty URL**:
   - Remove `.html`/`.htm` extension
   - For `index.html`: Use parent directory path or `/` for root
   - For other files: Use filename as directory with trailing `/`
5. **Reconstruct href** with query parameters and fragments preserved

#### Design-Time vs Build-Time Behavior

- **Design-Time**: Links point to actual `.html` files for easy preview and development
- **Build-Time**: Links are normalized to pretty URLs for SEO-friendly production URLs
- Support YAML frontmatter with head synthesis for metadata
- Layout discovery or override applies
- Head content synthesized from frontmatter (no `<head>` allowed in body)

### Head & Metadata Processing

#### HTML Pages

- **Front matter:** NOT supported
- **Head content:** Standard `<head>` element allowed; merged with layout head during build

#### Markdown Pages

- **Front matter:** Supported via YAML with head synthesis
- **Head content:** NO `<head>` allowed in body; synthesized from frontmatter only

#### Frontmatter Head Schema (Markdown only)

```yaml
title: string # Optional, becomes <title>
description: string # Optional, becomes <meta name="description" ...>

head: # Optional container for head sections
  meta: # Optional list of attribute maps -> <meta ...>
    - name: robots
      content: "index,follow"
    - property: og:title
      content: "Page Title"

  link: # Optional list of attribute maps -> <link ...>
    - rel: canonical
      href: "https://example.com/page"
    - rel: preload
      as: image
      href: "/img/hero.avif"

  script: # Optional list -> <script ...> or JSON-LD
    # External script
    - src: "/js/analytics.js"
      defer: true
    # JSON-LD block
    - type: "application/ld+json"
      json:
        "@context": "https://schema.org"
        "@type": "Article"
        headline: "Getting Started"

  style: # Optional list -> <style> or stylesheet link
    # Inline CSS
    - inline: |
        .hero { contain: paint; }
    # External stylesheet
    - href: "/css/print.css"
      media: "print"
```

#### Head Merge Algorithm

When combining layout `<head>` + page `<head>` (or synthesized head), Unify uses **standard DOM tree processing (top to bottom)**:

**Processing Order**: Top-to-bottom tree traversal starting from root fragment, then fragments in document order, then page content.

**Merge Rules**:

1. **Base order:** Start with root fragment (aka layout) head nodes, then fragments (in order of import), finally page head nodes
2. **Deterministic de-duplication:** Elements are deduplicated using identity keys:
   - `<title>`: Last-wins for titles
   - `<meta>`: Last-wins by `name` or `property` attribute (page wins over fragments, fragments win over layout)
   - `<link>`: First-kept for external styles/scripts; dedupe canonical links by last-wins
   - `<script>`: First-kept for external scripts; inline scripts never deduped
   - `<style>`: First-kept for external stylesheets; inline styles never deduped
   - Unknown elements: Append without deduplication
3. **Optional CSS layering hints:** Allow `data-layer="..."` on `<link>`/`<style>` elements so authors can align with `@layer`. This has no functionality but provides hints to consumers of the fragments. Also forward compatible in case we add automatic layering in the future.
4. **Script defaults that match modern practice:** It is recommended that scripts use `defer` behavior. Their relative order will be preserved inside each tier
5. **Safety:** Apply existing sanitization and path traversal prevention

#### Synthesis Rules (Markdown → `<head>`)

- `title` present → emit `<title>…</title>`
- `description` present → emit `<meta name="description" content="…">`
- `head.meta` items → emit `<meta …>` with given attributes
- `head.link` items → emit `<link …>`
- `head.script` items:
  - With `json` key → emit `<script type="application/ld+json">[minified JSON]</script>`
  - Without `json` → emit `<script …></script>` with provided attributes
- `head.style` items:
  - With `inline` → emit `<style>…</style>`
  - With `href` → emit `<link rel="stylesheet" …>`

#### Validation Rules

**File-type constraints:**

- HTML pages: ERROR if frontmatter detected
- Markdown pages: ERROR if body contains `<head>` element

**Frontmatter schema (Markdown only):**

- `title`: Must be string; WARN if conflicts with `head.meta` title entries
- `description`: Must be string; WARN if conflicts with `head.meta` description
- `head.meta`: List of attribute maps; WARN if empty items
- `head.link`: List of attribute maps; WARN if missing both `rel` and `href`
- `head.script`: List of attribute maps; WARN if both `src` and `json` present or neither present
- `head.style`: List of attribute maps; WARN if missing both `inline` and `href` or both present

**Merge-time diagnostics:**

- WARN when deduping replaces layout values with page values
- No warning for appended inline styles/scripts (by design)

### Static Assets

- **Implicit Assets Copy:** The `assets/**` directory is implicitly copied to output unless explicitly excluded (mirrors Astro/Vite "public" behavior)
- **Asset Reference Tracking:** Referenced assets from HTML/CSS are automatically detected and copied to output
- **Additional File Copying:** Use `--copy` option to specify additional files to copy using glob patterns
- **Copy vs Render Priority:** If a file matches both copy and render rules, **render wins** to prevent raw source files from leaking
- **Underscore Prefix Exclusion:** Files and folders starting with `_` are automatically excluded from build output (see Underscore Prefix Exclusion Rules above)
- **Glob-based Control:** Use `--ignore-copy` to exclude specific files from copying, or `--ignore` to exclude from both rendering and copying

### Include System


##### Area-based Component Composition

Components use area-based composition following DOM Cascade v1 rules:

```html
<!-- Component: _includes/nav.html -->
<nav class="navbar">
  <div class="unify-brand">Default Brand</div>
  <div class="unify-menu">
    <ul>
      <li><a href="/">Home</a></li>
    </ul>
  </div>
  <div class="unify-actions">
    <button>Sign In</button>
  </div>
</nav>

<!-- Page using the component -->
<body>
  <div data-unify="/_includes/nav.html">
    <div class="unify-brand">
      <a href="/">MyBrand</a>
    </div>
    <div class="unify-menu">
      <ul>
        <li><a href="/docs/">Docs</a></li>
        <li><a href="/blog/">Blog</a></li>
      </ul>
    </div>
    <div class="unify-actions">
      <a href="/start/" class="btn">Get Started</a>
    </div>
  </div>
</body>

<!-- Output -->
<nav class="navbar">
  <div class="unify-brand">
    <a href="/">MyBrand</a>
  </div>
  <div class="unify-menu">
    <ul>
      <li><a href="/docs/">Docs</a></li>
      <li><a href="/blog/">Blog</a></li>
    </ul>
  </div>
  <div class="unify-actions">
    <a href="/start/" class="btn">Get Started</a>
  </div>
</nav>
```

**Composition Rules (see DOM Cascade v1 for complete specification):**

1. **Area Matching**: Elements with area classes (e.g., `.unify-brand`) target matching areas in the component
2. **Content Replacement**: Host element keeps its tag/position; children are replaced; attributes merge
3. **Attribute Merging**: Page attributes override host attributes (except `id` which stays stable)
4. **Fallback Behavior**: If no area classes used, falls back to landmark or ordered fill matching

**Important Notes:**

- All composition behavior follows DOM Cascade v1 specification exactly
- Area classes must be unique per scope and use `unify-` prefix
- Components should document public areas in `<style data-unify-docs>` blocks

#### Apache SSI

```html
<!--#include file="relative.html" -->
<!--#include virtual="/absolute.html" -->
<!--#include file="toc.md" -->
<!--#include virtual="/includes/menu.md" -->
```

- `file` = relative to current file.
- `virtual` = from `src/` root.
- Apache SSI includes do not support area-based composition
- **Markdown Support**: When the included file has a `.md` extension, it is processed through the markdown processor and the resulting HTML is included. Frontmatter is processed but not included in the output.

### DOM Cascade Composition System

Unify uses **DOM Cascade v1** for layout and component composition. The composition behavior is **normatively defined** in DOM Cascade v1.

#### How DOM Cascade Composition Works

Layouts are applied using `data-unify` on `<html>` or `<body>` elements:

```html
<!-- Page with layout -->
<body data-unify="/layouts/blog.html">
  <section class="unify-hero">
    <h1>Article Title</h1>
    <p>Custom hero content...</p>
  </section>
  <main>
    <p>Article content goes into main area...</p>
  </main>
</body>
```

Components are imported using `data-unify` on any other element:

```html
<!-- Page importing a component -->
<div data-unify="/components/card.html">
  <h3 class="unify-title">Product Name</h3>
  <p class="unify-body">Product description...</p>
</div>
```

**Markdown Support**: When the imported file has a `.md` extension, it is processed through the markdown processor and the resulting HTML is included. Frontmatter is processed but not included in the output.

#### Layout/Component Path Resolution

**Full Path Syntax:**

- `data-unify="/layouts/blog.html"` → Look from source root (absolute path)
- `data-unify="../shared/fragment.html"` → Look relative to current page
- `data-unify="custom.html"` → Look relative to current page directory

**Short Name Syntax (Convenience Feature):**

- Unify will strip `_` prefixes, `.layout` segments, and `.html` extensions from filenames when locating a layout/component
- `data-unify="blog"` would find `_blog.layout.html` if it is in the correct folder path.
- Search order for short names:
  1. Current directory up through parent directories to source root
  2. Then `_includes` directory
- supports both exact filenames and short name resolution (e.g., `blog` → `_blog.layout.html`, `nav` -> `_nav.html`, `footer` -> `_includes/footer.html`)

#### Automatic Layout Discovery

When no `data-unify` attribute is found on `<html>` or `<body>` elements, Unify applies **automatic layout discovery**:

1. **Start in the page's directory** and look for `_layout.html`
2. **If not found**, move up to parent directory and repeat
3. **Continue climbing** the directory tree until reaching source root
4. **Site-wide fallback**: If no `_layout.html` found, use `_includes/layout.html` if it exists

#### Area-based Content Composition

Layouts define public areas using class selectors and document them:

```html
<!-- Layout: /layouts/blog.html -->
<html>
  <head>
    <style data-unify-docs="v1">
      /* Public areas */
      .unify-hero { /* Hero section */ }
      .unify-content { /* Main content area */ }
      .unify-sidebar { /* Sidebar area */ }
    </style>
    <title>Blog</title>
  </head>
  <body>
    <header class="unify-hero">
      <h1>Default Header</h1>
    </header>
    <main class="unify-content">
      <p>Default content...</p>
    </main>
    <aside class="unify-sidebar">
      <p>Default sidebar...</p>
    </aside>
  </body>
</html>
```

Pages provide content using matching area classes:

```html
<body data-unify="/layouts/blog.html">
  <section class="unify-hero">
    <h1>Custom Blog Header</h1>
    <p>Blog subtitle...</p>
  </section>
  
  <article class="unify-content">
    <h1>Article Title</h1>
    <p>Article content...</p>
  </article>

  <nav class="unify-sidebar">
    <h3>Navigation</h3>
    <ul>...</ul>
  </nav>
</body>
```

#### Composition Rules (see DOM Cascade v1 for complete specification)

1. **Scoping**: Each layout or component import creates an independent composition scope
2. **Layout Mode**: `data-unify` on `<html>` or `<body>` triggers layout chaining
3. **Component Mode**: `data-unify` on other elements triggers inline component composition
4. **Area Matching**: Content with area classes (`.unify-*`) replaces matching areas in host
5. **Fallback Behavior**: Without area classes, falls back to landmark or ordered fill matching
6. **Head Merging**: `<head>` content is merged globally using DOM Cascade v1 rules

#### Example Directory Structure

*Note: Examples illustrate usage patterns; they don't define behavior. See DOM Cascade v1 for normative composition rules.*

```
src/
├── _includes/
│   └── layout.html              # Site-wide fallback layout
├── _layout.html                 # Root layout for all pages in src/
├── layouts/
│   ├── _blog.layout.html        # Named blog layout
│   └── _docs.layout.html        # Named documentation layout
├── blog/
│   ├── _layout.html             # Blog section layout (auto-discovered)
│   ├── post1.html               # Uses blog/_layout.html
│   └── post2.html               # Uses blog/_layout.html
├── docs/
│   ├── guide.html               # Uses src/_layout.html
│   └── api.html                 # Uses src/_layout.html
├── about.html                   # Uses src/_layout.html
└── index.html                   # Uses src/_layout.html
```

#### Error Handling

During build, Unify will warn if:

- A page references a `data-unify` file that cannot be found
- Area classes are used that don't exist in the layout/component (see DOM Cascade v1 linter rules)
- Circular layout/component dependencies are detected

## Common Error Scenarios

### Circular Import Dependencies

```
Error: Circular import detected: layout.html → blog.html → layout.html
```

**Cause**: Fragment A imports Fragment B, which imports Fragment A.
**Solution**: Refactor fragments to break the circular dependency.

### Missing Area Targets

```
Warning: Area class "unify-sidebar" not found in imported layout/component
```

**Cause**: Page provides content for an area that doesn't exist in the layout/component.
**Solution**: Add the area to the layout/component or remove the area class from the page.

#### Markdown Processing

**Markdown Layout Application:**

Markdown files (`.md`) are processed and composed with layouts:

- The converted HTML body follows DOM Cascade v1 composition rules (area matching, landmark fallback, etc.)
- Frontmatter in Markdown provides head metadata (title, description, etc.) that is merged into the layout `<head>` using DOM Cascade v1 head merge rules
- Layout discovery applies the same way as HTML pages

This ensures content-heavy workflows (like documentation or blogs) stay lightweight and author-friendly, while Unify guarantees that final output follows DOM Cascade v1 composition semantics.

#### Example Composition

*Note: This example illustrates app-level behavior; composition semantics are defined in DOM Cascade v1.*

```html
<body data-unify="/layouts/base.html">
  <section class="unify-hero">
    <h1>Welcome</h1>
  </section>
  <main>
    <p>Page content...</p>
  </main>
</body>
```

- Triggers layout composition per DOM Cascade v1
- The `data-unify` attribute is removed after processing
  - **Full paths**: relative paths or absolute-from-`src` paths (e.g., `_custom.layout.html`, `/path/layout.html`)
  - **Short names**: convenient references that resolve to layout files (e.g., `blog` → `_blog.layout.html`)
- Composition behavior follows DOM Cascade v1 rules

```html
<!-- base.html -->
<html>
  <head>
    <style data-unify-docs="v1">
      .unify-hero { /* Hero area */ }
      .unify-footer { /* Footer area */ }
    </style>
    <meta charset="utf-8" />
    <title>Site</title>
  </head>
  <body>
    <header class="unify-hero">
      <h1>Default</h1>
    </header>
    <main>
      <p>Default main content...</p>
    </main>
    <footer class="unify-footer">
      <p>© Site</p>
    </footer>
  </body>
</html>
```

- **Public areas**: Documented via `.unify-*` classes in `<style data-unify-docs>` block
- **Area matching**: Page content with matching classes replaces corresponding layout areas
- **Fallback behavior**: Content without area classes uses landmark or ordered fill matching

#### Providing Content

```html
<head>
  <title>Home • Site</title>
  <meta name="description" content="Homepage" />
  <link rel="stylesheet" href="/css/home.css" />
</head>
<body data-unify="/layouts/base.html">
  <section class="unify-hero">
    <h1>Welcome!</h1>
    <p>Custom hero content</p>
  </section>
  <main>
    <p>Page main content...</p>
  </main>
</body>
```

- Area classes (`.unify-*`) target specific layout areas
- Host element keeps its tag/position; children are replaced; attributes merge
- Content without area classes uses fallback matching (landmark or ordered fill)
- Pages/Fragments can include `html`, `head`, and `body` tags - they will be properly merged during build per DOM Cascade v1

#### Composition Rules (see DOM Cascade v1 for complete specification)

- Each `data-unify` import defines an independent composition scope
- Layout imports (`data-unify` on `<html>`/`<body>`) can chain multiple layouts
- Area matching follows DOM Cascade v1 precedence: Area → Landmark → Ordered fill
- Host elements keep their tag/position; children replaced; attributes merge per DOM Cascade v1
- `html` and `body` attributes are merged globally with class union (merge, don't overwrite)
- `<head>` content is merged globally using DOM Cascade v1 head merge rules
- **Warnings**: Unknown area classes or composition errors warn during build

#### Global Merge (see DOM Cascade v1 for complete specification)

**Sources**: imported layouts/components' `<html>` `<head>` `<body>` elements, page elements

**Processing Order**: DOM Cascade v1 layer order: `layout → components → page`

**Attribute Merging (per DOM Cascade v1)**:

- **`<html>` attributes**: Layout provides base attributes, page wins conflicts
- **`<body>` class merging**: Union of classes (merge, don't overwrite) from layout and page
- **ID stability**: Host element IDs are retained; page references are rewritten

**Head Merging (per DOM Cascade v1)**:

- **Processing order**: layout → components → page
- **Deduplication**: by element type and key attributes
- **CSS/JS order**: layout → components → page (mirrors CSS cascade)

**Warning System**: Issue warnings about:

- Unknown area classes that don't match documented areas
- Composition conflicts per DOM Cascade v1 linter rules

### Includes (Legacy)

Apache SSI-style includes remain supported for backwards compatibility but are marked as legacy. New projects should prefer Cascading Imports.

```html
<!--#include file="relative.html" -->
<!--#include virtual="/absolute.html" -->
```

- `file` = relative to current file
- `virtual` = from `src/` root
- Apache SSI includes do not support content overrides

### Overrides

**Legacy Layout override precedence** (replaced by Cascading Imports):

- For HTML files use automatic layout discovery chain if no root import is found
- For Markdown files: frontmatter `layout` key takes precedence over discovered layout chain
- If no override is found, the nearest layout is discovered by climbing the directory tree, then falling back to `_includes/layout.html` if present

**Default Layout Discovery for DOM Cascade Composition**:

When no `data-unify` attribute is found on `<html>` or `<body>` elements, Unify applies automatic layout discovery:

1. **Auto-discovery chain**: Looks for `_layout.html` or `_layout.htm` files starting from the page's directory, climbing up to the source root
2. **Fallback layout**: If no layout found in the hierarchy, checks for `_includes/layout.html` or `_includes/layout.htm`
3. **Applied as layout**: The discovered layout is automatically applied as if it had `data-unify` on the `<body>`, enabling all DOM Cascade v1 functionality
4. **Short name resolution**: Layout discovery supports both exact filenames and short name resolution (e.g., `blog` → `_blog.layout.html`)

**Override precedence**:

- Imported fragment `<html>`, `<head>`, `<body>` provides base metadata and styles
- Page `<head>` (HTML) or synthesized head (Markdown) takes precedence via merge algorithm
- Deduplication of elements contained in head and attributes applied to `<html>` and `<body>` ensures page-specific metadata wins over imported fragments
- Multiple inline styles and scripts from both fragements and page are preserved

- Multiple inline styles and scripts from both layout and page are preserved

## Dependency Tracking

- Tracks pages ↔ layouts/components
- Rebuild dependents on change
- Automatically discovers dependencies:
  - **DOM Cascade imports**: `data-unify` references and nested imports
  - **Auto-discovered**: folder-scoped `_layout.html` files, fallback layouts in `_includes/layout.html`
  - **Legacy includes**: SSI includes (`<!--#include -->`)
- Tracks asset references from HTML and CSS files
- Deletes outputs when source is removed

## Live Reload and File Watching

The file watcher monitors all changes in the source directory and triggers appropriate rebuilds:

### DOM Cascade Import Changes

- **Imported layouts/components**: When a file referenced via `data-unify` changes, all pages importing that layout/component are rebuilt
- **Nested imports**: When nested imported layouts/components change, the dependency chain is followed to rebuild all affected pages

### Legacy Includes Changes

- When fragment files (legacy SSI includes) change, all pages that include them are rebuilt
- Handles nested fragment dependencies (fragments that include other fragments)
- Supports SSI-style (`<!--#include -->`) includes only

### New File Detection

- New HTML/Markdown pages are automatically built when added to source directory
- New fragment files trigger rebuilds of dependent pages
- New asset files are copied to output if referenced by pages

### Asset Changes

- CSS file changes trigger copying to output directory
- Image and other asset changes trigger copying if referenced by pages
- Asset reference tracking ensures only used assets, or assets specified in copy option(s) are copied

### File Deletion Handling

- Deleted pages are removed from output directory
- Deleted fragments trigger rebuilds of dependent pages (showing "fragment not found" warnings)
- Deleted assets are removed from output directory
- Dependency tracking is automatically cleaned up

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

#### Build Cache System

Unify includes an intelligent build cache system that significantly improves build performance for large projects:

**Cache Storage:**

- Cache directory: `.unify-cache` (created automatically)
- Hash cache: `hash-cache.json` (SHA-256 file hashes)
- Dependency graph: `deps-cache.json` (file dependency mappings)

**Hashing Strategy:**

- Uses Bun's native `CryptoHasher` with SHA-256 algorithm
- File-based hashing for change detection
- Content-based hashing for string data
- Composite hashing for file groups

**Cache Features:**

- **File Change Detection**: Tracks file modifications using SHA-256 hashes
- **Dependency Tracking**: Maintains bidirectional dependency graphs for include relationships
- **Up-to-date Checking**: Compares input/output timestamps with dependency chains
- **Automatic Cache Management**: Cache is persisted across builds and loaded on startup
- **Smart Invalidation**: Only rebuilds files when they or their dependencies change

**Cache Lifecycle:**

1. **Initialization**: Loads existing cache from disk on startup
2. **Build Process**: Updates hashes and dependencies during processing
3. **Persistence**: Saves cache state to disk after successful builds
4. **Restart Clearing**: Automatically clears cache on `serve` and `watch` commands for fresh development builds

**Performance Benefits:**

- Skip processing for unchanged files and their outputs
- Reduce dependency resolution overhead
- Minimize file system operations
- Enable efficient incremental builds for large sites (1000+ pages)

**Cache Statistics:**

The build cache tracks and reports:

- Number of cached files
- Dependency graph size
- Cache directory location
- Hashing method used (native-crypto)

### Development Server

- File change debouncing (100ms)
- Selective rebuild based on dependency analysis
- Efficient live reload via Server-Sent Events
- Memory-efficient file watching
- **Cache Management**: Build cache is automatically cleared when server or watch commands are restarted to ensure fresh builds

### Scalability

- Handle projects with 1000+ pages
- Handle page that are over 5MB
- Efficient processing of large asset collections

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

- No configuration required for layouts/fragments.
- Convention over configuration.

### Configuration File (unify.config.yaml)

```yaml
unify:
  dom_cascade:
    version: "1.0"     # MUST match a supported DOM Cascade major.minor
    area_prefix: "unify-" # default; tooling MAY allow override
  lint:
    U001: warn
    U002: error
    U003: warn
    U004: warn
    U005: info
    U006: warn
    U008: warn
```

Note: app-spec owns the config schema; **behavior still lives in DOM Cascade**.

## Linting & Diagnostics

**Rule Set**
The linter **MUST** implement DOM Cascade rules **U001, U002, U003, U004, U005, U006, U008** with the default severities specified in DOM Cascade v1. The app-spec defines CLI behavior, configuration keys, and CI exit codes; rule semantics are owned by DOM Cascade.

**CLI Exit Codes:**
- `error` level rules → non-zero exit code
- `warn`/`info` level rules → zero exit code

**Rule Summary (see DOM Cascade v1 for complete definitions):**
- **U001**: `docs-present` - warn
- **U002**: `area-unique-in-scope` - error  
- **U003**: `area-low-specificity` - warn
- **U004**: `area-documented` - warn
- **U005**: `docs-drift` - info
- **U006**: `landmark-ambiguous` - warn
- **U008**: `ordered-fill-collision` - warn

## Plugin & Extensibility

- App-spec owns **hooks** (pre/post build, asset pipeline, import resolvers)
- Plugins **MUST NOT** alter DOM merge semantics; they may only **supply inputs** (HTML) or **post-process outputs** (HTML/CSS/JS) outside the merge core

## Accessibility Requirements

Point to DOM Cascade's **ID stability & reference rewrite** as normative (see DOM Cascade v1 § Accessibility & ID Handling). App-spec can add additional a11y checks (e.g., multiple `main` detection UX), but must not contradict DOM Cascade.

## Known Issues & Pitfalls

### 1. Order Sensitivity with Globs & Negation

Mixing `--ignore`, `--ignore-render`, `--ignore-copy`, and negated patterns (`!foo/**`) is powerful but order-sensitive. Unify follows ripgrep's "last matching glob wins" behavior.

**Issue**: Complex rule interactions can be hard to predict
**Solution**: Use `--dry-run` when rules get complex to see exactly how files are classified

### 2. `.gitignore` Interplay Surprises

Because `.gitignore` is respected by default (like Eleventy), files can be skipped even without explicit `--ignore` flags.

**Issue**: Files unexpectedly missing from output
**Solution**: Use `--render` to force-emit specific inputs, negate patterns explicitly (`!pattern`), or use `--dry-run` to see classification reasons

### 3. Implicit `assets/**` Copying

Unify copies `assets/**` by default to mirror Astro/Vite "public" directory behavior.

**Issue**: Easy to forget this happens, unexpected files in output
**Solution**: Disable with `--ignore assets/**` or `--ignore-copy assets/**`. Use `--dry-run` to see what gets copied.

### 4. Overlapping Layout Rules

With "last wins" precedence, a broad `*=_base.html` listed after `blog/**=_post.html` will override the more specific rule.

**Issue**: Unexpected layout application due to rule order
**Solution**: Order rules from general to specific, or use `--dry-run` to see the match chain

### 5. Non-renderables Hit by Layout Globs

If a `--default-layout glob=...` matches images or other non-renderables, it's a no-op that might confuse users.

**Issue**: Layout rules that seem to do nothing
**Solution**: `--dry-run` shows `SKIP (non-renderable)` for clarity

### 6. Render vs Copy Collisions

If `--copy 'src/**'` includes renderable files, you won't get raw files because "render wins."

**Issue**: Expected raw files are processed instead
**Solution**: Use targeted globs like `--copy 'src/**/*.json'` for data files, or use `--ignore-render` for specific files

### 7. Logging Noise & Performance

`--log-level=debug` can be very chatty and may impact performance due to excessive I/O.

**Issue**: Performance degradation or overwhelming output
**Solution**: Keep default at `info`, only use `debug` for troubleshooting

### 8. Cross-platform Path Handling

**Issue**: Path separators and case sensitivity vary across platforms
**Solution**: Unify automatically converts paths to POSIX format internally. Use forward-slash patterns (`/`) in globs on all platforms. Note that case sensitivity behavior follows platform conventions (case-insensitive on Windows, case-sensitive on Linux/macOS).

### 9. Symlinks & Security

**Issue**: Symlinks could potentially access files outside the source directory
**Solution**: Unify does not follow symlinks for security and predictability. Symlinked files and directories are skipped with appropriate warnings in debug output.

### 10. Layout Auto-ignore Edge Cases

**Issue**: Layout files specified in `--default-layout` are auto-ignored, but this might not be obvious
**Solution**: `--dry-run` should clearly show when files are auto-ignored due to being layouts or includes

## Success Criteria

### Functional Requirements

- All three commands (build, serve, watch) work correctly and execute DOM Cascade v1
- App conformance tests **MUST** pass DOM Cascade v1 test checklist
- **DOM Cascade Composition**: `data-unify` and area-based layout/component composition system per DOM Cascade v1
- **Legacy includes**: Apache SSI support for backwards compatibility
- Markdown processing with frontmatter and layouts
- Live reload functionality in development server
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

### Scoped Styles

Unify assumes that developers will utilize the `@scope`, `@layer`, or CSS nesting features to manage fragment style scoping themselves. These modern CSS features provide a robust way to encapsulate styles for fragments. For developers targeting legacy browsers that do not support `@scope`, a polyfill such as [scoped-css-polyfill](https://github.com/GoogleChromeLabs/scoped-css-polyfill) can be leveraged to ensure compatibility. This approach allows Unify to maintain a lightweight and framework-free architecture while empowering developers to adopt modern CSS practices.

## References & Behavioral Parity

Unify's design draws inspiration from established tools and follows common patterns to meet developer expectations:

### Tool Behavior References

- **Eleventy**: Auto-respects `.gitignore` for file discovery and processing
- **ripgrep**: Gitignore-style glob patterns with **later globs taking precedence** over earlier ones
- **Astro**: `public/` directory copied untouched; clear guidance on `src/` vs `public/` asset handling
- **Vite**: `publicDir` copied as-is; can be disabled via `build.copyPublicDir` option
- **Next.js/Nuxt**: Automatic layout discovery and hierarchical layout systems

### Standards Compliance

- **DOM Cascade v1**: Full conformance to normative DOM composition specification
- **HTML Standards**: Area-based composition with `data-unify` attributes and class-based targeting
- **CSS Standards**: Support for modern CSS features like `@scope` and CSS nesting
- **HTTP Standards**: Proper content-type handling and SEO-friendly URL structures
- **File System Conventions**: Cross-platform path handling with POSIX normalization

### Logging & Developer Experience

- **Python logging**: Standard levels (`debug`, `info`, `warn`, `error`) as the pragmatic core
- **Common CLI patterns**: Intuitive flag naming and behavior following Unix conventions
- **Git workflow integration**: Respects `.gitignore` and common repository structures
- **Modern web development**: Follows established patterns from contemporary static site generators
