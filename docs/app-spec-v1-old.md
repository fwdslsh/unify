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
- Modern DOM templating with `<template>`, `data-slot` attributes, and `<include>` elements
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
- **Effect:** Creates directory structure for clean URLs and normalizes internal links
- **Link Normalization:** When enabled, transforms HTML links to match the pretty URL structure:
  - `./about.html` → `/about/`
  - `/blog.html` → `/blog/`
  - `../index.html` → `/`
  - Preserves query parameters and fragments: `./contact.html?form=1#section` → `/contact/?form=1#section`
  - External links, non-HTML links, and fragments are unchanged

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

- Pages: `.htm(l)` files not starting with `_` are emitted as pages.
- Partials: `.htm(l)` files starting with `_` are non-emitting partials.
- Layouts: Only files named `_layout.html` or `_layout.htm` are automatically applied as folder-scoped layouts.

#### HTML Page Types

HTML pages can be either **page fragments** or **full HTML documents**:

**Page Fragments:**

- HTML content without `<!DOCTYPE>`, `<html>`, `<head>`, or `<body>` elements
- Content is treated as fragment and inserted into layout's default slot (`data-slot="default"`) as-is
  - Head and template elements found in the fragment are processed as described in this document.
- Can use `data-layout` attribute on the root element for named layout discovery
  - Multiple elements with a data-layout attribute inside of a fragment page should result in an error.
- Example:

```html
<div data-layout="blog">
  <h1>Article Title</h1>
  <p>Article content...</p>
</div>
```

**Full HTML Documents:**

- Complete HTML documents with `<!DOCTYPE html>`, `<html>`, `<head>`, and `<body>` elements
- Document elements are merged with the layout during processing
  - Page attributes win if there is a conflict
  - Page content is appended to matching elements
- Layout discovery can be specified via `<link rel="layout">` in the document head
- Example:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Page Title</title>
    <link rel="layout" href="/layouts/blog.html" />
  </head>
  <body>
    <h1>Article Title</h1>
    <p>Article content...</p>
  </body>
</html>
```

#### HTML Document Merging

When processing full HTML documents with layouts:

1. **DOCTYPE**: Pages's DOCTYPE is used in final output if it exists. Otherwise fallback to Layout's DOCTYPE
2. **HTML Element**: Layout's `<html>` element and attributes are preserved. Page's html element's attributes are added and overwrite the layout's attributes when there is a conflict.
3. **HEAD Element**: Page head content is merged with layout head using the head merge algorithm (see Head Merge Algorithm section)
4. **BODY Element**: Page body content is inserted into the layout's default `data-slot="default"` element

### Markdown Files (`.md`)

- Processed with frontmatter extraction and Markdown→HTML conversion

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
- **Development Server**: Handles both `.html` and pretty URL requests for seamless development experience
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

When combining layout `<head>` + page `<head>` (or synthesized head):

1. **Base order:** Start with layout head nodes, append page head nodes
2. **Precedence:** Page version wins when nodes represent same semantic content
3. **Deduplication by identity keys:**
   - `<title>`: Keep last one (page wins)
   - `<meta>`: Dedupe by `name` or `property` attribute (last wins)
   - `<link>`: Dedupe `rel="canonical"` (last wins); others dedupe by `(rel, href)` pair
   - `<script>`: Dedupe by `src` (last wins); inline scripts never deduped
   - `<style>`: External handled by `<link>` rules; inline never deduped
   - Unknown elements: Append without deduplication
4. **Safety:** Apply existing sanitization and path traversal prevention

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

- **Asset Reference Tracking:** Only referenced assets are copied to output
- **Automatic `src/assets` Copying:** The `src/assets` directory is automatically copied to `dist/assets` if it exists, preserving folder structure
- **Additional File Copying:** Use `--copy` option to copy additional files with glob patterns
- **Underscore Prefix Exclusion:** Files and folders starting with `_` are automatically excluded from build output (see Underscore Prefix Exclusion Rules above)

### Include System

#### DOM Include

```html
<include src="/_includes/header.html"></include>
<include src="menu.md"></include>
<include src="/components/toc.md" />
```

Resolution:

1. Leading `/` → from `src/` root.
2. Else → relative to including file.

**Markdown Support**: When the included file has a `.md` extension, it is processed through the markdown processor and the resulting HTML is included. Frontmatter is processed but not included in the output.

##### Slot Injection in Includes

The `<include>` element supports slot-based content injection, allowing you to pass content to `data-slot` targets within the included component:

```html
<!-- Component: _includes/nav.html -->
<nav class="navbar">
  <div data-slot="brand">Default Brand</div>
  <ul data-slot="links">
    <li><a href="/">Home</a></li>
  </ul>
  <div data-slot="actions">
    <button>Sign In</button>
  </div>
