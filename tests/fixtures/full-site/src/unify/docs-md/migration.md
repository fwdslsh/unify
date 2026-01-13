---
title: Migration Guide - unify Documentation
description: Step-by-step guide for migrating from other static site generators to unify, including Jekyll, Hugo, Astro, and custom solutions.
---

# Migration Guide

This guide helps you migrate existing static sites to unify from popular generators like Jekyll, Hugo, Astro, and custom solutions. Each migration path focuses on preserving your content while modernizing your build process.

> **🎯 Migration Strategy**
>
> Focus on content preservation first, then gradually adopt unify's DOM Cascade features for improved maintainability and composition.

## General Migration Principles

### 1. Content-First Approach

- **Preserve existing content** structure and organization
- **Convert templates gradually** starting with layouts
- **Maintain URL structure** to preserve SEO
- **Test thoroughly** at each migration step

### 2. Progressive Enhancement

- **Start with basic HTML conversion**
- **Add DOM Cascade features incrementally**
- **Modernize components one at a time**
- **Optimize build process last**

### 3. Compatibility Considerations

- **Backup original site** before starting
- **Plan for temporary hybrid approaches**
- **Document custom features** that need recreation
- **Test across different browsers** and devices

## Migrating from Jekyll

Jekyll and unify share similar philosophies but differ in templating approaches.

### Key Differences

| Aspect | Jekyll | unify |
|--------|--------|-------|
| **Templates** | Liquid templating | DOM Cascade composition |
| **Layouts** | `_layouts/` directory | `_includes/` or `_layouts/` |
| **Includes** | `{% include %}` tags | `data-unify` attributes |
| **Data** | `_data/` files | Frontmatter or external |
| **Build** | Ruby + Gems | Bun native |

### Migration Steps

#### 1. Convert Jekyll Layouts

**Jekyll layout:**
```html
<!-- _layouts/default.html -->
---
---
<!DOCTYPE html>
<html>
<head>
  <title>{{ page.title | default: site.title }}</title>
</head>
<body>
  <header>{% include header.html %}</header>
  <main>{{ content }}</main>
  <footer>{% include footer.html %}</footer>
</body>
</html>
```

**Unify layout:**
```html
<!-- _includes/_layout.html -->
<head>
  <style data-unify-docs="v1">
    .unify-content { /* Main page content */ }
    .unify-header { /* Custom header content */ }
    .unify-footer { /* Custom footer content */ }
  </style>
  <title>Default Site Title</title>
</head>
<body>
  <header class="unify-header">
    <div data-unify="/_includes/header.html"></div>
  </header>
  <main class="unify-content">
    <p>Default content</p>
  </main>
  <footer class="unify-footer">
    <div data-unify="/_includes/footer.html"></div>
  </footer>
</body>
```

#### 2. Convert Jekyll Posts

**Jekyll post:**
```markdown
---
layout: post
title: "My Blog Post"
date: 2024-01-15 10:00:00 -0500
categories: blog tutorial
---

# {{ page.title }}

Post content here...
```

**Unify post:**
```markdown
---
layout: post
title: "My Blog Post"
date: 2024-01-15
categories: [blog, tutorial]
---

<h1 class="unify-title">My Blog Post</h1>

<div class="unify-meta">
<time datetime="2024-01-15">January 15, 2024</time>
</div>

<div class="unify-content">

Post content here...

</div>
```

#### 3. Handle Jekyll-specific Features

**Collections:**
```yaml
# Jekyll _config.yml
collections:
  docs:
    output: true
```

**Unify equivalent:**
```bash
# Organize files in directories
src/
├── docs/
│   ├── _docs.layout.html
│   ├── getting-started.md
│   └── api-reference.md
```

**Site variables:**
```html
<!-- Jekyll -->
{{ site.title }}
{{ site.description }}

<!-- Unify -->
<title>Site Title</title>
<meta name="description" content="Site description">
```

## Migrating from Hugo

Hugo's Go templating requires more significant changes than Jekyll.

