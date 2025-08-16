# Advanced Example

This example demonstrates the `unify` convention-based static site generator that uses pure HTML with minimal configuration.

## 🎯 Design Principles

- **Convention-based**: Files and directories starting with `_` are non-emitting by convention
- **Layout discovery**: Automatic layout wrapping using file naming patterns
- **Pure HTML output**: No runtime JavaScript or dynamic templating
- **Minimal configuration**: Layouts are inferred by convention

## 📁 Project Structure

```
example/advanced/
├── src/
│   ├── _includes/
│   │   ├── layout.html          # Site-wide fallback layout
│   │   ├── header.html          # Shared header component
│   │   ├── footer.html          # Shared footer component
│   │   ├── navigation.html      # Navigation component
│   │   ├── card.html            # Card component  
│   │   └── alert.html           # Alert component
│   ├── _blog.layout.html        # Blog-specific layout using naming pattern
│   ├── index.html               # Homepage (uses _includes/layout.html)
│   ├── about.html               # About page (uses _includes/layout.html)
│   ├── blog.html                # Blog page (uses _blog.layout.html)
│   └── styles/
│       └── site.css             # Global styles
└── dist/                        # Generated output
```

## 🧩 Key Features Demonstrated

### 1. Convention-Based Layout System

Pages are automatically wrapped with the nearest layout file using naming patterns:

```html
<!-- Layout file: _blog.layout.html -->
<!DOCTYPE html>
<html>
<head>
  <title><slot name="title">Default Title</slot></title>
</head>
<body>
  <main><slot></slot></main> <!-- Main content goes here -->
</body>
</html>
```

### 2. Layout Naming Patterns

**Recommended layout filenames:**
- `_layout.html`, `_layout.htm` (standard)
- `_blog.layout.html`, `_docs.layout.htm` (extended patterns)
- `_documentation.layout.html` (complex naming)

**Also valid (but less clear):**
- `_blog.html`, `_main.htm`, `_template.html` (works but less obvious purpose)

**Special case for `_includes` directory:**
- Files in `_includes/` don't require underscore prefix (e.g., `layout.html`, `blog.layout.html`)

### 3. Layout Discovery Process

1. **Explicit Override**: `data-layout` attribute or frontmatter (supports short names like `data-layout="blog"`)
2. **Auto Discovery**: Searches for `_*.layout.html` then `_*.html` files in page directory and parent directories  
3. **Site-wide Fallback**: Uses `_includes/layout.html` if it exists (no underscore prefix required)
4. **No Layout**: Renders content as-is

### 4. Short Name Layout References

For convenience, you can use short names instead of full file paths:

```html
<!-- Instead of data-layout="_blog.layout.html" -->
<div data-layout="blog">
  <h1>Blog Post</h1>
</div>
```

Short names automatically resolve to:
- Same directory: `_blog.layout.html`, `_blog.html`
- `_includes` directory: `blog.layout.html`, `blog.html`

### 5. Slot System

Named slots in layouts:
```html
<!-- In layout -->
<title><slot name="title">Default Title</slot></title>
<main><slot></slot></main> <!-- unnamed slot -->
```

Content for slots:
```html
<!-- In page -->
<template slot="title">My Page Title</template>
<!-- Content outside templates goes to unnamed slot -->
<h1>Main Content</h1>
```

### 6. Component Inclusion

Include components using Apache SSI syntax:
```html
<!--#include virtual="/_includes/header.html" -->
<!--#include virtual="/_includes/alert.html" -->
```

## 🔧 Building This Example

```bash
# Build the advanced example
unify build --source example/advanced/src --output example/advanced/dist

# The build process will:
# 1. Discover layout files using naming patterns
# 2. Automatically wrap pages with nearest layouts
# 3. Process slot system for content insertion
# 4. Resolve includes recursively
# 5. Copy referenced assets to output
```

## ✨ Expected Output

The `index.html` file will be processed into a complete HTML document:

- Layout `_includes/layout.html` provides the base structure
- Named slots (`title`) filled from `<template slot="...">`
- Default content goes into the unnamed `<slot></slot>`
- Include directives replaced with component content
- Component styles moved to `<head>` and deduplicated

## 🆚 Comparison with Configuration-Based Approach

| Feature | Old Approach | Convention-Based |
|---------|--------------|------------------|
| **Layout Discovery** | `--layouts` flag + explicit paths | Automatic discovery using naming patterns |
| **Component Organization** | `--components` flag | `_includes/` directory by convention |
| **File Classification** | Configuration-driven | Underscore prefix convention |
| **Layout Application** | Manual specification | Automatic wrapping based on discovery |

## 🎨 Convention Details

### Non-Emitting Files
Files and directories starting with `_` are non-emitting:
- `_includes/` - Shared components and layouts
- `_layout.html` - Layout files
- `_sidebar.html` - Partial components

### Layout Naming Patterns
Valid layout filenames:
- `_layout.html`, `_layout.htm` (standard)
- `_blog.layout.html` (extended pattern)
- `_custom.layout.html` (descriptive naming)

### Layout Discovery Order
1. **Explicit Override**: `data-layout` attribute or frontmatter (supports short names)
2. **Auto Discovery**: Current directory for `_*.layout.html` then `_*.html` files  
3. **Parent directories**: Climbing up the directory tree
4. **Site-wide fallback**: `_includes/layout.html` (no underscore prefix required)
5. **No layout**: Render content as-is

## 🚀 Benefits

- **🧩 Zero Configuration**: No flags needed for basic layout functionality
- **🎨 Intuitive**: File organization matches mental model
- **⚡ Fast**: Convention-based discovery is efficient
- **🔧 Maintainable**: Clear separation of layouts, components, and content
- **📱 Scalable**: Conventions work for small and large projects
- **🎯 Focused**: Developers focus on content, not configuration

---

*This example showcases the power of Unify's convention-based architecture - a modern approach to static site generation with minimal configuration.*