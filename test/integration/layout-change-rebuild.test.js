/**
 * Tests for layout change rebuild functionality
 * Verifies that pages are rebuilt when their layouts change
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { watch } from '../../src/core/file-watcher.js';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';

describe('Layout Change Rebuild', () => {
  let tempDir, sourceDir, outputDir;
  let watcher;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    sourceDir = path.join(tempDir, 'src');
    outputDir = path.join(tempDir, 'dist');
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.stopWatching();
      watcher = null;
    }
    await cleanupTempDirectory(tempDir);
  });

  describe('Explicit layout with data-layout attribute', () => {
    it('should rebuild page when explicit layout file changes', async () => {
      const structure = {
        'src/index.html': `<div data-layout="layout.html">
  <h1>Home Page</h1>
</div>`,
        'src/layout.html': `<!DOCTYPE html>
<html>
<head><title>Layout</title></head>
<body>
  <header>Original Header</header>
  <main><!-- Page content goes here --></main>
</body>
</html>`
      };

      await createTestStructure(tempDir, structure);

      // Start file watcher
      watcher = await watch({
        source: sourceDir,
        output: outputDir,
        debounceMs: 100
      });

      // Wait for initial build
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Verify initial state
      const initialContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(initialContent).toContain('Original Header');
      
      // Change the layout file
      await fs.writeFile(path.join(sourceDir, 'layout.html'), `<!DOCTYPE html>
<html>
<head><title>Layout</title></head>
<body>
  <header>Updated Header</header>
  <main><!-- Page content goes here --></main>
</body>
</html>`);
      
      // Wait for rebuild
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check that the page was rebuilt with new layout
      const updatedContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(updatedContent).toContain('Updated Header');
      expect(updatedContent).not.toContain('Original Header');
    });

    it('should rebuild multiple pages when shared layout changes', async () => {
      const structure = {
        'src/index.html': `<div data-layout="shared.html">
  <h1>Home Page</h1>
</div>`,
        'src/about.html': `<div data-layout="shared.html">
  <h1>About Page</h1>
</div>`,
        'src/shared.html': `<!DOCTYPE html>
<html>
<head><title>Shared Layout</title></head>
<body>
  <nav>Original Navigation</nav>
  <main><!-- Page content goes here --></main>
</body>
</html>`
      };

      await createTestStructure(tempDir, structure);

      // Start file watcher
      watcher = await watch({
        source: sourceDir,
        output: outputDir,
        debounceMs: 100
      });

      // Wait for initial build
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Verify initial state
      const initialHome = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      const initialAbout = await fs.readFile(path.join(outputDir, 'about.html'), 'utf-8');
      expect(initialHome).toContain('Original Navigation');
      expect(initialAbout).toContain('Original Navigation');
      
      // Change the shared layout file
      await fs.writeFile(path.join(sourceDir, 'shared.html'), `<!DOCTYPE html>
<html>
<head><title>Shared Layout</title></head>
<body>
  <nav>Updated Navigation</nav>
  <main><!-- Page content goes here --></main>
</body>
</html>`);
      
      // Wait for rebuild
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check that both pages were rebuilt with new layout
      const updatedHome = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      const updatedAbout = await fs.readFile(path.join(outputDir, 'about.html'), 'utf-8');
      expect(updatedHome).toContain('Updated Navigation');
      expect(updatedAbout).toContain('Updated Navigation');
    });
  });

  describe('Auto-discovered layouts (_layout.html)', () => {
    it('should rebuild page when folder-scoped _layout.html changes', async () => {
      const structure = {
        'src/index.html': `<h1>Home Page</h1>`,
        'src/_layout.html': `<!DOCTYPE html>
<html>
<head><title>Auto Layout</title></head>
<body>
  <header>Original Auto Header</header>
  <main><!-- Page content goes here --></main>
</body>
</html>`
      };

      await createTestStructure(tempDir, structure);

      // Start file watcher
      watcher = await watch({
        source: sourceDir,
        output: outputDir,
        debounceMs: 100
      });

      // Wait for initial build
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Verify initial state
      const initialContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(initialContent).toContain('Original Auto Header');
      
      // Change the auto-discovered layout file
      await fs.writeFile(path.join(sourceDir, '_layout.html'), `<!DOCTYPE html>
<html>
<head><title>Auto Layout</title></head>
<body>
  <header>Updated Auto Header</header>
  <main><!-- Page content goes here --></main>
</body>
</html>`);
      
      // Wait for rebuild
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check that the page was rebuilt with new layout
      const updatedContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(updatedContent).toContain('Updated Auto Header');
      expect(updatedContent).not.toContain('Original Auto Header');
    });

    it('should rebuild pages when nested folder _layout.html changes', async () => {
      const structure = {
        'src/blog/post1.html': `<h1>Blog Post 1</h1>`,
        'src/blog/post2.html': `<h1>Blog Post 2</h1>`,
        'src/blog/_layout.html': `<!DOCTYPE html>
<html>
<head><title>Blog Layout</title></head>
<body>
  <nav>Original Blog Nav</nav>
  <main><!-- Page content goes here --></main>
</body>
</html>`,
        'src/index.html': `<h1>Home Page</h1>`
      };

      await createTestStructure(tempDir, structure);

      // Start file watcher
      watcher = await watch({
        source: sourceDir,
        output: outputDir,
        debounceMs: 100
      });

      // Wait for initial build
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Verify initial state - blog posts should have blog layout
      const initialPost1 = await fs.readFile(path.join(outputDir, 'blog/post1.html'), 'utf-8');
      const initialPost2 = await fs.readFile(path.join(outputDir, 'blog/post2.html'), 'utf-8');
      const homeContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      
      expect(initialPost1).toContain('Original Blog Nav');
      expect(initialPost2).toContain('Original Blog Nav');
      // Home page shouldn't have blog nav
      expect(homeContent).not.toContain('Original Blog Nav');
      
      // Change the blog layout file
      await fs.writeFile(path.join(sourceDir, 'blog/_layout.html'), `<!DOCTYPE html>
<html>
<head><title>Blog Layout</title></head>
<body>
  <nav>Updated Blog Nav</nav>
  <main><!-- Page content goes here --></main>
</body>
</html>`);
      
      // Wait for rebuild
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check that only blog pages were rebuilt with new layout
      const updatedPost1 = await fs.readFile(path.join(outputDir, 'blog/post1.html'), 'utf-8');
      const updatedPost2 = await fs.readFile(path.join(outputDir, 'blog/post2.html'), 'utf-8');
      const unchangedHome = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      
      expect(updatedPost1).toContain('Updated Blog Nav');
      expect(updatedPost2).toContain('Updated Blog Nav');
      // Home page should remain unchanged
      expect(unchangedHome).not.toContain('Updated Blog Nav');
    });
  });

  // v2: _includes/layout.html fallback feature removed
  // Layout hierarchy changes are tested in other tests
});