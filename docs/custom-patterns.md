# Custom File Patterns Guide

Unify supports customizable file patterns that allow you to define which files should be treated as components, layouts, and includes directories. This gives you flexibility to use naming conventions that fit your project's style.

## Overview

By default, Unify uses underscore-prefixed files (`_`) as non-emitting components and layouts. With custom patterns, you can use more descriptive naming conventions like:

- `card.component.html` instead of `_card.html`
- `main.layout.html` instead of `_main.layout.html`
- `components/` directory instead of `_includes/`

## Configuration Options

### CLI Options

```bash
unify build [options]

File Pattern Options:
  --includes-dir        Directory for includes (default: _includes)
  --layouts-dir         Directory for layouts (default: auto-discovery)
  --component-pattern   Pattern for non-emitting files (default: _*)
  --layout-pattern      Pattern for layout files (default: *layout.html|*layout.htm)
  --layout-filename     Default layout filename (default: layout.html)
```

### Pattern Syntax

Patterns support glob-style matching:
- `*` matches any characters
- `|` separates multiple patterns (OR logic)
- Patterns match the entire filename

## Real-World Examples

### Example 1: Component-Based Architecture

Use `.component.` suffix for components and `.layout.` for layouts:

```bash
unify build \
  --component-pattern "*.component.*" \
  --layout-pattern "*.layout.*" \
  --includes-dir "components"
```

**Directory Structure:**
```
src/
├── index.html
├── about.html
├── components/
│   ├── nav.component.html
│   ├── card.component.html
│   ├── main.layout.html
│   └── blog.layout.html
└── assets/
    └── style.css
```

**Usage in HTML:**
```html
<!-- index.html -->
<div data-layout="main">
  <h1>Welcome</h1>
  <!--#include file="../components/nav.component.html" -->
  <!--#include file="../components/card.component.html" -->
</div>
```

### Example 2: Framework-Style Organization

Use dedicated directories for different file types:

```bash
unify build \
  --includes-dir "includes" \
  --layouts-dir "layouts" \
  --component-pattern "component.*" \
  --layout-pattern "layout.*|default.*"
```

**Directory Structure:**
```
src/
├── pages/
│   ├── index.html
│   └── about.html
├── includes/
│   ├── header.html
│   └── footer.html
├── layouts/
│   ├── default.html
│   ├── layout.blog.html
│   └── layout.docs.html
└── components/
    ├── component.nav.html
    └── component.hero.html
```

### Example 3: Migration from Underscore Convention

Gradually migrate from underscore prefixes:

```bash
# Step 1: Use a mixed approach
unify build \
  --component-pattern "_*|*.component.*" \
  --layout-pattern "_*layout.*|*.layout.*"

# Step 2: Move to new pattern completely
unify build \
  --component-pattern "*.component.*" \
  --layout-pattern "*.layout.*" \
  --includes-dir "components"
```

### Example 4: Hugo-Style Structure

Mimic Hugo's content organization:

```bash
unify build \
  --includes-dir "partials" \
  --layouts-dir "layouts" \
  --layout-filename "baseof.html" \
  --layout-pattern "*.html"
```

**Directory Structure:**
```
src/
├── content/
│   ├── index.html
│   └── posts/
│       └── first-post.md
├── layouts/
│   ├── baseof.html
│   ├── single.html
│   └── list.html
└── partials/
    ├── header.html
    └── footer.html
```

## Pattern Examples

### Component Patterns

| Pattern | Matches | Use Case |
|---------|---------|----------|
| `_*` | `_header.html`, `_nav.html` | Default underscore convention |
| `*.component.*` | `nav.component.html`, `card.component.js` | Component suffix |
| `component.*` | `component.nav.html`, `component.hero.html` | Component prefix |
| `*.partial.*` | `nav.partial.html`, `hero.partial.html` | Partial suffix |

### Layout Patterns

| Pattern | Matches | Use Case |
|---------|---------|----------|
| `*layout.html\|*layout.htm` | `_layout.html`, `blog.layout.htm` | Default pattern |
| `*.layout.*` | `main.layout.html`, `blog.layout.htm` | Layout suffix |
| `layout.*\|default.*` | `layout.main.html`, `default.html` | Layout prefix or default |
| `*.template.*` | `main.template.html`, `blog.template.htm` | Template suffix |

