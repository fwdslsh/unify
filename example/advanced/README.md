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
│   │   ├── _layout.html         # Fallback layout
│   │   ├── header.html          # Shared header component
│   │   ├── footer.html          # Shared footer component
│   │   ├── navigation.html      # Navigation component
│   │   ├── card.html            # Card component  
│   │   └── alert.html           # Alert component
│   ├── _blog.layout.html        # Blog-specific layout using naming pattern
│   ├── index.html               # Homepage (uses _includes/_layout.html)
│   ├── about.html               # About page (uses _includes/_layout.html)
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

Valid layout filenames:
- `_layout.html`, `_layout.htm` (standard)
- `_blog.layout.html`, `_docs.layout.htm` (extended patterns)
- `_documentation.layout.html` (complex naming)

### 3. Layout Discovery Process

1. **Folder Layout**: Searches current directory for layout files
2. **Parent Directory Climb**: Walks up directory tree to find nearest layout
3. **Fallback Layout**: Uses `_includes/_layout.html` if it exists
4. **No Layout**: Renders content as-is

### 4. Slot System

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

### 5. Component Inclusion

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

- Layout `_includes/_layout.html` provides the base structure
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
1. Current directory for layout files
2. Parent directories (climbing up)
3. Fallback to `_includes/_layout.html`
4. No layout (render content as-is)

## 🚀 Benefits

- **🧩 Zero Configuration**: No flags needed for basic layout functionality
- **🎨 Intuitive**: File organization matches mental model
- **⚡ Fast**: Convention-based discovery is efficient
- **🔧 Maintainable**: Clear separation of layouts, components, and content
- **📱 Scalable**: Conventions work for small and large projects
- **🎯 Focused**: Developers focus on content, not configuration

---

*This example showcases the power of Unify's convention-based architecture - a modern approach to static site generation with minimal configuration.*