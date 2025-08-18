# Unify Static Site Generator - Complete Application Specification (Updated)

## Overview

Unify is a modern, lightweight static site generator designed for frontend developers who want to build maintainable static sites with fragment-based architecture. It produces framework-free, pure HTML/CSS output and emphasizes authoring with standard HTML, CSS, and JS — no special build-time DSLs. Developers can preview layouts, fragments, and pages locally without complex tooling, while still benefiting from composition, slotting, and head merging using Cascading Imports.

## Target Users

- Frontend developers familiar with HTML/CSS/JS
- Content creators needing a simple static site generator
- Teams that want fragment-based architecture without a framework
- Developers who prefer convention-over-configuration with minimal setup

## Core Functionality

### Terminology

- **Page**: A source file (HTML or Markdown) that generates a corresponding output file in the built site
- **Fragment**: A reusable HTML component or layout file that is imported and composed into pages but does not generate its own output file (typically prefixed with `_`)

### Primary Purpose

Transform source HTML/Markdown files with intelligent imports into a complete static website ready for deployment.

### Key Features

- **Cascading Imports** (`data-import`/`slot` / `data-target`): Unified mechanism for fragments composition
- **Includes (Legacy)**: Apache SSI-style includes for backwards compatibility
- **Markdown**: YAML frontmatter support, head synthesis, and conversion to HTML

### Additional Features

- Live development server with auto-reload
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
7. Reports build summary

**Expected Output:**

- Complete static website in output directory
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
- **Behavior:** Useful for rendering "hidden" or experimental content. Precedence for a renderable file: `--render` overrides `--ignore-render`/`--ignore` → classify as **EMIT**. If a file matches both render and copy rules, **render wins** so raw templates don't leak.

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

Examples:

- `--fail-level warning`: Fail on any warning or error
- `--fail-level error`: Fail only on errors (not warnings)
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
- **Valid levels:** `error`, `warn`, `info`, `debug`
- **Used by:** All commands
- **Behavior:** Controls logging output verbosity. Debug is chatty and should be opt-in. Keeps logging simple and aligned with common practice.

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
# Production build with minification and strict error handling
unify --minify --fail-level=warning --clean

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

#### Import Not Applied

```bash
# Check layout resolution
unify --dry-run | grep "import"

# Common causes:
# - Import file not found in expected location
# - Typo in data-import attribute
# - No automatic layout discovery file found
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

**Note:** Unify prefers `.html` extension but supports `.htm` for compatibility. All examples in this document use `.html`.

- Pages: `.html` files not starting with `_` are emitted as pages.
- Fragments: `.html` files starting with `_` are non-emitting html files.
- Layouts: Fragments imported by the page's root element are considered layouts. Only files named `_layout.html` are automatically applied as part of automatic layout discovery.

#### HTML Page Types

HTML pages can be either **page fragments** or **full HTML documents**:

**Page Fragments:**

- HTML content without `<!DOCTYPE>`, `<html>`, `<head>`, or `<body>` elements
- Content is treated as a fragment and inserted into root fragment's unnamed slot as-is
  - Head and template elements found in the fragment are processed as described in this document
  - Only one top-level element with a `data-import` attribute is allowed per page
- Example:

```html
<div data-import="blog">
  <h1>Article Title</h1>
  <p>Article content...</p>
</div>
```

**Full HTML Documents:**

- Complete HTML documents with `<!DOCTYPE html>`, `<html>`, `<head>`, and `<body>` elements
- Document elements are merged with the layout during processing
  - Page attributes win if there is a conflict
  - Page content is appended to matching elements
- Layout discovery uses automatic file discovery (see Layout Discovery section)
- Example:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Page Title</title>
  </head>
  <body>
    <h1>Article Title</h1>
    <p>Article content...</p>
  </body>
</html>
```

**Note on Document Structure Flexibility:**

