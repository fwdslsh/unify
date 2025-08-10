# Include System Documentation

unify supports two include systems: **Apache SSI-style comments** and **include elements**. This document covers both syntaxes and when to use each.

## Include Syntax Types

### Element-Based Includes

Using HTML elements.

```html
<!-- include element -->
<include src="/_includes/header.html" />
```

**Limitations:**

- Not compatible with traditional Apache SSI implementations

### Comment-Based Includes (Legacy)

Using Apache SSI comments. 

```html
<!--#include virtual="/path/from/source/root.html" -->
<!--#include file="relative/path/from/current/file.html" -->
```

#### Virtual Includes

Virtual includes use paths relative to the **source root directory**:

```html
<!-- In any file, this resolves to src/_includes/header.html -->
<!--#include virtual="/_includes/header.html" -->

<!-- Nested directory structure -->
<!--#include virtual="/blog/_sidebar.html" -->

<!-- Cross-directory includes -->
<!--#include virtual="/shared/navigation.html" -->
```

**Path Resolution:**

- Always starts from source root (`src/` by default)
- Leading `/` is optional but recommended for clarity
- Case-sensitive on most systems

#### File Includes

File includes use paths relative to the **current file's directory**:

```html
<!-- From src/pages/about.html, includes src/pages/sidebar.html -->
<!--#include file="sidebar.html" -->

<!-- From src/blog/post.html, includes src/_includes/header.html -->
<!--#include file="../_includes/header.html" -->

<!-- Deeply nested relative path -->
<!--#include file="../../shared/footer.html" -->
```

**Path Resolution:**

- Relative to the directory containing the current file
- Use `../` to navigate up directories
- Use `./` for current directory (optional)

## Usage Recommendations

### Use DOM Elements When

- Building component-based architectures
- Want modern HTML element syntax

### Use SSI Comments When

- Building legacy static sites
- Need Apache SSI compatibility

## Include Features

### Recursive Processing

Includes can contain other includes, allowing complex composition:

**File: `src/_includes/page-layout.html`**

```html
<!DOCTYPE html>
<html>
  <head>
    <!--#include virtual="/_includes/head-meta.html" -->
  </head>
  <body>
    <!--#include virtual="/_includes/header.html" -->
    <main>
      <!-- Content will be inserted here -->
    </main>
    <!--#include virtual="/_includes/footer.html" -->
  </body>
</html>
```

**File: `src/_includes/header.html`**

```html
<header>
  <!--#include virtual="/_includes/navigation.html" -->
  <!--#include virtual="/_includes/user-menu.html" -->
</header>
```

### Circular Dependency Detection

unify automatically detects and prevents infinite include loops:

```html
<!-- This will cause a circular dependency error -->
<!-- file-a.html -->
<!--#include file="file-b.html" -->

<!-- file-b.html -->
<!--#include file="file-a.html" -->
```

**Error message:**

```
Error: Circular dependency detected
Include chain: file-a.html → file-b.html → file-a.html
```

### Depth Limiting

Includes are limited to 10 levels deep to prevent runaway recursion:

```html
<!-- This will work (within limit) -->
<!--#include virtual="/level1.html" -->
<!-- level1.html includes level2.html, etc. -->

<!-- Beyond 10 levels triggers depth limit error -->
```

## Security Features

### Path Traversal Prevention

unify prevents includes from accessing files outside the source directory:

```html
<!-- These will be blocked for security -->
<!--#include file="../../../etc/passwd" -->
<!--#include virtual="/../../../../sensitive-file.txt" -->
```

**Error message:**

```
Security Error: Include path outside source directory
Attempted path: /etc/passwd
Allowed directories: src/
```

### File Type Restrictions

Only certain file types can be included:

**Allowed extensions:**

- `.html`, `.htm` - HTML content
- `.md`, `.markdown` - Markdown content (processed)
- `.txt` - Plain text content
- `.svg` - SVG images (as HTML)

