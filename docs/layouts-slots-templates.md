# Layouts, Slots, and Templates (v2)

unify provides a powerful templating system that combines convention-based layouts with modern template and slot syntax. This document covers all aspects of the v2 template system.

## Overview

The template system supports three main concepts:

- **Layouts**: Base templates that wrap content using slots
- **Slots**: Placeholders for content insertion
- **Templates**: Modern component-based templating

## HTML Page Types

unify supports two types of HTML pages with different processing behavior:

### Page Fragments

HTML content without complete document structure (`<!DOCTYPE>`, `<html>`, `<head>`, `<body>` elements):

```html
<div data-layout="/layouts/blog.html">
  <h1>Article Title</h1>
  <p>This is a page fragment.</p>
</div>
```

**Features:**
- Content is treated as fragment and inserted into layout's default slot
- Can use `data-layout` attribute on root element for layout discovery
- **Validation**: Only one `data-layout` attribute allowed per fragment
- Head and template elements found in fragments are processed normally

### Full HTML Documents

Complete HTML documents with `<!DOCTYPE html>`, `<html>`, `<head>`, and `<body>` elements:

```html
<!DOCTYPE html>
<html data-layout="/layouts/blog.html">
<head>
  <title>Page Title</title>
</head>
<body>
  <h1>Article Title</h1>
  <p>This is a full HTML document.</p>
</body>
</html>
```

**Features:**
- Document elements are merged with the layout during processing
- Can use `data-layout` attribute on `<html>` or `<body>` elements
- **Document Merging**:
  - Page's DOCTYPE is used if present, otherwise layout's DOCTYPE
  - Layout's `<html>` attributes preserved, page's attributes added/override on conflict
  - HEAD content merged using head merge algorithm (page content wins on conflicts)
  - BODY content inserted into layout's default `<slot>` element

## Layout System

### Convention-Based Layout Discovery

unify automatically discovers and applies layouts based on file naming conventions and directory structure:

**Layout Discovery Precedence (highest to lowest):**

1. **`data-layout` attribute** on root element (fragments) or `<html>`/`<body>` elements (full documents)
2. **Frontmatter `layout` key** (Markdown files only)
3. **Auto Discovery**: Searches for `_layout.html` files in page directory and parent directories
4. **No Layout**: Renders page content as-is if no layout is found

**Layout Path Resolution (v2):**
- **Absolute paths**: `data-layout="/layouts/blog.html"` - resolves from source root
- **Relative paths**: `data-layout="../shared/layout.html"` - relative to current file's directory
- **Auto-discovery**: Only `_layout.html` files (exact name) are auto-discovered

### Layout Naming Convention

**Automatic Layout Discovery:**
- Only files named exactly `_layout.html` are automatically discovered and applied
- These files must be in the page's directory or a parent directory
- Auto-discovery walks up the directory tree until a `_layout.html` is found

**Named Layouts (Referenced Explicitly via data-layout or frontmatter):**
- Can be located anywhere in src directory
- Can have any filename (e.g., `blog-layout.html`, `docs-layout.html`)
- Must be referenced with explicit paths (absolute or relative)

**Recommended naming patterns:**
- `_layout.html` (auto-discovered default layout)
- `layouts/blog.html`, `layouts/docs.html` (explicit layouts in dedicated directory)
- `_blog-layout.html` (co-located with blog pages, must reference explicitly)

### Basic Layout Usage

Layouts provide a base structure for your pages using slot elements for content insertion.

**Layout file: `src/_layout.html`**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <slot name="head"></slot>
</head>
<body>
  <include src="/components/header.html" />
  <main>
    <slot></slot>
  </main>
  <include src="/components/footer.html" />
</body>
</html>
```

**Markdown file with automatic layout: `src/about.md`**
```markdown
---
title: "About Us"
---

# About Us

This content will be placed in the default slot of the layout.
```

**HTML page with automatic layout:**
```html
<template slot="head">
  <title>About Us - My Site</title>
  <meta name="description" content="Learn more about our company">
</template>
<div>
  <h1>About Us</h1>
  <p>This content will be placed in the default slot.</p>
