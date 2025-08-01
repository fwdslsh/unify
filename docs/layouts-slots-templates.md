# Layouts, Slots, and Templates

unify provides a powerful templating system that combines traditional layouts with modern template and slot syntax. This document covers all aspects of the template system.

## Overview

The template system supports three main concepts:

- **Layouts**: Base templates that wrap content using slots
- **Slots**: Placeholders for content insertion
- **Templates**: Modern component-based templating

## Layout System

### Basic Layout Usage

Layouts provide a base structure for your pages using slot elements for content insertion.

**Layout file: `src/.layouts/default.html`**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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

**Markdown file with layout: `src/about.md`**
```markdown
---
title: "About Us"
layout: default
---

# About Us

This content will be placed in the default slot of the layout.
```

**HTML page with layout:**
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

### Layout Directory Structure

```
src/
├── .layouts/
│   ├── default.html      # Base layout
│   ├── blog.html         # Blog-specific layout
│   ├── landing.html      # Landing page layout
│   └── admin/
│       └── dashboard.html # Admin section layout
```

### Layout Selection

Layouts are selected in order of precedence:

1. **Data attribute**: `<div data-layout="layouts/custom.html">` or on html/body elements
2. **Frontmatter**: `layout: custom` (for markdown files)
3. **Default layout**: `.layouts/default.html`
4. **Basic HTML structure**: Auto-generated if no layout found

```html
<!-- Page with data-layout attribute -->
<div data-layout="blog.html">
  <h1>My Blog Post</h1>
</div>
```

```markdown
---
layout: blog              # Uses .layouts/blog.html
---
# My Blog Post
```

## Modern Template System

### Template Elements

Use `<template>` elements for modern component-based templating:

**Page using template: `src/index.html`**
```html
<div data-layout="layouts/default.html">
  <template slot="title">Welcome to My Site</template>
  <template slot="meta">
    <meta name="keywords" content="static site, generator">
  </template>
  
  <h1>Homepage Content</h1>
  <p>This content goes in the default slot.</p>
</div>
```

**Layout with slots: `src/layouts/default.html`**
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
<div data-layout="layouts/blog.html">
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
<html data-layout="layouts/blog.html">
  <template slot="title">My Page Title</template>
  <!-- Page content -->
</html>

<!-- OR -->

<body data-layout="layouts/blog.html">
  <template slot="header">Custom Header</template>
  <!-- Page content -->
</body>
```

### Path Resolution for Layouts

Layout paths are resolved in this order:

1. **Absolute from source**: `data-layout="/layouts/custom.html"` → `src/layouts/custom.html`
2. **Relative to .layouts**: `data-layout="blog.html"` → `src/.layouts/blog.html`
3. **Custom directory**: `data-layout="templates/blog.html"` → `src/templates/blog.html`

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

**Card component: `src/.components/card.html`**
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
<div data-layout="layouts/default.html">
  <!--#include virtual="/.components/card.html" -->
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

**Blog layout: `src/.layouts/blog.html`**
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
  <!--#include virtual="/.components/header.html" -->
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
  <!--#include virtual="/.components/footer.html" -->
</body>
</html>
```

**Using blog layout:**
```html
<div data-layout="blog.html">
  <template slot="head">
    <title>My Blog Post - My Site</title>
    <meta name="description" content="A great blog post">
  </template>
  <template slot="post-meta">
    <h1>My Blog Post</h1>
    <p class="meta">Published on January 1, 2024</p>
  </template>
  <template slot="comments">
    <!--#include virtual="/.components/comments.html" -->
  </template>
  
  <!-- Main content goes in default slot -->
  <p>This is the main blog post content.</p>
</div>
```
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

## Integration with Includes
```

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

<!--#include virtual="/.components/code-example.html" -->

More markdown content here.
```

### Layout Selection in Markdown

Specify layouts in frontmatter:

```markdown
---
layout: custom-layout    # Uses .layouts/custom-layout.html
---

# Page Content

This content will use the custom-layout.html layout file.
```
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

- Confirm layout file exists in `.layouts/` directory
- Check frontmatter layout name matches filename
- Verify layout has proper slot placeholders

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
