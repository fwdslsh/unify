# Getting Started with Unify

This guide walks you through creating your first Unify site using DOM Cascade v1 for area-based composition.

## Installation

### Using the Init Command (Recommended)

```bash
# Initialize a new project with a starter template
unify init

# Or choose a specific template
unify init blog
unify init docs
unify init portfolio
```

### Manual Setup

```bash
# Install globally
npm install -g @fwdslsh/unify

# Or use with npx
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

Create `src/_layout.html` (auto-discovered layout):

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Site</title>
    <style data-unify-docs="v1">
      /* Public areas exposed by this layout */
      .unify-hero {
        /* Hero section area */
      }
      .unify-content {
        /* Main content area */
      }
      .unify-sidebar {
        /* Optional sidebar area */
      }
    </style>
  </head>
  <body>
    <header>
      <h1>My Website</h1>
      <nav>
        <a href="/">Home</a>
        <a href="/about">About</a>
      </nav>
    </header>
    <main>
      <section class="unify-hero">
        <h1>Default Hero</h1>
      </section>
      <div class="content-wrapper">
        <article class="unify-content">
          <p>Default main content</p>
        </article>
        <aside class="unify-sidebar">
          <p>Default sidebar</p>
        </aside>
      </div>
    </main>
    <footer>
      <p>&copy; 2024 My Site. Built with Unify.</p>
    </footer>
  </body>
</html>
```

### 3. Create Pages with Area-Based Composition

Create `src/index.html`:

```html
<body data-unify="/_layout.html">
  <section class="unify-hero">
    <h1>Welcome to My Site</h1>
    <p>Building modern static sites with DOM Cascade</p>
  </section>
  
  <article class="unify-content">
    <h2>Getting Started</h2>
    <p>This site uses Unify's DOM Cascade v1 for area-based composition.</p>
    <p>Content is matched to layout areas using CSS classes.</p>
  </article>
  
  <aside class="unify-sidebar">
    <h3>Quick Links</h3>
    <ul>
      <li><a href="/docs">Documentation</a></li>
      <li><a href="/examples">Examples</a></li>
    </ul>
  </aside>
</body>
```

Create `src/about.md` (Markdown with frontmatter):

```markdown
---
title: "About Us"
description: "Learn more about our mission"
head:
  meta:
    - name: author
      content: "My Team"
---

# About Us

This page demonstrates Markdown processing with DOM Cascade composition.

The content will be placed in the layout's main content area automatically.

## Our Mission

We build great static sites with modern web standards.
```

### 4. Create Components

Create `src/_includes/feature-card.html`:

```html
<div class="card">
  <style data-unify-docs="v1">
    /* Public areas for the feature card */
    .unify-card-title {
      /* Card title area */
    }
    .unify-card-content {
      /* Card content area */
    }
    .unify-card-actions {
      /* Card actions area */
    }
  </style>
  
  <header class="unify-card-title">
    <h3>Default Title</h3>
  </header>
  
  <div class="unify-card-content">
    <p>Default content</p>
  </div>
  
  <footer class="unify-card-actions">
    <button>Learn More</button>
  </footer>
</div>
```

Use the component in `src/features.html`:

```html
<body data-unify="/_layout.html">
  <section class="unify-hero">
    <h1>Our Features</h1>
  </section>
  
  <div class="unify-content">
    <h2>What We Offer</h2>
    
    <!-- Import and customize the component -->
    <div data-unify="/_includes/feature-card.html">
      <h3 class="unify-card-title">DOM Cascade</h3>
      <div class="unify-card-content">
        <p>CSS-like composition with areas and matching</p>
      </div>
      <div class="unify-card-actions">
        <a href="/docs/cascade">Learn More</a>
        <button>Try It</button>
      </div>
    </div>
    
    <div data-unify="/_includes/feature-card.html">
      <h3 class="unify-card-title">Live Development</h3>
      <div class="unify-card-content">
        <p>Hot reload and incremental builds</p>
      </div>
    </div>
  </div>
</body>
```

### 5. Build and Serve

```bash
# Build the site
unify build

# Start development server with live reload
unify serve

# Watch for changes without serving
unify watch
```