</nav>

<!-- Page using the component -->
<include src="/_includes/nav.html">
  <a data-slot="brand" href="/">MyBrand</a>
  
  <ul data-slot="links">
    <li><a href="/docs/">Docs</a></li>
    <li><a href="/blog/">Blog</a></li>
  </ul>
  
  <div data-slot="actions">
    <a href="/start/" class="btn">Get Started</a>
  </div>
</include>

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

1. **Slot Matching**: Child elements with `data-slot` attributes are matched to corresponding `data-slot` targets in the included component
2. **Content Replacement**: The entire content of the target element (with matching `data-slot`) is replaced by the provided slot content
3. **Attribute Removal**: The `data-slot` attribute is removed from both the provider and target elements in the final output
4. **Fallback Content**: If no slot content is provided, the original content in the component's `data-slot` element serves as fallback
5. **Multiple Slots**: Multiple slots can be provided in any order; they will be injected into their corresponding targets
6. **Nested Includes**: Slot injection works with nested includes - slots are resolved at each level

**Important Notes:**

- Slot injection only works with `<include>` elements, not with Apache SSI includes
- The `data-slot` attribute must match exactly (case-sensitive)
- Elements without `data-slot` attributes inside `<include>` are ignored
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

### Layout System

#### Layout Discovery Process

Unify uses a hierarchical layout discovery system with both automatic and explicit layout selection:

**1. Explicit Layout Override (Highest Priority)**

- HTML pages: `data-layout` attribute on root element OR `<link rel="layout">` in document head
- Markdown pages: `layout` key in frontmatter
- Layout files can be located anywhere in the src directory with any filename
- Layout path resolution supports:

**Full Path Syntax:**

- `data-layout="custom.html"` → Look relative to current page directory
- `data-layout="/path/to/layout.html"` → Look from source root (absolute path)
- `data-layout="../shared/layout.html"` → Look relative to current page

**Link Element Layout Discovery (Full HTML Documents Only):**

- `<link rel="layout" href="custom.html">` → Look relative to current page directory
- `<link rel="layout" href="/path/to/layout.html">` → Look from source root (absolute path)
- `<link rel="layout" href="../shared/layout.html">` → Look relative to current page
- Uses typical layout discovery on the `href` value (same path resolution as `data-layout`)
- Only applies to full HTML documents with `<head>` element
- Takes precedence over `data-layout` attribute if both are present

**Short Name Syntax (Convenience Feature):**

- `data-layout="blog"` → Searches for `_blog.layout.html` or `_blog.layout.htm`
- `<link rel="layout" href="blog">` → Same search pattern as `data-layout="blog"`
- Short names drop the underscore prefix (`_`), layout segment (`.layout`), and file extension
- Search order for short names:
  1. Current directory up through parent directories to source root
  2. Then `_includes` directory
- **Important**: Files must have `.layout.html` or `.layout.htm` suffix to be found via short name
- If no matching file found, a warning is produced
- Examples:
  - `data-layout="blog"` finds `_blog.layout.html` in directory hierarchy
  - `data-layout="docs"` finds `_docs.layout.htm` in directory hierarchy or `_includes`
  - `data-layout="api"` finds `_api.layout.html` in directory hierarchy

**2. Automatic Layout Discovery (Default Behavior)**

- **Only applies to files named exactly `_layout.html` or `_layout.htm`**
- Start in the page's directory
- Look for `_layout.html` or `_layout.htm`
- If not found, move up to parent directory and repeat
- Continue climbing the directory tree until reaching source root
- **Note**: Other layout files (e.g., `_blog.layout.html`, `_custom.html`) are NOT automatically applied

**3. Site-wide Fallback Layout (Lowest Priority)**

