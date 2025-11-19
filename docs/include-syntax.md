# Include System Documentation (v2)

unify v2 uses **HTML include elements** for composing pages from reusable components. This provides a clean, modern syntax that's easy to understand and use.

## Include Syntax

### Basic Include Element

The `<include>` element loads and injects content from another file:

```html
<!-- Self-closing format -->
<include src="/components/header.html" />

<!-- With closing tag (same behavior) -->
<include src="/components/header.html"></include>
```

Both formats work identically - use whichever you prefer for consistency in your project.

## Path Resolution Rules

unify v2 uses a simple, unified path resolution system:

### Absolute Paths (Starting with `/`)

Absolute paths resolve from the **source root directory**:

```html
<!-- Resolves to: src/components/header.html -->
<include src="/components/header.html" />

<!-- Resolves to: src/blog/sidebar.html -->
<include src="/blog/sidebar.html" />

<!-- Resolves to: src/_includes/navigation.html -->
<include src="/_includes/navigation.html" />
```

**When to use:**
- Cross-directory includes
- Shared components used across the site
- Components in a central directory

### Relative Paths

Relative paths resolve from the **current file's directory**:

```html
<!-- From src/pages/about.html, includes src/pages/sidebar.html -->
<include src="./sidebar.html" />

<!-- From src/blog/post.html, includes src/components/header.html -->
<include src="../components/header.html" />

<!-- Navigate up two directories -->
<include src="../../shared/footer.html" />
```

**When to use:**
- Co-located components (components near the pages that use them)
- Section-specific includes (blog sidebar for blog pages)
- Quick relative references

## Include Features

### Recursive Processing

Includes can contain other includes, allowing complex composition:

**File: `src/components/page-layout.html`**

```html
<!DOCTYPE html>
<html>
  <head>
    <include src="/components/head-meta.html" />
  </head>
  <body>
    <include src="/components/header.html" />
    <main>
      <!-- Content will be inserted here -->
    </main>
    <include src="/components/footer.html" />
  </body>
</html>
```

**File: `src/components/header.html`**

```html
<header>
  <include src="/components/nav.html" />
  <h1>My Site</h1>
</header>
```

Unify automatically processes nested includes up to 10 levels deep.

### Circular Dependency Detection

unify detects and prevents circular include dependencies:

```html
<!-- ❌ This will cause an error -->
<!-- File A includes File B -->
<!-- File B includes File A -->
```

Error message will show the circular chain and prevent infinite loops.

### Include Depth Limiting

Includes are processed up to 10 levels deep:

```
page.html
  → includes level1.html
    → includes level2.html
      → includes level3.html
        ... up to level 10
```

This prevents accidentally creating overly complex dependency chains.

## Security

### Path Traversal Protection

unify automatically validates that all includes stay within your source directory:

```html
<!-- ✅ OK: Within source directory -->
<include src="/components/header.html" />

<!-- ❌ ERROR: Attempts to access files outside source -->
<include src="../../etc/passwd" />
```

Any attempt to access files outside the source directory will result in a `PathTraversalError`.

## Best Practices

### 1. Use Absolute Paths for Shared Components

```html
<!-- Good: Clear, predictable -->
<include src="/components/header.html" />
<include src="/components/footer.html" />

<!-- Avoid: Depends on current file location -->
<include src="../../components/header.html" />
```

### 2. Organize Components in Standard Directories

```
src/
  components/     # Shared components
  _includes/      # Alternative component directory
  layouts/        # Layout files
  pages/          # Page files
```

### 3. Use Descriptive Filenames

```html
<!-- Good: Clear purpose -->
<include src="/components/site-header.html" />
<include src="/components/blog-sidebar.html" />

<!-- Avoid: Unclear -->
<include src="/components/comp1.html" />
```

### 4. Keep Include Depth Reasonable

```html
<!-- Good: 2-3 levels -->
page.html
  → layout.html
    → header.html

<!-- Avoid: Too many levels -->
page.html
  → level1.html
    → level2.html
      → level3.html
        → level4.html (hard to debug)
```

## Common Patterns

### Page with Layout and Components

```html
<!-- src/pages/about.html -->
<!DOCTYPE html>
<html>
  <head>
    <title>About Us</title>
    <include src="/components/meta-tags.html" />
  </head>
  <body>
    <include src="/components/header.html" />

    <main>
      <h1>About Our Company</h1>
      <p>Company information...</p>
      <include src="/components/contact-form.html" />
    </main>

    <include src="/components/footer.html" />
  </body>
</html>
```

### Layout with Slot for Content

```html
<!-- src/layouts/main.html -->
<!DOCTYPE html>
<html>
  <head>
    <include src="/components/meta-tags.html" />
  </head>
  <body>
    <include src="/components/header.html" />
    <main>
      <slot></slot> <!-- Page content goes here -->
    </main>
    <include src="/components/footer.html" />
  </body>
</html>
```

### Component with Sub-components

```html
<!-- src/components/header.html -->
<header>
  <div class="logo">
    <include src="/components/logo.html" />
  </div>
  <nav>
    <include src="/components/main-nav.html" />
  </nav>
  <div class="user-menu">
    <include src="/components/user-menu.html" />
  </div>
</header>
```

## Error Handling

### Include Not Found

When an include file doesn't exist:

```html
<include src="/components/missing.html" />
```

**Default behavior:** Warning logged, comment inserted in output:
```html
<!-- Include not found: /components/missing.html -->
```

**With `--fail-on warning`:** Build fails with detailed error message.

### Path Traversal Attempt

```html
<include src="../../etc/passwd" />
```

**Always fails** with `PathTraversalError` - security violations are never ignored.

### Circular Dependency

```html
<!-- a.html includes b.html -->
<!-- b.html includes a.html -->
```

**Always fails** with `CircularDependencyError` showing the dependency chain.

## Migration from v1

v1 supported both SSI comments (`<!--#include-->`) and `<include>` elements. v2 only supports `<include>` elements.

### Before (v1 - SSI syntax)

```html
<!--#include virtual="/components/header.html" -->
<!--#include file="../footer.html" -->
```

### After (v2 - include element)

```html
<include src="/components/header.html" />
<include src="../footer.html" />
```

**Migration steps:**
1. Replace `<!--#include virtual="path"` with `<include src="/path"`
2. Replace `<!--#include file="path"` with `<include src="path"`
3. Change `-->` to `/>` or `></include>`

See [MIGRATION_TO_V2.md](./MIGRATION_TO_V2.md) for detailed migration guide.

## See Also

- [App Specification](./app-spec.md) - Complete v2 specification
- [Layouts & Slots](./layouts-slots-templates.md) - Layout system documentation
- [Getting Started](./getting-started.md) - Tutorial and examples