Visit `http://localhost:3000` to see your site!

## Core Concepts

### DOM Cascade v1

Unify implements the DOM Cascade specification for predictable composition:

- **Layers**: `layout → components → page` (CSS-like precedence)
- **Areas**: Public regions exposed via `.unify-*` classes
- **Scoping**: Each import creates an independent composition boundary
- **Matching**: Area → Landmark → Ordered fill precedence

### Area-Based Composition

Instead of traditional templating, Unify uses CSS-like area matching:

```html
<!-- Layout exposes areas -->
<section class="unify-hero">Default hero</section>
<main class="unify-content">Default content</main>

<!-- Page targets areas by class -->
<section class="unify-hero">Custom hero content</section>
<article class="unify-content">Custom main content</article>
```

### File Organization

- **Pages**: `.html` or `.md` files that generate output
- **Fragments**: Files prefixed with `_` (layouts, components, partials)
- **Auto-discovery**: `_layout.html` files are automatically applied
- **Includes**: Use `data-unify` for area-based composition

### Convention-Based Architecture

```
src/
├── _includes/          # Shared components and site-wide layout
│   ├── layout.html     # Site-wide fallback layout
│   ├── header.html     # Header component
│   └── nav.html        # Navigation component
├── _layout.html        # Root-level layout (auto-discovered)
├── blog/
│   ├── _layout.html    # Blog-specific layout
│   ├── _sidebar.html   # Blog sidebar component
│   └── post1.md        # Blog post
├── index.html          # Homepage
└── about.md            # About page
```

## Include System

Unify supports both modern area-based composition and legacy Apache SSI:

### Area-Based (Recommended)

```html
<!-- Component with areas -->
<div data-unify="/_includes/card.html">
  <h3 class="unify-title">Custom Title</h3>
  <p class="unify-body">Custom content</p>
</div>
```

### Legacy Apache SSI (Backwards Compatibility)

```html
<!--#include virtual="/_includes/header.html" -->
<!--#include file="../shared/nav.html" -->
```

## Layout Discovery

Unify discovers layouts in this order:

1. **Explicit**: `data-unify` attribute on `<html>` or `<body>`
2. **Frontmatter**: `layout: name` in Markdown
3. **Auto-discovery**: `_layout.html` in page directory or parents
4. **Site fallback**: `_includes/layout.html`
5. **No layout**: Raw page content

## Development Workflow

1. **Create layouts** with documented public areas
2. **Build pages** that target those areas
3. **Import components** with `data-unify`
4. **Live reload** sees changes instantly

## CLI Commands

```bash
# Initialize new project
unify init [template]

# Build site
unify build --source src --output dist

# Development server
unify serve --port 3000 --host localhost

# Build with options
unify build --pretty-urls --minify --clean

# Production build with security checks
unify build --fail-on security --minify
```

## Next Steps

- Read the [Complete App Specification](app-spec.md)
- Learn about [DOM Cascade v1](dom-spec.md)
- Try the [Example Projects](../example/)
- Explore [CLI Reference](cli-reference.md)

## Common Patterns

### Blog Site

```
src/
├── _includes/
│   └── layout.html     # Site-wide layout
├── blog/
│   ├── _layout.html    # Blog-specific layout with areas
│   ├── post1.md        # Uses blog layout
│   └── post2.md
├── index.html          # Homepage
└── about.md            # About page
```

### Multi-Section Site

```
src/
├── _layout.html        # Root layout for all pages
├── docs/
│   ├── _layout.html    # Documentation layout
│   ├── guide.html
│   └── api.html
├── blog/
│   ├── _layout.html    # Blog layout
│   └── posts/
└── index.html
```

### Component Library

```
src/
├── _includes/
│   ├── card.html       # Reusable card component
│   ├── button.html     # Button component
│   └── nav.html        # Navigation component
├── components.html     # Showcase page
└── index.html
```

## Security Features

- **Path traversal prevention**: All file operations are validated
- **Security scanning**: Built-in checks for XSS and injection vectors
- **Build-time validation**: `--fail-on security` for CI/CD pipelines
- **Content policy support**: Works with CSP headers