The `<!DOCTYPE>`, `<html>`, `<head>`, and `<body>` tags are trivial in Unify and are allowed to exist or not exist in both fragments and pages. Unify will intelligently merge the ones that are found and ensure the basic boilerplate exists if neither the page nor any fragments have included them. This makes it easy to use full HTML documents for layouts, fragments, and pages, or drop them to reduce boilerplate if you prefer.

#### HTML Document Merging

When processing full HTML documents with layouts:

1. **DOCTYPE**: Pages's DOCTYPE is used in final output if it exists. Otherwise fallback to Layout's DOCTYPE
2. **HTML Element**: Layout's `<html>` element and attributes are preserved. Page's html element's attributes are added and overwrite the layout's attributes when there is a conflict.
3. **HEAD Element**: Page head content is merged with layout head using the head merge algorithm (see Head Merge Algorithm section)
4. **BODY Element**: Page body content is inserted into the root import's unnamed slot

### Markdown Files (`.md`)

- Processed with frontmatter extraction and Markdown→HTML conversion
- Converted HTML injected into the unnamed slot of the layout
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
   - `<link>`: First-kept for external styles/scripts unless `data-allow-duplicate` is present; dedupe canonical links by last-wins
   - `<script>`: First-kept for external scripts unless `data-allow-duplicate` is present; inline scripts never deduped
   - `<style>`: First-kept for external stylesheets unless `data-allow-duplicate` is present; inline styles never deduped
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
- **Copy vs Render Priority:** If a file matches both copy and render rules, **render wins** to prevent raw templates from leaking
- **Underscore Prefix Exclusion:** Files and folders starting with `_` are automatically excluded from build output (see Underscore Prefix Exclusion Rules above)
- **Glob-based Control:** Use `--ignore-copy` to exclude specific files from copying, or `--ignore` to exclude from both rendering and copying

### Include System


##### Slot Injection in Includes

The elements with `data-import` support slot-based content injection, allowing you to pass content to `<slot>` targets within the included component:

```html
<!-- Component: _includes/nav.html -->
<nav class="navbar">
  <slot name="brand">Default Brand</slot>
  <slot>
    <ul>
      <li><a href="/">Home</a></li>
    </ul>
  </slot>
  <div>
    <slot name="actions">
      <button>Sign In</button>
    </slot>
  </div>
</nav>

<!-- Page using the component -->
<body>
  <template data-import="/_includes/nav.html">
    <a href="/" data-target="brand">MyBrand</a>

    <ul>
      <li><a href="/docs/">Docs</a></li>
      <li><a href="/blog/">Blog</a></li>
    </ul>

    <template data-target="actions">
      <a href="/start/" class="btn">Get Started</a>
    </template>
  </template>
</body>

<!-- Output -->
<nav class="navbar">
  <a href="/">MyBrand</a>
  <ul>
    <li><a href="/docs/">Docs</a></li>
    <li><a href="/blog/">Blog</a></li>
  </ul>
  <div>
    <a href="/start/" class="btn">Get Started</a>
  </div>
</nav>
```

**Slot Injection Rules:**

1. **Slot Matching**: Elements with `data-target="name"` are matched to corresponding `<slot name="name">` targets in the imported fragment
2. **Content Replacement**: The entire `<slot>` element is replaced by the element with a matching `data-target=name` attribute. If the element is a template (`<template data-target="name">`) the content of the template replaces the slot element.
3. **Element and Attribute Removal**: Both `<slot>` and `<template>` elements are removed in the final output, leaving only their content. `data-import` and `data-target` attributes are removed from element in final output
4. **Fallback Content**: If no slot content is provided, the original content inside the `<slot>` element serves as fallback`
5. **Multiple Slots**: Multiple slots can be provided by a fragment in any order; they will be injected into their corresponding targets. Only one unnamed slot is allowed per fragment
6. **Nested Includes**: Slot injection works with nested includes - slots are resolved at each level

**Important Notes:**

- Slot injection only works with elements, not with Apache SSI includes
- The `data-target` attribute value must match the `<slot>` name attribute value exactly (case-sensitive)
- Elements without `data-target` attributes inside `data-import` elements are placed into the fragments default slot
- Styles and scripts from components are still extracted and relocated as usual

#### Apache SSI

```html
<!--#include file="relative.html" -->
<!--#include virtual="/absolute.html" -->
<!--#include file="toc.md" -->
<!--#include virtual="/includes/menu.md" -->
```

- `file` = relative to current file.
- `virtual` = from `src/` root.
- Apache SSI includes do not support slot injection
- **Markdown Support**: When the included file has a `.md` extension, it is processed through the markdown processor and the resulting HTML is included. Frontmatter is processed but not included in the output.

### Cascading Imports System

Unify uses **Cascading Imports** for fragment composition.

#### How Cascading Imports Work

Pages can import "layout" fragments using the `data-import` attribute on the root element:

```html
<!-- Page importing a layout -->
<div data-import="/layouts/blog.html">
  <h1>Article Title</h1>
  <p>Article content goes into the default slot...</p>
