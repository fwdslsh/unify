---
title: Project Structure - unify Documentation
description: Learn how to organize your unify projects with recommended directory layouts, naming conventions, and file organization patterns.
---

# Project Structure

Unify is flexible about project organization, but following established conventions will make your projects more maintainable and easier to understand. This guide covers recommended directory structures and naming patterns.

> **🗂️ Organization Principles**
>
> Clear separation of concerns, predictable file locations, and scalable architecture for projects of all sizes.

## Basic Project Structure

The minimal unify project needs only source content:

```
my-site/
├── src/                    # Source directory (default)
│   ├── index.html          # Homepage
│   ├── about.html          # About page
│   └── assets/             # Static assets (auto-copied)
│       ├── css/
│       ├── js/
│       └── images/
└── dist/                   # Generated output (default)
```

## Recommended Structure

For most projects, this structure provides good organization:

```
my-site/
├── src/                    # Source content
│   ├── _includes/          # Layouts and components
│   │   ├── _layout.html    # Default layout
│   │   ├── _header.html    # Site header component
│   │   └── _footer.html    # Site footer component
│   │
│   ├── assets/             # Static assets (auto-copied)
│   │   ├── css/
│   │   │   ├── main.css
│   │   │   └── components.css
│   │   ├── js/
│   │   │   ├── main.js
│   │   │   └── components.js
│   │   ├── images/
│   │   │   ├── hero.jpg
│   │   │   └── icons/
│   │   └── fonts/
│   │
│   ├── index.html          # Homepage
│   ├── about.html          # About page
│   ├── contact.html        # Contact page
│   └── sitemap.xml         # SEO sitemap
│
├── dist/                   # Build output
├── unify.config.yaml       # Configuration (optional)
└── package.json            # Node dependencies (optional)
```

## Advanced Project Structure

For larger sites with multiple content types:

```
my-site/
├── src/
│   ├── _includes/              # Shared components
│   │   ├── _layout.html        # Base layout
│   │   ├── _nav.html          # Navigation
│   │   ├── _header.html       # Site header
│   │   ├── _footer.html       # Site footer
│   │   └── components/        # Reusable components
│   │       ├── _card.html     # Content card
│   │       ├── _button.html   # Button component
│   │       └── _modal.html    # Modal dialog
│   │
│   ├── _layouts/              # Page layouts
│   │   ├── _blog.html         # Blog post layout
│   │   ├── _docs.html         # Documentation layout
│   │   └── _landing.html      # Landing page layout
│   │
│   ├── assets/                # Static assets
│   │   ├── css/
│   │   │   ├── main.css       # Main styles
│   │   │   ├── components.css # Component styles
│   │   │   └── themes/        # Theme variations
│   │   │       ├── light.css
│   │   │       └── dark.css
│   │   ├── js/
│   │   │   ├── main.js        # Main JavaScript
│   │   │   ├── components/    # Component scripts
│   │   │   └── vendor/        # Third-party scripts
│   │   ├── images/
│   │   │   ├── hero/          # Hero images
│   │   │   ├── gallery/       # Gallery images
│   │   │   └── icons/         # Icon files
│   │   └── fonts/             # Web fonts
│   │
│   ├── blog/                  # Blog section
│   │   ├── _post.html         # Blog post layout (local)
│   │   ├── index.html         # Blog index
│   │   ├── 2024-01-15-first-post.md
│   │   └── 2024-01-20-second-post.md
│   │
│   ├── docs/                  # Documentation section
│   │   ├── _docs.html         # Docs layout (local)
│   │   ├── index.html         # Docs index
│   │   ├── getting-started.md
│   │   ├── api-reference.md
│   │   └── examples/
│   │       ├── basic.html
│   │       └── advanced.html
│   │
│   ├── products/              # Product pages
│   │   ├── _product.html      # Product layout
│   │   ├── index.html         # Product catalog
│   │   ├── laptop.html
│   │   └── desktop.html
│   │
│   ├── public/                # Additional public files
│   │   ├── robots.txt
│   │   ├── sitemap.xml
│   │   └── .well-known/
│   │       └── security.txt
│   │
│   ├── index.html             # Homepage
│   ├── about.html             # About page
│   └── contact.html           # Contact page
│
├── dist/                      # Build output
├── .unify-cache/              # Build cache
├── unify.config.yaml          # Configuration
├── package.json               # Dependencies
└── .gitignore                 # Git ignore rules
```

## Directory Conventions

### Layouts and Components

**`_includes/`** - Shared layouts and components:
- **`_layout.html`** - Default site layout
- **`_header.html`, `_footer.html`** - Site-wide components
- **`components/`** - Reusable UI components

**`_layouts/`** - Specialized page layouts:
- **`_blog.html`** - Blog post layout
- **`_docs.html`** - Documentation layout
- **`_landing.html`** - Landing page layout

### Content Organization

**By content type:**
```
src/
├── blog/          # Blog posts
├── docs/          # Documentation
├── products/      # Product pages
└── case-studies/  # Case studies
```

**By date (for chronological content):**
```
src/blog/
├── 2024/
│   ├── 01/
│   │   ├── 15-first-post.md
│   │   └── 20-second-post.md
│   └── 02/
└── 2023/
```

### Asset Organization

**By type:**
```
assets/
├── css/           # Stylesheets
├── js/            # JavaScript files
├── images/        # Image files
├── fonts/         # Web fonts
└── icons/         # Icon files
```