### Key Differences

| Aspect | Hugo | unify |
|--------|------|-------|
| **Templates** | Go templates | DOM Cascade |
| **Partials** | `{{ partial }}` | `data-unify` |
| **Shortcodes** | `{{< shortcode >}}` | Components |
| **Content** | Markdown + frontmatter | Same |
| **Build** | Go binary | Bun |

### Migration Steps

#### 1. Convert Hugo Layouts

**Hugo layout:**
```html
<!-- layouts/_default/single.html -->
{{ define "main" }}
<article>
  <h1>{{ .Title }}</h1>
  <div>{{ .Content }}</div>
  {{ partial "author.html" . }}
</article>
{{ end }}
```

**Unify layout:**
```html
<!-- _includes/single.html -->
<head>
  <style data-unify-docs="v1">
    .unify-title { /* Article title */ }
    .unify-content { /* Article content */ }
    .unify-author { /* Author information */ }
  </style>
</head>
<body>
  <article>
    <h1 class="unify-title">Default Title</h1>
    <div class="unify-content">Default content</div>
    <div class="unify-author" data-unify="/_includes/author.html"></div>
  </article>
</body>
```

#### 2. Convert Hugo Shortcodes

**Hugo shortcode:**
```html
<!-- layouts/shortcodes/callout.html -->
<div class="callout callout-{{ .Get 0 }}">
  {{ .Inner }}
</div>
```

**Unify component:**
```html
<!-- _includes/callout.html -->
<head>
  <style data-unify-docs="v1">
    .unify-content { /* Callout content */ }
    /* State classes: .is-warning, .is-info, .is-success */
  </style>
</head>
<div class="callout">
  <div class="unify-content">
    <p>Default callout content</p>
  </div>
</div>
```

**Usage:**
```markdown
<!-- Hugo -->
{{< callout "warning" >}}
This is a warning message
{{< /callout >}}

<!-- Unify -->
<div data-unify="/_includes/callout.html" class="is-warning">
<div class="unify-content">
This is a warning message
</div>
</div>
```

## Migrating from Astro

Astro's component-based approach has some similarities to unify's DOM Cascade.

### Key Differences

| Aspect | Astro | unify |
|--------|-------|-------|
| **Components** | `.astro` files | HTML fragments |
| **Islands** | Hydration | No JavaScript required |
| **Styling** | Scoped CSS | CSS classes |
| **Build** | Vite | Bun |

### Migration Steps

#### 1. Convert Astro Components

**Astro component:**
```astro
---
// Card.astro
const { title, content } = Astro.props;
---
<article class="card">
  <h3>{title}</h3>
  <p>{content}</p>
</article>

<style scoped>
  .card {
    border: 1px solid #ddd;
    padding: 1rem;
  }
</style>
```

**Unify component:**
```html
<!-- _includes/card.html -->
<head>
  <style data-unify-docs="v1">
    .unify-title { /* Card title */ }
    .unify-content { /* Card content */ }
  </style>
  <style>
    .card {
      border: 1px solid #ddd;
      padding: 1rem;
    }
  </style>
</head>
<article class="card">
  <h3 class="unify-title">Default Title</h3>
  <p class="unify-content">Default content</p>
</article>
```

#### 2. Convert Astro Layouts

**Astro layout:**
```astro
---
// Layout.astro
const { title } = Astro.props;
---
<html>
<head>
  <title>{title}</title>
</head>
<body>
  <main>
    <slot />
  </main>
</body>
</html>
```

**Unify layout:**
```html
<!-- _includes/_layout.html -->
<head>
  <style data-unify-docs="v1">
    .unify-content { /* Main content slot */ }
  </style>
  <title>Default Title</title>
</head>
<body>
  <main class="unify-content">
    <p>Default content</p>
  </main>
</body>
```

## Migrating from Custom Solutions

### Common Patterns

#### 1. Template String Systems

**Custom template:**
```javascript
const template = `
  <h1>${title}</h1>
  <p>${content}</p>
