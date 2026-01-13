# Contract Documentation Test Fixture

## Overview
Demonstrates the contract documentation system where `data-unify-docs` style blocks document public areas but are completely removed during build.

## Key Features Tested

### Contract Documentation Blocks
Style blocks with `data-unify-docs` attribute:
- Document public area classes (`.unify-hero`, `.unify-content`)
- Document optional modifiers (`.is-dark-theme`, `.is-centered`)
- Can include version info (`data-unify-docs="v1"`)
- Provide usage guidance and comments

### Build-Time Removal
All `data-unify-docs` blocks removed:
- Layout contract block → removed
- Component contract block → removed  
- Page contract block → removed
- Regular `<style>` blocks → preserved

### Multi-Level Contracts
- **Layout contract**: Documents layout areas
- **Component contract**: Documents component areas
- **Page contract**: Can document page-specific areas

### Public API Documentation
Contracts serve as:
- Developer documentation
- Public API definition
- Usage examples
- Version compatibility info

## Expected Behavior

### During Development
- Contract blocks visible for reference
- Developers can see available areas
- IDE/tooling can parse for autocomplete

### After Build
1. All `data-unify-docs` style blocks removed
2. Regular styles preserved in order
3. No contract documentation in production
4. Clean, optimized output

## Benefits
- **Discoverable**: Public areas documented inline
- **Versioned**: Can track API changes
- **Clean output**: No documentation in production
- **Self-documenting**: Components carry their own docs

## DOM Cascade Spec Reference
- Section: "Docs: Exposing Public Areas as CSS"
- Contract block format and guidelines
- Build removal requirement
- Prefix conventions (`.unify-*` for areas)