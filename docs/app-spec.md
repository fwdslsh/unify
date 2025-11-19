# Unify Static Site Generator - Simplified Specification v2.0

## Vision Statement

Unify is a **zero-configuration, convention-based static site generator** that leverages standard HTML and modern web practices. Built with Bun for maximum performance and distributed as a single executable requiring no runtime installation.

## Core Principles

1. **Convention over Configuration**: Sensible defaults, minimal setup
2. **Standard HTML First**: Use valid HTML syntax wherever possible
3. **One Way to Do It**: Avoid multiple syntaxes for the same feature
4. **Progressive Enhancement**: Start simple, add complexity only when needed
5. **Performance by Default**: Fast builds, efficient incremental updates

## Design Decisions

### Why Bun-Native?

Unify is distributed as a **single executable binary** compiled from Bun. Users don't need Bun, Node.js, or any runtime installed—just download and run. This approach provides:

- **Zero runtime dependencies**: One file, works everywhere
- **Instant startup**: ~800ms cold start vs 2-3s for Node.js alternatives
- **Native performance**: Built-in HTMLRewriter, fs.watch, and HTTP server
- **Cross-platform**: Single executable for Linux, macOS, Windows

The Bun-native architecture enables features impossible in Node.js without dependencies.

---

## 1. Include System

### Single Syntax: `<include>` Elements

**Rationale**: Modern HTML-like syntax, works with slot injection, easier to understand.

```html
<!-- ✅ Include a component -->
<include src="/components/header.html"></include>

<!-- ✅ Include with content injection -->
<include src="/components/card.html">
  <div data-slot="title">Product Name</div>
  <div data-slot="content">Product description here.</div>
</include>

<!-- ✅ Include markdown (auto-processed) -->
<include src="/blog/intro.md"></include>
```

### Path Resolution Rules

**All paths use the same resolution logic**:

1. **Absolute paths** (start with `/`): Resolve from `src/` root
   - `<include src="/components/nav.html">` → `src/components/nav.html`

2. **Relative paths**: Resolve from current file's directory
   - `<include src="./sidebar.html">` → same directory
   - `<include src="../shared/footer.html">` → parent directory

**No special cases, no search hierarchies.**

### Slot Injection

Pass content to component slots using `data-slot` attributes:

```html
<!-- Component: components/card.html -->
<div class="card">
  <h3 data-slot="title">Default Title</h3>
  <div data-slot="content">Default content</div>
</div>

<!-- Usage -->
<include src="/components/card.html">
  <h3 data-slot="title">Custom Title</h3>
  <p data-slot="content">Custom content here.</p>
</include>

<!-- Output -->
<div class="card">
  <h3>Custom Title</h3>
  <p>Custom content here.</p>
</div>
```

**Rules**:
- Content replaces target element's content entirely
- `data-slot` attribute is removed in output
- If no content provided, original content serves as fallback
- Works recursively with nested includes

### Include Features

- **Markdown support**: `.md` files processed automatically
- **Depth limit**: 10 levels maximum (prevents infinite loops)
- **Circular detection**: Errors on circular dependencies
- **Allowed file types**: `.html`, `.htm`, `.md`, `.txt`, `.svg`
- **Security**: Path traversal prevention (cannot escape `src/` directory)

---

## 2. Layout System

### Two Methods Only

**1. Auto-Discovery (Default)**

Place `_layout.html` in any directory to automatically wrap pages in that directory and subdirectories:

```
src/
├── _layout.html           # Wraps: index.html, about.html
├── index.html
├── about.html
└── blog/
    ├── _layout.html       # Wraps: post1.md, post2.md
    ├── post1.md
    └── post2.md
```

**Search order**: Current directory → parent → grandparent → `src/` root.

**2. Explicit Override**

Override auto-discovery with `data-layout` attribute on root element:

```html
<!-- HTML fragment -->
<article data-layout="/layouts/blog.html">
  <h1>Blog Post</h1>
</article>

<!-- Full document -->
<!DOCTYPE html>
<html data-layout="/layouts/landing.html">
<head><title>Landing Page</title></head>
<body>...</body>
</html>
```

