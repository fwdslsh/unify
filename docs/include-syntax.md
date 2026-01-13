# Include System Documentation

Unify supports two include systems: **DOM Cascade area-based composition** (recommended) and **Apache SSI-style comments** (legacy compatibility). This document covers both approaches.

## Include System Types

### Area-Based Composition (Recommended)

Using `data-unify` attributes for DOM Cascade v1 composition:

```html
<!-- Import component with area-based customization -->
<div data-unify="/_includes/card.html">
  <h3 class="unify-title">Custom Title</h3>
  <div class="unify-content">
    <p>Custom card content here</p>
  </div>
  <div class="unify-actions">
    <button>Custom Action</button>
  </div>
</div>
```

**Benefits:**
- CSS-like composition with areas and scoping
- Component customization via area matching
- Predictable precedence (Area → Landmark → Ordered fill)
- Modern web standards approach

### Apache SSI Comments (Legacy Compatibility)

Using traditional Apache Server Side Include syntax:

```html
<!--#include virtual="/path/from/source/root.html" -->
<!--#include file="relative/path/from/current/file.html" -->
```

**Limitations:**
- No content customization (static includes)
- Legacy compatibility only
- Not compatible with area-based composition

## DOM Cascade Area-Based Composition

### Component Structure

Components expose public areas via CSS classes and document them:

**Component: `src/_includes/feature-card.html`**

```html
<div class="card">
  <style data-unify-docs="v1">
    /* Public areas for customization */
    .unify-title {
      /* Card title area */
    }
    .unify-content {
      /* Main content area */
    }
    .unify-image {
      /* Optional image area */
    }
    .unify-actions {
      /* Action buttons area */
    }
  </style>
  
  <header class="unify-title">
    <h3>Default Title</h3>
  </header>
  
  <div class="unify-image">
    <img src="/default-image.jpg" alt="Default" />
  </div>
  
  <div class="unify-content">
    <p>Default content description</p>
  </div>
  
  <footer class="unify-actions">
    <button>Learn More</button>
  </footer>
</div>
```

### Using Components

**Page importing and customizing the component:**

```html
<body data-unify="/_layout.html">
  <section class="unify-hero">
    <h1>Our Features</h1>
  </section>
  
  <div class="unify-content">
    <!-- Import and customize feature card -->
    <div data-unify="/_includes/feature-card.html">
      <h3 class="unify-title">DOM Cascade</h3>
      <div class="unify-content">
        <p>Area-based composition with CSS-like matching</p>
        <ul>
          <li>Predictable precedence</li>
          <li>Scoped composition</li>
          <li>Component reusability</li>
        </ul>
      </div>
      <div class="unify-actions">
        <a href="/docs" class="btn-primary">Read Docs</a>
        <button class="btn-secondary">Try Demo</button>
      </div>
    </div>
    
    <!-- Another instance with different content -->
    <div data-unify="/_includes/feature-card.html">
      <h3 class="unify-title">Live Development</h3>
      <div class="unify-image">
        <img src="/live-dev.png" alt="Live Development" />
      </div>
      <div class="unify-content">
        <p>Hot reload and incremental builds for fast development</p>
      </div>
    </div>
  </div>
</body>
```

### Layout Composition

Layouts use `data-unify` on `<html>` or `<body>` elements:

**Layout: `src/_layout.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My Site</title>
    <style data-unify-docs="v1">
      /* Public areas exposed by layout */
      .unify-hero {
        /* Hero section */
      }
      .unify-content {
        /* Main content area */
      }
      .unify-sidebar {
        /* Optional sidebar */
      }
    </style>
  </head>
  <body>
    <header>
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
      <p>&copy; 2024 My Site</p>
    </footer>
  </body>
</html>
```

**Page using the layout:**

```html
<body data-unify="/_layout.html">
  <section class="unify-hero">
    <h1>Welcome to My Site</h1>
    <p>Building with DOM Cascade v1</p>
  </section>
  
  <article class="unify-content">
    <h2>Getting Started</h2>
    <p>This content replaces the layout's default content area.</p>
  </article>
  
  <aside class="unify-sidebar">
    <h3>Quick Navigation</h3>
    <ul>
      <li><a href="/docs">Documentation</a></li>
      <li><a href="/examples">Examples</a></li>
    </ul>
  </aside>
</body>
```

## Path Resolution

### data-unify Path Types

- **Absolute from source**: `data-unify="/layouts/base.html"` → `src/layouts/base.html`
- **Relative to current**: `data-unify="../shared/nav.html"` → relative to current page
- **Short names**: `data-unify="blog"` → searches for `_blog.layout.html`

### Short Name Resolution

For convenience, Unify resolves short names to layout files:

```html
<!-- Short name -->
<body data-unify="blog">

<!-- Resolves to (in order of precedence): -->
<!-- 1. Current directory: _blog.layout.html -->
<!-- 2. Parent directories: ../_blog.layout.html -->
<!-- 3. _includes directory: blog.layout.html -->
```

### Component Path Resolution

