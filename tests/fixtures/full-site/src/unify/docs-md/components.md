---
title: Components - unify Documentation
description: Learn how to create, organize, and use reusable components in unify with DOM Cascade composition patterns and best practices.
---

# Components

Components are reusable HTML fragments that can be imported and composed into pages and layouts. Unify's component system is built on DOM Cascade, providing powerful area-based composition with predictable semantics.

> **📝 What You'll Learn**
>
> This guide covers component creation, organization, composition patterns, and best practices for building maintainable component libraries.

## Component Fundamentals

### What Are Components?

Components are HTML fragments designed for reuse across multiple pages. They:

- Encapsulate structure, styling, and behavior
- Expose public areas for customization
- Can be parameterized through area-based composition
- Support both standalone and nested usage

### Component vs Layout

Understanding the difference between components and layouts:

| Aspect | Components | Layouts |
|--------|------------|---------|
| **Import Target** | Any element | `<html>` or `<body>` |
| **Scope** | Component root element | Layout body element |
| **Purpose** | Reusable UI elements | Page structure and chrome |
| **Composition** | Inline at import point | Wraps entire page content |

## Creating Components

### Basic Component Structure

A simple component follows this pattern:

```html
<!-- _includes/button.html -->
<!-- Contract documentation -->
<head>
    <style data-unify-docs="v1">
        /* Public areas */
        .unify-label {
            /* Button text content */
        }
        
        /* Optional state classes */
        .is-primary {
            /* Primary button variant */
        }
        .is-large {
            /* Large size variant */
        }
    </style>
</head>

<!-- Component implementation -->
<button class="btn" type="button">
    <span class="unify-label">Click Me</span>
</button>
```

### Component Naming Conventions

Follow these conventions for maintainable components:

- **File naming:** Use descriptive names with `_` prefix: `_card.html`, `_navigation.html`
- **Directory organization:** Group in `_includes/` or `_components/`
- **Area classes:** Use semantic names: `.unify-title`, `.unify-actions`
- **State classes:** Use `is-` prefix: `.is-active`, `.is-loading`

### Complex Component Example

Here's a more sophisticated card component:

```html
<!-- _includes/card.html -->
<head>
    <style data-unify-docs="v1">
        /* Public areas */
        .unify-image {
            /* Card hero image */
        }
        .unify-title {
            /* Card headline */
        }
        .unify-body {
            /* Main card content */
        }
        .unify-meta {
            /* Metadata like author, date */
        }
        .unify-actions {
            /* Call-to-action buttons */
        }
        
        /* State variants */
        .is-featured {
            /* Featured card styling */
        }
        .is-horizontal {
            /* Side-by-side layout */
        }
    </style>
</head>

<article class="card">
    <div class="unify-image">
        <img src="/assets/placeholder.jpg" alt="Default image" />
    </div>
    
    <div class="card-content">
        <h3 class="unify-title">Default Title</h3>
        
        <div class="unify-meta">
            <time datetime="2024-01-01">January 1, 2024</time>
        </div>
        
        <div class="unify-body">
            <p>Default card content goes here...</p>
        </div>
        
        <div class="unify-actions">
            <a href="#" class="btn">Learn More</a>
        </div>
    </div>
</article>
```

## Using Components

### Basic Component Import

Import components using `data-unify` on any element:

```html
<!-- Simple button usage -->
<div data-unify="/_includes/button.html">
    <span class="unify-label">Subscribe Now</span>
</div>

<!-- With state classes -->
<div data-unify="/_includes/button.html" class="is-primary is-large">
    <span class="unify-label">Get Started</span>
</div>
```

### Advanced Component Usage

Using the complex card component:

```html
<!-- Featured product card -->
<div data-unify="/_includes/card.html" class="is-featured">
    <div class="unify-image">
        <img src="/products/laptop.jpg" alt="Pro Laptop" />
    </div>
    
    <h3 class="unify-title">Pro Laptop 2024</h3>
    
    <div class="unify-meta">
        <span class="price">$1,299</span>
        <span class="rating">★★★★★</span>
    </div>
    
    <div class="unify-body">
        <p>Professional-grade laptop with cutting-edge performance for creators and developers.</p>
        <ul>
            <li>M3 Pro chip</li>
            <li>16GB unified memory</li>
            <li>1TB SSD storage</li>
        </ul>
    </div>
    
    <div class="unify-actions">
        <a href="/products/laptop" class="btn btn-primary">View Details</a>
        <button class="btn btn-secondary" data-cart-add="laptop-pro">Add to Cart</button>
    </div>
</div>
```

### Component Path Resolution

Components support the same path resolution as layouts:

- **Absolute:** `data-unify="/_includes/card.html"`
- **Relative:** `data-unify="../shared/button.html"`
- **Short names:** `data-unify="card"` → finds `_card.html`

## Component Organization

### Directory Structure

Organize components for scalability and maintainability:

```
src/
├── _includes/              # Global components
│   ├── _button.html         # Basic button
│   ├── _card.html           # Content card
│   ├── _navigation.html     # Site navigation
│   └── _footer.html         # Site footer
│
├── _components/            # Complex components
│   ├── forms/
│   │   ├── _contact-form.html
│   │   └── _newsletter.html
│   ├── layout/
│   │   ├── _header.html
│   │   └── _sidebar.html
│   └── widgets/
│       ├── _testimonial.html
│       └── _pricing-table.html
│
└── blog/
    ├── _post-card.html      # Section-specific components
    └── _author-bio.html
```

### Component Libraries

For larger projects, consider organizing components into libraries:

- **Core components:** Basic UI elements (buttons, forms, cards)
- **Layout components:** Headers, footers, navigation
- **Content components:** Blog posts, product listings, testimonials
- **Utility components:** Alerts, modals, loading states

## Composition Patterns

### Nested Components

Components can import other components:

```html
<!-- _includes/hero-section.html -->
<section class="hero">
    <div class="hero-content">
        <h1 class="unify-title">Default Hero Title</h1>
        <p class="unify-subtitle">Default subtitle text</p>
        
        <div class="unify-actions">
            <!-- Nested button component -->
            <div data-unify="/_includes/button.html" class="is-primary is-large">
                <span class="unify-label">Get Started</span>
            </div>
        </div>
    </div>
</section>
```

### Component Composition

Compose multiple components for complex interfaces:

```html
<!-- Product listing page -->
<main>
    <!-- Hero with search -->
    <div data-unify="/_includes/hero-section.html">
        <h1 class="unify-title">Our Products</h1>
        <p class="unify-subtitle">Find the perfect solution for your needs</p>
        <div class="unify-actions">
            <div data-unify="/_includes/search-form.html">
                <input class="unify-input" placeholder="Search products..." />
            </div>
        </div>
    </div>
    
    <!-- Product grid -->
    <section class="product-grid">
        <div data-unify="/_includes/card.html">
            <!-- Product 1 content -->
        </div>
        
        <div data-unify="/_includes/card.html">
            <!-- Product 2 content -->
        </div>
        
        <div data-unify="/_includes/card.html">
            <!-- Product 3 content -->
        </div>
    </section>
</main>
```

### Conditional Components

Use CSS and JavaScript to conditionally show components:

```html
<!-- Show different components based on state -->
<div class="user-section">
    <div data-unify="/_includes/login-form.html" class="show-when-logged-out">
        <!-- Login form content -->
    </div>
    
    <div data-unify="/_includes/user-profile.html" class="show-when-logged-in">
        <!-- User profile content -->
    </div>
</div>
```

## Best Practices

> **✅ Component Design Guidelines**
>
> - **Single Responsibility:** Each component should have one clear purpose
> - **Semantic HTML:** Use proper HTML5 elements and ARIA attributes
> - **Progressive Enhancement:** Ensure components work without JavaScript
> - **Responsive Design:** Components should adapt to different screen sizes

### API Design

- **Document all public areas** in contract blocks
- **Use semantic area names** that describe content, not layout
- **Provide sensible defaults** for all areas
- **Keep area classes unique** within each component scope
- **Support optional variants** through state classes

### Styling Strategy

- **Use CSS custom properties** for themeable components
- **Scope styles appropriately** with `@scope` or CSS nesting
- **Avoid overly specific selectors** in contract documentation
- **Support utility classes** for quick modifications

### Performance Considerations

- **Minimize nested imports** to reduce build complexity
- **Use efficient asset references** in component styles
- **Consider lazy loading** for heavy interactive components
- **Optimize component styles** for critical rendering path

## Testing Components

### Development Testing

Test components during development:

```html
# Create a test page for your component
# test-pages/button-tests.html
<body>
    <h1>Button Component Tests</h1>
    
    <!-- Default state -->
    <div data-unify="/_includes/button.html">
        <span class="unify-label">Default Button</span>
    </div>
    
    <!-- Primary variant -->
    <div data-unify="/_includes/button.html" class="is-primary">
        <span class="unify-label">Primary Button</span>
    </div>
    
    <!-- Large size -->
    <div data-unify="/_includes/button.html" class="is-large">
        <span class="unify-label">Large Button</span>
    </div>
</body>
```

### Linting Components

Use unify's built-in linting to validate components:

```bash
# Validate component contracts
unify build --fail-on U001,U002,U004

# Check for common issues
# U001: Contract documentation present
# U002: Area classes unique in scope
# U004: All areas documented
```

## Common Patterns

### Form Components

```html
<!-- _includes/form-field.html -->
<div class="form-field">
    <label class="unify-label" for="field-id">Field Label</label>
    <div class="unify-input">
        <input type="text" id="field-id" name="field-name" />
    </div>
    <div class="unify-help">
        <p>Helper text goes here</p>
    </div>
    <div class="unify-error">
        <!-- Error messages -->
    </div>
</div>
```

### Navigation Components

```html
<!-- _includes/breadcrumb.html -->
<nav class="breadcrumb" aria-label="Breadcrumb">
    <ol class="unify-items">
        <li><a href="/">Home</a></li>
        <li><a href="/products">Products</a></li>
        <li aria-current="page">Current Page</li>
    </ol>
</nav>
```

### Content Components

```html
<!-- _includes/testimonial.html -->
<blockquote class="testimonial">
    <div class="unify-quote">
        <p>Default testimonial text goes here...</p>
    </div>
    <footer class="testimonial-footer">
        <div class="unify-author">
            <strong>John Doe</strong>
        </div>
        <div class="unify-title">
            <span>CEO, Company Name</span>
        </div>
    </footer>
</blockquote>
```

> **⚠️ Common Pitfalls**
>
> - **Duplicate area classes** within the same component scope
> - **Overly specific CSS selectors** in contract documentation
> - **Missing fallback content** for all public areas
> - **Circular component dependencies** causing build errors
> - **Undocumented areas** leading to maintenance issues

## Next Steps

Now that you understand component patterns:

- [Review DOM Cascade composition rules](/unify/docs/includes)
- [Learn about Markdown components](/unify/docs/markdown)
- [Understand asset management in components](/unify/docs/assets)
- [Optimize component performance](/unify/docs/performance)