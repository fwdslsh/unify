---
title: Static Assets - unify Documentation
description: Learn how unify handles static assets including automatic copying, reference tracking, optimization strategies, and advanced asset management techniques.
---

# Static Assets

Unify provides intelligent static asset handling with automatic copying, reference tracking, and flexible configuration options. Assets are processed efficiently while maintaining directory structure and optimizing for web delivery.

> **📋 What You'll Learn**
>
> This guide covers asset processing, automatic copying, reference tracking, optimization strategies, and advanced asset management techniques.

## Asset Processing Overview

### How Unify Handles Assets

Unify processes assets through multiple mechanisms:

- **Automatic reference tracking:** Assets referenced in HTML/CSS are copied automatically
- **Implicit assets directory:** `assets/**` is copied by default
- **Explicit copy patterns:** Use `--copy` for additional files
- **Smart filtering:** Use ignore patterns to exclude unwanted files

### Asset Processing Priority

When files match multiple rules, unify follows this precedence:

1. **Render wins over copy:** Renderable files are processed, not copied raw
2. **Explicit overrides implicit:** CLI flags override default behavior
3. **Last pattern wins:** Later glob patterns take precedence

## Asset Organization

### Recommended Directory Structure

```
src/
├── assets/                     # Auto-copied asset directory
│   ├── css/
│   │   ├── styles.css
│   │   ├── components.css
│   │   └── themes/
│   │       ├── light.css
│   │       └── dark.css
│   ├── js/
│   │   ├── main.js
│   │   ├── components/
│   │   └── vendor/
│   ├── images/
│   │   ├── hero.jpg
│   │   ├── thumbnails/
│   │   └── icons/
│   │       ├── favicon.ico
│   │       └── logo.svg
│   └── fonts/
│       ├── inter.woff2
│       └── mono.woff2
│
├── public/                    # Additional public files
│   ├── robots.txt
│   ├── sitemap.xml
│   └── .well-known/
│       └── security.txt
│
└── downloads/                 # Large files, documents
    ├── whitepaper.pdf
    └── user-manual.pdf
```

### Asset Naming Conventions

- **Use descriptive names:** `hero-image.jpg` not `img1.jpg`
- **Include dimensions for images:** `logo-200x50.png`
- **Version critical assets:** `main-v2.css` for cache busting
- **Group by type:** Keep similar assets in dedicated folders

## Automatic Asset Copying

### Implicit Assets Directory

Unify automatically copies the `assets/**` directory to maintain compatibility with common static site patterns:

```
# This happens automatically
src/assets/css/styles.css → dist/assets/css/styles.css
src/assets/images/logo.png → dist/assets/images/logo.png
```

> **💡 Pro Tip**
>
> The `assets/**` behavior mirrors Astro's `public/` directory and Vite's `publicDir` for familiar workflow patterns.

### Reference-Based Copying

Assets referenced in HTML, CSS, or Markdown are automatically tracked and copied:

```html
<!-- HTML references -->
<img src="/images/hero.jpg" alt="Hero image" />
<link rel="stylesheet" href="/css/components.css" />
<script src="/js/analytics.js"></script>

/* CSS references */
.hero {
  background-image: url('/images/backgrounds/gradient.png');
}

@font-face {
  font-family: 'CustomFont';
  src: url('/fonts/custom.woff2') format('woff2');
}
```

### Disabling Automatic Copying

Disable implicit `assets/**` copying if needed:

```bash
# Disable automatic assets copying
unify build --ignore "assets/**"

# Copy only specific asset types
unify build --ignore "assets/**" --copy "assets/**/*.{css,js,woff2}"
```

## Manual Asset Management

### Copy Patterns

Use `--copy` to explicitly copy additional files:

```bash
# Copy specific file types
unify build --copy "public/**/*.{txt,xml,json}"

# Copy entire directories
unify build --copy "downloads/**"

# Multiple copy patterns
unify build --copy "docs/**/*.pdf" --copy "config/*.json"
```

### Complex Copy Rules

Combine copy and ignore patterns for precise control:

```bash
# Copy all images except raw/source files
unify build \
  --copy "assets/images/**" \
  --ignore-copy "assets/images/raw/**" \
  --ignore-copy "**/*.{psd,ai,sketch}"

# Copy processed assets only
unify build \
  --copy "assets/dist/**" \
  --ignore "assets/src/**"
```

### Selective Asset Processing

Fine-tune which assets are processed vs copied:

```bash
# Render some assets, copy others
unify build \
  --copy "assets/images/**" \
  --copy "assets/fonts/**" \
  --ignore-copy "assets/css/**"    # Let CSS be reference-tracked instead
```