- If no `_layout.htm(l)` found in directory tree, look for `src/_includes/layout.html` or `src/_includes/layout.htm`
- Note: Files in `_includes` directory do **NOT** require underscore prefix
- This serves as the default site layout for all pages

**4. No Layout**

- If no layout is found at any level, render page content as-is

#### Layout Naming Convention

**Automatic Layout Discovery:**

- Only `_layout.html` or `_layout.htm` files are automatically applied
- These files must be named exactly as shown (with underscore prefix)
- Automatically discovered by climbing directory hierarchy

**Named Layouts (Referenced Explicitly):**

- Can be located anywhere in src directory
- Can have any filename (e.g., `header.html`, `blog-template.html`, `_custom.html`)
- Must be referenced explicitly via `data-layout` or frontmatter `layout`
- For short name discovery, must follow naming pattern `_[name].layout.htm(l)`
- Layouts in the `_includes` folder do not require the `_` prefix for short name discovery

**For regular directories:**

- Layout files should start with underscore (`_`) to be excluded from build output, unless in the `_includes` folder.
- Including `.layout.` in the filename is **required** for short name discovery
- Without `.layout.` suffix, layouts must be referenced by full path

**Examples:**

- `_layout.html` (auto-discovered default layout)
- `_blog.layout.html` (named layout, findable via `data-layout="blog"`)
- `_documentation.layout.html` (named layout, findable via `data-layout="documentation"`)
- `custom-template.html` (must reference via full path like `data-layout="custom-template.html"`)
- `_sidebar.html` (must reference via full path, not findable via short name)

**For `_includes` directory:**

- Layout files do NOT require underscore prefix (entire directory is excluded)
- `layout.html` or `layout.htm` serves as site-wide fallback
- Named layouts should follow pattern `[name].layout.htm(l)` for short name discovery

**Examples in `_includes`:**

- `layout.html` (site-wide fallback)
- `blog.layout.html` (findable via `data-layout="blog"`)
- `docs.layout.html` (findable via `data-layout="docs"`)

#### Example Directory Structure

```
src/
├── _includes/
│   ├── layout.html              # Site-wide fallback (no _ prefix needed)
│   ├── blog.layout.html         # Named blog layout in _includes
│   └── docs.layout.html         # Named docs layout in _includes
├── _layout.html                 # Root layout for all pages in src/
├── blog/
│   ├── _blog.layout.html        # Blog-specific layout
│   ├── post1.html               # Uses _blog.layout.html
│   └── post2.html               # Uses _blog.layout.html
├── docs/
│   ├── api/
│   │   ├── _api.layout.html     # API docs layout
│   │   └── endpoints.html       # Uses _api.layout.html
│   ├── _docs.layout.html        # General docs layout
│   └── guide.html               # Uses _docs.layout.html
├── about.html                   # Uses src/_layout.html
└── index.html                   # Uses src/_layout.html
```

**Layout Discovery Examples:**

- `blog/post1.html` uses `blog/_layout.html` if it exists (auto-discovery)
- `docs/api/endpoints.html` uses `docs/api/_layout.html` if it exists (auto-discovery)
- `docs/guide.html` uses `docs/_layout.html` if it exists (auto-discovery)
- `about.html` and `index.html` use `src/_layout.html` if it exists (auto-discovery)
- If `src/_layout.html` doesn't exist, they use `src/_includes/layout.html` (fallback)

**Short Name Reference Examples:**

- `<html data-layout="blog">` → Finds `_blog.layout.html` or `_blog.layout.htm` in directory hierarchy or `_includes`
- `<html data-layout="docs">` → Finds `_docs.layout.html` or `_docs.layout.htm` in directory hierarchy or `_includes`
- `<html data-layout="api">` → Finds `_api.layout.html` or `_api.layout.htm` in directory hierarchy or `_includes`
- If short name doesn't resolve to a `.layout.htm(l)` file, a warning is produced

**Full Path Reference Examples:**

- `<html data-layout="/shared/base.html">` → Uses `src/shared/base.html`
- `<html data-layout="../layouts/blog.html">` → Uses layout relative to page
- `<html data-layout="custom.html">` → Uses `custom.html` in same directory as page

### Layouts and Slots

Unify composes pages with layouts using a simple, standards-adjacent mechanism:

