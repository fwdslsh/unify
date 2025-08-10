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

Or create `src/_includes/_layout.html` (fallback layout):

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
<template target="head">
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
- **Layouts**: Files starting with `_` and ending with `layout.html` or `layout.htm`
- **Shared Components**: Files in `_includes/` directory

### Layout System

#### Layout Naming Patterns

Valid layout file names:
- `_layout.html`, `_layout.htm` (standard)
- `_custom.layout.html`, `_blog.layout.htm` (extended patterns)
- `_documentation.layout.html`, `_admin-panel.layout.htm` (complex naming)

#### Layout Discovery

1. **Folder Layout**: Looks for layout files in the page's directory
2. **Parent Directories**: Climbs up to find the nearest layout
3. **Fallback Layout**: Uses `_includes/_layout.html` if it exists
4. **No Layout**: Renders page content as-is

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
│   ├── _layout.html          # Fallback layout
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
│   ├── _layout.html          # Fallback layout
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
│   ├── _layout.html          # Global fallback
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
