# Component Scoping Test Fixture

## Overview
Demonstrates scope isolation where matching never crosses component boundaries, ensuring predictable composition behavior.

## Key Features Tested

### Scope Boundaries
- Layout body creates one scope
- Each imported component (`data-unify`) creates new scope
- Nested components each have their own isolated scopes

### Matching Rules
- Page can target layout areas (`.unify-hero`, `.unify-footer-content`)
- Page can target first-level component areas (`.unify-section-title`, `.unify-grid-footer`)
- Page CANNOT target nested component areas (cards inside grid)

### Component Hierarchy
```
Layout (scope 1)
├── .unify-hero → matched by page
├── card-grid component (scope 2)
│   ├── .unify-section-title → matched by page
│   ├── card component (scope 3) → uses defaults
│   ├── card component (scope 4) → uses defaults
│   └── .unify-grid-footer → matched by page
└── .unify-footer-content → matched by page
```

### Expected Behavior
1. Page elements with `.unify-card-title` and `.unify-card-content` do NOT affect individual cards
2. Cards retain their default content because they're in separate scopes
3. Only areas within the same scope can be targeted

## DOM Cascade Spec Reference
- Section: "Scoping"
- Principle: "Matching is strictly local to each scope"
- No cross-scope targeting allowed