</div>
```

**Markdown Support**: When the imported file has a `.md` extension, it is processed through the markdown processor and the resulting HTML is included. Frontmatter is processed but not included in the output. Markdown do not support slots.

```html
<!-- Page importing a markdown file -->
<div data-import="/posts/post1.md"></div>
```

```text
# Article Title

Article content goes into the importing element just like an html page...
```

```html
<!-- Output -->
<div data-import="/layouts/blog.html">
  <h1>Article Title</h1>
  <p>Article content goes into the importing element just like an html page...</p>
</div>
```

#### Fragment Path Resolution

**Full Path Syntax:**

- `data-import="/layouts/blog.html"` → Look from source root (absolute path)
- `data-import="../shared/fragment.html"` → Look relative to current page
- `data-import="custom.html"` → Look relative to current page directory

**Short Name Syntax (Convenience Feature):**

- Unify will strip `_` prefixes, `.layout` segments, and `.html` extensions from filenames when locating a fragment during import
- `data-import="blog"` would find `_blog.layout.html` if it is in the correct folder path.
- Search order for short names:
  1. Current directory up through parent directories to source root
  2. Then `_includes` directory
- supports both exact filenames and short name resolution (e.g., `blog` → `_blog.layout.html`, `nav` -> `_nav.html`, `footer` -> `_includes/footer.html`)

#### Automatic Layout Discovery

When no `data-import` attribute is found on the root element of a page, Unify applies **automatic layout discovery**:

1. **Start in the page's directory** and look for `_layout.html`
2. **If not found**, move up to parent directory and repeat
3. **Continue climbing** the directory tree until reaching source root
4. **Site-wide fallback**: If no `_layout.html` found, use `_includes/layout.html` if it exists

#### Slots and Content Injection

Layouts define insertion points using `<slot>` elements:

```html
<!-- Layout: /layouts/blog.html -->
<html>
  <head>
    <title>Blog</title>
  </head>
  <body>
    <header>
      <slot name="header">Default Header</slot>
    </header>
    <main>
      <slot><!-- Default/unnamed slot for main content --></slot>
    </main>
    <aside>
      <slot name="sidebar">Default Sidebar</slot>
    </aside>
  </body>
</html>
```

Pages provide content for named slots using `<template slot="name">`:

```html
<div data-import="/layouts/blog.html">
  <!-- This content goes to the default/unnamed slot -->
  <article>
    <h1>Article Title</h1>
    <p>Article content...</p>
  </article>

  <!-- Named slot content -->
  <template slot="header">
    <h1>Custom Blog Header</h1>
  </template>

  <template slot="sidebar">
    <nav>Article navigation...</nav>
  </template>