- **Layouts** define insertion points with `data-slot` attributes.
- **Pages** provide content for those slots using the same `data-slot` attribute.
- Composition happens entirely at build/dev time — no runtime or shadow DOM involved.

> **Tagline:** _Slots without the shadow baggage._  
> Unify reuses the intuitive slot model, but with plain HTML `data-slot` attributes — no shadow DOM, no polyfills, no surprises.

#### Layout Targets

In a layout, any element with `data-slot="name"` marks an insertion point:

```html
<body>
  <header>…</header>
  <main data-slot="default"></main>
  <aside data-slot="sidebar"></aside>
  <footer>…</footer>
</body>
```

**Slot Content Replacement Rules:**

1. **Empty slots:** When a layout slot element has no content or only whitespace, page content is inserted directly
2. **Slots with fallback content:** When a layout slot element contains content, that content serves as fallback and is **completely replaced** by matching page slot content
3. **Default slot:** `data-slot="default"` is the default insertion point. If no `data-slot="default"` exists, Unify injects the page body into the first `<main>` element.

**Example with fallback content:**

```html
<!-- Layout -->
<header>
  <div data-slot="header">
    <h1>Default Title</h1>
    <p>Default subtitle</p>
  </div>
</header>

<!-- Page -->
<template data-slot="header">
  <h1>🚀 Custom Title</h1>
  <p>Custom subtitle with emoji</p>
</template>

<!-- Result: Fallback content is completely replaced -->
<header>
  <div>
    <h1>🚀 Custom Title</h1>
    <p>Custom subtitle with emoji</p>
  </div>
</header>
```

#### Page Providers

Pages declare which slot their content should flow into using the same attribute:

**Preferred (non-rendering):**

```html
<template data-slot="sidebar">
  <nav>Local nav…</nav>
</template>
```

**Visible in standalone previews (rendered, then moved at build time):**

```html
<section data-slot="sidebar">
  <nav>Local nav…</nav>
</section>
```

Both forms are valid. Use `<template>` when you don't want slot content to render standalone, and normal elements when you _do_.

#### Head Merging

When a page specifies a layout with `<link rel="layout" href="…">` or equivalent:

- Unify merges the page `<head>` into the layout `<head>` using the approved merge + dedupe rules.
- Page `<title>`, `<meta name="description">`, `<link rel="canonical">`, etc. override the layout's values with warnings for potential conflicts.

#### Diagnostics

During build, Unify warns if:

- A page references a `data-slot` not present in the layout.
- A declared layout cannot be found.
- A page head entry overrides an identity key from the layout (`title`, description, canonical, etc.).

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

#### Example: Composing with `data-slot`

**Layout (`/_layouts/base.html`):**

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Site Title</title>
    <meta name="description" content="Default description" />
  </head>
  <body>
    <header>Global Header</header>

    <main data-slot="default"></main>
    <aside data-slot="sidebar"></aside>

    <footer>Global Footer</footer>
  </body>
</html>
```

**Page (`/pages/about.html`):**

```html
<!DOCTYPE html>
<html>
  <head>
    <link rel="layout" href="/_layouts/base.html" />
    <title>About Us</title>
    <meta name="description" content="Learn about our company history." />
  </head>
  <body>
    <h1>About</h1>
    <p>Our company was founded in…</p>

    <template data-slot="sidebar">
      <nav>
        <ul>
          <li><a href="/team">Team</a></li>
          <li><a href="/careers">Careers</a></li>
        </ul>
      </nav>
    </template>
  </body>
</html>
```

**Final Output (after Unify build):**

```html
<!DOCTYPE html>
<html>
  <head>
    <title>About Us</title>
    <meta name="description" content="Learn about our company history." />
  </head>
  <body>
    <header>Global Header</header>

    <main>
      <h1>About</h1>
      <p>Our company was founded in…</p>
    </main>

    <aside>
      <nav>
        <ul>
          <li><a href="/team">Team</a></li>
          <li><a href="/careers">Careers</a></li>
        </ul>
      </nav>
    </aside>

    <footer>Global Footer</footer>
  </body>
</html>
```

#### Example: Fragment Page

**Layout (`/_layouts/docs.html`):**

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Docs – My Site</title>
    <meta name="description" content="Documentation layout" />
  </head>
  <body>
    <header>Docs Header</header>

    <main data-slot="default"></main>
    <aside data-slot="sidebar"></aside>

    <footer>Docs Footer</footer>
  </body>
</html>
```

