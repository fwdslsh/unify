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

# Create source directory
mkdir -p src/.components src/.layouts
```

### 2. Create a Layout

Create `src/.layouts/default.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <slot name="head"></slot>
  </head>
  <body>
    <!--#include virtual="/.components/header.html" -->
    <main>
      <slot></slot>
    </main>
    <!--#include virtual="/.components/footer.html" -->
  </body>
</html>
```

### 3. Create Components

Create `src/.components/header.html`:

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

Create `src/.components/footer.html`:

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
layout: default
---

# About Us

This page demonstrates markdown with frontmatter and layout integration.

## Features

- Markdown processing with layout
- Frontmatter metadata
- Include processing within markdown

<!--#include virtual="/.components/contact-form.html" -->
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

### Include System

unify uses Apache SSI syntax for includes:

- `<!--#include virtual="/path/from/source/root.html" -->`
- `<!--#include file="relative/path.html" -->`

### File Organization

- **Source directory** (`src/`): Your content and templates
- **Components directory** (`.components/`): Reusable includes
- **Layouts directory** (`.layouts/`): Page templates
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
├── .layouts/
│   ├── default.html
│   └── blog-post.html
├── .components/
│   ├── header.html
│   ├── footer.html
│   └── blog-nav.html
├── posts/
│   ├── 2024-01-01-first-post.md
│   └── 2024-01-02-second-post.md
├── index.html
└── blog.html
```

### Multi-page Site

```
src/
├── .layouts/default.html
├── .components/
│   ├── nav.html
│   └── footer.html
├── pages/
│   ├── about.md
│   ├── services.html
│   └── contact.html
├── assets/
│   ├── css/style.css
│   └── images/
└── index.html
```

### Component-based

```
src/
├── .components/
│   ├── hero-section.html
│   ├── feature-card.html
│   ├── testimonial.html
│   └── call-to-action.html
├── pages/
└── index.html
```
