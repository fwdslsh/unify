/**
 * Dependency Tracker Tests
 * Tests for tracking dependencies between pages, fragments, and assets
 * Coverage target: 85%+
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { DependencyTracker } from '../../../src/core/dependency-tracker.js';
import { AssetTracker } from '../../../src/core/asset-tracker.js';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

describe('DependencyTracker', () => {
  let tracker;
  let tempDir;
  let mockAssetTracker;
  
  beforeEach(() => {
    // Create temp directory for testing
    tempDir = `/tmp/dep-tracker-test-${Date.now()}`;
    mkdirSync(tempDir, { recursive: true });
    
    // Create test directory structure
    mkdirSync(join(tempDir, '_layouts'), { recursive: true });
    mkdirSync(join(tempDir, '_includes'), { recursive: true });
    mkdirSync(join(tempDir, '_components'), { recursive: true });
    mkdirSync(join(tempDir, 'pages'), { recursive: true });
    
    // Create test files
    writeFileSync(join(tempDir, '_layouts/default.html'), '<html><body>Layout</body></html>');
    writeFileSync(join(tempDir, '_includes/header.html'), '<header>Header</header>');
    writeFileSync(join(tempDir, '_components/nav.html'), '<nav>Navigation</nav>');
    writeFileSync(join(tempDir, 'pages/index.html'), '<html>Page</html>');
    
    // Initialize tracker
    tracker = new DependencyTracker();
    
    // Mock AssetTracker methods
    mockAssetTracker = {
      extractAssetReferences: mock((content, pagePath, sourceRoot) => {
        // Return mock asset references based on content
        const assets = [];
        if (content.includes('href="style.css"')) assets.push(join(sourceRoot, 'style.css'));
        if (content.includes('src="script.js"')) assets.push(join(sourceRoot, 'script.js'));
        if (content.includes('href="old.css"')) assets.push(join(sourceRoot, 'old.css'));
        if (content.includes('href="new.css"')) assets.push(join(sourceRoot, 'new.css'));
        if (content.includes('href="shared.css"')) assets.push(join(sourceRoot, 'shared.css'));
        if (content.includes('logo.png')) assets.push(join(sourceRoot, 'logo.png'));
        return assets;
      }),
      clear: mock(() => {}),
      getAllReferencedAssets: mock(() => ['style.css', 'script.js'])
    };
    
    // Replace the AssetTracker instance
    tracker.assetTracker = mockAssetTracker;
  });
  
  afterEach(() => {
    // Clean up temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
  
  describe('Constructor and Initialization', () => {
    test('should initialize with empty maps and asset tracker', () => {
      const newTracker = new DependencyTracker();
      
      expect(newTracker.pageDependencies).toBeInstanceOf(Map);
      expect(newTracker.dependentPages).toBeInstanceOf(Map);
      expect(newTracker.pageDependencies.size).toBe(0);
      expect(newTracker.dependentPages.size).toBe(0);
      expect(newTracker.assetTracker).toBeDefined();
    });
  });
  
  describe('trackPageDependencies', () => {
    test('should track asset dependencies', async () => {
      const pagePath = join(tempDir, 'pages/index.html');
      const content = '<html><link href="style.css"><script src="script.js"></script></html>';
      
      await tracker.trackPageDependencies(pagePath, content, tempDir);
      
      const deps = tracker.getPageDependencies(pagePath);
      expect(deps).toContain(join(tempDir, 'style.css'));
      expect(deps).toContain(join(tempDir, 'script.js'));
    });
    
    test('should track fragment dependencies with data-unify', async () => {
      const pagePath = join(tempDir, 'pages/index.html');
      const content = '<html data-unify="../_layouts/default.html"><body data-unify="../_includes/header.html"></body></html>';
      
      await tracker.trackPageDependencies(pagePath, content, tempDir);
      
      const deps = tracker.getPageDependencies(pagePath);
      // Path should be resolved relative from the page directory
      expect(deps).toContain(join(tempDir, '_layouts/default.html'));
      expect(deps).toContain(join(tempDir, '_includes/header.html'));
    });
    
    test('should track SSI include references', async () => {
      const pagePath = join(tempDir, 'pages/index.html');
      const content = '<!--#include file="../_includes/header.html" --><!--#include virtual="../_components/nav.html" -->';
      
      await tracker.trackPageDependencies(pagePath, content, tempDir);
      
      const deps = tracker.getPageDependencies(pagePath);
      expect(deps).toContain(join(tempDir, '_includes/header.html'));
      expect(deps).toContain(join(tempDir, '_components/nav.html'));
    });
    
    test('should handle mixed dependency types', async () => {
      const pagePath = join(tempDir, 'pages/index.html');
      const content = `
        <html data-unify="../_layouts/default.html">
          <link href="style.css">
          <!--#include file="../_includes/header.html" -->
          <script src="script.js"></script>
        </html>
      `;
      
      await tracker.trackPageDependencies(pagePath, content, tempDir);
      
      const deps = tracker.getPageDependencies(pagePath);
      expect(deps.length).toBe(4);
      expect(deps).toContain(join(tempDir, '_layouts/default.html'));
      expect(deps).toContain(join(tempDir, '_includes/header.html'));
      expect(deps).toContain(join(tempDir, 'style.css'));
      expect(deps).toContain(join(tempDir, 'script.js'));
    });
    
    test('should update existing dependencies when re-tracking', async () => {
      const pagePath = join(tempDir, 'pages/index.html');
      
      // Initial tracking
      await tracker.trackPageDependencies(pagePath, '<link href="old.css">', tempDir);
      expect(tracker.getPageDependencies(pagePath)).toContain(join(tempDir, 'old.css'));
      
      // Update with new dependencies
      await tracker.trackPageDependencies(pagePath, '<link href="new.css">', tempDir);
      const deps = tracker.getPageDependencies(pagePath);
      expect(deps).not.toContain(join(tempDir, 'old.css'));
      expect(deps).toContain(join(tempDir, 'new.css'));
    });
    
    test('should handle empty content', async () => {
      const pagePath = join(tempDir, 'pages/empty.html');
      
      await tracker.trackPageDependencies(pagePath, '', tempDir);
      
      const deps = tracker.getPageDependencies(pagePath);
      expect(deps).toEqual([]);
    });
    
    test('should handle malformed data-unify attributes', async () => {
      const pagePath = join(tempDir, 'pages/index.html');
      const content = '<html data-unify="" data-unify=\'\' data-unify=></html>';
      
      await tracker.trackPageDependencies(pagePath, content, tempDir);
      
      const deps = tracker.getPageDependencies(pagePath);
      expect(deps.length).toBe(0);
    });
  });
  
  describe('getPageDependencies', () => {
    test('should return empty array for untracked page', () => {
      const deps = tracker.getPageDependencies('/unknown/page.html');
      
      expect(deps).toEqual([]);
    });
    
    test('should return tracked dependencies', async () => {
      const pagePath = join(tempDir, 'pages/index.html');
      await tracker.trackPageDependencies(pagePath, '<link href="style.css">', tempDir);
      
      const deps = tracker.getPageDependencies(pagePath);
      
      expect(deps).toContain(join(tempDir, 'style.css'));
    });
  });
  
  describe('getDependentPages', () => {
    test('should return pages dependent on a file', async () => {
      const page1 = join(tempDir, 'page1.html');
      const page2 = join(tempDir, 'page2.html');
      const layout = join(tempDir, '_layouts/default.html');
      
      await tracker.trackPageDependencies(page1, 'data-unify="_layouts/default.html"', tempDir);
      await tracker.trackPageDependencies(page2, 'data-unify="_layouts/default.html"', tempDir);
      
      const dependents = tracker.getDependentPages(layout);
      
      expect(dependents).toContain(page1);
      expect(dependents).toContain(page2);
      expect(dependents.length).toBe(2);
    });
    
    test('should return empty array for file with no dependents', () => {
      const dependents = tracker.getDependentPages('/some/unused/file.css');
      
      expect(dependents).toEqual([]);
    });
    
    test('should update dependent pages when dependencies change', async () => {
      const page = join(tempDir, 'page.html');
      const oldDep = join(tempDir, 'old.css');
      const newDep = join(tempDir, 'new.css');
      
      // Track with old dependency
      await tracker.trackPageDependencies(page, '<link href="old.css">', tempDir);
      expect(tracker.getDependentPages(oldDep)).toContain(page);
      
      // Update to new dependency
      await tracker.trackPageDependencies(page, '<link href="new.css">', tempDir);
      expect(tracker.getDependentPages(oldDep)).not.toContain(page);
      expect(tracker.getDependentPages(newDep)).toContain(page);
    });
  });
  
  describe('getAllTransitiveDependents', () => {
    test('should find all transitive dependents', async () => {
      // Create dependency chain: layout <- page1 <- page2
      const layout = join(tempDir, '_layouts/default.html');
      const page1 = join(tempDir, 'page1.html');
      const page2 = join(tempDir, 'page2.html');
      const page3 = join(tempDir, 'page3.html');
      
      // page1 depends on layout
      await tracker.trackPageDependencies(page1, 'data-unify="_layouts/default.html"', tempDir);
      
      // page2 depends on page1 (as a fragment)
      await tracker.trackPageDependencies(page2, `data-unify="page1.html"`, tempDir);
      
      // page3 also depends on layout directly
      await tracker.trackPageDependencies(page3, 'data-unify="_layouts/default.html"', tempDir);
      
      const transitiveDeps = tracker.getAllTransitiveDependents(layout);
      
      expect(transitiveDeps).toContain(page1);
      expect(transitiveDeps).toContain(page2);
      expect(transitiveDeps).toContain(page3);
    });
    
    test('should handle circular dependencies without infinite loop', async () => {
      const page1 = join(tempDir, 'page1.html');
      const page2 = join(tempDir, 'page2.html');
      
      // Create circular dependency
      await tracker.trackPageDependencies(page1, 'data-unify="page2.html"', tempDir);
      await tracker.trackPageDependencies(page2, 'data-unify="page1.html"', tempDir);
      
      // Should not hang or throw
      const deps1 = tracker.getAllTransitiveDependents(page1);
      const deps2 = tracker.getAllTransitiveDependents(page2);
      
      expect(deps1).toContain(page2);
      expect(deps2).toContain(page1);
    });
    
    test('should return empty array for file with no dependents', () => {
      const deps = tracker.getAllTransitiveDependents('/unused/file.css');
      
      expect(deps).toEqual([]);
    });
    
    test('should handle complex dependency graphs', async () => {
      // Create complex graph
      const files = Array.from({ length: 10 }, (_, i) => join(tempDir, `page${i}.html`));
      
      // Create various dependencies
      for (let i = 0; i < 5; i++) {
        await tracker.trackPageDependencies(files[i], `data-unify="_layouts/default.html"`, tempDir);
      }
      for (let i = 5; i < 10; i++) {
        await tracker.trackPageDependencies(files[i], `data-unify="page${i-5}.html"`, tempDir);
      }
      
      const layoutDeps = tracker.getAllTransitiveDependents(join(tempDir, '_layouts/default.html'));
      
      // Should include all files
      expect(layoutDeps.length).toBe(10);
    });
  });
  
  describe('removePage', () => {
    test('should remove page and clean up mappings', async () => {
      const page = join(tempDir, 'page.html');
      const dep1 = join(tempDir, 'style.css');
      const dep2 = join(tempDir, 'script.js');
      
      await tracker.trackPageDependencies(page, '<link href="style.css"><script src="script.js">', tempDir);
      
      // Verify initial state
      expect(tracker.getPageDependencies(page).length).toBe(2);
      expect(tracker.getDependentPages(dep1)).toContain(page);
      expect(tracker.getDependentPages(dep2)).toContain(page);
      
      // Remove page
      tracker.removePage(page);
      
      // Verify cleanup
      expect(tracker.getPageDependencies(page)).toEqual([]);
      expect(tracker.getDependentPages(dep1)).not.toContain(page);
      expect(tracker.getDependentPages(dep2)).not.toContain(page);
    });
    
    test('should handle removing non-existent page', () => {
      // Should not throw
      tracker.removePage('/non/existent/page.html');
      
      expect(tracker.pageDependencies.size).toBe(0);
    });
    
    test('should preserve other pages when removing one', async () => {
      const page1 = join(tempDir, 'page1.html');
      const page2 = join(tempDir, 'page2.html');
      const sharedDep = join(tempDir, '_layouts/default.html');
      
      await tracker.trackPageDependencies(page1, 'data-unify="_layouts/default.html"', tempDir);
      await tracker.trackPageDependencies(page2, 'data-unify="_layouts/default.html"', tempDir);
      
      tracker.removePage(page1);
      
      // page2 should still depend on layout
      expect(tracker.getDependentPages(sharedDep)).toContain(page2);
      expect(tracker.getDependentPages(sharedDep)).not.toContain(page1);
    });
  });
  
  describe('clear', () => {
    test('should clear all dependency data', async () => {
      const page = join(tempDir, 'page.html');
      await tracker.trackPageDependencies(page, '<link href="style.css">', tempDir);
      
      tracker.clear();
      
      expect(tracker.pageDependencies.size).toBe(0);
      expect(tracker.dependentPages.size).toBe(0);
      expect(tracker.getPageDependencies(page)).toEqual([]);
      expect(mockAssetTracker.clear).toHaveBeenCalled();
    });
  });
  
  describe('getStats', () => {
    test('should return accurate statistics', async () => {
      const page1 = join(tempDir, 'page1.html');
      const page2 = join(tempDir, 'page2.html');
      
      await tracker.trackPageDependencies(page1, '<link href="style.css"><script src="script.js">', tempDir);
      await tracker.trackPageDependencies(page2, 'data-unify="_layouts/default.html"', tempDir);
      
      const stats = tracker.getStats();
      
      expect(stats.totalPages).toBe(2);
      expect(stats.totalDependencies).toBe(3);
      expect(stats.totalAssets).toBe(2); // From mock
      expect(stats.averageDependenciesPerPage).toBe(1.5);
    });
    
    test('should handle empty tracker', () => {
      const stats = tracker.getStats();
      
      expect(stats.totalPages).toBe(0);
      expect(stats.totalDependencies).toBe(0);
      expect(stats.totalAssets).toBe(2); // From mock
      expect(stats.averageDependenciesPerPage).toBe(0);
    });
  });
  
  describe('_extractFragmentReferences', () => {
    test('should extract multiple data-unify attributes', async () => {
      const content = `
        <html data-unify="layout1.html">
          <body data-unify="layout2.html">
            <div data-unify="component.html"></div>
          </body>
        </html>
      `;
      const pagePath = join(tempDir, 'page.html');
      
      await tracker.trackPageDependencies(pagePath, content, tempDir);
      
      const deps = tracker.getPageDependencies(pagePath);
      expect(deps.filter(d => d.includes('layout1.html')).length).toBe(1);
      expect(deps.filter(d => d.includes('layout2.html')).length).toBe(1);
      expect(deps.filter(d => d.includes('component.html')).length).toBe(1);
    });
    
    test('should handle single and double quotes', async () => {
      const content = `
        <div data-unify="single.html" data-unify='double.html'></div>
      `;
      const pagePath = join(tempDir, 'page.html');
      
      await tracker.trackPageDependencies(pagePath, content, tempDir);
      
      const deps = tracker.getPageDependencies(pagePath);
      expect(deps.filter(d => d.includes('single.html')).length).toBe(1);
      expect(deps.filter(d => d.includes('double.html')).length).toBe(1);
    });
  });
  
  describe('_extractIncludeReferences', () => {
    test('should extract both file and virtual includes', async () => {
      const content = `
        <!--#include file="header.html" -->
        <!--#include virtual="footer.html" -->
      `;
      const pagePath = join(tempDir, 'page.html');
      
      await tracker.trackPageDependencies(pagePath, content, tempDir);
      
      const deps = tracker.getPageDependencies(pagePath);
      expect(deps.filter(d => d.includes('header.html')).length).toBe(1);
      expect(deps.filter(d => d.includes('footer.html')).length).toBe(1);
    });
    
    test('should handle various include formats', async () => {
      const content = `
        <!--#include file="test1.html"-->
        <!--#include  file="test2.html"  -->
        <!--#include file='test3.html' -->
      `;
      const pagePath = join(tempDir, 'page.html');
      
      await tracker.trackPageDependencies(pagePath, content, tempDir);
      
      const deps = tracker.getPageDependencies(pagePath);
      expect(deps.filter(d => d.includes('test1.html')).length).toBe(1);
      expect(deps.filter(d => d.includes('test2.html')).length).toBe(1);
      expect(deps.filter(d => d.includes('test3.html')).length).toBe(1);
    });
  });
  
  describe('_resolveFragmentPath', () => {
    test('should resolve absolute paths from source root', async () => {
      const content = 'data-unify="/_layouts/default.html"';
      const pagePath = join(tempDir, 'pages/index.html');
      
      await tracker.trackPageDependencies(pagePath, content, tempDir);
      
      const deps = tracker.getPageDependencies(pagePath);
      expect(deps).toContain(join(tempDir, '_layouts/default.html'));
    });
    
    test('should resolve relative paths from page directory', async () => {
      const content = 'data-unify="../_layouts/default.html"';
      const pagePath = join(tempDir, 'pages/index.html');
      
      await tracker.trackPageDependencies(pagePath, content, tempDir);
      
      const deps = tracker.getPageDependencies(pagePath);
      expect(deps).toContain(join(tempDir, '_layouts/default.html'));
    });
    
    test('should search common directories for simple filenames', async () => {
      const content = 'data-unify="default.html"';
      const pagePath = join(tempDir, 'pages/index.html');
      
      await tracker.trackPageDependencies(pagePath, content, tempDir);
      
      const deps = tracker.getPageDependencies(pagePath);
      // Should find in _layouts directory
      expect(deps.filter(d => d.includes('default.html')).length).toBe(1);
    });
    
    test('should track non-existent files for future creation', async () => {
      const content = 'data-unify="future-file.html"';
      const pagePath = join(tempDir, 'page.html');
      
      await tracker.trackPageDependencies(pagePath, content, tempDir);
      
      const deps = tracker.getPageDependencies(pagePath);
      expect(deps.length).toBeGreaterThan(0);
    });
  });
  
  describe('Edge Cases and Error Handling', () => {
    test('should handle null and undefined paths gracefully', () => {
      expect(tracker.getPageDependencies(null)).toEqual([]);
      expect(tracker.getPageDependencies(undefined)).toEqual([]);
      expect(tracker.getDependentPages(null)).toEqual([]);
      expect(tracker.getDependentPages(undefined)).toEqual([]);
    });
    
    test('should handle concurrent dependency updates', async () => {
      const pages = Array.from({ length: 50 }, (_, i) => join(tempDir, `page${i}.html`));
      
      const promises = pages.map(page =>
        tracker.trackPageDependencies(page, '<link href="shared.css">', tempDir)
      );
      
      await Promise.all(promises);
      
      const sharedDep = join(tempDir, 'shared.css');
      const dependents = tracker.getDependentPages(sharedDep);
      
      expect(dependents.length).toBe(50);
    });
    
    test('should handle very long dependency chains', async () => {
      const files = Array.from({ length: 100 }, (_, i) => join(tempDir, `file${i}.html`));
      
      // Create chain: file0 <- file1 <- file2 <- ... <- file99
      for (let i = 1; i < files.length; i++) {
        await tracker.trackPageDependencies(files[i], `data-unify="file${i-1}.html"`, tempDir);
      }
      
      const deps = tracker.getAllTransitiveDependents(files[0]);
      
      // All files except file0 should be transitive dependents
      expect(deps.length).toBe(99);
    });
    
    test('should handle malformed HTML gracefully', async () => {
      const content = '<html data-unify="><<>"><<<<<';
      const pagePath = join(tempDir, 'malformed.html');
      
      // Should not throw
      await tracker.trackPageDependencies(pagePath, content, tempDir);
      
      const deps = tracker.getPageDependencies(pagePath);
      expect(deps).toBeDefined();
    });
  });
  
  describe('Performance and Memory', () => {
    test('should efficiently handle large numbers of dependencies', async () => {
      const startTime = Date.now();
      const numPages = 1000;
      
      for (let i = 0; i < numPages; i++) {
        const page = join(tempDir, `page${i}.html`);
        const content = `<link href="style${i % 10}.css">`;
        await tracker.trackPageDependencies(page, content, tempDir);
      }
      
      const duration = Date.now() - startTime;
      
      expect(tracker.pageDependencies.size).toBe(numPages);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });
    
    test('should properly clean up memory when removing pages', async () => {
      // Add many pages
      for (let i = 0; i < 100; i++) {
        const page = join(tempDir, `page${i}.html`);
        await tracker.trackPageDependencies(page, '<link href="style.css">', tempDir);
      }
      
      // Remove all pages
      for (let i = 0; i < 100; i++) {
        tracker.removePage(join(tempDir, `page${i}.html`));
      }
      
      expect(tracker.pageDependencies.size).toBe(0);
      expect(tracker.dependentPages.size).toBe(0);
    });
  });
});