## Asset Optimization

### Image Optimization Strategy

Optimize images before adding to your unify project:

#### Modern Image Formats

- **WebP:** Excellent compression, wide browser support
- **AVIF:** Better compression than WebP, newer format
- **JPEG XL:** Future-focused, emerging support

#### Responsive Images

Provide multiple sizes for different contexts:

```html
<!-- Responsive image with multiple sources -->
<picture>
  <source 
    srcset="/images/hero-800.avif 800w, /images/hero-1200.avif 1200w, /images/hero-1600.avif 1600w"
    sizes="(max-width: 768px) 800px, (max-width: 1200px) 1200px, 1600px"
    type="image/avif" />
  <source 
    srcset="/images/hero-800.webp 800w, /images/hero-1200.webp 1200w, /images/hero-1600.webp 1600w"
    sizes="(max-width: 768px) 800px, (max-width: 1200px) 1200px, 1600px"
    type="image/webp" />
  <img 
    src="/images/hero-1200.jpg" 
    srcset="/images/hero-800.jpg 800w, /images/hero-1200.jpg 1200w, /images/hero-1600.jpg 1600w"
    sizes="(max-width: 768px) 800px, (max-width: 1200px) 1200px, 1600px"
    alt="Hero image" 
    loading="lazy" />
</picture>
```

### CSS Optimization

Organize CSS for optimal loading and maintenance:

```html
<!-- Critical CSS inline -->
<style>
  /* Above-the-fold styles */
  body { margin: 0; font-family: system-ui; }
  .hero { height: 100vh; display: flex; align-items: center; }
</style>

<!-- Non-critical CSS with media queries -->
<link rel="stylesheet" href="/assets/css/components.css" media="print" onload="this.media='all'" />
<link rel="stylesheet" href="/assets/css/utilities.css" media="print" onload="this.media='all'" />
```

### JavaScript Optimization

Load JavaScript efficiently:

```html
<!-- Essential scripts -->
<script src="/assets/js/critical.js"></script>

<!-- Deferred non-critical scripts -->
<script src="/assets/js/analytics.js" defer></script>
<script src="/assets/js/interactions.js" defer></script>

<!-- Module scripts for modern browsers -->
<script type="module" src="/assets/js/main.mjs"></script>
<script nomodule src="/assets/js/main.legacy.js"></script>
```

## Advanced Asset Patterns

### Content Delivery Network (CDN)

Mix local and CDN assets effectively:

```html
<!-- CDN for common libraries -->
<script src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js" defer></script>

<!-- Local assets for custom code -->
<script src="/assets/js/app.js" defer></script>

<!-- Fallback for CDN failures -->
<script>
  window.Alpine || document.write('<script src="/assets/js/alpine.min.js" defer><\/script>');
</script>
```

### Asset Versioning

Implement cache busting for updated assets:

```html
<!-- Version in filename -->
<link rel="stylesheet" href="/assets/css/main-v2.3.1.css" />

<!-- Query parameter versioning -->
<script src="/assets/js/app.js?v=2.3.1"></script>

<!-- Hash-based versioning (ideal) -->
<link rel="stylesheet" href="/assets/css/main.a1b2c3d4.css" />
```

### Progressive Enhancement Assets

Layer assets for progressive enhancement:

```html
<!-- Base experience -->
<link rel="stylesheet" href="/assets/css/base.css" />

<!-- Enhanced features -->
<link rel="stylesheet" href="/assets/css/enhanced.css" media="(min-width: 768px)" />

<!-- Advanced interactions -->
<script>
  if ('IntersectionObserver' in window) {
    import('/assets/js/scroll-effects.js');
  }
</script>
```

## Asset Security

### Content Security Policy (CSP)

Configure CSP headers for asset security:

```html
<!-- CSP meta tag -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' https://api.example.com;
" />
```

### Subresource Integrity (SRI)

Use SRI for external assets:

```html
<!-- SRI for CDN assets -->
<script 
  src="https://cdn.jsdelivr.net/npm/alpinejs@3.13.3/dist/cdn.min.js"
  integrity="sha384-example-hash-here"
  crossorigin="anonymous"
  defer></script>

<link 
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css"
  integrity="sha384-example-hash-here"
  crossorigin="anonymous" />
```

## Performance Monitoring

### Asset Loading Analytics

Monitor asset performance:

```html
<script>
  // Monitor largest contentful paint
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      console.log('LCP:', entry.startTime);
      // Send to analytics
    }
  }).observe({type: 'largest-contentful-paint', buffered: true});
  
  // Monitor resource loading
  window.addEventListener('load', () => {
    const resources = performance.getEntriesByType('resource');
    resources.forEach(resource => {
      if (resource.duration > 1000) {
        console.warn('Slow asset:', resource.name, resource.duration);
      }
    });
  });
</script>
```

