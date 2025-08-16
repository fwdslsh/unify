# Getting Started with unify

This guide will walk you through creating your first unify site and understanding the core concepts.

## Installation

### Global Installation (Recommended)

```bash
npm install -g @fwdslsh/unify
```

### Or use with npx

```bash
npx @fwdslsh/unify --help
```

## Your First Site

### 1. Create Project Structure

```bash
mkdir my-site
cd my-site

# Create source directory with conventional structure
mkdir -p src/_includes
```

### 2. Create a Layout

Create `src/_layout.html` (folder-scoped layout):

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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

Or create `src/_includes/layout.html` (site-wide fallback layout):

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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

### 3. Create Components

Create `src/_includes/header.html`:

```html
<header>
  <nav>
    <h1>My Site</h1>
    <ul>
      <li><a href="/">Home</a></li>
      <li><a href="/about.html">About</a></li>
    </ul>
  </nav>
</header>
```

Create `src/_includes/footer.html`:

```html
<footer>
  <p>&copy; 2024 My Site. Built with unify.</p>
</footer>
```

### 4. Create Pages

Create `src/index.html`:

```html
<template slot="head">
  <title>Welcome - My Site</title>
</template>
<div>
  <h1>Welcome to My Site</h1>
  <p>This is the home page built with unify.</p>
</div>
```

Create `src/about.md`:

```markdown
---
title: "About Us"
---

# About Us

This page demonstrates markdown with automatic layout integration.

## Features

- Markdown processing with layout
- Frontmatter metadata
- Include processing within markdown

<!--#include virtual="/_includes/contact-form.html" -->
```

### 5. Build and Serve

```bash
# Build the site
unify build

# Start development server
unify serve
```

Visit `http://localhost:3000` to see your site!

## Core Concepts

### Convention-Based Architecture

unify uses conventions to organize your site:

- **Pages**: Any `.html` or `.md` file not starting with `_`
- **Partials**: Files starting with `_` (non-emitting)
- **Layouts**: Only `_layout.html` or `_layout.htm` are auto-discovered; named layouts require `.layout.htm(l)` suffix for short name resolution
- **Shared Components**: Files in `_includes/` directory (no `_` prefix required)

### Layout System

#### Layout Naming Patterns

Auto-discovered layout files:
- `_layout.html`, `_layout.htm` (automatically applied to pages)

Named layout files (referenced via data-layout or frontmatter):
- `_custom.layout.html`, `_blog.layout.htm` (findable via short names)
- `_documentation.layout.html`, `_admin-panel.layout.htm` (findable via short names)
- Any other `_*.html` file (must use full path reference)

#### Layout Discovery

1. **Explicit Override**: `data-layout` attribute or frontmatter (supports short names like `data-layout="blog"`)
2. **Auto Discovery**: Looks for `_layout.html` or `_layout.htm` files only in page directory and parent directories
3. **Site-wide Fallback**: Uses `_includes/layout.html` if it exists (no underscore prefix required)
4. **No Layout**: Renders page content as-is

#### Short Name Layout References

For convenience, you can use short names instead of full file paths:

```html
<!-- Instead of data-layout="_blog.layout.html" -->
<div data-layout="blog">
  <h1>Blog Post</h1>
</div>
```

Short names automatically resolve to (must have `.layout.htm(l)` suffix):
- Search up directory hierarchy: `_blog.layout.html` or `_blog.layout.htm`
- Then `_includes` directory: `blog.layout.html` or `blog.layout.htm`
- Warning produced if short name doesn't resolve

### Include System

unify uses Apache SSI syntax for includes:

- `<!--#include virtual="/path/from/source/root.html" -->`
- `<!--#include file="relative/path.html" -->`

### File Organization

- **Source directory** (`src/`): Your content and templates
- **Includes directory** (`_includes/`): Shared partials and layouts
- **Output directory** (`dist/`): Generated static site

### Development Workflow

1. **Edit** source files
2. **Auto-rebuild** with file watching
3. **Live reload** in browser
4. **Deploy** static output

## Next Steps

- Read the [Full Documentation](../README.md)
- Check out [Example Projects](../example/)
- Learn about [Docker Deployment](docker-usage.md)

## Common Patterns

### Blog Setup

```
src/
├── _includes/
│   ├── layout.html           # Site-wide fallback layout
│   ├── header.html           # Shared header
│   ├── footer.html           # Shared footer
│   └── blog-nav.html         # Blog navigation
├── blog/
│   ├── _blog.layout.html     # Blog-specific layout
│   ├── _sidebar.html         # Blog sidebar partial
│   ├── 2024-01-01-first-post.md
│   └── 2024-01-02-second-post.md
├── index.html
└── blog.html
```

### Multi-page Site

```
src/
├── _includes/
│   ├── layout.html           # Site-wide fallback layout
│   ├── nav.html              # Main navigation
│   └── footer.html           # Footer
├── pages/
│   ├── about.md
│   ├── services.html
│   └── contact.html
├── assets/
│   ├── css/style.css
│   └── images/
└── index.html
```

### Section-Specific Layouts

```
src/
├── _includes/
│   ├── layout.html           # Site-wide fallback
│   ├── header.html
│   └── footer.html
├── docs/
│   ├── _docs.layout.html     # Documentation layout
│   ├── _toc.html             # Table of contents partial
│   ├── guide.html
│   └── api.html
├── blog/
│   ├── _blog.layout.html     # Blog layout
│   ├── _sidebar.html         # Blog sidebar
│   └── posts/
│       ├── first-post.md
│       └── second-post.md
└── index.html
```
