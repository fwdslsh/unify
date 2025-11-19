# Getting Started with unify (v2)

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
mkdir -p src/components
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
    <include src="/components/header.html" />
    <main>
      <slot></slot>
    </main>
    <include src="/components/footer.html" />
  </body>
</html>
```

### 3. Create Components

Create `src/components/header.html`:

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

Create `src/components/footer.html`:

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

<include src="/components/contact-form.html" />
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
- **Layouts**: Only `_layout.html` is auto-discovered
- **Shared Components**: Files in `components/` directory or any other directory you choose

### Layout System

#### Layout Naming Patterns

**Auto-discovered layout files:**
- `_layout.html` (automatically applied to pages in that directory and subdirectories)

**Named layout files (referenced explicitly):**
- `layouts/blog.html`
- `layouts/docs.html`
- `custom-layout.html`
- Any `.html` file - must use explicit path reference

#### Layout Discovery

1. **Explicit Override**: `data-layout` attribute or frontmatter with full path
2. **Auto Discovery**: Looks for `_layout.html` files only in page directory and parent directories
3. **No Layout**: Renders page content as-is

**Examples:**

```html
<!-- Explicit layout with absolute path -->
<div data-layout="/layouts/blog.html">
  <h1>Blog Post</h1>
</div>

<!-- Explicit layout with relative path -->
<div data-layout="../custom-layout.html">
  <h1>Custom Page</h1>
</div>

<!-- Auto-discovery: uses nearest _layout.html -->
<div>
  <h1>Auto Layout</h1>
</div>
```

**Markdown frontmatter:**

```markdown
---
title: "My Post"
layout: /layouts/blog.html
---

# My Blog Post

Content here...
```

### Include System

unify uses HTML `<include>` elements for composing pages:

**Absolute paths** (from source root):
```html
<include src="/components/header.html" />
<include src="/components/footer.html" />
```

**Relative paths** (from current file):
```html
<include src="./sidebar.html" />
<include src="../shared/nav.html" />
```

See [Include System Documentation](include-syntax.md) for complete reference.

### File Organization

- **Source directory** (`src/`): Your content and templates
- **Components directory** (`src/components/`): Shared partials (recommended)
- **Layouts directory** (`src/layouts/`): Explicit layouts (recommended)
- **Output directory** (`dist/`): Generated static site

### Development Workflow

1. **Edit** source files
2. **Auto-rebuild** with file watching
3. **Live reload** in browser
4. **Deploy** static output

## Next Steps

- Read the [Full Documentation](../README.md)
- Check the [App Specification](app-spec.md)
- Learn about [Layouts and Slots](layouts-slots-templates.md)

## Common Patterns

### Blog Setup

```
src/
├── components/
│   ├── header.html           # Shared header
│   ├── footer.html           # Shared footer
│   └── blog-nav.html         # Blog navigation
├── layouts/
│   └── blog.html             # Blog-specific layout
├── blog/
│   ├── _layout.html          # Auto-discovered blog layout (alternative)
│   ├── sidebar.html          # Blog sidebar component
│   ├── 2024-01-01-first-post.md
│   └── 2024-01-02-second-post.md
├── index.html
└── blog.html
```

**Blog post using explicit layout:**
```markdown
---
title: "My First Post"
layout: /layouts/blog.html
---

# My First Post

Content here...
```

**Or use auto-discovery with `blog/_layout.html`:**
```markdown
---
title: "My First Post"
---

# My First Post

Content automatically uses blog/_layout.html
```

### Multi-page Site

```
src/
├── _layout.html              # Root layout (auto-discovered for all pages)
├── components/
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
├── _layout.html              # Root default layout
├── layouts/
│   ├── blog.html             # Blog layout (explicit)
│   └── docs.html             # Documentation layout (explicit)
├── components/
│   ├── header.html
│   └── footer.html
├── docs/
│   ├── _layout.html          # Docs auto-discovered layout (alternative)
│   ├── toc.html              # Table of contents component
│   ├── guide.html
│   └── api.html
├── blog/
│   ├── _layout.html          # Blog auto-discovered layout (alternative)
│   ├── sidebar.html          # Blog sidebar
│   └── posts/
│       ├── first-post.md
│       └── second-post.md
└── index.html
```

**Using explicit layouts:**
```html
<!-- In docs/guide.html -->
<div data-layout="/layouts/docs.html">
  <h1>Guide</h1>
  ...
</div>
```

**Or using auto-discovery:**
Place `_layout.html` in the docs/ or blog/ directory and pages will automatically use it.

## Tips and Best Practices

### 1. Use Absolute Paths for Shared Components

```html
<!-- Good: Clear, predictable -->
<include src="/components/header.html" />

<!-- Avoid: Depends on file location -->
<include src="../../components/header.html" />
```

### 2. Organize by Purpose

```
src/
├── components/     # Reusable UI components
├── layouts/        # Page layouts
├── pages/          # Static pages
├── blog/           # Blog posts
└── assets/         # Static assets
```

### 3. Use Auto-Discovery for Section Defaults

Place `_layout.html` in directories to automatically apply layouts to all pages in that section:

```
src/
├── _layout.html          # Default for root pages
├── blog/
│   ├── _layout.html      # Default for blog pages
│   └── post1.md
└── docs/
    ├── _layout.html      # Default for doc pages
    └── guide.md
```

### 4. Use Explicit Layouts for Special Cases

```html
<!-- Override auto-discovered layout -->
<div data-layout="/layouts/landing-page.html">
  <h1>Special Landing Page</h1>
</div>
```

## Migration from v1

If you're upgrading from v1, see the [Layouts and Slots documentation](layouts-slots-templates.md#migration-from-v1) for migration steps.

Key changes:
- Replace `<!--#include virtual="path"-->` with `<include src="path" />`
- Replace short layout names (`data-layout="blog"`) with explicit paths (`data-layout="/layouts/blog.html"`)
- Rename `_blog.layout.html` to either `_layout.html` (auto-discovery) or `layouts/blog.html` (explicit)
- Only `.html` extension supported (no `.htm`)