### Bundle Analysis

Analyze asset sizes and usage:

```bash
# Use tools to analyze asset usage
# Example with webpack-bundle-analyzer for bundled assets
npx webpack-bundle-analyzer dist/assets/js/*.js

# Check asset sizes
du -sh dist/assets/*

# Find large files
find dist -type f -size +100k -exec ls -lh {} \;
```

## Build Integration

### Asset Pipeline Integration

Integrate with build tools:

```json
{
  "scripts": {
    "build:assets": "npm run build:css && npm run build:js && npm run optimize:images",
    "build:css": "postcss src/assets/css/main.css -o dist/assets/css/main.css",
    "build:js": "esbuild src/assets/js/main.js --bundle --outfile=dist/assets/js/main.js",
    "optimize:images": "imagemin src/assets/images/* --out-dir=dist/assets/images",
    "build": "npm run build:assets && unify build --source src --output dist"
  }
}
```

### Watch Mode Integration

Set up asset watching during development:

```bash
# Watch assets and unify files simultaneously
npm run watch:assets & unify serve --source src --port 3000

# Or use a tool like concurrently
npx concurrently "npm run watch:assets" "unify serve"
```

## Common Patterns

### Multi-environment Assets

```bash
# Development build (unoptimized)
unify build --copy "assets/dev/**"

# Production build (optimized)
unify build --copy "assets/dist/**" --ignore "assets/dev/**"

# Staging build (mixed)
unify build --copy "assets/dist/**" --copy "assets/debug.js"
```

### Theme-based Assets

```html
<!-- Dynamic theme loading -->
<link id="theme-css" rel="stylesheet" href="/assets/css/themes/light.css" />

<script>
  function switchTheme(theme) {
    document.getElementById('theme-css').href = `/assets/css/themes/${theme}.css`;
    localStorage.setItem('theme', theme);
  }
  
  // Load saved theme
  const savedTheme = localStorage.getItem('theme') || 'light';
  switchTheme(savedTheme);
</script>
```

### Lazy Loading Assets

```html
<!-- Intersection Observer for images -->
<img 
  data-src="/assets/images/heavy-image.jpg" 
  src="/assets/images/placeholder.svg"
  alt="Description"
  loading="lazy"
  class="lazy-image" />

<script>
  // Lazy load images
  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.classList.remove('lazy-image');
        observer.unobserve(img);
      }
    });
  });
  
  document.querySelectorAll('.lazy-image').forEach(img => {
    imageObserver.observe(img);
  });
</script>
```

> **⚠️ Common Pitfalls**
>
> - **Overly broad copy patterns:** `--copy "**/*"` can impact performance
> - **Missing asset references:** Unreferenced assets won't be copied automatically
> - **Wrong path formats:** Use forward slashes in paths on all platforms
> - **Large unoptimized assets:** Always optimize images and compress files
> - **Missing fallbacks:** Provide fallbacks for modern asset formats

## Troubleshooting

### Assets Not Copying

1. **Check file paths:** Verify assets exist at expected locations
2. **Review ignore patterns:** Ensure assets aren't being excluded
3. **Validate copy patterns:** Test glob patterns with `--dry-run`
4. **Check precedence rules:** Later patterns may override earlier ones

### Reference Tracking Issues

1. **Verify paths:** Ensure referenced paths are correct
2. **Check CSS imports:** CSS `@import` and `url()` paths
3. **Review HTML attributes:** `src`, `href`, and other asset references
4. **Debug with verbose logging:** Use `--log-level debug`

### Performance Issues

1. **Profile asset loading:** Use browser dev tools Network tab
2. **Check asset sizes:** Identify and optimize large files
3. **Review copy patterns:** Avoid overly broad patterns
4. **Monitor build times:** Track asset processing performance

> **✅ Best Practices Summary**
>
> - **Organize assets logically** by type and usage
> - **Use modern formats** with proper fallbacks
> - **Implement responsive images** for different screen sizes
> - **Optimize asset loading** with defer, async, and lazy loading
> - **Monitor performance** and optimize bottlenecks
> - **Secure assets** with CSP and SRI where appropriate

## Next Steps

Now that you understand asset management in unify:

- [Learn about performance optimization](/unify/docs/performance)
- [Explore security best practices](/unify/docs/security)
- [Deploy your asset-rich site](/unify/docs/deployment)
- [Master build command options](/unify/docs/cli-build)