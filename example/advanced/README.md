# Advanced Example (v2)

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
│   │   ├── layout.html          # Site-wide layout
│   │   ├── header.html          # Shared header component
│   │   ├── footer.html          # Shared footer component
│   │   ├── navigation.html      # Navigation component
│   │   ├── card.html            # Card component
│   │   └── alert.html           # Alert component
│   ├── _blog.layout.html        # Blog-specific layout (explicit reference)
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

### 2. Layout Naming Patterns (v2)

**Auto-discovered layout:**
- `_layout.html` - The ONLY filename that is auto-discovered

**Explicit layouts (must be referenced with data-layout):**
- `_blog.layout.html` - Blog layout (use `data-layout="_blog.layout.html"`)
- `layouts/docs.html` - Docs layout (use `data-layout="/layouts/docs.html"`)
- Any `.html` file can be a layout

### 3. Layout Discovery Process (v2)

1. **Explicit Override**: `data-layout` attribute or frontmatter with explicit path
2. **Auto Discovery**: Searches for `_layout.html` only in page directory and parent directories
3. **No Layout**: Renders content as-is

**v2 Changes:**
- ❌ No short names (e.g., `data-layout="blog"` is invalid)
- ❌ No `_includes/` fallback
- ❌ No `.htm` extension support
- ✅ Only `_layout.html` is auto-discovered
- ✅ All other layouts must be explicitly referenced

### 4. Explicit Layout References (v2)

Use `data-layout` attribute with explicit paths:

```html
<!-- Relative path -->
<html data-layout="_blog.layout.html">
  <h1>Blog Post</h1>
</html>

<!-- Absolute path -->
<html data-layout="/layouts/blog.html">
  <h1>Blog Post</h1>
</html>

<!-- Simple filename (treated as relative to current directory) -->
<html data-layout="shared.html">
  <h1>Page Content</h1>
</html>
```

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

### 6. Component Inclusion (v2)

Include components using HTML include elements:
```html
<include src="/_includes/header.html" />
<include src="/_includes/alert.html" />

<!-- Relative paths also work -->
<include src="./components/card.html" />
```

## 🔧 Building This Example

```bash
# Build the advanced example
unify build --source example/advanced/src --output example/advanced/dist

# The build process will:
# 1. Discover layout files (_layout.html only for auto-discovery)
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
- Include elements replaced with component content
- Component styles moved to `<head>` and deduplicated

## 🆚 v1 vs v2 Comparison

| Feature | v1 | v2 |
|---------|----|----|
| **Include Syntax** | `<!--#include virtual="..." -->` | `<include src="..." />` |
| **Short Names** | `data-layout="blog"` ✅ | ❌ Not supported |
| **Auto-discovered Layouts** | `_*.layout.html`, `_*.html` | `_layout.html` only |
| **Fallback Layout** | `_includes/layout.html` ✅ | ❌ Not supported |
| **Extensions** | `.html` and `.htm` | `.html` only |

## 🎨 Convention Details

### Non-Emitting Files
Files and directories starting with `_` are non-emitting:
- `_includes/` - Shared components and layouts
- `_layout.html` - Auto-discovered layout file
- `_sidebar.html` - Partial components

### Layout Naming (v2)
Valid layout filenames:
- `_layout.html` - Auto-discovered default layout
- `_blog.layout.html` - Explicit layout (use `data-layout="_blog.layout.html"`)
- `layouts/custom.html` - Explicit layout (use `data-layout="/layouts/custom.html"`)

### Layout Discovery Order (v2)
1. **Explicit Override**: `data-layout` attribute or frontmatter with full path
2. **Auto Discovery**: Current directory for `_layout.html` file
3. **Parent directories**: Climbing up the directory tree looking for `_layout.html`
4. **No layout**: Render content as-is

## 🚀 Benefits

- **🧩 Zero Configuration**: No flags needed for basic layout functionality
- **🎨 Intuitive**: File organization matches mental model
- **⚡ Fast**: Convention-based discovery is efficient
- **🔧 Maintainable**: Clear separation of layouts, components, and content
- **📱 Scalable**: Conventions work for small and large projects
- **🎯 Focused**: Developers focus on content, not configuration

---

*This example showcases the power of Unify v2's convention-based architecture - a modern approach to static site generation with minimal configuration.*