`;
```

**Unify equivalent:**
```html
<!-- _includes/post.html -->
<head>
  <style data-unify-docs="v1">
    .unify-title { /* Post title */ }
    .unify-content { /* Post content */ }
  </style>
</head>
<article>
  <h1 class="unify-title">Default Title</h1>
  <div class="unify-content">Default content</div>
</article>
```

#### 2. Build Scripts

**Custom build:**
```javascript
// build.js
const files = glob('src/**/*.md');
files.forEach(file => {
  const content = processMarkdown(file);
  const html = applyLayout(content, layout);
  writeFile(output, html);
});
```

**Unify equivalent:**
```bash
# Simple command replaces complex build script
unify build --source src --output dist
```

## Content Migration Strategies

### 1. URL Preservation

Maintain existing URL structure:

```bash
# Original URLs
/blog/2024/01/15/my-post.html
/docs/getting-started.html

# Preserve with unify structure
src/blog/2024/01/15/my-post.md
src/docs/getting-started.md

# Use --pretty-urls for clean URLs
unify build --pretty-urls
```

### 2. Frontmatter Standardization

Normalize frontmatter across content:

```markdown
---
# Standard fields
title: "Post Title"
description: "Post description"
date: "2024-01-15"
layout: "post"

# Migration helpers
redirect_from: ["/old-url", "/another-old-url"]
canonical: "https://example.com/new-url"
---
```

### 3. Asset Organization

Reorganize assets for unify conventions:

```bash
# Original structure
static/
├── css/
├── js/
└── images/

# Unify structure
src/assets/
├── css/
├── js/
└── images/
```

## Testing Migration

### 1. Content Verification

```bash
# Compare page counts
find old-site -name "*.html" | wc -l
find dist -name "*.html" | wc -l

# Check for missing pages
diff <(find old-site -name "*.html" | sort) \
     <(find dist -name "*.html" | sort)
```

### 2. Link Validation

```bash
# Check internal links
unify build --fail-on warning
```

### 3. Performance Comparison

```bash
# Measure build times
time old-build-command
time unify build
```

## Common Pitfalls

### 1. Over-Migration

**Avoid:**
- Converting everything at once
- Recreating unnecessary complexity
- Maintaining legacy patterns

**Instead:**
- Migrate incrementally
- Simplify where possible
- Adopt unify patterns gradually

### 2. Template Logic

**Challenge:**
```liquid
<!-- Jekyll template logic -->
{% if page.featured %}
  <div class="featured">{{ content }}</div>
{% else %}
  <div class="regular">{{ content }}</div>
{% endif %}
```

**Solution:**
```html
<!-- Use CSS classes instead -->
<div class="unify-content">
  <div class="post">Content</div>
</div>

<!-- Apply via frontmatter + CSS -->
```

```markdown
---
featured: true
---
```

```css
.post { /* Regular styles */ }
.featured .post { /* Featured styles */ }
```

## Migration Checklist

### Pre-Migration

- [ ] Backup original site
- [ ] Inventory content types and layouts
- [ ] List custom features to recreate
- [ ] Plan URL structure preservation
- [ ] Set up unify development environment

### During Migration

- [ ] Convert layouts to DOM Cascade
- [ ] Migrate content with frontmatter
- [ ] Update internal links
- [ ] Test component composition
- [ ] Verify asset copying

### Post-Migration

- [ ] Compare original vs. migrated site
- [ ] Test all functionality
- [ ] Validate performance improvements
- [ ] Update deployment process
- [ ] Document new workflow

## Getting Help

### Resources

- [unify Examples](/unify/examples) - See real-world implementations
- [CLI Reference](/unify/docs/cli-build) - Master the build process
- [Components Guide](/unify/docs/components) - Learn DOM Cascade patterns

### Support

- Check existing patterns in unify examples
- Test migration steps in isolation
- Use `--dry-run` to preview changes
- Start with simple content first

Migration to unify should result in simpler, more maintainable code while preserving all your valuable content and SEO benefits.