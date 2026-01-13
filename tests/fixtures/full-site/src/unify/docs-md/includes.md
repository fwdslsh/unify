---
title: Server-Side Includes & DOM Cascade - unify Documentation
description: Learn about unify's powerful DOM Cascade composition system and legacy Server-Side Includes support for building maintainable static sites.
---

# Server-Side Includes & DOM Cascade

Unify provides two complementary systems for including and composing HTML content: the modern **DOM Cascade** composition system and legacy **Server-Side Includes (SSI)** for backward compatibility.

> **💡 Recommendation**
>
> **New projects should use DOM Cascade** for area-based composition. Server-Side Includes are provided for migration from legacy systems and simple content inclusion.

## DOM Cascade Composition System

DOM Cascade is unify's primary composition system, providing area-based layout and component composition with predictable semantics. It follows a familiar CSS-like mental model with layers, scopes, and cascade behavior.

### Core Concepts

#### Layers & Precedence

Content is composed in layers, with later layers overriding earlier ones:

- **Layout layer** - Base structure and default content
- **Component layer** - Imported components and fragments
- **Page layer** - Page-specific content (highest precedence)

#### Scopes & Boundaries

Each layout body or imported component creates an independent composition scope. Matching never crosses scope boundaries, ensuring predictable behavior.

#### Areas & Targeting

Layouts and components expose **public areas** using CSS classes with the `unify-` prefix. Pages target these areas using matching class names:

```html
<!-- Layout defines areas -->
<section class="unify-hero">
    <h1>Default Hero</h1>
</section>

<!-- Page provides content -->
<section class="unify-hero">
    <h1>Custom Hero Title</h1>
    <p>Custom subtitle content</p>
</section>
```

### Layout Composition

Apply layouts using `data-unify` on `<html>` or `<body>` elements:

```html
<!-- Applying a layout -->
<body data-unify="/layouts/blog.html">
    <section class="unify-hero">
        <h1>Blog Post Title</h1>
        <p>Post excerpt and meta information</p>
    </section>
    <article class="unify-content">
        <p>Your blog post content goes here...</p>
    </article>
</body>
```

#### Layout Path Resolution

Layouts can be referenced using several path formats:

- **Absolute paths:** `data-unify="/layouts/blog.html"`
- **Relative paths:** `data-unify="../shared/layout.html"`
- **Short names:** `data-unify="blog"` → finds `_blog.layout.html`

#### Automatic Layout Discovery

When no `data-unify` is specified, unify automatically discovers layouts:

1. Look for `_layout.html` in the page's directory
2. Climb up parent directories to source root
3. Fall back to `_includes/layout.html` if found

### Component Composition

Import components using `data-unify` on any non-layout element:

```html
<!-- Component: _includes/card.html -->
<article class="card">
    <h3 class="unify-title">Default Title</h3>
    <p class="unify-body">Default content</p>
    <div class="unify-actions">
        <button>Default Action</button>
    </div>
</article>

<!-- Using the component -->
<div data-unify="/_includes/card.html">
    <h3 class="unify-title">Product Name</h3>
    <p class="unify-body">Product description and details</p>
    <div class="unify-actions">
        <a href="/product" class="btn">Learn More</a>
    </div>
</div>
```

### Area Matching Rules

DOM Cascade uses a three-tier matching system with clear precedence:

#### 1. Area Class Matching (Highest Priority)

Elements with matching `.unify-*` classes are paired directly:

```html
<!-- Layout area -->
<header class="unify-hero">...</header>

<!-- Page content -->
<section class="unify-hero">...</section>
```

#### 2. Landmark Fallback (Medium Priority)

When no area classes are used, match by unique semantic landmarks:

```html
<!-- Automatic matching -->
<header> ↔ <header>
<nav> ↔ <nav>
<main> ↔ <main>
<aside> ↔ <aside>
<footer> ↔ <footer>
```

#### 3. Ordered Fill (Lowest Priority)

Remaining unmatched elements fill in document order.

### Head Merging

Layout and page head elements are intelligently merged:

- **Title**: Page title takes precedence
- **Meta tags**: Deduplicated by name/property/http-equiv
- **CSS links**: Layout first, then page (respects CSS cascade)
- **Scripts**: External scripts deduplicated by src

## Legacy Server-Side Includes

Unify supports traditional SSI for simple content inclusion and migration scenarios.

### Basic Include Syntax

```html
<!-- Simple file inclusion -->
<!--#include virtual="/_includes/header.html" -->

<!-- Include with variables -->
<!--#set var="title" value="My Page" -->
<!--#include virtual="/_includes/header.html" -->
```

### Supported SSI Directives

- `#include virtual="path"` - Include file content
- `#set var="name" value="value"` - Set variable
- `#echo var="name"` - Output variable
- `#config` - Configure SSI behavior

### Migration from SSI

To modernize SSI-based sites to DOM Cascade:

1. **Replace includes with components**:
   ```html
   <!-- SSI -->
   <!--#include virtual="/header.html" -->
   
   <!-- DOM Cascade -->
   <div data-unify="/header.html"></div>
   ```

2. **Convert variables to areas**:
   ```html
   <!-- SSI -->
   <!--#set var="title" value="My Title" -->
   
   <!-- DOM Cascade -->
   <h1 class="unify-title">My Title</h1>
   ```

3. **Use proper layout composition**:
   ```html
   <!-- SSI -->
   <!--#include virtual="/layout/header.html" -->
   <main>Content</main>
   <!--#include virtual="/layout/footer.html" -->
   
   <!-- DOM Cascade -->
   <body data-unify="/layout.html">
     <main class="unify-content">Content</main>
   </body>
   ```

## Best Practices

### When to Use Each System

**Use DOM Cascade for:**
- New projects and modern development
- Complex layout and component composition
- Sites requiring maintainable structure
- When you need scoped area targeting

**Use SSI for:**
- Legacy system migration
- Simple content inclusion without composition
- Quick prototyping and content sharing
- When DOM Cascade would be overkill

### Design Guidelines

**DOM Cascade:**
- Document public areas with `data-unify-docs` blocks
- Use semantic area names (`.unify-content`, not `.unify-box`)
- Keep area classes unique within each scope
- Provide sensible defaults for all public areas

**SSI:**
- Keep includes simple and stateless
- Avoid deep nesting of includes
- Use clear, descriptive variable names
- Consider migration path to DOM Cascade

## Next Steps

Now that you understand unify's composition systems:

- [Learn about Components](/unify/docs/components)
- [Explore Markdown support](/unify/docs/markdown)
- [Master the build command](/unify/docs/cli-build)
- [Follow the migration guide](/unify/docs/migration)