</div>
```

#### Composition Rules

1. **Import Scope**: Each `data-import` creates an independent composition scope
2. **Root Import**: Only the root element can have `data-import` attribute
3. **Slot Resolution**: `<template slot="name">` elements target `<slot name="name">` in the imported fragment
4. **Default Content**: Content not in `<template>` elements goes to the unnamed `<slot>`
5. **Fallback Content**: Content inside `<slot>` elements serves as fallback if no matching template is provided
6. **Head Merging**: `<head>` content is merged globally using the head merge algorithm

#### Example Directory Structure

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

- A page references a `data-import` file that cannot be found
- A `<template data-target="name">` targets a slot not present in the imported fragment
- Circular import dependencies are detected

## Common Error Scenarios

### Circular Import Dependencies

```
Error: Circular import detected: layout.html → blog.html → layout.html
```

**Cause**: Fragment A imports Fragment B, which imports Fragment A.
**Solution**: Refactor fragments to break the circular dependency.

### Missing Slot Targets

```
Warning: Template slot="sidebar" has no matching <slot name="sidebar"> in imported fragment
```

**Cause**: Page provides content for a slot that doesn't exist in the layout.
**Solution**: Add the slot to the layout or remove the template from the page.

#### Fragment Pages and Markdown

Unify supports **fragment pages** — pages that omit `<html>`, `<head>`, and `<body>` wrappers and only contain content.

- When a file has no `<html>` root, Unify treats it as a fragment.
- The fragment is injected into the layout's `data-slot="default"`.
- Any `<template data-slot="name">` or elements with `data-slot="name"` inside the fragment are moved into the corresponding layout slot.
- The dev server automatically wraps fragment pages in their layout for accurate previews.

**Markdown Defaults:**

Markdown files (`.md`) are always compiled to fragments:

- The converted HTML body is injected into `data-slot="default"`.
- Frontmatter in Markdown provides head metadata (title, description, etc.) that is merged into the layout `<head>` using the same merge + dedupe rules as full HTML pages.
- Authors don't need to add `<html>` or `<head>` in Markdown — only content and optional `data-slot` templates.

This ensures content-heavy workflows (like documentation or blogs) stay lightweight and author-friendly, while Unify guarantees that final output is always a complete, valid HTML document.

#### Example Composition

```html
<div data-import="/layouts/base.html"></div>
```

- Fetches and inlines external HTML inside this element
- The `data-import` attribute is removed
  - **Full paths**: relative paths or absolute-from-`src` paths (e.g., `_custom.layout.html`, `/path/layout.html`)
  - **Short names**: convenient references that resolve to framgement files (e.g., `blog` → `_blog.layout.html`)
- The importing element becomes the composition scope
- Only children of this scope may target slots inside the imported fragment

```html
<!-- base.html -->
<html>
  <head>
    <meta charset="utf-8" />
    <title>Site</title>
  </head>
  <body>
    <header>
      <slot name="header"><h1>Default</h1></slot>
    </header>
    <main>
      <slot><!-- unnamed default --></slot>
    </main>
    <footer><slot name="footer">© Site</slot></footer>
  </body>
</html>
```

- **Named slots**: `<slot name="…">` for specific content areas
- **Unnamed slot**: One allowed per fragment, used for default body content

#### Providing Overrides

```html
<head>
  <title>Home • Site</title>
  <meta name="description" content="Homepage" />
  <link rel="stylesheet" href="/css/home.css" />
</head>
<body data-import="/layouts/base.html">
  <p>Body content (unnamed slot)</p>
  <div data-target="header"><h1>Welcome!</h1></div>
