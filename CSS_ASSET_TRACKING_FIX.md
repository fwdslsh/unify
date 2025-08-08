# CSS Asset Tracking Fix

## Issue
CSS files with `@import` statements were not having their asset references processed recursively. This meant that assets (fonts, images, etc.) referenced in imported CSS files were not being discovered and copied during the build process.

## Root Cause
The `recordAssetReferences` method in `asset-tracker.js` only processed CSS files that were directly referenced in HTML. When a CSS file contained `@import url('/css/other.css')`, the `other.css` file was added to the asset list but was not recursively processed to extract its own asset references.

## Solution
Modified the `recordAssetReferences` method to implement recursive CSS processing:

1. **Recursive Processing**: When a CSS file is found to contain asset references, if those references are to other CSS files (via `@import`), those CSS files are also processed recursively.

2. **Circular Import Protection**: Added a `processedCssFiles` Set to prevent infinite loops in case of circular CSS imports.

3. **Maintained Error Handling**: Preserved existing error handling for cases where CSS files cannot be read.

## Code Changes

### Before
```javascript
// Process CSS files referenced in HTML
for (const assetPath of assets) {
  if (assetPath.endsWith('.css')) {
    const cssContent = await fs.readFile(assetPath, 'utf-8');
    const cssReferences = this.extractCssAssetReferences(cssContent, assetPath, sourceRoot);
    for (const cssRef of cssReferences) {
      cssAssets.add(cssRef);
    }
  }
}
```

### After  
```javascript
// Process CSS files recursively to handle @import chains
const processCssFile = async (cssPath) => {
  if (processedCssFiles.has(cssPath)) {
    return; // Already processed
  }
  processedCssFiles.add(cssPath);
  
  const cssContent = await fs.readFile(cssPath, 'utf-8');
  const cssReferences = this.extractCssAssetReferences(cssContent, cssPath, sourceRoot);
  
  for (const cssRef of cssReferences) {
    cssAssets.add(cssRef);
    
    // If this reference is another CSS file, process it recursively
    if (cssRef.endsWith('.css')) {
      await processCssFile(cssRef);
    }
  }
};

// Process all CSS files found in HTML
for (const assetPath of assets) {
  if (assetPath.endsWith('.css')) {
    await processCssFile(assetPath);
  }
}
```

## Test Coverage
Added comprehensive test case `should handle deep CSS @import chains and extract assets from all levels` that verifies:

- Multi-level CSS import chains (main.css → typography.css → components.css)
- Font file extraction from `@font-face` declarations in imported CSS
- Image file extraction from various CSS properties in imported CSS  
- Proper handling of both relative and absolute paths in CSS imports

## Impact
This fix ensures that all CSS-referenced assets are properly discovered and copied during the build process, regardless of how deeply nested the CSS import chain is. This resolves issues where fonts, background images, and other assets referenced in imported CSS files were not being included in the build output.