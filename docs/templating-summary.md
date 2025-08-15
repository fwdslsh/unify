# Templating System Summary

A concise overview of unify's four templating features using web platform standards.

## Core Concepts
  
- **Includes** → Component insertion via comments or elements
- **Layouts** → HTML structure with `<slot>` placeholders  
- **Slots** → Content placeholders with optional names and default content
- **Templates** → Content containers with `slot` attributes that replace associated slots

## How It Works

1. **Layouts** define page structure with slots:

   `src/.layouts/default.html`

   ```html
   <html>
    <head>
        <title><slot name="title">Untitled</slot>
    </head>
     <body>
       <slot>Default</slot>
     </body>
   </html>
   ```

2. **Pages** have one root container element and can contain templates for containing content for layout slots, styles elements, and scripts elements:
   `src/index.html`

   ```html
   <template slot="title">Home Page</template>

   <div id="home-content">
     <h1>Welcome home!</h1>
     <include src=".components/getting-started.html" />
   </div>
   <style>
     #home-content {
       h1 {
         font-size: 1.5rem;
       }
     }
   </style>
   <script>
     console.log("Embrace the future");
   </script>
   ```

3. **Components** are included as is and replace the include element or comment:

   ```html
   <div class="getting-started-container">
     What you doing just standing there?!
   </div>
   <style>
     .getting-started-container {
       container-type: inline-size;
     }
   </style>
   <script>
     console.log("Get started or you will never finish");
   </script>
   ```

4. **Templates** contain content that will replace layout slots.

5. **Result** is complete HTML with content in the right places.

## Syntax Reference

| Element                         | Purpose                          | Example                                     |
| ------------------------------- | -------------------------------- | ------------------------------------------- |
| `<slot name="x">`               | Content placeholder              | `<slot name="title">Default</slot>`         |
| `<slot></slot>`                 | Default content area             | `<slot></slot>`                             |
| `<template slot="x">`           | Content for named slot           | `<template slot="title">Hi</template>`     |
| `<element slot="x">`            | Element assigned to named slot   | `<aside slot="sidebar">Content</aside>`    |
| `data-layout="path"`            | Layout selection                 | `<div data-layout="base.html">`             |
| `<!--#include virtual="/x" -->` | Include from source root         | `<!--#include virtual="/header.html" -->`   |
| `<!--#include file="x" -->`     | Include relative to current file | `<!--#include file="../nav.html" -->`       |
| `<include src="/x">`            | Include element (source root)    | `<include src="/header.html">`              |
| `<include virtual="/x">`        | Include element (source root)    | `<include virtual="/header.html">`          |
| `<include file="x">`            | Include element (relative)       | `<include file="../nav.html">`              |

## Include Path Resolution

- **`src="/path"` or `virtual="/path"`**: Resolves from source root directory (`src/`)
- **`file="path"`**: Resolves relative to the current file's directory
- **Leading `/`**: Optional for virtual/src paths, recommended for clarity

## File Organization

```text
dist/                # Rendered output
src/
├── .layouts/        # Page structures
├── .components/     # Reusable components
├── *.html          # Pages (one root element + templates, styles, and scripts)
└── *.md            # Markdown with layout: frontmatter
```

## Page Structure

Pages contain exactly:

- **One root element** with optional `data-layout` attribute
- **Zero or more** `<template slot="name">` elements or elements with `slot="name"` attributes
- **Zero or more** `<script>` and `<style>` elements
- **Include directives** (comments or elements) within the root element

## Slot Content Options

Pages can provide content for named slots using either:

- **`<template slot="name">`** - Hidden when viewing the raw page in a browser
- **`<element slot="name">`** - Visible when viewing the raw page in a browser

## Key Benefits

- **Simple**: Uses standard web platform `slot` attributes
- **Flexible**: Slots have defaults, content can be mixed and matched
- **Modular**: Components are reusable and customizable
- **Standard**: Works with existing HTML and Markdown workflows
- **Raw-viewable**: Choose whether slot content is visible in uncompiled pages

## Example Flow

**Layout:** `src/.layouts/base.html`

```html
<html>
  <head>
    <title><slot name="title"></slot></title>
  </head>
  <body>
    <slot name="main">Default content</slot>
  </body>
</html>
```

**Component:** `src/.components/card.html`

```html
<div class="card">Card</div>
```

**Page:** `src/index.html`

```html
<div data-layout="base">
  <template slot="title">My Card Page</template>
  
  <p>This goes to the layout's main slot</p>
  <!--#include virtual="/.components/card.html" -->
</div>
```

**Output:** Complete HTML page with card component inside layout structure.
`dist/index.html`

```html
<html>
  <head>
    <title>My Card Page</title>
  </head>
  <body>
    <div class="card">Card</div>
    <p>This goes to the layout's main slot</p>
  </body>
</html>
```
