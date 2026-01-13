---
title: Markdown Support - unify Documentation
description: Learn how to use Markdown files in unify with YAML frontmatter, automatic HTML conversion, and DOM Cascade integration.
---

# Markdown Support

Unify provides comprehensive Markdown support with YAML frontmatter processing, automatic layout application, and seamless integration with the DOM Cascade composition system.

> **📝 What You'll Learn**
>
> YAML frontmatter syntax, Markdown processing, layout integration, and advanced Markdown techniques for static site generation.

## Basic Markdown Processing

Unify automatically processes `.md` files using markdown-it with sensible defaults:

```markdown
# Example Post

This **Markdown** content will be converted to HTML and can use DOM Cascade features.

## Features

- Standard Markdown syntax
- YAML frontmatter support
- Automatic layout application
- DOM Cascade integration

[Learn more](/docs/examples)
```

### Supported Markdown Features

- **Headers** (`#` through `######`)
- **Text formatting** (bold, italic, code)
- **Lists** (ordered and unordered)
- **Links** and **images**
- **Code blocks** with syntax highlighting
- **Tables**
- **Blockquotes**

## YAML Frontmatter

Add metadata and configuration using YAML frontmatter:

```markdown
---
title: My Blog Post
description: A comprehensive guide to using unify
layout: blog
author: John Doe
date: 2024-01-15
tags: [unify, markdown, guide]
---

# My Blog Post

Your Markdown content starts here...
```

### Standard Frontmatter Fields

- **`title`**: Page title (overrides layout title)
- **`description`**: Meta description
- **`layout`**: Layout file to use
- **`date`**: Publication date
- **`author`**: Content author
- **`tags`**: Array of tags

### Custom Frontmatter

You can define custom fields for your specific needs:

```markdown
---
title: Product Review
category: reviews
rating: 5
price: $99.99
featured: true
---
```

## Layout Integration

Markdown files integrate seamlessly with DOM Cascade layouts:

### Automatic Layout Application

```markdown
---
layout: blog-post
---

# This content targets layout areas

This Markdown content will be processed and placed in the layout's content areas.
```

### Manual Area Targeting

Use HTML within Markdown for precise area targeting:

```markdown
---
layout: blog-post
---

<div class="unify-meta">
Published on <time datetime="2024-01-15">January 15, 2024</time>
</div>

# Blog Post Title

Regular Markdown content goes in the main content area.

<aside class="unify-sidebar">

## Related Posts

- [Post 1](/blog/post-1)
- [Post 2](/blog/post-2)

</aside>
```

## Advanced Markdown Features

### Code Blocks with Language Labels

```markdown
Here's some JavaScript code:

```javascript
function greet(name) {
    return `Hello, ${name}!`;
}
```

And some CSS:

```css
.button {
    background: #007bff;
    color: white;
    padding: 0.5rem 1rem;
}
```
```

### Tables

```markdown
| Feature | Basic | Pro |
|---------|-------|-----|
| Pages | 10 | Unlimited |
| Storage | 1GB | 100GB |
| Support | Email | Phone |
```

### Task Lists

```markdown
## Todo List

- [x] Set up project
- [x] Create basic layout
- [ ] Add blog functionality
- [ ] Deploy to production
```

## Integration with DOM Cascade

### Using Components in Markdown

```markdown
# My Blog Post

Here's some regular content, followed by a component:

<div data-unify="/_includes/callout.html">
<div class="unify-content">
This is a callout box component used within Markdown!
</div>
</div>

More Markdown content continues here...
```

### Mixed HTML and Markdown

```markdown
---
layout: article
---

<header class="unify-hero">
<h1>Article Title</h1>
<p class="subtitle">A comprehensive guide</p>
</header>

The main article content starts here in **Markdown** and can include:

- Regular Markdown features
- HTML elements when needed
- Component includes via data-unify

<div data-unify="/_includes/author-bio.html">
<div class="unify-name">John Doe</div>
</div>
```

## File Organization

### Recommended Structure

