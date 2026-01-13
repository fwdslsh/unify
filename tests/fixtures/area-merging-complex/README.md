# Area Merging Complex Test Fixture

## Overview
Demonstrates advanced area matching and merging behavior when multiple page elements target the same area class.

## Key Features Tested

### Multiple Elements → Single Area
- Multiple page elements with class `.unify-hero` target one layout area
- Children from all matching elements concatenate in document order
- Attributes merge using last matching element (except IDs)

### Attribute Merging Rules
- **Page wins**: `data-theme="dark"` → `data-theme="light"` 
- **ID stability**: Layout's `id="hero-section"` retained (not page's `id="page-hero"`)
- **New attributes added**: `data-custom="page-value"` from page
- **Last match wins**: `data-priority="2"` from third element overrides

### Expected Behavior
1. All three page elements with `.unify-hero` match the single layout area
2. Their children are concatenated into the host element in order
3. Host element keeps its tag (`<section>`) and position
4. Attributes merge with page values winning (except ID)

## DOM Cascade Spec Reference
- Section: "Multiple page sources for one area" 
- Section: "Replacement semantics (v1)"
- Attribute merge rules with ID stability exception