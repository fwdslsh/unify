# Layouts, Slots, and Templates

unify provides a powerful templating system that combines convention-based layouts with modern template and slot syntax. This document covers all aspects of the template system.

## Overview

The template system supports three main concepts:

- **Layouts**: Base templates that wrap content using slots
- **Slots**: Placeholders for content insertion
- **Templates**: Modern component-based templating

## Layout System

### Convention-Based Layout Discovery

unify automatically discovers and applies layouts based on file naming conventions and directory structure:

1. **Explicit Override**: `data-layout` attribute or frontmatter (supports short names like `data-layout="blog"`)
2. **Auto Discovery**: Searches for `_layout.html` or `_layout.htm` files in page directory and parent directories
3. **Site-wide Fallback**: Uses `_includes/layout.html` if it exists (no underscore prefix required)
4. **No Layout**: Renders page content as-is if no layout is found

### Layout Naming Convention

**Automatic Layout Discovery:**
- Only files named exactly `_layout.html` or `_layout.htm` are automatically discovered and applied
- These files must be in the page's directory or a parent directory
- Site-wide fallback: `_includes/layout.html` or `_includes/layout.htm` (no underscore prefix)

**Named Layouts (Referenced Explicitly via data-layout or frontmatter):**
- Can be located anywhere in src directory
- Can have any filename (e.g., `_custom.html`, `_blog-template.html`)
- For short name discovery (e.g., `data-layout="blog"`), must follow pattern `_[name].layout.htm(l)`
- Files in `_includes/` don't require underscore prefix for short names

**Recommended naming patterns:**
- `_layout.html`, `_layout.htm` (auto-discovered default layout)
- `_blog.layout.html`, `_documentation.layout.htm` (named layouts, findable via short names)
- `_custom-template.html` (must reference via full path)

**Special case for `_includes` directory:**
- `layout.html` or `layout.htm` serves as site-wide fallback
- Named layouts should follow pattern `[name].layout.htm(l)` for short name discovery

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
  <!--#include virtual="/_includes/header.html" -->
  <main>
    <slot></slot>
  </main>
  <!--#include virtual="/_includes/footer.html" -->
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

### Layout Directory Structure Examples

#### Simple Site Structure
```
src/
├── _layout.html              # Root layout (wraps all pages)
├── _includes/
│   ├── header.html           # Shared header
│   └── footer.html           # Shared footer
├── index.html                # Homepage (uses _layout.html)
└── about.html                # About page (uses _layout.html)
```

#### Multi-Section Site
```
src/
├── _includes/
│   ├── layout.html           # Site-wide fallback layout
│   ├── header.html           # Global header
│   └── footer.html           # Global footer
├── blog/
│   ├── _blog.layout.html     # Blog-specific layout
│   ├── _sidebar.html         # Blog sidebar partial
│   ├── post1.md              # Blog post (uses _blog.layout.html)
│   └── post2.md              # Another post (uses _blog.layout.html)
├── docs/
│   ├── _docs.layout.html     # Documentation layout
│   ├── _toc.html             # Table of contents
│   ├── guide.html            # Guide (uses _docs.layout.html)
│   └── api.html              # API docs (uses _docs.layout.html)
├── index.html                # Homepage (uses _includes/layout.html)
└── about.html                # About (uses _includes/layout.html)
```

### Layout Selection and Overrides

Layouts are selected in order of precedence:

1. **Data attribute**: `<div data-layout="_custom.layout.html">` or `<div data-layout="blog">` (supports short names)
2. **Frontmatter**: `layout: custom` (for markdown files - searches for `_custom.layout.html`)
3. **Auto discovery**: Nearest `_layout.html` or `_layout.htm` file in directory tree
4. **Site-wide fallback**: `_includes/layout.html` if it exists
5. **No layout**: Renders page content as-is

```html
<!-- Page with full path data-layout attribute -->
<div data-layout="_custom.layout.html">
  <h1>My Blog Post</h1>
</div>

<!-- Page with short name data-layout attribute -->
<div data-layout="blog">
  <h1>My Blog Post</h1>
</div>
```

#### Short Name Layout References

Short names provide a convenient way to reference layouts without full file paths:

```html
<!-- Short name automatically resolves to: -->
<!-- Same directory: _blog.layout.html, _blog.html -->
<!-- _includes directory: blog.layout.html, blog.html -->
<div data-layout="blog">
  <h1>Blog Content</h1>
</div>
```

```markdown
---
layout: blog              # Searches for _blog.layout.html in current or parent directories
---
# My Blog Post
```

### Layout Wrapping Process

When unify processes a page, it follows this wrapping process:

1. **Parse Page Content**: Extract templates and default content
2. **Discover Layout**: Find the appropriate layout using the selection rules
3. **Process Layout**: Parse layout file and identify slots
4. **Fill Slots**: Insert page templates into named slots, default content into unnamed slot
5. **Process Includes**: Resolve all includes within the final layout
6. **Output**: Generate the complete HTML page

Example of the wrapping process:

**Page: `src/blog/post.html`**
```html
<template slot="title">My First Post</template>
<template slot="meta">
  <meta name="author" content="John Doe">
</template>
<h1>Welcome to my blog</h1>
<p>This is my first post content.</p>
```