```html
<!-- Full path -->
<div data-unify="/_includes/components/card.html">

<!-- Relative path -->
<div data-unify="../shared/button.html">

<!-- From current directory -->
<div data-unify="_sidebar.html">
```

## DOM Cascade Composition Rules

### Area Matching Precedence

1. **Area Match**: `.unify-*` classes match between page and host
2. **Landmark Fallback**: `header`, `nav`, `main`, `aside`, `footer`
3. **Ordered Fill**: Sequential mapping of `main > section` elements

### Attribute Merging

- **Host attributes preserved**: Layout/component attributes kept
- **Page wins on conflicts**: Page attributes override host (except `id`)
- **Class union**: Classes are merged, not replaced
- **ID stability**: Host IDs retained, page references rewritten

### Content Replacement

- **Host element kept**: Tag and position preserved
- **Children replaced**: Page content replaces host children
- **Scoped composition**: Each `data-unify` creates independent scope

## Apache SSI Compatibility (Legacy)

### Virtual Includes

Virtual includes resolve from the **source root directory**:

```html
<!-- Resolves to src/_includes/header.html -->
<!--#include virtual="/_includes/header.html" -->

<!-- Resolves to src/blog/_sidebar.html -->
<!--#include virtual="/blog/_sidebar.html" -->

<!-- Resolves to src/shared/navigation.html -->
<!--#include virtual="/shared/navigation.html" -->
```

**Path Resolution:**
- Always starts from source root (`src/` by default)
- Leading `/` is optional but recommended for clarity
- Case-sensitive on most systems

### File Includes

File includes resolve relative to the **current file's directory**:

```html
<!-- From src/pages/about.html, includes src/pages/sidebar.html -->
<!--#include file="sidebar.html" -->

<!-- From src/blog/post.html, includes src/_includes/header.html -->
<!--#include file="../_includes/header.html" -->

<!-- Navigate up multiple levels -->
<!--#include file="../../shared/footer.html" -->
```

**Path Resolution:**
- Relative to current file's directory
- Use `../` to navigate up directories
- Use `./` for current directory (optional)

## Include Features

### Recursive Processing

Both area-based and SSI includes support recursive composition:

**Layout: `src/_includes/page-layout.html`**

```html
<!DOCTYPE html>
<html>
  <head>
    <title>My Site</title>
    <style data-unify-docs="v1">
      .unify-header { /* Header area */ }
      .unify-content { /* Content area */ }
      .unify-footer { /* Footer area */ }
    </style>
  </head>
  <body>
    <div class="unify-header" data-unify="/_includes/header.html">
      <h1>Default Header</h1>
    </div>
    
    <main class="unify-content">
      <!-- Page content goes here -->
    </main>
    
    <div class="unify-footer" data-unify="/_includes/footer.html">
      <p>Default Footer</p>
    </div>
  </body>
</html>
```

**Header Component: `src/_includes/header.html`**

```html
<header>
  <style data-unify-docs="v1">
    .unify-logo { /* Logo area */ }
    .unify-nav { /* Navigation area */ }
  </style>
  
  <div class="unify-logo">
    <img src="/logo.png" alt="Logo" />
  </div>
  
  <nav class="unify-nav" data-unify="/_includes/navigation.html">
    <!-- Default navigation -->
    <a href="/">Home</a>
  </nav>
</header>
```

### Circular Dependency Detection

Unify prevents infinite include loops:

```html
<!-- This will cause a circular dependency error -->
<!-- file-a.html -->
<div data-unify="file-b.html"></div>

<!-- file-b.html -->
<div data-unify="file-a.html"></div>
```

**Error message:**
```
Error: Circular dependency detected in data-unify chain:
file-a.html → file-b.html → file-a.html
```

### Depth Limiting

Includes are limited to 10 levels deep to prevent runaway recursion:

```html
<!-- This will work (within limit) -->
<div data-unify="/level1.html"></div>
<!-- level1.html imports level2.html, etc. -->

<!-- Beyond 10 levels triggers depth limit error -->
```

## Security Features

### Path Traversal Prevention

Unify blocks attempts to access files outside the source directory:

```html
<!-- These will be blocked for security -->
<div data-unify="../../../etc/passwd"></div>
<!--#include file="../../../sensitive-file.txt" -->
```

**Error message:**
```
Security Error: Include path outside source directory
Attempted path: /etc/passwd
Allowed directories: src/
```

### Content Validation

- **File type restrictions**: Only `.html`, `.htm`, `.md` files allowed
- **Path sanitization**: All paths normalized and validated
- **Scope isolation**: Each composition creates isolated boundary

## Directory Structure Best Practices

### Recommended Organization

```
src/
├── _includes/              # Shared components and layouts
│   ├── layout.html         # Site-wide fallback layout
│   ├── header.html         # Header component with areas
│   ├── footer.html         # Footer component
│   └── components/
│       ├── card.html       # Reusable card component
│       ├── button.html     # Button component
│       └── form.html       # Form component
├── _layout.html            # Root layout (auto-discovered)
├── blog/
│   ├── _layout.html        # Blog-specific layout
│   ├── _sidebar.html       # Blog sidebar component
│   └── posts/
│       ├── first-post.md
│       └── second-post.md
├── pages/
│   ├── about.html
│   └── contact.html
└── index.html
```