**Path resolution**:
- Absolute: `/layouts/blog.html` → `src/layouts/blog.html`
- Relative: `custom.html` → relative to current file

**No short names, no search hierarchies, no link elements.**

### Layout Structure

Layouts use `data-slot` attributes to mark insertion points:

```html
<!-- layouts/blog.html -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title data-slot="title">Default Blog Title</title>
</head>
<body>
  <header>
    <include src="/components/nav.html"></include>
  </header>

  <main data-slot="content">
    <!-- Page content goes here -->
  </main>

  <aside data-slot="sidebar">
    <!-- Default sidebar content -->
    <p>No sidebar provided</p>
  </aside>

  <footer>
    <include src="/components/footer.html"></include>
  </footer>
</body>
</html>
```

### Providing Slot Content

```html
<!-- Page: blog/post.html -->
<article data-layout="/layouts/blog.html">
  <template data-slot="title">My Blog Post</template>
  <template data-slot="sidebar">
    <h3>Related Posts</h3>
    <ul>
      <li><a href="/post2">Another Post</a></li>
    </ul>
  </template>

  <!-- Content without data-slot goes to default slot (data-slot="content" if exists, or <main> as fallback) -->
  <h1>Blog Post Heading</h1>
  <p>Blog post content here.</p>
</article>
```

**Slot Resolution**:
1. Named slots: `data-slot="name"` matches between page and layout
2. Default slot: Content without `data-slot` goes to `data-slot="content"` or first `<main>` element
3. Fallback: If no slot content provided, layout's original content is preserved

---

## 3. File Processing

### HTML Pages

**Fragment pages** (no `<!DOCTYPE>`, `<html>`, etc.):
```html
<div data-layout="/layouts/page.html">
  <h1>Simple Page</h1>
  <p>Content here</p>
</div>
```

**Full documents**:
```html
<!DOCTYPE html>
<html data-layout="/layouts/page.html">
<head>
  <title>My Page</title>
  <meta name="description" content="Description here">
</head>
<body>
  <h1>Page Content</h1>
</body>
</html>
```

**Document merging** (when layout + full document):
1. Page's `<!DOCTYPE>` preserved (or layout's if page has none)
2. Layout's `<html>` attributes used, page's attributes added/override
3. Head elements merged: page elements appended after layout elements
4. Body content inserted into layout's default slot

### Markdown Pages

```markdown
---
title: "Page Title"
description: "Page description"
layout: "/layouts/blog.html"
---

# Markdown Heading

Content here.
```

**Frontmatter**:
- `title`: Becomes `<title>` element (optional)
- `description`: Becomes `<meta name="description">` element (optional)
- `layout`: Override auto-discovered layout (optional)

**Processing**:
1. Frontmatter extracted and removed
2. Markdown → HTML conversion
3. If `title` or `description` present, synthesized as meta tags
4. Result treated as fragment, wrapped in layout

**Simplified frontmatter** (removed complex head synthesis):
- Only `title`, `description`, `layout` supported
- For custom head elements, use full HTML document instead

### Static Assets

**Convention**: Files/directories starting with `_` are non-emitting (not copied to output).

```
src/
├── _layouts/          # ❌ Not copied (non-emitting directory)
├── _components/       # ❌ Not copied (non-emitting directory)
├── _header.html       # ❌ Not copied (non-emitting file)
├── index.html         # ✅ Copied and processed
├── assets/            # ✅ Copied recursively
│   ├── css/
│   ├── images/
│   └── js/
└── blog/
    ├── _layout.html   # ❌ Not copied (layout)
    └── post.md        # ✅ Copied and processed
```

**Asset copying**:
- Files not starting with `_` are copied
- HTML/Markdown files are processed
- All other files copied as-is
- Directory structure preserved

---

## 4. Conventions

### Directory Structure

```
project/
├── src/                    # Source files (default)
│   ├── _layouts/           # Shared layouts (optional)
│   ├── _components/        # Shared components (optional)
│   ├── _layout.html        # Root layout (optional)
│   ├── assets/             # Static assets
│   ├── index.html          # Pages
│   ├── about.html
│   └── blog/
│       ├── _layout.html    # Blog layout
│       ├── post1.md
│       └── post2.md
└── dist/                   # Output (default)
    ├── index.html
    ├── about.html
    ├── assets/
    └── blog/
        ├── post1.html
        └── post2.html
```