## Directory Configuration

### Includes Directory

The includes directory contains reusable components and potentially layouts:

```bash
# Use 'components' instead of '_includes'
unify build --includes-dir "components"

# Use 'partials' for Hugo-like structure
unify build --includes-dir "partials"
```

### Layouts Directory

By default, layouts are discovered automatically and can also be found in the includes directory. You can specify a dedicated layouts directory:

```bash
# Dedicated layouts directory
unify build --layouts-dir "layouts"

# Combined with custom includes
unify build --includes-dir "partials" --layouts-dir "layouts"
```

### Layout Filename

Change the default layout filename used for fallback:

```bash
# Use 'base.html' instead of 'layout.html'
unify build --layout-filename "base.html"

# Hugo-style baseof template
unify build --layout-filename "baseof.html"
```

## Best Practices

### 1. Consistency

Choose a pattern and stick with it throughout your project:

```bash
# Good: Consistent component pattern
unify build --component-pattern "*.component.*"

# Avoid: Mixing multiple patterns unless migrating
unify build --component-pattern "_*|*.component.*|partial.*"
```

### 2. Descriptive Naming

Use patterns that make the file purpose clear:

```bash
# Clear component identification
unify build --component-pattern "*.component.*"

# Clear layout identification  
unify build --layout-pattern "*.layout.*"
```

### 3. Team Conventions

Choose patterns that match your team's existing conventions:

```bash
# React-style components
unify build --component-pattern "*.component.*"

# Vue-style components
unify build --component-pattern "*.vue.*" --layout-pattern "*.layout.*"

# Angular-style components
unify build --component-pattern "*.component.*" --layout-pattern "*.template.*"
```

### 4. Tool Integration

Consider integration with other tools in your workflow:

```bash
# For projects using Prettier/ESLint with specific patterns
unify build --component-pattern "*.component.html"

# For projects with TypeScript definitions
unify build --component-pattern "*.component.*" --layout-pattern "*.layout.*"
```

## Common Patterns by Framework

### React Projects
```bash
unify build \
  --component-pattern "*.component.*" \
  --layout-pattern "*.layout.*" \
  --includes-dir "components"
```

### Vue Projects  
```bash
unify build \
  --component-pattern "*.vue.*" \
  --layout-pattern "*.layout.*" \
  --includes-dir "components"
```

### Angular Projects
```bash
unify build \
  --component-pattern "*.component.*" \
  --layout-pattern "*.template.*" \
  --includes-dir "shared"
```

### Hugo Migration
```bash
unify build \
  --includes-dir "partials" \
  --layouts-dir "layouts" \
  --layout-filename "baseof.html" \
  --layout-pattern "*.html"
```

## Error Handling

### Validation Errors

The system validates your configuration and provides helpful error messages:

```bash
# Error: Conflicting directories
unify build --includes-dir "shared" --layouts-dir "shared"
# Error: Includes directory and layouts directory cannot be the same

# Error: Empty patterns
unify build --component-pattern ""
# Error: Component pattern cannot be empty
```

### Debugging

Use `--verbose` to see how patterns are being applied:

```bash
unify build --component-pattern "*.component.*" --verbose
# [DEBUG] Classifying partial file: nav.component.html
# [DEBUG] Classifying layout file: main.layout.html
```

## Migration Guide

### From Underscore Convention

1. **Start with mixed patterns** to support both old and new files:
   ```bash
   unify build --component-pattern "_*|*.component.*"
   ```

2. **Gradually rename files** to use the new pattern:
   ```bash
   mv _header.html header.component.html
   mv _layout.html main.layout.html
   ```

3. **Switch to new pattern only** once migration is complete:
   ```bash
   unify build --component-pattern "*.component.*"
   ```

### Testing Your Patterns

Create a test build to verify your patterns work correctly:

```bash
# Test build with custom patterns
unify build \
  --source src \
  --output test-dist \
  --component-pattern "*.component.*" \
  --layout-pattern "*.layout.*" \
  --verbose

# Check that components and layouts are not in output
ls test-dist/  # Should not contain .component. or .layout. files
```

## Conclusion

Custom file patterns in Unify provide the flexibility to use naming conventions that fit your project and team preferences while maintaining the powerful build features. Start with simple patterns and gradually adopt more sophisticated configurations as your project grows.