</div>
```

### Explicit Layout References

#### Using `data-layout` Attribute

**Layout file: `src/layouts/blog.html`**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Blog Layout</title>
  <slot name="head"></slot>
</head>
<body>
  <header>
    <h1>My Blog</h1>
  </header>
  <main>
    <slot></slot>
  </main>
</body>
</html>
```

**Page fragment with explicit layout: `src/posts/article.html`**
```html
<article data-layout="/layouts/blog.html">
  <h1>Article Title</h1>
  <p>Article content goes here.</p>
</article>
```

**Full HTML document with explicit layout: `src/posts/full-article.html`**
```html
<!DOCTYPE html>
<html data-layout="/layouts/blog.html">
<head>
  <title>Full Article</title>
</head>
<body>
  <article>
    <h1>Full Article Title</h1>
    <p>Full article content.</p>
  </article>
</body>
</html>
```

**Relative path to layout:**
```html
<!-- From src/blog/posts/article.html -->
<article data-layout="../blog-layout.html">
  <h1>Article Title</h1>
  <p>Uses layout at src/blog/blog-layout.html</p>
</article>
```

### Layout Directory Structure Examples

#### Simple Site Structure
```
src/
├── _layout.html              # Root layout (wraps all pages)
├── components/
│   ├── header.html           # Shared header
│   └── footer.html           # Shared footer
├── index.html                # Homepage (uses _layout.html)
└── about.html                # About page (uses _layout.html)
```

#### Multi-Section Site
```
src/
├── _layout.html              # Root default layout
├── layouts/
│   ├── blog.html             # Blog-specific layout
│   └── docs.html             # Documentation layout
├── components/
│   ├── header.html           # Global header
│   └── footer.html           # Global footer
├── blog/
│   ├── _layout.html          # Blog section default (or use data-layout="/layouts/blog.html")
│   ├── sidebar.html          # Blog sidebar component
│   ├── post1.md              # Blog post (uses blog/_layout.html or /layouts/blog.html)
│   └── post2.md              # Another post
├── docs/
│   ├── _layout.html          # Docs section default
│   ├── toc.html              # Table of contents component
│   ├── guide.html            # Guide (uses docs/_layout.html)
│   └── api.html              # API docs (uses docs/_layout.html)
├── index.html                # Homepage (uses root _layout.html)
└── about.html                # About (uses root _layout.html)
```

### Layout Selection and Overrides

Layouts are selected in order of precedence:

1. **Data attribute**: `data-layout="/layouts/custom.html"` (must be absolute or relative path)
2. **Frontmatter**: `layout: /layouts/custom.html` (for markdown files)
3. **Auto discovery**: Nearest `_layout.html` file in directory tree
4. **No layout**: Renders page content as-is

```html
<!-- Page with absolute path data-layout attribute -->
<div data-layout="/layouts/custom.html">
  <h1>My Blog Post</h1>
</div>

<!-- Page with relative path data-layout attribute -->
<div data-layout="../custom-layout.html">
  <h1>My Blog Post</h1>
</div>
```

### Layout Wrapping Process

When unify processes a page, it follows this wrapping process:

1. **Parse Page Content**: Extract templates and default content
2. **Discover Layout**: Find the appropriate layout using the selection rules
3. **Process Layout**: Parse layout file and identify slots
4. **Fill Slots**: Insert page templates into named slots, default content into unnamed slot
5. **Process Includes**: Resolve all `<include>` elements within the final layout
6. **Output**: Generate the complete HTML page

Example of the wrapping process:

**Page: `src/blog/post.html`**
```html
<div data-layout="/layouts/blog.html">
  <template slot="title">My First Post</template>
  <template slot="meta">
    <meta name="author" content="John Doe">
  </template>
  <h1>Welcome to my blog</h1>
  <p>This is my first post content.</p>
</div>
```

**Layout: `src/layouts/blog.html`**
```html
<!DOCTYPE html>
<html>
<head>
  <title><slot name="title">Default Title</slot></title>
  <slot name="meta"></slot>
</head>
<body>
  <include src="/components/header.html" />
  <article>
    <slot></slot> <!-- Default content goes here -->
  </article>
  <include src="/components/footer.html" />
</body>
</html>
```

**Result: `dist/blog/post.html`**
```html
<!DOCTYPE html>
<html>
<head>
  <title>My First Post</title>
  <meta name="author" content="John Doe">
</head>
<body>
  <header>...</header> <!-- From included header -->
  <article>
    <h1>Welcome to my blog</h1>
    <p>This is my first post content.</p>
  </article>
  <footer>...</footer> <!-- From included footer -->
</body>
</html>
```