### Naming Conventions

1. **Layouts**: Name them `_layout.html` for auto-discovery
2. **Components**: Store in `_components/` or any `_directory/`
3. **Pages**: Regular names (no underscore prefix)
4. **Assets**: Store in `assets/` or any non-underscore directory

**Recommendation**: Use semantic names
- `_components/nav.html` (not `_nav.html`)
- `_components/card.html` (not `_card-component.html`)
- `_layouts/blog.html` (not `_blog.layout.html`)

---

## 5. CLI Interface

### Commands

```bash
# Build (default command)
unify
unify build

# Development server with live reload
unify serve

# Watch and rebuild (no server)
unify watch
```

### Options

**Directory Options**:
- `--source, -s <dir>` - Source directory (default: `src`)
- `--output, -o <dir>` - Output directory (default: `dist`)

**Build Options**:
- `--clean` - Clean output before build
- `--pretty-urls` - Generate pretty URLs (`about.html` → `about/index.html`)
- `--base-url <url>` - Base URL for sitemap (default: from package.json or `https://example.com`)
- `--no-sitemap` - Disable sitemap generation

**Server Options** (serve command only):
- `--port, -p <number>` - Server port (default: `3000`)
- `--host <hostname>` - Server host (default: `localhost`)

**Global Options**:
- `--help, -h` - Show help
- `--version, -v` - Show version
- `--verbose` - Enable verbose logging

### Pretty URLs

When enabled, transforms file structure for clean URLs:

```
Input:              Output (--pretty-urls):
src/about.html  →   dist/about/index.html
src/blog.html   →   dist/blog/index.html
src/index.html  →   dist/index.html (special case)
```

**Link transformation**: HTML links automatically updated to match:
- `<a href="about.html">` → `<a href="/about/">`
- `<a href="blog.html#section">` → `<a href="/blog/#section">`
- `<a href="page.html?query=1">` → `<a href="/page/?query=1">`

**Preserved links** (not transformed):
- External: `https://example.com`
- Protocols: `mailto:`, `tel:`, `ftp:`, etc.
- Data URLs: `data:image/png;base64,...`
- Non-HTML: `document.pdf`, `style.css`
- Fragments: `#anchor`

---

## 6. Features

### Live Reload

When using `unify serve`:
1. File watcher monitors `src/` directory
2. Changes trigger incremental rebuild
3. Browser receives Server-Sent Events (SSE) at `/__live-reload`
4. Page auto-refreshes

**Smart rebuilds**:
- Changing a page rebuilds only that page
- Changing a component rebuilds all pages that include it
- Changing a layout rebuilds all pages using it

### Incremental Builds

**Build cache** tracks file hashes and dependencies:
- Only rebuild changed files and their dependents
- Typical incremental build: <1 second
- Cache stored in `.unify-cache/` (git-ignored)

### Dependency Tracking

Automatically tracks:
- `<include>` dependencies
- Layout dependencies
- Nested include chains

When a file changes, all dependent files are rebuilt.

### Sitemap Generation

Automatic `sitemap.xml` generation:
- All HTML pages included
- Uses `--base-url` or package.json `homepage`
- Respects pretty URLs if enabled
- Disable with `--no-sitemap`

### Security

**Path traversal prevention**:
```html
<!-- ❌ Blocked: Cannot escape src/ directory -->
<include src="../../etc/passwd"></include>
<include src="/etc/passwd"></include>
```

**File type restrictions**:
- Only `.html`, `.htm`, `.md`, `.txt`, `.svg` can be included
- Binary files rejected

**Depth limiting**:
- Maximum 10 levels of nested includes
- Prevents infinite loops and stack overflow

---

## 7. Performance Requirements

### Build Performance

| Metric | Target | Status |
|--------|--------|--------|
| Cold start | <1s | ✅ ~800ms |
| Initial build (100 pages) | <5s | ✅ ~800ms |
| Incremental (1 file) | <1s | ✅ ~200ms |
| Large project (1000 pages) | <30s | ✅ ~18s |

### Memory Efficiency

