
# Templating Quick Start Guide

A simple introduction to dompile's templating features. Learn the basics of layouts, slots, templates, and includes in minutes.

## Overview

dompile has four simple templating features:

- **Layouts** → Page structure with `<slot name="example">` placeholders
- **Slots** → Content placeholders in layouts with optional default content
- **Templates** → Content containers with `<template target="example">`
- **Includes** → Component insertion with `<!--#include virtual="..." -->` or `<include src="...">`

## 1. Layouts (Page Structure)

**What it does:** Provides page structure with slot placeholders that pages can fill

**Layout file:** `src/.layouts/default.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title><slot name="title">Default Site Title</slot></title>
  <slot name="head"></slot>
</head>
<body>
  <header>
    <slot name="header">
      <h1>My Website</h1>
    </slot>
  </header>
  <main>
    <slot></slot> <!-- Default slot for main content -->
  </main>
  <footer>
    <slot name="footer">
      <p>&copy; 2024 My Site</p>
    </slot>
  </footer>
</body>
</html>
```

**Your page:** `src/about.html`

```html
<div data-layout="default">
  <template target="title">About Us - My Site</template>
  <template target="header">
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
  <title><slot name="title">Default Article Title</slot></title>
  <slot name="head"></slot>
</head>
<body>
  <article>
    <header>
      <h1><slot name="headline"></slot></h1>
      <p class="meta"><slot name="meta">Published recently</slot></p>
    </header>
    <div class="content">
      <slot></slot> <!-- Main article content -->
    </div>
  </article>
</body>
</html>
```

**Your page:** `src/my-article.html`

```html
<div data-layout="article">
  <template target="title">Amazing Discovery - My Blog</template>
  <template target="headline">Scientists Make Amazing Discovery</template>
  <template target="meta">Published on March 15, 2024 by Jane Doe</template>
  <template target="head">
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
  <slot name="head">
    <!-- Default head content if no template provides it -->
    <meta charset="UTF-8">
    <title>My Website</title>
  </slot>
</head>
<body>
  <header>
    <slot name="header">
      <h1>Default Header</h1>
    </slot>
  </header>
  <main>
    <slot></slot> <!-- Default slot - gets content not in named templates -->
  </main>
  <footer>
    <slot name="footer">
      <p>&copy; 2024 My Site</p>
    </slot>
  </footer>
</body>
</html>
```

**Page using some slots:** `src/contact.html`

```html
<div data-layout="page">
  <template target="head">
    <title>Contact Us - My Site</title>
    <meta name="description" content="Get in touch with us">
  </template>
  <template target="header">
    <h1>Contact Us</h1>
  </template>
  <!-- No footer template provided - uses default from layout -->
  
  <!-- This content goes to the default slot -->
  <h2>Get In Touch</h2>
  <p>Send us a message...</p>
</div>
```

**Key concepts:**

- Named slots: `<slot name="title">` → filled by `<template target="title">`
- Default slot: `<slot></slot>` → gets content not in named templates
- Fallback content: Content inside `<slot>` tags is used when no template fills the slot

## 4. Includes (Component Insertion)

**What it does:** Inserts the content of a component file into the DOM

**Header component:** `src/.components/site-header.html`

```html
<header class="site-header">
  <h1><slot name="site-title">My Website</slot></h1>
  <nav>
    <slot name="navigation">
      <a href="/">Home</a>
      <a href="/about">About</a>
    </slot>
  </nav>
</header>
```

**Using includes - Comment syntax:** `src/index.html`

```html
<!DOCTYPE html>
<html>
<body>
  <!--#include virtual="/.components/site-header.html" -->
  <template target="site-title">Welcome to My Site</template>
  <template target="navigation">
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
  <template target="site-title">Our Products</template>
  
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
    <h3><slot name="title">Product Title</slot></h3>
    <p class="price"><slot name="price">$0.00</slot></p>
  </div>
  <div class="card-body">
    <slot></slot> <!-- Main product description -->
  </div>
  <div class="card-footer">
    <slot name="actions">
      <button>Learn More</button>
    </slot>
  </div>
</div>
```

**Layout with product grid:** `src/.layouts/shop.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title><slot name="title">My Shop</slot></title>
  <slot name="head"></slot>
</head>
<body>
  <header>
    <slot name="header">
      <h1>My Online Shop</h1>
    </slot>
  </header>
  <main class="product-grid">
    <slot></slot> <!-- Products go here -->
  </main>
</body>
</html>
```

**Products page using everything:** `src/products.html`

```html
<div data-layout="shop">
  <template target="title">Amazing Products - My Shop</template>
  <template target="header">
    <h1>Our Amazing Products</h1>
    <p>Find exactly what you need</p>
  </template>
  
  <!-- Include and customize product cards -->
  <!--#include virtual="/.components/product-card.html" -->
  <template target="title">Super Widget</template>
  <template target="price">$29.99</template>
  <template target="actions">
    <button class="btn-primary">Buy Now</button>
    <button class="btn-secondary">Add to Cart</button>
  </template>
  <p>The most amazing widget you'll ever own!</p>
  
  <!--#include virtual="/.components/product-card.html" -->
  <template target="title">Mega Gadget</template>
  <template target="price">$49.99</template>
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
| Named slot | `<slot name="title">Default</slot>` | Content placeholder with fallback |
| Default slot | `<slot></slot>` | Main content area |
| Fill slot | `<template target="title">Content</template>` | Provide content for named slot |
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
  <title><slot name="title">My Blog</slot></title>
</head>
<body>
  <article>
    <header>
      <h1><slot name="headline"></slot></h1>
      <p class="meta">
        By <slot name="author">Anonymous</slot> on <slot name="date"></slot>
      </p>
    </header>
    <div class="content">
      <slot></slot>
    </div>
  </article>
</body>
</html>

<!-- blog/my-post.html -->
<div data-layout="blog">
  <template target="title">My First Post - My Blog</template>
  <template target="headline">Welcome to My Blog</template>
  <template target="author">Jane Smith</template>
  <template target="date">March 15, 2024</template>
  
  <p>This is my first blog post content...</p>
  <p>More content here...</p>
</div>
```

**Reusable header component:**

```html
<!-- .components/site-header.html -->
<header class="site-header">
  <div class="container">
    <h1><slot name="site-title">My Website</slot></h1>
    <nav>
      <slot name="navigation">
        <a href="/">Home</a>
        <a href="/about">About</a>
      </slot>
    </nav>
  </div>
</header>

<!-- Any page using the header -->
<div data-layout="default">
  <!--#include virtual="/.components/site-header.html" -->
  <template target="site-title">Welcome to My Site</template>
  <template target="navigation">
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

- `<template target="name">` - Content for named slots
- `<include src="path">` - Element syntax for includes
- `data-layout="path"` - Layout selection for pages

## Next Steps

- [Complete Templating Guide](complete-templating-guide.md) - Comprehensive documentation
- [Include Syntax](include-syntax.md) - Detailed include options  
- [Getting Started](getting-started.md) - Full project setup guide
