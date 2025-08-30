# Head Merging Advanced Test Fixture

## Overview
Demonstrates complex `<head>` element merging with proper CSS cascade order, deduplication rules, and component head contributions.

## Key Features Tested

### CSS Order (Critical!)
Layout → Components → Page (mimics CSS cascade, page wins)
1. `/layout.css` (from layout)
2. `/analytics.css` (from component) 
3. `/page.css` (from page)
4. `/shared.css` (deduped, appears once)

### Meta Tag Deduplication
- **By name**: `description` - page overrides layout
- **By property**: `og:title` - page overrides layout
- **By property conflict**: `og:type` - component's "article" overrides layout's "website"
- **Unique additions**: `author`, `og:description`, `analytics-version` all preserved

### Link Deduplication
- `canonical` - page URL overrides layout URL
- `icon` - page favicon overrides layout favicon

### Script Handling
- **External dedup by src**: `/layout.js`, `/analytics.js` appear once
- **Inline dedup by content**: Duplicate "Analytics component loaded" script appears once
- **Unique inline scripts**: All preserved in order

### Component Head Contributions
Analytics component adds:
- Meta tags that merge/override
- CSS that follows cascade order
- Scripts that deduplicate properly

## Expected Behavior
1. Title: Page wins ("Page Title Wins")
2. CSS loads in layer order for proper cascade
3. External scripts deduplicated by src
4. Inline scripts deduplicated by content hash
5. Meta/link tags deduplicated by key attributes

## DOM Cascade Spec Reference
- Section: "Head & Assets"
- CSS order principle
- Deduplication rules for meta, link, and script elements