- Streaming file processing (no full-site memory load)
- Memory usage <100MB for typical projects (<200 pages)

### Live Reload

- File change detection: <100ms (native fs.watch)
- Rebuild + reload: <2s for typical changes

---

## 8. Error Handling

### User-Friendly Errors

All errors include:
- Clear description of what went wrong
- File path and line number (if applicable)
- Suggestions for fixing

**Example**:
```
ERROR: Include file not found: header.html
  in: src/index.html:5

Suggestions:
  • Create the file: src/_components/header.html
  • Check the path and spelling
  • Use absolute path: <include src="/components/header.html">
```

### Error Levels

- **Warning**: Build continues (missing include, deprecated syntax)
- **Error**: Build continues, exit code 1 (broken references)
- **Fatal**: Build stops immediately (invalid syntax, circular dependencies)

### Exit Codes

- `0`: Success
- `1`: Build completed with errors
- `2`: Fatal error (build aborted)

---

## 9. Migration Notes

### Removed Features

**SSI includes** (use `<include>` instead):
```html
<!-- ❌ Old (removed) -->
<!--#include virtual="/header.html" -->
<!--#include file="footer.html" -->

<!-- ✅ New -->
<include src="/components/header.html"></include>
<include src="./footer.html"></include>
```

**Complex frontmatter head synthesis** (use full HTML documents for custom head):
```yaml
# ❌ Old (removed)
---
head:
  meta:
    - name: robots
      content: "index"
  script:
    - type: "application/ld+json"
      json: {...}
---
```

```html
<!-- ✅ New: Use full HTML document -->
<!DOCTYPE html>
<html data-layout="/layouts/base.html">
<head>
  <title>Page Title</title>
  <meta name="description" content="Description">
  <meta name="robots" content="index">
  <script type="application/ld+json">
    {"@type": "WebPage"}
  </script>
</head>
<body>
  <h1>Content</h1>
</body>
</html>
```

**Short layout names** (use explicit paths):
```html
<!-- ❌ Old (removed) -->
<div data-layout="blog">...</div>  <!-- searched for _blog.layout.html -->

<!-- ✅ New -->
<div data-layout="/layouts/blog.html">...</div>
```

**`<link rel="layout">`** (use data-layout attribute):
```html
<!-- ❌ Old (removed) -->
<head>
  <link rel="layout" href="/layouts/blog.html">
</head>

<!-- ✅ New -->
<html data-layout="/layouts/blog.html">
```

---

## 10. Implementation Status

### ✅ Implemented Features

- [x] Include system with `<include>` elements
- [x] Slot injection with `data-slot`
- [x] Layout auto-discovery
- [x] Layout override with `data-layout`
- [x] Markdown processing
- [x] Basic frontmatter (title, description, layout)
- [x] Fragment and full document support
- [x] Live reload server
- [x] Incremental builds
- [x] Dependency tracking
- [x] Pretty URLs
- [x] Sitemap generation
- [x] Path traversal prevention
- [x] Cross-platform executables

### 🚧 Planned Features

- [ ] Head element deduplication (title, meta, link)
- [ ] Plugin system (custom processors)
- [ ] Data files (JSON/YAML)
- [ ] Template filters
- [ ] Asset optimization (minification)

### ❌ Explicitly Not Planned

- SSI-style includes (use `<include>` instead)
- Complex frontmatter head synthesis (use HTML documents)
- Short layout name resolution (use explicit paths)
- Multiple include syntaxes (one way only)

---

## Summary: Key Simplifications

| Before | After | Rationale |
|--------|-------|-----------|
| 2 include syntaxes (SSI + `<include>`) | 1 (`<include>` only) | Reduce cognitive load |
| 5 layout discovery methods | 2 (auto + explicit) | Easier to understand |
| Complex head synthesis from frontmatter | Simple title/description only | Use HTML for complex needs |
| Short name resolution + search | Explicit paths only | Predictable behavior |
| Path resolution varies by context | Unified resolution | Consistent across features |
| `_*.layout.html` naming | `_layout.html` only | Clear convention |

**Goal**: Make Unify the simplest, fastest SSG for modern web development—no runtime dependencies, no complexity bloat.