**By feature:**
```
assets/
├── global/        # Site-wide assets
│   ├── css/
│   ├── js/
│   └── images/
├── blog/          # Blog-specific assets
├── docs/          # Docs-specific assets
└── components/    # Component assets
```

## Naming Conventions

### Files and Directories

**Use descriptive, lowercase names:**
- ✅ `getting-started.html`
- ✅ `api-reference.md`
- ❌ `page1.html`
- ❌ `APIRef.html`

**Use consistent separators:**
- **Directories:** `kebab-case` (`blog-posts/`, `case-studies/`)
- **Files:** `kebab-case` (`contact-form.html`, `user-guide.md`)
- **Components:** `_component-name.html` (`_card.html`, `_nav-menu.html`)

### Layout and Component Names

**Layouts (prefix with `_`):**
- `_layout.html` - Default layout
- `_blog.html` - Blog layout
- `_docs.html` - Documentation layout

**Components (prefix with `_`):**
- `_header.html` - Site header
- `_nav.html` - Navigation menu
- `_card.html` - Content card
- `_button.html` - Button component

**Public areas (prefix with `unify-`):**
- `.unify-content` - Main content area
- `.unify-sidebar` - Sidebar content
- `.unify-hero` - Hero section
- `.unify-actions` - Action buttons

## Configuration Files

### `unify.config.yaml`

Project configuration file:

```yaml
# Build settings
source: src
output: dist
clean: true

# Processing options
minify: false
pretty-urls: false

# Default layouts
default-layout:
  - "blog/**=_blog.html"
  - "docs/**=_docs.html"

# Copy patterns
copy:
  - "public/**"
  - "downloads/**/*.pdf"

# Ignore patterns  
ignore:
  - "**/.DS_Store"
  - "**/Thumbs.db"
  - "**/*.tmp"
```

### `package.json`

Dependency management and scripts:

```json
{
  "name": "my-unify-site",
  "version": "1.0.0",
  "scripts": {
    "build": "unify build",
    "dev": "unify serve",
    "build:prod": "unify build --clean --minify --pretty-urls"
  },
  "devDependencies": {
    "@fwdslsh/unify": "^0.6.0"
  }
}
```

### `.gitignore`

Version control ignore patterns:

```gitignore
# Build output
dist/
.unify-cache/

# Dependencies
node_modules/
.npm/

# Editor files
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Environment
.env
.env.local
```

## Layout Discovery Patterns

Unify searches for layouts in this order:

1. **Page-specified layout:**
   ```html
   <body data-unify="/layouts/custom.html">
   ```

2. **Directory-local layout:**
   ```
   blog/
   ├── _blog.html      # Local layout
   └── post.md         # Uses _blog.html
   ```

3. **Parent directory layouts:**
   ```
   src/
   ├── _layout.html    # Found by traversing up
   └── blog/
       └── post.md     # Uses src/_layout.html
   ```

4. **Global fallback layout:**
   ```
   src/_includes/_layout.html
   ```

## Scaling Patterns

### Small Projects (1-10 pages)

```
src/
├── _includes/
│   └── _layout.html
├── assets/
├── index.html
├── about.html
└── contact.html
```

### Medium Projects (10-100 pages)

```
src/
├── _includes/
├── _layouts/
├── assets/
├── blog/
├── docs/
└── [pages]
```

### Large Projects (100+ pages)

```
src/
├── _includes/
│   └── components/
├── _layouts/
├── assets/
│   ├── global/
│   └── [sections]/
├── [content-sections]/
└── public/
```

## Best Practices

### Organization Guidelines

1. **Group related content** in directories
2. **Use consistent naming** across the project
3. **Separate global and local** assets and components
4. **Keep layout hierarchy** simple and predictable
5. **Document custom conventions** in README

### Performance Considerations

1. **Minimize asset directory depth** for faster copying
2. **Group frequently changing content** together
3. **Use efficient ignore patterns** to exclude unnecessary files
4. **Organize images by usage** (thumbnails, full-size, etc.)

### Maintainability

1. **Use descriptive file names** that indicate purpose
2. **Keep related files together** in the same directory
3. **Separate concerns** (content, presentation, behavior)
4. **Document component contracts** with `data-unify-docs`

## Common Anti-patterns

### What to Avoid

**Deep directory nesting:**
```
❌ src/content/blog/posts/2024/january/week1/post.md
✅ src/blog/2024-01-15-post.md
```

**Inconsistent naming:**
```
❌ Mixed styles: blogPost.html, news-item.html, Product_Page.html
✅ Consistent: blog-post.html, news-item.html, product-page.html
```

**Monolithic assets:**
```
❌ Single huge CSS file with all styles
✅ Organized CSS by component and section
```

**Poor layout hierarchy:**
```
❌ Every page specifies its own layout
✅ Logical layout inheritance and defaults
```

## Migration from Other Generators

### Jekyll Structure

```
# Jekyll
_layouts/
_includes/
_posts/
_sass/

# Unify equivalent
_layouts/        → _includes/ or _layouts/
_includes/       → _includes/components/
_posts/          → blog/
_sass/           → assets/css/
```

### Hugo Structure

```
# Hugo
layouts/
content/
static/
data/

# Unify equivalent
layouts/         → _includes/ or _layouts/
content/         → [organized by type]
static/          → assets/ or public/
data/            → [frontmatter or external]
```

This structure provides a solid foundation for unify projects while remaining flexible enough to adapt to specific needs and preferences.