## Directory Structure Best Practices

### Recommended Organization

```
src/
├── _includes/            # Shared partials and layouts (non-emitting)
│   ├── header.html
│   ├── footer.html
│   ├── navigation.html
│   └── forms/
│       ├── contact.html
│       └── newsletter.html
├── blog/
│   ├── _blog.layout.html  # Blog layout
│   ├── _sidebar.html      # Blog sidebar partial
│   └── posts/
│       ├── first-post.md
│       └── second-post.md
├── pages/                 # Main content
│   ├── about.html
│   └── contact.html
└── index.html
```

### Component Naming Conventions

- **Prefix with purpose**: `nav-`, `form-`, `card-`
- **Use kebab-case**: `user-profile.html`, `blog-sidebar.html`
- **Descriptive names**: `primary-navigation.html` vs `nav.html`
- **Organize by feature**: Group related components in subdirectories

## Performance Considerations

### Build Performance

- **Include depth**: Deeper nesting increases build time
- **File size**: Large includes slow down processing
- **Dependency chains**: Complex dependency trees take longer to resolve

### Optimization Tips

1. **Keep includes focused**: Single responsibility per include
2. **Minimize nesting**: Flatten complex include hierarchies
3. **Use virtual paths**: More efficient than relative file paths
4. **Cache includes**: unify automatically caches parsed includes

## Error Handling

### Common Errors

**Include file not found:**

```
Include file not found: header.html
  in: src/index.html:5
Suggestions:
  • Create the include file: src/_includes/header.html
  • Check the include path and spelling
  • Use virtual path: <!--#include virtual="/_includes/header.html" -->
```

**Circular dependency:**

```
Circular dependency detected in includes
Include chain: page.html → layout.html → page.html
  in: src/page.html:3
Suggestions:
  • Remove the circular reference
  • Restructure your include hierarchy
  • Use layout system instead of mutual includes
```

**Path traversal blocked:**

```
Security: Include path outside source directory
Path: ../../config.html
  in: src/page.html:7
Suggestions:
  • Use paths within the source directory
  • Move the include file to src/ or subdirectory
  • Use virtual paths starting from source root
```

### Debug Mode

Enable detailed include processing information:

```bash
UNIFY_DEBUG=1 unify build
```

Shows:

- Include resolution steps
- File path calculations
- Dependency chain building
- Performance timing

## Integration with Other Features

### Markdown Processing

Includes work within markdown files:

```markdown
# My Blog Post

This is markdown content.

<!--#include virtual="/_includes/code-example.html" -->

More markdown content here.
```

### Asset Processing

Include files can reference assets that get tracked:

```html
<!-- header.html -->
<header>
  <img src="/assets/images/logo.png" alt="Logo" />
  <link rel="stylesheet" href="/assets/css/header.css" />
</header>
```

## Migration Guide

### From Other SSG Systems

**From Jekyll includes:**

```html
<!-- Jekyll -->
{% include header.html %}
<!-- unify -->
<include src="/_includes/header.html"/>
```

**From Hugo partials:**

```go
<!-- Hugo -->
{{ partial "header.html" . }}
<!-- unify -->
<include src="/_includes/header.html"/>
```

**From 11ty includes:**

```liquid
<!-- 11ty -->
{% include "header.njk" %}
<!-- unify -->
<include src="header.html"/>
```

### Legacy Apache SSI

unify is compatible with most Apache SSI include directives:

```apache
<!-- Apache SSI (supported) -->
<!--#include virtual="/includes/header.shtml" -->
<!--#include file="footer.shtml" -->

<!-- Apache SSI (not supported) -->
<!--#exec cmd="date" -->
<!--#echo var="LAST_MODIFIED" -->
```

## See Also

- [Layout System Documentation](layouts-slots-templates.md)
- [Template Elements in Markdown](template-elements-in-markdown.md)
- [Token Replacement Documentation](token-replacement.md)
- [Getting Started Guide](getting-started.md)