## Modern Template System

### Template Elements

Use `<template>` elements for modern component-based templating:

**Page using template: `src/index.html`**
```html
<div data-layout="/layouts/custom.html">
  <template slot="title">Welcome to My Site</template>
  <template slot="meta">
    <meta name="keywords" content="static site, generator">
  </template>

  <h1>Homepage Content</h1>
  <p>This content goes in the default slot.</p>
</div>
```

**Layout with slots: `src/layouts/custom.html`**
```html
<!DOCTYPE html>
<html>
<head>
  <title><slot name="title">Default Title</slot></title>
  <slot name="meta"></slot>
</head>
<body>
  <main>
    <slot></slot> <!-- Default slot for main content -->
  </main>
</body>
</html>
```

### Data-Layout Attribute Syntax

Use the `data-layout` attribute to specify layouts and fill slots:

**Page with data-layout:**
```html
<div data-layout="/layouts/blog.html">
  <template slot="sidebar">
    <h3>Recent Posts</h3>
    <ul>
      <li><a href="/post1">First Post</a></li>
      <li><a href="/post2">Second Post</a></li>
    </ul>
  </template>
  <template slot="meta">
    <meta name="author" content="John Doe">
  </template>

  <!-- Content outside templates goes to default slot -->
  <h1>My Blog Post</h1>
  <p>This is the main content that goes in the default slot.</p>
</div>
```

**Alternative placement on html/body elements:**
```html
<html data-layout="/layouts/blog.html">
  <template slot="title">My Page Title</template>
  <!-- Page content -->
</html>

<!-- OR -->

<body data-layout="/layouts/blog.html">
  <template slot="header">Custom Header</template>
  <!-- Page content -->
</body>
```

### Path Resolution for Layouts

Layout paths are resolved in this order:

1. **Absolute from source**: `data-layout="/layouts/blog.html"` → `src/layouts/blog.html`
2. **Relative to current file**: `data-layout="../shared/layout.html"` → relative to current file's directory
3. **Auto discovery**: Search up directory tree for `_layout.html` files

### Slot Content Options

Pages can provide content for named slots using two approaches with different raw-view behaviors:

#### Template Slot (Hidden in Raw View)

Use `<template slot="name">` for content that should be hidden when viewing the uncompiled page directly in a browser:

```html
<div data-layout="/layouts/blog.html">
  <template slot="sidebar">
    <h3>Recent Posts</h3>
    <ul>
      <li><a href="/post1">First Post</a></li>
    </ul>
  </template>

  <h1>Main Blog Post</h1>
  <p>This content is visible in both raw and compiled views.</p>
</div>
```

**Raw page view**: Only the `<h1>` and `<p>` are visible; the sidebar content is hidden since `<template>` is inert.

**Compiled output**: Sidebar content appears in the layout's `<slot name="sidebar">` position.

#### Element Slot (Visible in Raw View)

Use any element with `slot="name"` for content that should be visible when viewing the uncompiled page:

```html
<div data-layout="/layouts/blog.html">
  <aside slot="sidebar">
    <h3>Recent Posts</h3>
    <ul>
      <li><a href="/post1">First Post</a></li>
    </ul>
  </aside>

  <h1>Main Blog Post</h1>
  <p>This content is visible in both raw and compiled views.</p>
</div>
```

**Raw page view**: Both the sidebar and main content are visible.

**Compiled output**: The `<aside>` element is moved to the layout's `<slot name="sidebar">` position.

#### Layout Fallback Content

Layouts can provide fallback content that displays when slots are empty:

```html
<html>
<head>
  <title><slot name="title">Default Site Title</slot></title>
</head>
<body>
  <aside>
    <slot name="sidebar">
      <h3>Default Sidebar</h3>
      <p>No custom sidebar provided.</p>
    </slot>
  </aside>
  <main>
    <slot>Default main content</slot>
  </main>
</body>
</html>
```

When a layout file is viewed directly in a browser, **all slot fallback content is visible** since `<slot>` elements outside of a shadow DOM display their children.

## Slot System

### Named Slots

