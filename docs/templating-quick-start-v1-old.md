
# Templating Quick Start Guide

A simple introduction to unify's templating features. Learn the basics of layouts, slots, templates, and includes in minutes.

## Overview

unify has four simple templating features:

- **Layouts** → Page structure with `data-slot="example"` placeholders
- **Slots** → Content placeholders in layouts with optional default content
- **Templates** → Content containers with `<template data-slot="example">`
- **Includes** → Component insertion with `<!--#include virtual="..." -->` or `<include src="...">`

## 1. Layouts (Page Structure)

**What it does:** Provides page structure with slot placeholders that pages can fill

**Layout file:** `src/.layouts/default.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title data-slot="title">Default Site Title</title>
  <div data-slot="head"></div>
</head>
<body>
  <header>
    <div data-slot="header">
      <h1>My Website</h1>
    </div>
  </header>
  <main data-slot="default">
    <!-- Default slot for main content -->
  </main>
  <footer>
    <div data-slot="footer">
      <p>&copy; 2024 My Site</p>
    </div>
  </footer>
</body>
</html>
```

**Your page:** `src/about.html`

```html
<div data-layout="default">
  <template data-slot="title">About Us - My Site</template>
  <template data-slot="header">
    <h1>About Our Company</h1>
  </template>
  
  <!-- This content goes to the default slot -->
  <h2>Our Story</h2>
  <p>We've been serving customers since 2020...</p>
</div>
```

**Markdown page:** `src/blog.md`

```markdown
---
layout: default
---

# My Blog Post

This markdown content goes to the default slot in the layout.
```

**Result:** A complete HTML page with your content placed in the layout's slots.

## 2. Templates (Content Containers)

**What it does:** Holds content to be inserted into layout slots

**Layout with slots:** `src/.layouts/article.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title data-slot="title">Default Article Title</title>
  <div data-slot="head"></div>
</head>
<body>
  <article>
    <header>
      <h1 data-slot="headline"></h1>
      <p class="meta" data-slot="meta">Published recently</p>
    </header>
    <div class="content">
      <div data-slot="default"></div> <!-- Main article content -->
    </div>
  </article>
</body>
</html>
```

**Your page:** `src/my-article.html`

```html
<div data-layout="article">
  <template data-slot="title">Amazing Discovery - My Blog</template>
  <template data-slot="headline">Scientists Make Amazing Discovery</template>
  <template data-slot="meta">Published on March 15, 2024 by Jane Doe</template>
  <template data-slot="head">
    <meta name="description" content="Learn about this amazing discovery">
  </template>
  
  <!-- This content goes to the default slot -->
  <p>Scientists have made an incredible breakthrough...</p>
  <p>The implications are enormous...</p>
</div>
```

**Result:** Template contents are inserted into the corresponding layout slots.

## 3. Slots (Content Placeholders)

**What it does:** Creates placeholders in layouts that can be filled with template content

**Layout with various slot types:** `src/.layouts/page.html`

```html
<!DOCTYPE html>
<html>
<head>
  <div data-slot="head">
    <!-- Default head content if no template provides it -->
    <meta charset="UTF-8">
    <title>My Website</title>
  </div>
</head>
<body>
  <header>
    <div data-slot="header">
      <h1>Default Header</h1>
    </div>
  </header>
  <main data-slot="default">
    <!-- Default slot - gets content not in named templates -->
  </main>
  <footer>
    <div data-slot="footer">
      <p>&copy; 2024 My Site</p>
    </div>
  </footer>
</body>
</html>
```

**Page using some slots:** `src/contact.html`

```html
<div data-layout="page">
  <template data-slot="head">
    <title>Contact Us - My Site</title>
    <meta name="description" content="Get in touch with us">
  </template>
  <template data-slot="header">
    <h1>Contact Us</h1>
  </template>
  <!-- No footer template provided - uses default from layout -->
  
  <!-- This content goes to the default slot -->
  <h2>Get In Touch</h2>
  <p>Send us a message...</p>
</div>
```

**Key concepts:**

- Named slots: `data-slot="title"` → filled by `<template data-slot="title">`
- Default slot: `data-slot="default"` → gets content not in named templates
- Fallback content: Content inside elements with `data-slot` attributes is used when no template fills the slot

## 4. Includes (Component Insertion)

**What it does:** Inserts the content of a component file into the DOM

**Header component:** `src/.components/site-header.html`

```html
<header class="site-header">
  <h1 data-slot="site-title">My Website</h1>
  <nav data-slot="navigation">
    <a href="/">Home</a>
    <a href="/about">About</a>
  </nav>
</header>
```

**Using includes - Comment syntax:** `src/index.html`

```html
<!DOCTYPE html>
<html>
<body>
  <!--#include virtual="/.components/site-header.html" -->
  <template data-slot="site-title">Welcome to My Site</template>
  <template data-slot="navigation">
    <a href="/">Home</a>
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
  </template>
  
  <main>
    <h2>Welcome!</h2>
    <p>This is my homepage content.</p>
  </main>
</body>
</html>
```

**Using includes - Element syntax:** `src/products.html`

```html
<!DOCTYPE html>
<html>
<body>
  <include src="/.components/site-header.html"></include>
  <template data-slot="site-title">Our Products</template>
  
  <main>
    <h2>Product Catalog</h2>
    <p>Browse our amazing products...</p>
  </main>
</body>
</html>
```

**Include path types:**

