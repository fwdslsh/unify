# Default Layout Site Test Fixture

## Overview
Demonstrates layout discovery patterns and fallback mechanisms when pages don't explicitly specify layouts, showing how Unify intelligently resolves layout files.

## Key Features Tested

### Layout Discovery Patterns
Multiple ways layouts are discovered and applied:
1. **Explicit declaration**: `data-unify="_includes/post.html"` on index.html
2. **Directory default**: `_layout.html` in source directory
3. **Filename matching**: Pages match layouts by name pattern
4. **Path-based matching**: Blog posts match `post.html` layout

### Directory Structure
```
src/
├── _layout.html          # Directory default layout
├── _includes/
│   ├── base.html        # Base layout template
│   ├── featured.html    # Featured content layout
│   └── post.html        # Blog post layout
├── index.html           # Uses explicit layout
├── about.html           # Uses discovery/fallback
├── blog/
│   ├── post.html       # Matches post.html layout
│   └── featured/
│       └── special.html # Nested path matching
└── docs/
    └── guide.html      # Documentation layout matching
```

### Layout Resolution Order
1. **Explicit `data-unify` attribute** (highest priority)
2. **Markdown frontmatter `layout` field**
3. **Filename-based matching** (`post.html` → `_includes/post.html`)
4. **Directory `_layout.html`** (directory default)
5. **Parent directory layouts** (traversal up)

### Area Classes Used
- `.unify-header` - Page header content
- `.unify-content` - Main content area
- `.unify-footer` - Footer content
- `.unify-sidebar` - Sidebar for blog posts

## Test Scenarios

### Scenario 1: Explicit Layout
- **File**: `index.html`
- **Layout**: Explicitly uses `_includes/post.html`
- **Behavior**: Direct layout specification overrides discovery

### Scenario 2: Directory Default
- **File**: `about.html` 
- **Layout**: Falls back to `_layout.html` in same directory
- **Behavior**: No explicit layout, uses directory default

### Scenario 3: Path Pattern Matching
- **File**: `blog/post.html`
- **Layout**: Matches `_includes/post.html` by path pattern
- **Behavior**: Blog posts automatically get post layout

### Scenario 4: Nested Directory
- **File**: `blog/featured/special.html`
- **Layout**: Matches `_includes/featured.html`
- **Behavior**: Nested paths can match specific layouts

## Expected Behavior
1. Pages without explicit layouts discover appropriate defaults
2. Directory `_layout.html` serves as fallback
3. Path patterns enable convention-based layout assignment
4. Explicit `data-unify` always takes precedence
5. Layout discovery works recursively up directory tree

## DOM Cascade Spec Reference
- Layout discovery via `data-unify` attribute
- Directory-based layout conventions
- Fallback mechanisms for zero-config usage
- Path-based pattern matching

## Real-World Use Case
This pattern enables:
- Convention over configuration
- Minimal boilerplate for new pages
- Automatic layout assignment for content types
- Override capability when needed
- Clean project organization