**Layout: `src/blog/_blog.layout.html`**
```html
<!DOCTYPE html>
<html>
<head>
  <title><slot name="title">Default Title</slot></title>
  <slot name="meta"></slot>
</head>
<body>
  <!--#include virtual="/_includes/header.html" -->
  <article>
    <slot></slot> <!-- Default content goes here -->
  </article>
  <!--#include virtual="/_includes/footer.html" -->
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
<div data-layout="_custom.layout.html">
  <template slot="title">Welcome to My Site</template>
  <template slot="meta">
    <meta name="keywords" content="static site, generator">
  </template>
  
  <h1>Homepage Content</h1>
  <p>This content goes in the default slot.</p>
</div>
```

**Layout with slots: `src/_custom.layout.html`**
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
<div data-layout="_blog.layout.html">
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
<html data-layout="_blog.layout.html">
  <template slot="title">My Page Title</template>
  <!-- Page content -->
</html>

<!-- OR -->

<body data-layout="_blog.layout.html">
  <template slot="header">Custom Header</template>
  <!-- Page content -->
</body>
```

### Path Resolution for Layouts

Layout paths are resolved in this order:

1. **Short names**: `data-layout="blog"` → Searches for `_blog.layout.html`, `_blog.html` in same directory and `blog.layout.html`, `blog.html` in `_includes`
2. **Absolute from source**: `data-layout="/_includes/layout.html"` → `src/_includes/layout.html`
3. **Relative to current directory**: `data-layout="_custom.layout.html"` → current directory
4. **Auto discovery**: Search up directory tree for `_*.layout.html` then `_*.html` files
5. **Site-wide fallback**: `src/_includes/layout.html` if it exists

### Slot Content Options

Pages can provide content for named slots using two approaches with different raw-view behaviors:

#### Template Slot (Hidden in Raw View)

Use `<template slot="name">` for content that should be hidden when viewing the uncompiled page directly in a browser:

```html
<div data-layout="_blog.layout.html">
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
<div data-layout="_blog.layout.html">
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
<div data-layout="layouts/complex.html">
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
<div data-layout="layout.html">
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

**Card component: `src/_includes/card.html`**
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
<div data-layout="_layout.html">
  <!--#include virtual="/_includes/card.html" -->
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

**Blog layout: `src/blog/_blog.layout.html`**
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
  <!--#include virtual="/_includes/header.html" -->
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
  <!--#include virtual="/_includes/footer.html" -->
</body>
</html>
```

**Using blog layout:**
```html
<!-- This page is in src/blog/ directory, so it automatically uses _blog.layout.html -->
<template slot="head">
  <title>My Blog Post - My Site</title>
  <meta name="description" content="A great blog post">
</template>
<template slot="post-meta">
  <h1>My Blog Post</h1>
  <p class="meta">Published on January 1, 2024</p>
</template>
<template slot="comments">
  <!--#include virtual="/_includes/comments.html" -->
</template>

<!-- Main content goes in default slot -->
<p>This is the main blog post content.</p>

## Integration with Includes

### Conditional Slots

Show slots based on conditions:

```html
<!-- Layout with conditional slots -->
<article>
  <header>
    <h1><slot name="title"></slot></h1>
    {{#if author}}
    <p class="author">
      By <slot name="author">{{ author }}</slot>
    </p>
    {{/if}}
  </header>
  
  <div class="content">
    <slot></slot>
  </div>
  
  {{#if tags}}
  <footer class="tags">
    <slot name="tags">
      {{#each tags}}
      <span class="tag">{{ . }}</span>
      {{/each}}
    </slot>
  </footer>
  {{/if}}
</article>
## Markdown Integration

## Markdown Integration

### Templates in Markdown

Markdown files can specify layouts using frontmatter and include template elements:

```markdown
---
title: "Blog Post"
layout: blog
---

# My Blog Post

This markdown content will be processed and placed in the default slot of the blog layout.

You can also include components within markdown:

<!--#include virtual="/_includes/code-example.html" -->

More markdown content here.
```

### Layout Selection in Markdown

Specify layouts in frontmatter:

```markdown
---
layout: custom-layout    # Searches for _custom-layout.layout.html in current/parent directories
---

# Page Content

This content will use the custom-layout layout file.
```

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

- Confirm layout file follows naming conventions (`_*.layout.html` or `_*.html`)
- Check frontmatter layout name matches filename (without `_` prefix)
- Verify layout has proper slot placeholders
- For short names, ensure layout exists in same directory or `_includes/`

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

## Migration from Other Systems

### From Liquid Templates

```liquid
<!-- Liquid -->
{% layout "base" %}
{% block title %}Page Title{% endblock %}
{% block content %}Content here{% endblock %}

<!-- unify -->
<div data-layout="layouts/base.html">
  <template slot="title">Page Title</template>
  Content here (goes to default slot)
</div>
```

### From Handlebars

```handlebars
<!-- Handlebars -->
{{> header title="Page Title"}}
<main>{{{content}}}</main>
{{> footer}}

<!-- unify -->
<!--#include virtual="/.components/header.html" -->
<main>
  <slot></slot>
</main>
<!--#include virtual="/.components/footer.html" -->
```

### From Hugo Partials

```go
<!-- Hugo -->
{{ partial "header.html" . }}
<main>{{ .Content }}</main>
{{ partial "footer.html" . }}

<!-- unify -->
<!--#include virtual="/.components/header.html" -->
<main>
  <slot></slot>
</main>
<!--#include virtual="/.components/footer.html" -->
```

## See Also

- [Include System Documentation](include-syntax.md)
- [Template Elements in Markdown](template-elements-in-markdown.md)
- [Getting Started Guide](getting-started.md)
