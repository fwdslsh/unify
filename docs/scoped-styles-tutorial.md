# Tutorial: Using Scoped Styles with Components in Unify

## Introduction

Unify allows developers to build maintainable static sites with component-based architecture. One of the key features is the ability to encapsulate styles for components and layouts using the `@scope` rule. This tutorial will guide you through the best practices for using scoped styles in Unify, ensuring maintainable and isolated styling for your projects.

---

## 1. Using `@scope` for Style Encapsulation

The `@scope` rule allows you to encapsulate styles to specific parts of the DOM, such as components or layouts. This ensures that styles are applied only to the intended elements, avoiding conflicts with other parts of the site.

### Example: Scoped Styles for a Component

```css
@scope (.component-header) {
  h1 {
    color: red;
    font-size: 2rem;
  }

  p {
    margin: 0;
  }
}
```

- **Explanation**: The styles inside the `@scope` block will only apply to elements within the `.component-header` subtree.
- **Usage in Unify**: Wrap each component or layout in a unique container (e.g., `<div class="component-header">`) to scope styles effectively.

### How to Structure Components

```html
<div class="component-header">
  <h1>Header Title</h1>
  <p>Header description</p>
</div>
```

```css
@scope (.component-header) {
  h1 {
    color: red;
  }
  p {
    font-size: 1rem;
  }
}
```

---

## 2. Combining `@scope` with CSS Nesting

CSS Nesting allows you to write cleaner, more maintainable styles within scoped blocks. Here's an example:

### Example: Scoped Styles with Nesting

```css
@scope (.component-header) {
  h1 {
    color: red;

    &:hover {
      color: darkred;
    }
  }

  p {
    font-size: 1rem;

    &.highlight {
      font-weight: bold;
    }
  }
}
```

- **Explanation**: The `&` symbol refers to the parent selector, making it easier to write nested styles for states like `:hover` or specific class combinations.

---

## 3. Runtime Polyfill for `@scope`

For browsers that do not yet support `@scope` (e.g., Firefox), you can use the **Scoped CSS Polyfill** to enable runtime support. This is the recommended approach for most Unify users, as it does not require a build system.

### Scoped CSS Polyfill

- **Library**: [scoped-css-polyfill](https://github.com/GoogleChromeLabs/scoped-css-polyfill)
- **Installation**:

```bash
bun add scoped-css-polyfill
```

- **Usage**:

Add the polyfill to the `<head>` of your site:

```html
<script src="/path/to/scoped-css-polyfill.js"></script>
```

This polyfill ensures that `@scope` rules are applied correctly in browsers that do not natively support them.

---

## 4. Optional: Using PostCSS for Build Systems

If you are already using a build system with Unify, you can leverage **PostCSS** to transform `@scope` and CSS nesting into browser-compatible CSS during the build process. This approach is optional and recommended only for users who have an existing build pipeline.

### Recommended PostCSS Plugins

1. **PostCSS Nesting**: Transforms nested CSS into flat, browser-compatible rules.
2. **PostCSS Scoped Styles**: Converts `@scope` rules into namespaced selectors.

### Example PostCSS Configuration

```javascript
module.exports = {
  plugins: [
    require("postcss-nesting"), // For CSS nesting
    require("postcss-scoped-styles"), // For @scope transformation
  ],
};
```

### Installation

```bash
bun add postcss postcss-nesting postcss-scoped-styles
```

### Usage

Run PostCSS during the build process to transform scoped and nested styles into browser-compatible CSS.

---

## 5. Fallback for Unsupported Browsers

If you cannot use the runtime polyfill or PostCSS, you can use **manual namespacing** as a fallback:

### Example: Manual Namespacing

```css
/* Instead of @scope */
.component-header h1 {
  color: red;
}

.component-header p {
  font-size: 1rem;
}
```

- **Tradeoff**: This approach is less elegant and requires manual maintenance but ensures compatibility across all browsers.

---

## 6. Documentation for Users

### Example Documentation Section

````markdown
### Scoping Styles in Unify

To encapsulate styles for components and layouts, use the `@scope` rule and CSS nesting. This ensures styles are applied only to specific parts of your site.

#### Example: Scoped Styles

```css
@scope (.component-header) {
  h1 {
    color: red;
  }
}
```

#### Using CSS Nesting

```css
@scope (.component-header) {
  h1 {
    color: red;

    &:hover {
      color: darkred;
    }
  }
}
```

#### Browser Support

`@scope` is supported in most modern browsers, but not in Firefox or IE. To ensure compatibility:

1. Use the [Scoped CSS Polyfill](https://github.com/GoogleChromeLabs/scoped-css-polyfill) for runtime support.
2. Optionally, use a PostCSS build step with the `postcss-scoped-styles` plugin if you already have a build system.

#### Fallback: Manual Namespacing

If you cannot use `@scope`, manually namespace your styles:

```css
.component-header h1 {
  color: red;
}
```

````

---

## Conclusion

By leveraging `@scope` and CSS nesting, Unify users can achieve style encapsulation without the complexity of the Shadow DOM. For unsupported browsers, the **Scoped CSS Polyfill** is the recommended solution. If you are using a build system, consider PostCSS as an optional enhancement. For maximum compatibility, manual namespacing can be used as a fallback.