Define specific content areas with named slots:

**Layout with multiple slots:**
```html
<!DOCTYPE html>
<html>
<head>
  <slot name="head">
    <!-- Default head content -->
    <meta charset="UTF-8">
  </slot>
</head>
<body>
  <header>
    <slot name="header">
      <h1>Default Header</h1>
    </slot>
  </header>
  <aside>
    <slot name="sidebar">
      <p>Default sidebar content</p>
    </slot>
  </aside>
  <main>
    <slot name="content">
      <slot></slot> <!-- Fallback to default slot -->
    </slot>
  </main>
  <footer>
    <slot name="footer">
      <p>&copy; 2024 My Site</p>
    </slot>
  </footer>
</body>
</html>
```

**Page filling named slots:**
```html
<div data-layout="/layouts/complex.html">
  <template slot="head">
    <title>Custom Page Title</title>
    <link rel="stylesheet" href="/custom.css">
  </template>

  <template slot="header">
    <h1>Custom Header</h1>
    <nav>...</nav>
  </template>

  <template slot="sidebar">
    <h3>Page Navigation</h3>
    <ul>...</ul>
  </template>

  <template slot="footer">
    <p>Custom footer for this page</p>
  </template>

  <!-- Default slot content -->
  <h2>Main Content</h2>
  <p>This goes in the default slot.</p>
</div>
```

### Default Slot

The unnamed slot receives content not in named templates:

```html
<!-- Layout -->
<main>
  <slot></slot> <!-- Receives default content -->
</main>

<!-- Page -->
<div data-layout="/layouts/simple.html">
  <template slot="title">Page Title</template>

  <!-- This content goes to the default slot -->
  <h1>Main Heading</h1>
  <p>Main content here.</p>
</div>
```

### Slot Fallbacks

Provide fallback content for empty slots:

```html
<!-- Layout with fallbacks -->
<header>
  <slot name="header">
    <!-- Fallback content if no header slot provided -->
    <h1>Default Site Title</h1>
    <nav>
      <a href="/">Home</a>
      <a href="/about">About</a>
    </nav>
  </slot>
</header>

<aside>
  <slot name="sidebar">
    <!-- Default sidebar -->
    <h3>Quick Links</h3>
    <ul>
      <li><a href="/contact">Contact</a></li>
    </ul>
  </slot>
</aside>
```

## Advanced Template Patterns

### Component-Based Architecture

Build reusable components with slots:

**Card component: `src/components/card.html`**
```html
<div class="card">
  <header class="card-header">
    <slot name="header">Default Header</slot>
  </header>
  <div class="card-body">
    <slot></slot>
  </div>
  <footer class="card-footer">
    <slot name="footer"></slot>
  </footer>
</div>
```

**Using card component:**
```html
<div data-layout="/layouts/main.html">
  <include src="/components/card.html" />
  <template slot="header">
    <h3>Product Card</h3>
  </template>
  <template slot="footer">
    <button>Buy Now</button>
  </template>

  <!-- Default slot content -->
  <p>Product description goes here.</p>
  <p class="price">$99.99</p>
</div>
```

### Multiple Layout Support

Create specialized layouts for different content types:

**Blog layout: `src/layouts/blog.html`**
```html
<!DOCTYPE html>
<html>
<head>
  <slot name="head">
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </slot>
</head>
<body>
  <include src="/components/header.html" />
  <article>
    <header class="post-header">
      <slot name="post-meta"></slot>
    </header>
    <div class="post-content">
      <slot></slot>
    </div>
    <footer class="post-footer">
      <slot name="comments"></slot>
    </footer>
  </article>
  <include src="/components/footer.html" />
</body>
</html>
```

**Using blog layout explicitly:**
```html
<div data-layout="/layouts/blog.html">
  <template slot="head">
    <title>My Blog Post - My Site</title>
    <meta name="description" content="A great blog post">
  </template>
  <template slot="post-meta">
    <h1>My Blog Post</h1>
    <p class="meta">Published on January 1, 2024</p>
  </template>
  <template slot="comments">
    <include src="/components/comments.html" />
  </template>

  <!-- Main content goes in default slot -->
  <p>This is the main blog post content.</p>
</div>
```

## Markdown Integration

### Templates in Markdown

Markdown files can specify layouts using frontmatter and include components:

