# Advanced Example

This example demonstrates the `unify` modern templating system that uses pure HTML with minimal custom elements.

## 🎯 Design Principles

- **HTML-centric**: No templating language, just HTML
- **Single custom element**: Only `<include />` is introduced  
- **No wrappers**: Pages and components are just HTML
- **Minimal configuration**: Layouts are inferred by convention
- **Pure build-time**: No runtime JavaScript or dynamic templating

## 📁 Project Structure

```
examples/dom-mode/
├── pages/
│   ├── index.html           # Homepage with blog layout
│   └── about.html           # About page with default layout
├── components/
│   ├── alert.html           # Alert component with token replacement
│   ├── card.html            # Card component  
│   └── navigation.html      # Navigation component
├── layouts/
│   ├── default.html         # Default page layout
│   └── blog.html            # Blog-specific layout
├── styles/
│   └── site.css             # Global styles
└── dist/                    # Generated output
```

## 🧩 Key Features Demonstrated

### 1. Layout System

Pages specify layouts using `data-layout`:

```html
<body data-layout="/layouts/blog.html">
  <!-- Page content -->
</body>
```

### 2. Slot System

Named slots in layouts:
```html
<!-- In layout -->
<title><slot name="title">Default Title</slot></title>
<main><slot></slot></main> <!-- unnamed slot -->
```

Content for slots:
```html
<!-- In page -->
<template target="title">My Page Title</template>
<!-- Content outside templates goes to unnamed slot -->
<h1>Main Content</h1>
```

### 3. Component Inclusion

Include components with data binding:
```html
<include src="/components/alert.html"
         data-title="Warning"
         data-message="This is important!" />
```

### 4. Token Replacement

Components use `data-token` for replaceable content:
```html
<!-- In component -->
<strong data-token="title">Default Title</strong>
<p data-token="message">Default message</p>
```

## 🔧 Building This Example

```bash
# Build the DOM mode example
unify build --source examples/dom-mode/pages --output examples/dom-mode/dist

# The build process will:
# 1. Detect DOM mode elements in pages
# 2. Apply layouts with slot system
# 3. Process component includes with token replacement
# 4. Move component styles to <head> (deduplicated)
# 5. Move component scripts to end of <body> (deduplicated)
```

## ✨ Expected Output

The `index.html` file will be processed into a complete HTML document:

- Layout `layouts/blog.html` provides the structure
- Named slots (`title`, `header`, `footer`) filled from `<template target="...">`
- Default content goes into the unnamed `<slot></slot>`
- `<include>` elements replaced with component content
- `data-token` attributes replaced with values from `data-*` attributes
- Component styles moved to `<head>` and deduplicated
- Component scripts moved to end of `<body>` and deduplicated

## 🆚 Comparison with Traditional SSI

| Feature | Traditional SSI | DOM Mode |
|---------|----------------|----------|
| **Includes** | `<!--#include virtual="/path" -->` | `<include src="/path" />` |
| **Data Passing** | ❌ Not supported | ✅ `data-title="value"` |
| **Layouts** | ❌ Manual | ✅ `data-layout` + slots |
| **Components** | ❌ Static only | ✅ Token replacement |
| **Scoped Styles** | ❌ Global only | ✅ Component styles moved to head |

## 🎨 Component Architecture

Components are self-contained HTML files that can include:

- **Styles**: `<style>` tags moved to document head
- **Scripts**: `<script>` tags moved to end of body  
- **Markup**: HTML content with `data-token` placeholders
- **Token replacement**: `data-token="field"` replaced with `data-field` values

## 🚀 Benefits

- **🧩 Modular**: Build sites from reusable components
- **🎨 Flexible**: Mix layouts, components, and traditional includes
- **⚡ Fast**: All processing at build time, pure HTML output
- **🔧 Maintainable**: Component-based architecture scales well
- **📱 Modern**: Web standards-inspired syntax
- **🎯 Focused**: Only one new element to learn (`<include>`)

---

*This example showcases the full power of Unify's DOM Mode - a modern approach to static site generation with pure HTML.*