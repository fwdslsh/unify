# Alpine.js Integration Test Fixture

## Overview
Demonstrates DOM Cascade working seamlessly with Alpine.js for interactive components, showing how third-party JavaScript libraries integrate with the composition system.

## Key Features Tested

### Multi-Layer Layout Chain
Root → Site → Page (three levels of composition):
1. **Root layout**: Global structure, Bootstrap Icons, Alpine.js
2. **Site layout**: Inherits from root, defines content areas
3. **Page**: Final layer with product-specific content

### Alpine.js Integration
- Interactive navigation toggle with `x-data` and `@click`
- ARIA attributes managed by Alpine (`:aria-expanded`)
- State management (`navOpen` variable)
- Responsive mobile menu functionality

### CSS Cascade Order
Demonstrates proper CSS layer ordering:
1. External libraries (normalize.css, Bootstrap Icons)
2. Root layout styles
3. Site layout styles  
4. Component styles
5. Page styles (highest specificity)

### Component Composition
- Multiple card components imported with different content
- Each card maintains its own scope
- Icon integration via Bootstrap Icons
- Button styling cascade from component → page

### Contract Documentation
All three levels document their public areas:
- **Root**: `.unify-header`, `.unify-main-nav`, `.unify-footer`
- **Site**: `.unify-hero`, `.unify-features`, `.unify-cta`
- **Card**: `.unify-title`, `.unify-body`, `.unify-actions`

## Technical Highlights

### JavaScript Framework Compatibility
- Alpine.js directives preserved through composition
- Event handlers (`@click`) maintained
- Dynamic attributes (`:aria-expanded`) work correctly
- No interference with reactive data binding

### Responsive Design
- Mobile navigation toggle
- CSS media queries preserved
- Progressive enhancement approach

### Icon Library Integration  
- Bootstrap Icons via CDN
- Icons used in navigation, buttons, and CTAs
- Font icons work through all composition layers

## Expected Behavior
1. Three-level layout chain resolves correctly
2. Alpine.js functionality remains intact
3. CSS cascades in proper order (layout → component → page)
4. All interactive elements work (nav toggle, buttons)
5. Contract documentation blocks removed in output

## DOM Cascade Spec Compliance
- Nested layouts with `data-unify` chains
- Component imports within replaced areas
- CSS cascade principle honored
- External script preservation
- Public area documentation via contracts

## Real-World Use Case
This fixture represents a production-ready example showing:
- Modern JavaScript framework integration
- Professional styling with utility libraries
- Interactive UI components
- Responsive design patterns
- Multi-level layout inheritance