### Component Naming Conventions

- **Purpose-based prefixes**: `nav-`, `form-`, `card-`
- **Kebab-case**: `user-profile.html`, `blog-sidebar.html`
- **Descriptive names**: `primary-navigation.html` vs `nav.html`
- **Feature grouping**: Organize related components in subdirectories

## Performance Considerations

### Build Performance

- **Component caching**: Parsed components are cached automatically
- **Dependency tracking**: Smart rebuilds only process changed files
- **Scope optimization**: Area matching is optimized for performance

### Optimization Tips

1. **Document areas**: Use `<style data-unify-docs>` blocks
2. **Minimize nesting**: Avoid deep component hierarchies
3. **Use area classes**: More efficient than landmark fallbacks
4. **Component reuse**: Design for reusability across pages

## Error Handling

### Common Errors

**Component file not found:**
```
Component not found: _includes/card.html
  in: src/index.html:5
Suggestions:
  • Create the component file: src/_includes/card.html
  • Check the path spelling and casing
  • Use absolute path: data-unify="/_includes/card.html"
```

**Area mismatch:**
```
Warning: Area class "unify-sidebar" not found in component
  Component: _includes/card.html
  Page: src/features.html:12
Suggestions:
  • Add .unify-sidebar area to the component
  • Check component documentation for available areas
  • Use different area class that exists in component
```

**Circular dependency:**
```
Circular dependency detected in data-unify chain:
page.html → layout.html → page.html
  in: src/page.html:3
Suggestions:
  • Remove the circular reference
  • Restructure component hierarchy
  • Use different layout or component structure
```

### Debug Mode

Enable detailed processing information:

```bash
DEBUG=1 unify build
```

Shows:
- Component resolution steps
- Area matching decisions
- Attribute merging details
- Performance timing

## Integration Examples

### Blog Post with Components

```html
<body data-unify="/_layout.html">
  <section class="unify-hero">
    <h1>My Latest Post</h1>
    <p>Published on March 15, 2024</p>
  </section>
  
  <article class="unify-content">
    <h2>Introduction</h2>
    <p>This post demonstrates component usage...</p>
    
    <!-- Embed reusable code example component -->
    <div data-unify="/_includes/code-example.html">
      <div class="unify-title">Example: Area Matching</div>
      <div class="unify-code">
        <pre><code>
&lt;div data-unify="/component.html"&gt;
  &lt;h3 class="unify-title"&gt;Custom Title&lt;/h3&gt;
&lt;/div&gt;
        </code></pre>
      </div>
    </div>
    
    <p>More content continues...</p>
  </article>
  
  <aside class="unify-sidebar">
    <!-- Related posts component -->
    <div data-unify="/_includes/related-posts.html">
      <h3 class="unify-heading">Related Posts</h3>
      <div class="unify-posts">
        <a href="/post1">First Related Post</a>
        <a href="/post2">Second Related Post</a>
      </div>
    </div>
  </aside>
</body>
```

### Component Library Page

```html
<body data-unify="/_layout.html">
  <section class="unify-hero">
    <h1>Component Library</h1>
  </section>
  
  <div class="unify-content">
    <h2>Available Components</h2>
    
    <!-- Showcase different button variants -->
    <div data-unify="/_includes/button.html">
      <button class="unify-button btn-primary">Primary Button</button>
    </div>
    
    <div data-unify="/_includes/button.html">
      <button class="unify-button btn-secondary">Secondary Button</button>
    </div>
    
    <!-- Showcase card component -->
    <div data-unify="/_includes/card.html">
      <h3 class="unify-title">Feature Card</h3>
      <div class="unify-content">
        <p>This card showcases the component system</p>
      </div>
      <div class="unify-actions">
        <button>View Details</button>
      </div>
    </div>
  </div>
</body>
```

## Migration Guide

### From Apache SSI

```html
<!-- Old Apache SSI -->
<!--#include virtual="/includes/header.html" -->
<!--#include file="../nav.html" -->

<!-- New area-based (recommended) -->
<div data-unify="/_includes/header.html">
  <h1 class="unify-title">Custom Header</h1>
</div>

<!-- Or keep SSI for simple static includes -->
<!--#include virtual="/_includes/header.html" -->
```

### From Other Template Systems

```html
<!-- Jekyll -->
{% include header.html title="Custom" %}

<!-- Unify area-based -->
<div data-unify="/_includes/header.html">
  <h1 class="unify-title">Custom</h1>
</div>
```

```html
<!-- Hugo -->
{{ partial "card.html" (dict "title" "Custom" "content" "Text") }}

<!-- Unify area-based -->
<div data-unify="/_includes/card.html">
  <h3 class="unify-title">Custom</h3>
  <div class="unify-content">Text</div>
</div>
```

## See Also

- [Getting Started Guide](getting-started.md)
- [DOM Cascade Specification](dom-spec.md)
- [Application Specification](app-spec.md)
- [CLI Reference](cli-reference.md)