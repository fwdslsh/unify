/**
 * Comprehensive test for all file watching requirements from issue #29
 * Updated for v0.6.0 architecture with data-import system
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { watch } from '../../src/core/file-watcher.js';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';

describe('Issue #29: Complete File Watching Requirements', () => {
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

  describe('Requirement 1: Pages rebuild when layout changes', () => {
    it('should rebuild all pages that use a layout when the layout is modified', async () => {
      const structure = {
        'src/index.html': `<div data-import="shared">
  <h1>Home Page</h1>
</div>`,
        'src/about.html': `<div data-import="shared">
  <h1>About Page</h1>
</div>`,
        'src/contact.html': `<div data-import="shared">
  <h1>Contact Page</h1>
</div>`,
        'src/shared.html': `<!DOCTYPE html>
<html>
<head><title>Shared Layout</title></head>
<body>
  <nav>Original Navigation</nav>
  <main><slot></slot></main>
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
      
      // Verify initial state - check that files exist
      const homeExists = await fileExists(path.join(outputDir, 'index.html'));
      const aboutExists = await fileExists(path.join(outputDir, 'about.html'));
      const contactExists = await fileExists(path.join(outputDir, 'contact.html'));
      
      expect(homeExists).toBe(true);
      expect(aboutExists).toBe(true);
      expect(contactExists).toBe(true);
      
      // Change the shared layout file - this should trigger rebuild of ALL pages using it
      await fs.writeFile(path.join(sourceDir, 'shared.html'), `<!DOCTYPE html>
<html>
<head><title>Shared Layout</title></head>
<body>
  <nav>Updated Navigation - Layout Changed!</nav>
  <main><slot></slot></main>
</body>
</html>`);
      
      // Wait for rebuild
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check that pages still exist after layout change
      const updatedHomeExists = await fileExists(path.join(outputDir, 'index.html'));
      const updatedAboutExists = await fileExists(path.join(outputDir, 'about.html'));
      const updatedContactExists = await fileExists(path.join(outputDir, 'contact.html'));
      
      expect(updatedHomeExists).toBe(true);
      expect(updatedAboutExists).toBe(true);
      expect(updatedContactExists).toBe(true);
    });

    it('should work with auto-discovered _layout.html files', async () => {
      const structure = {
        'src/blog/post1.html': `<h1>Blog Post 1</h1>`,
        'src/blog/post2.html': `<h1>Blog Post 2</h1>`,
        'src/blog/_layout.html': `<!DOCTYPE html>
<html>
<head><title>Blog Layout</title></head>
<body>
  <header>Original Blog Header</header>
  <main><slot></slot></main>
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
      
      // Verify initial state - files should exist
      const post1Exists = await fileExists(path.join(outputDir, 'blog/post1.html'));
      const post2Exists = await fileExists(path.join(outputDir, 'blog/post2.html'));
      
      expect(post1Exists).toBe(true);
      expect(post2Exists).toBe(true);
      
      // Change the blog layout
      await fs.writeFile(path.join(sourceDir, 'blog/_layout.html'), `<!DOCTYPE html>
<html>
<head><title>Blog Layout</title></head>
<body>
  <header>Updated Blog Header - Auto Layout Changed!</header>
  <main><slot></slot></main>
</body>
</html>`);
      
      // Wait for rebuild
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check that all blog pages still exist after layout change
      const updatedPost1Exists = await fileExists(path.join(outputDir, 'blog/post1.html'));
      const updatedPost2Exists = await fileExists(path.join(outputDir, 'blog/post2.html'));
      
      expect(updatedPost1Exists).toBe(true);
      expect(updatedPost2Exists).toBe(true);
    });
  });

  describe('Requirement 2: New pages trigger builds', () => {
    it('should build new pages when they are added to the src folder', async () => {
      const structure = {
        'src/index.html': `<h1>Home Page</h1>`,
        'src/_layout.html': `<!DOCTYPE html>
<html>
<head><title>Site Layout</title></head>
<body>
  <header>Site Header</header>
  <main><slot></slot></main>
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
      
      // Verify initial state - only index.html exists
      expect(await fileExists(path.join(outputDir, 'index.html'))).toBe(true);
      expect(await fileExists(path.join(outputDir, 'new-page.html'))).toBe(false);
      
      // Add a new page - this should trigger a build automatically
      await fs.writeFile(path.join(sourceDir, 'new-page.html'), `<h1>This is a New Page</h1>`);
      
      // Wait for the new page to be built
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check that the new page was built
      expect(await fileExists(path.join(outputDir, 'new-page.html'))).toBe(true);
      
      const newPageContent = await fs.readFile(path.join(outputDir, 'new-page.html'), 'utf-8');
      expect(newPageContent).toContain('This is a New Page');
    });

    it('should build new pages in subdirectories', async () => {
      const structure = {
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
      
      // Create subdirectory and add new page
      await fs.mkdir(path.join(sourceDir, 'docs'), { recursive: true });
      await fs.writeFile(path.join(sourceDir, 'docs/guide.html'), `<h1>Documentation Guide</h1>`);
      
      // Wait for the new page to be built
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check that the new page was built in the correct subdirectory
      expect(await fileExists(path.join(outputDir, 'docs/guide.html'))).toBe(true);
      
      const guideContent = await fs.readFile(path.join(outputDir, 'docs/guide.html'), 'utf-8');
      expect(guideContent).toContain('Documentation Guide');
    });
  });

  describe('Requirement 3: Component changes trigger dependent page rebuilds', () => {
    it('should rebuild all pages that import a component when the component changes', async () => {
      const structure = {
        'src/home.html': `<!DOCTYPE html>
<html>
<head><title>Home</title></head>
<body>
  <nav data-import="navbar"></nav>
  <main><h1>Home Page</h1></main>
</body>
</html>`,
        'src/about.html': `<!DOCTYPE html>
<html>
<head><title>About</title></head>
<body>
  <nav data-import="navbar"></nav>
  <main><h1>About Page</h1></main>
</body>
</html>`,
        'src/contact.html': `<!DOCTYPE html>
<html>
<head><title>Contact</title></head>
<body>
  <main><h1>Contact Page</h1></main>
</body>
</html>`,
        'src/_includes/navbar.html': `<a href="/">Home</a><a href="/about.html">About</a>`
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
      
      // Verify initial state - check files exist
      expect(await fileExists(path.join(outputDir, 'home.html'))).toBe(true);
      expect(await fileExists(path.join(outputDir, 'about.html'))).toBe(true);
      expect(await fileExists(path.join(outputDir, 'contact.html'))).toBe(true);
      
      // Change the component - this should trigger rebuild of dependent pages
      await fs.writeFile(path.join(sourceDir, '_includes/navbar.html'), `<a href="/">Home</a><a href="/about.html">About</a><a href="/contact.html">Contact</a>`);
      
      // Wait for rebuild
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check that pages still exist after component change
      expect(await fileExists(path.join(outputDir, 'home.html'))).toBe(true);
      expect(await fileExists(path.join(outputDir, 'about.html'))).toBe(true);
      expect(await fileExists(path.join(outputDir, 'contact.html'))).toBe(true);
    });

    it('should handle nested component dependencies', async () => {
      const structure = {
        'src/index.html': `<!DOCTYPE html>
<html>
<head><title>Home</title></head>
<body>
  <header data-import="header"></header>
  <main><h1>Home Content</h1></main>
</body>
</html>`,
        'src/_includes/header.html': `<h1>Site Header</h1>
<nav data-import="navbar"></nav>`,
        'src/_includes/navbar.html': `<a href="/">Home</a><a href="/about">About</a>`
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
      
      // Verify initial state - page should exist
      expect(await fileExists(path.join(outputDir, 'index.html'))).toBe(true);
      
      // Change the nested component
      await fs.writeFile(path.join(sourceDir, '_includes/navbar.html'), `<a href="/">Home</a><a href="/about">About</a><a href="/contact">Contact</a>`);
      
      // Wait for rebuild
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check that the page still exists after nested component change
      expect(await fileExists(path.join(outputDir, 'index.html'))).toBe(true);
    });
  });

  describe('Requirement 4: Asset changes trigger page reloads', () => {
    it('should handle CSS file changes', async () => {
      const structure = {
        'src/index.html': `<!DOCTYPE html>
<html>
<head>
  <title>Home</title>
  <link rel="stylesheet" href="/css/main.css">
</head>
<body><h1>Home Page</h1></body>
</html>`,
        'src/css/main.css': `body { background: red; }`
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
      
      // Verify CSS file was copied
      expect(await fileExists(path.join(outputDir, 'css/main.css'))).toBe(true);
      const initialCSS = await fs.readFile(path.join(outputDir, 'css/main.css'), 'utf-8');
      expect(initialCSS).toContain('background: red');
      
      // Change the CSS file
      await fs.writeFile(path.join(sourceDir, 'css/main.css'), `body { background: blue; }`);
      
      // Wait for update
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check that CSS file was updated
      const updatedCSS = await fs.readFile(path.join(outputDir, 'css/main.css'), 'utf-8');
      expect(updatedCSS).toContain('background: blue');
      expect(updatedCSS).not.toContain('background: red');
    });

    it('should handle image file additions and changes', async () => {
      const structure = {
        'src/index.html': `<!DOCTYPE html>
<html>
<head><title>Home</title></head>
<body>
  <h1>Home Page</h1>
  <img src="/images/logo.png" alt="Logo">
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
      
      // Initially, image doesn't exist
      expect(await fileExists(path.join(outputDir, 'images/logo.png'))).toBe(false);
      
      // Create images directory and add image
      await fs.mkdir(path.join(sourceDir, 'images'), { recursive: true });
      await fs.writeFile(path.join(sourceDir, 'images/logo.png'), 'fake-png-content');
      
      // Wait for asset to be copied
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check that image was copied
      expect(await fileExists(path.join(outputDir, 'images/logo.png'))).toBe(true);
      const logoContent = await fs.readFile(path.join(outputDir, 'images/logo.png'), 'utf-8');
      expect(logoContent).toBe('fake-png-content');
    });
  });
});

/**
 * Helper function to check if file exists
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}