</body>
```

- `data-target` specifies the slot name
- Children of the targeting element replace the slot
- `<template>` hides override content at author time
- Regular elements keep overrides visible for design-time preview
- Pages/Fragments can include `html`, `head`, and `body` tags - they will be properly merged during build

#### Composition Rules

- Each `[data-import]` defines an independent scope; overrides do not leak
- The top most `[data-import]` in a page will be considered the root import (or layout).
- Process targets in document order; last writer wins
- Slots are replaced by overrides. Exception: `<head>` contributions are merged globally
- `html` and `body` attributes are merged globally with body class merging (merge, don't overwrite)
- For unnamed slots: use importing element's direct children not within `data-target`
- Unmatched `data-target`: no-op with dev warning
- **Warnings, not surprises**: Unknown `data-target` or unfilled named slots warn in strict mode

#### Global Merge

**Sources**: imported fragments' `<html>` `<head>` `<body>` elements, page elements

**Processing Order**: `root fragment → fragments → page`, with standard top-to-bottom DOM processing

**Attribute Merging**:

- **`<html>` attributes**: Layout provides base attributes, fragments can add/override, page wins final conflicts
- **`<body>` class merging**: Merge (don't overwrite) `class` attributes on `<body>` from layout, fragments, and page
- **Scope hook on the layout**: Allow adding a class to `<body>` (e.g., `class="layout-default"`) so fragment/page CSS can scope when needed

**De-duplication keys for head element**:

- `<title>`: last wins
- `<meta>`: dedupe by `name`, else `property`, else `http-equiv`
- `<link>`: dedupe by `(rel, href)`
- `<script>`: dedupe by `src` (external) or exact text (inline)
- Design-only assets: `[data-remove]` dropped or replaced at build time

**Warning System**: Issue warnings about:

- Unknown `data-target` attributes that don't match any slots
- Unfilled named slots that have no corresponding `data-target` override

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

**Default Layout Discovery for Cascading Imports**:

When no `data-import` attribute is found on the root element of a page, Unify applies automatic layout discovery:

1. **Auto-discovery chain**: Looks for `_layout.html` or `_layout.htm` files starting from the page's directory, climbing up to the source root
2. **Fallback layout**: If no layout found in the hierarchy, checks for `_includes/layout.html` or `_includes/layout.htm`
3. **Applied as root import**: The discovered layout is automatically applied as if it was a root-level `data-import`, enabling all Cascading Imports functionality
4. **Short name resolution**: Layout discovery supports both exact filenames and short name resolution (e.g., `blog` → `_blog.layout.html`)

**Override precedence**:

- Imported fragment `<html>`, `<head>`, `<body>` provides base metadata and styles
- Page `<head>` (HTML) or synthesized head (Markdown) takes precedence via merge algorithm
- Deduplication of elements contained in head and attributes applied to `<html>` and `<body>` ensures page-specific metadata wins over imported fragments
- Multiple inline styles and scripts from both fragements and page are preserved

- Multiple inline styles and scripts from both layout and page are preserved

## Dependency Tracking

- Tracks pages ↔ fragements
- Rebuild dependents on change
- Automatically discovers dependencies:
  - **Cascading Imports**: `data-import` references and nested imports
  - **Auto-discovered**: folder-scoped `_layout.html` files, fallback layouts in `_includes/layout.html`
  - **Legacy includes**: SSI includes (`<!--#include -->`)
- Tracks asset references from HTML and CSS files
- Deletes outputs when source is removed

## Live Reload and File Watching

The file watcher monitors all changes in the source directory and triggers appropriate rebuilds:

### Cascading Imports Changes

- **Imported fragments**: When a file referenced via `data-import` changes, all pages importing that fragment are rebuilt
- **Nested imports**: When nested imported fragments change, the dependency chain is followed to rebuild all affected pages

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

- All three commands (build, serve, watch) work correctly
- **Cascading Imports**: `data-import` and `slot` and `data-target` fragment composition system
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

- **HTML Standards**: Modern DOM templating with `<slot>`, `data-*` attributes, and standard element composition
- **CSS Standards**: Support for modern CSS features like `@scope` and CSS nesting
- **HTTP Standards**: Proper content-type handling and SEO-friendly URL structures
- **File System Conventions**: Cross-platform path handling with POSIX normalization

### Logging & Developer Experience

- **Python logging**: Standard levels (`debug`, `info`, `warn`, `error`) as the pragmatic core
- **Common CLI patterns**: Intuitive flag naming and behavior following Unix conventions
- **Git workflow integration**: Respects `.gitignore` and common repository structures
- **Modern web development**: Follows established patterns from contemporary static site generators