```markdown
---
title: "Blog Post"
layout: /layouts/blog.html
---

# My Blog Post

This markdown content will be processed and placed in the default slot of the blog layout.

You can also include components within markdown:

<include src="/components/code-example.html" />

More markdown content here.
```

### Layout Selection in Markdown

Specify layouts in frontmatter:

```markdown
---
layout: /layouts/custom.html    # Absolute path from source root
---

# Page Content

This content will use the custom layout file.
```

```markdown
---
layout: ../custom-layout.html   # Relative path from current file
---

# Page Content

This uses a relative path to the layout.
```

**Auto-discovery:**
If no layout is specified in frontmatter, markdown files use auto-discovery (nearest `_layout.html`).

## Performance and Best Practices

### Template Performance

- **Keep templates focused**: Single responsibility
- **Minimize nesting**: Avoid deeply nested slot structures
- **Cache-friendly**: Templates are processed once per build
- **Slot efficiency**: Named slots are faster than complex selectors

### Best Practices

1. **Consistent naming**: Use descriptive slot names
2. **Fallback content**: Always provide meaningful defaults
3. **Documentation**: Comment complex template logic
4. **Testing**: Verify template rendering with different content
5. **Explicit paths**: Use absolute paths (`/layouts/blog.html`) for shared layouts
6. **Auto-discovery**: Use `_layout.html` for section-specific defaults

### Common Patterns

**Blog layout:**
```html
<!DOCTYPE html>
<html>
<head>
  <slot name="title">Default Blog Title</slot>
  <slot name="meta"></slot>
</head>
<body>
  <article>
    <header>
      <slot name="post-header">
        <h1>Blog Post Title</h1>
      </slot>
    </header>
    <div class="content">
      <slot></slot>
    </div>
    <slot name="comments"></slot>
  </article>
</body>
</html>
```

**Landing page layout:**
```html
<!DOCTYPE html>
<html>
<head>
  <slot name="head"></slot>
</head>
<body class="landing">
  <slot name="hero"></slot>
  <slot name="features"></slot>
  <slot name="testimonials"></slot>
  <slot name="cta"></slot>
  <slot name="footer"></slot>
</body>
</html>
```

## Troubleshooting

### Common Issues

**Slot not rendering:**
- Check slot name spelling matches exactly
- Verify template syntax is correct
- Ensure layout file exists and is accessible

**Layout not applied:**
- Confirm layout file is named `_layout.html` for auto-discovery
- Check `data-layout` path is absolute (`/layouts/blog.html`) or relative (`../layout.html`)
- Verify layout has proper slot placeholders
- Check that layout path resolves correctly (use absolute paths to avoid ambiguity)

**Template elements not working:**
- Check template slot attribute matches slot name in layout
- Ensure template elements are properly nested
- Verify layout file contains the expected slots

### Debug Tips

```bash
# Enable debug mode for template processing
DEBUG=1 unify build

# Check specific file processing
unify build --source src --output debug-dist
```

## Migration from v1

### Layout Discovery Changes

**v1 (multiple discovery methods):**
```html
<!-- Short name -->
<div data-layout="blog">...</div>

<!-- Link element -->
<link rel="layout" href="blog">

<!-- Multiple naming patterns -->
_blog.layout.html
_blog.layout.htm
blog.layout.html (in _includes)
```

**v2 (simplified):**
```html
<!-- Explicit path only -->
<div data-layout="/layouts/blog.html">...</div>

<!-- Auto-discovery: only _layout.html -->
_layout.html (exact name)
```

### Migration Steps

1. **Replace short names with explicit paths:**
   - Change `data-layout="blog"` to `data-layout="/layouts/blog.html"`
   - Change `layout: blog` to `layout: /layouts/blog.html`

2. **Remove `<link rel="layout">` elements:**
   - Replace with `data-layout` attribute on `<html>` or root element

3. **Rename layout files:**
   - Auto-discovered: rename to `_layout.html` (exact name)
   - Explicit: move to `layouts/` directory with descriptive names

4. **Update include syntax:**
   - Replace `<!--#include virtual="path"-->` with `<include src="path" />`

## See Also

- [Include System Documentation](include-syntax.md)
- [App Specification](app-spec.md)
- [Getting Started Guide](getting-started.md)