- `virtual="/.components/file.html"` → Path from source root (src/)
- `file="../components/file.html"` → Path relative to current file
- `src="/.components/file.html"` → Element syntax, path from source root

## Combining Features

The real power comes from combining layouts, slots, templates, and includes:

**Reusable card component:** `src/.components/product-card.html`

```html
<div class="card">
  <div class="card-header">
    <h3 data-slot="title">Product Title</h3>
    <p class="price" data-slot="price">$0.00</p>
  </div>
  <div class="card-body" data-slot="default">
    <!-- Main product description -->
  </div>
  <div class="card-footer">
    <div data-slot="actions">
      <button>Learn More</button>
    </div>
  </div>
</div>
```

**Layout with product grid:** `src/.layouts/shop.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title data-slot="title">My Shop</title>
  <div data-slot="head"></div>
</head>
<body>
  <header>
    <div data-slot="header">
      <h1>My Online Shop</h1>
    </div>
  </header>
  <main class="product-grid" data-slot="default">
    <!-- Products go here -->
  </main>
</body>
</html>
```

**Products page using everything:** `src/products.html`

```html
<div data-layout="shop">
  <template data-slot="title">Amazing Products - My Shop</template>
  <template data-slot="header">
    <h1>Our Amazing Products</h1>
    <p>Find exactly what you need</p>
  </template>
  
  <!-- Include and customize product cards -->
  <!--#include virtual="/.components/product-card.html" -->
  <template data-slot="title">Super Widget</template>
  <template data-slot="price">$29.99</template>
  <template data-slot="actions">
    <button class="btn-primary">Buy Now</button>
    <button class="btn-secondary">Add to Cart</button>
  </template>
  <p>The most amazing widget you'll ever own!</p>
  
  <!--#include virtual="/.components/product-card.html" -->
  <template data-slot="title">Mega Gadget</template>
  <template data-slot="price">$49.99</template>
  <p>This gadget will revolutionize your workflow.</p>
</div>
```

## Directory Structure

Keep your files organized:

```text
src/
├── .layouts/          # Page layouts with slots
│   ├── default.html
│   ├── article.html
│   └── shop.html
├── .components/       # Reusable components with slots
│   ├── site-header.html
│   ├── product-card.html
│   └── footer.html
├── pages/            # Your content pages
│   ├── index.html
│   ├── about.html
│   └── products.html
└── blog/             # Markdown content
    ├── post1.md
    └── post2.md
```

## Quick Reference

| Feature | Syntax | Purpose |
|---------|--------|---------|
| Layout selection | `data-layout="path/layout.html"` | Specify which layout to use |
| Layout selection (MD) | `layout: default` in frontmatter | Specify layout for markdown |
| Named slot | `data-slot="title"` | Content placeholder with fallback |
| Default slot | `data-slot="default"` | Main content area |
| Fill slot | `<template data-slot="title">Content</template>` | Provide content for named slot |
| Virtual include | `<!--#include virtual="/file.html" -->` | Include from source root |
| File include | `<!--#include file="../file.html" -->` | Include relative path |
| Element include | `<include src="/file.html"></include>` | Element syntax for includes |

## Common Patterns

**Blog post with layout:**

```html
<!-- .layouts/blog.html -->
<!DOCTYPE html>
<html>
<head>
  <title data-slot="title">My Blog</title>
</head>
<body>
  <article>
    <header>
      <h1 data-slot="headline"></h1>
      <p class="meta">
        By <span data-slot="author">Anonymous</span> on <span data-slot="date"></span>
      </p>
    </header>
    <div class="content" data-slot="default">
    </div>
  </article>
</body>
</html>

<!-- blog/my-post.html -->
<div data-layout="blog">
  <template data-slot="title">My First Post - My Blog</template>
  <template data-slot="headline">Welcome to My Blog</template>
  <template data-slot="author">Jane Smith</template>
  <template data-slot="date">March 15, 2024</template>
  
  <p>This is my first blog post content...</p>
  <p>More content here...</p>
</div>
```

**Reusable header component:**

```html
<!-- .components/site-header.html -->
<header class="site-header">
  <div class="container">
    <h1 data-slot="site-title">My Website</h1>
    <nav data-slot="navigation">
      <a href="/">Home</a>
      <a href="/about">About</a>
    </nav>
  </div>
</header>

<!-- Any page using the header -->
<div data-layout="default">
  <!--#include virtual="/.components/site-header.html" -->
  <template data-slot="site-title">Welcome to My Site</template>
  <template data-slot="navigation">
    <a href="/">Home</a>
    <a href="/products">Products</a>
    <a href="/contact">Contact</a>
  </template>
  
  <h2>Page Content</h2>
  <p>This page content goes to the layout's default slot.</p>
</div>
```

## Summary

These four simple concepts give you powerful templating:

1. **Layouts** provide page structure with slot placeholders
2. **Templates** hold content to fill layout slots
3. **Slots** create flexible placeholders with optional default content
4. **Includes** insert reusable components into pages

Start with layouts for basic page structure, add templates to fill slots with content, use includes for reusable components, and leverage slot defaults for fallback content.

**Key attributes added to standard HTML:**

- `<template data-slot="name">` - Content for named slots
- `<include src="path">` - Element syntax for includes
- `data-layout="path"` - Layout selection for pages
- `data-slot="name"` - Slot placeholders in layouts

## Next Steps

- [Complete Templating Guide](complete-templating-guide.md) - Comprehensive documentation
- [Include Syntax](include-syntax.md) - Detailed include options  
- [Getting Started](getting-started.md) - Full project setup guide