**Page (`/pages/docs/index.html` – fragment style):**

```html
<h1>Documentation</h1>
<p>Welcome to the docs. Use the navigation to explore topics.</p>

<template data-slot="sidebar">
  <nav>
    <ul>
      <li><a href="/docs/getting-started">Getting Started</a></li>
      <li><a href="/docs/api">API Reference</a></li>
    </ul>
  </nav>
</template>
```

**Final Output (after Unify build):**

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Docs – My Site</title>
    <meta name="description" content="Documentation layout" />
  </head>
  <body>
    <header>Docs Header</header>

    <main>
      <h1>Documentation</h1>
      <p>Welcome to the docs. Use the navigation to explore topics.</p>
    </main>

    <aside>
      <nav>
        <ul>
          <li><a href="/docs/getting-started">Getting Started</a></li>
          <li><a href="/docs/api">API Reference</a></li>
        </ul>
      </nav>
    </aside>

    <footer>Docs Footer</footer>
  </body>
</html>
```

### Overrides

**Layout override precedence:**

- For HTML files:
  1. `<link rel="layout">` in document head (highest priority, full HTML documents only)
  2. `data-layout` attribute on root element
  3. Automatic layout discovery chain
- For Markdown files: frontmatter `layout` key takes precedence over discovered layout chain.
- If no override is found, the nearest layout is discovered by climbing the directory tree, then falling back to `_includes/layout.html` if present.
- Both `<link rel="layout" href="...">` and `data-layout` accept:
  - **Full paths**: relative paths or absolute-from-`src` paths (e.g., `_custom.layout.html`, `/path/layout.html`)
  - **Short names**: convenient references that resolve to layout files (e.g., `blog` → `_blog.layout.html`)

**Head override precedence:**

- Layout `<head>` provides base metadata and styles
- Page `<head>` (HTML) or synthesized head (Markdown) takes precedence via merge algorithm
- Deduplication ensures page-specific metadata wins over layout defaults
- Multiple inline styles and scripts from both layout and page are preserved

## Dependency Tracking

- Tracks pages ↔ partials/layouts/includes.
- Rebuild dependents on change.
- Automatically discovers layout dependencies:
  - Explicit `data-layout` attribute references
  - Auto-discovered folder-scoped `_layout.html` files
  - Fallback layouts in `_includes/layout.html`
- Tracks include dependencies (SSI and DOM includes)
- Tracks asset references from HTML and CSS files

## Live Reload and File Watching

The file watcher monitors all changes in the source directory and triggers appropriate rebuilds:

### Layout Changes
- **Explicit layouts**: When a layout file referenced via `data-layout` changes, all pages using that layout are rebuilt
- **Auto-discovered layouts**: When folder-scoped `_layout.html` files change, all pages in that folder hierarchy are rebuilt
- **Fallback layouts**: When `_includes/layout.html` changes, all pages without other layouts are rebuilt

### Component Changes
- When component files (includes) change, all pages that include them are rebuilt
- Handles nested component dependencies (components that include other components)
- Supports both SSI-style (`<!--#include -->`) and DOM-style (`<include>`) includes

### New File Detection
- New HTML/Markdown pages are automatically built when added to source directory
- New component files trigger rebuilds of dependent pages
- New asset files are copied to output if referenced by pages

### Asset Changes
- CSS file changes trigger copying to output directory
- Image and other asset changes trigger copying if referenced by pages
- Asset reference tracking ensures only used assets are copied

### File Deletion Handling
- Deleted pages are removed from output directory
- Deleted components trigger rebuilds of dependent pages (showing "not found" messages)
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

### Scoped Styles

Unify assumes that developers will utilize the `@scope` rule and CSS nesting features to manage component style scoping themselves. These modern CSS features provide a robust way to encapsulate styles for components and layouts. For developers targeting legacy browsers that do not support `@scope`, a polyfill such as [scoped-css-polyfill](https://github.com/GoogleChromeLabs/scoped-css-polyfill) can be leveraged to ensure compatibility. This approach allows Unify to maintain a lightweight and framework-free architecture while empowering developers to adopt modern CSS practices.