```
src/
├── blog/
│   ├── _post.layout.html       # Blog post layout
│   ├── 2024-01-15-first-post.md
│   ├── 2024-01-20-second-post.md
│   └── index.html              # Blog index
├── docs/
│   ├── _docs.layout.html       # Documentation layout
│   ├── getting-started.md
│   ├── advanced-guide.md
│   └── api-reference.md
└── _includes/
    ├── _layout.html            # Default layout
    └── _components/
```

### Naming Conventions

- **Date prefix**: `2024-01-15-post-title.md` for chronological content
- **Descriptive names**: `getting-started.md`, `api-reference.md`
- **Consistent casing**: Use kebab-case for filenames

## Configuration Options

### Global Markdown Settings

Configure Markdown processing in `unify.config.yaml`:

```yaml
markdown:
  breaks: true          # Convert \n to <br>
  linkify: true        # Auto-convert URLs to links
  typographer: true    # Smart quotes and dashes
  
frontmatter:
  strip: false         # Keep frontmatter in output
  validate: true       # Validate YAML syntax
```

### Per-File Configuration

Override settings in frontmatter:

```markdown
---
title: Special Post
markdown:
  breaks: false
  html: true
---

# Content with custom Markdown settings
```

## Best Practices

### Frontmatter Guidelines

- **Use consistent field names** across your site
- **Validate required fields** for content types
- **Keep descriptions concise** (under 160 characters)
- **Use ISO date format** (YYYY-MM-DD)

### Content Organization

- **Group related content** in directories
- **Use descriptive filenames** that indicate content
- **Apply consistent layouts** for content types
- **Structure content hierarchically**

### SEO Optimization

```markdown
---
title: "Complete Guide to Static Sites | My Blog"
description: "Learn how to build fast, secure static websites with modern tools and best practices."
canonical: "https://example.com/guides/static-sites"
meta:
  robots: "index, follow"
  og:type: "article"
  og:image: "/images/static-sites-guide.jpg"
---
```

## Common Patterns

### Blog Posts

```markdown
---
layout: blog-post
title: "How to Build Better Websites"
description: "Tips and techniques for modern web development"
author: "Jane Developer"
date: "2024-01-15"
tags: [web-development, best-practices, tutorial]
featured: true
---

<div class="unify-meta">
<time datetime="{{ date }}">{{ date | date: "%B %d, %Y" }}</time>
<span class="author">By {{ author }}</span>
</div>

# {{ title }}

Your blog post content here...
```

### Documentation Pages

```markdown
---
layout: docs
title: "API Reference"
description: "Complete API documentation and examples"
section: "reference"
order: 3
---

# API Reference

## Authentication

All API requests require authentication...

### Example Request

```http
GET /api/users
Authorization: Bearer your-token-here
```
```

### Landing Pages

```markdown
---
layout: landing
title: "Welcome to Our Service"
description: "The best solution for your business needs"
hero:
  title: "Build Better Websites"
  subtitle: "Fast, secure, and scalable"
  cta: "Get Started"
---

<section class="unify-hero">
<h1>{{ hero.title }}</h1>
<p>{{ hero.subtitle }}</p>
<a href="/signup" class="btn">{{ hero.cta }}</a>
</section>

Regular Markdown content follows...
```

## Troubleshooting

### Common Issues

**Frontmatter not parsing:**
- Check YAML syntax and indentation
- Ensure triple dashes are on separate lines
- Validate with a YAML linter

**Layout not applied:**
- Verify layout file exists
- Check layout path resolution
- Ensure frontmatter `layout` field is correct

**Mixed HTML/Markdown rendering:**
- Use blank lines around HTML blocks
- Check for conflicting Markdown syntax
- Validate HTML structure

## Next Steps

Now that you understand Markdown in unify:

- [Learn about project structure](/unify/docs/project-structure)
- [Explore component integration](/unify/docs/components)
- [Master the build process](/unify/docs/cli-build)
- [Deploy your Markdown site](/unify/docs/deployment)