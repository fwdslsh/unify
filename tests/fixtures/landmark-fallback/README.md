# Landmark Fallback Test Fixture

## Overview
Demonstrates automatic matching by HTML5 semantic landmarks when no `.unify-*` area classes are used, enabling zero-configuration layouts.

## Key Features Tested

### Landmark Matching
When page has no area classes, matches by unique landmarks:
- `<header>` → `<header>`
- `<nav>` → `<nav>` 
- `<main>` → `<main>`
- `<aside>` → `<aside>`
- `<footer>` → `<footer>`

### Attribute Preservation
Layout landmarks keep their:
- IDs (`id="site-header"`)
- Classes (`class="main-header"`, `class="primary-nav"`)
- Data attributes (`data-theme="dark"`, `data-widget="related"`)
- ARIA roles (`role="main"`)

### Content Replacement
- Children completely replaced with page content
- Layout structure preserved
- Page can add more complex content (nested elements)

### Zero Configuration
- No `.unify-*` classes needed
- Works with semantic HTML only
- Great for simple pages and quick prototypes

## Expected Behavior
1. Each landmark in page matches corresponding landmark in layout
2. Layout landmark elements retained with all attributes
3. Children replaced with page content
4. No ambiguity since landmarks are unique per sectioning root

## DOM Cascade Spec Reference
- Section: "Landmark fallback"
- Precedence: Area class match → **Landmark fallback** → Ordered fill
- Requires unique landmarks within sectioning root