/**
 * File Watcher Addition and Deletion Tests
 * Tests for proper handling of file additions and deletions in watch mode
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { watch } from '../../src/core/file-watcher.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('File Watcher Addition and Deletion', () => {
  let tempDir, sourceDir, outputDir;
  let watcher;

  beforeEach(async () => {
    const uniqueId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    tempDir = path.join(__dirname, '../test-temp/file-watcher-test-' + uniqueId);
    sourceDir = path.join(tempDir, 'src');
    outputDir = path.join(tempDir, 'dist');
    
    await fs.mkdir(sourceDir, { recursive: true });
    
    // Create initial structure
    await fs.writeFile(path.join(sourceDir, 'index.html'), `<!DOCTYPE html>
<html>
<head><title>Home</title></head>
<body><h1>Welcome</h1></body>
</html>`);
    
    await fs.mkdir(path.join(sourceDir, '.components'), { recursive: true });
    await fs.writeFile(path.join(sourceDir, '.components', 'header.html'), '<header>Header</header>');
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.stopWatching();
      watcher = null;
    }
    
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  it('should detect new file additions and build them', async () => {
    // Start file watcher
    watcher = await watch({
      source: sourceDir,
      output: outputDir,
      debounceMs: 100
    });

    // Wait for initial build
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Verify initial state
    expect(await fileExists(path.join(outputDir, 'index.html'))).toBe(true);
    expect(await fileExists(path.join(outputDir, 'about.html'))).toBe(false);
    
    // Add a new file
    await fs.writeFile(path.join(sourceDir, 'about.html'), `<!DOCTYPE html>
<html>
<head><title>About</title></head>
<body><h1>About Us</h1></body>
</html>`);
    
    // Wait for file watcher to process the addition
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check that the new file was built
    expect(await fileExists(path.join(outputDir, 'about.html'))).toBe(true);
    
    const aboutContent = await fs.readFile(path.join(outputDir, 'about.html'), 'utf-8');
    expect(aboutContent).toContain('<title>About</title>');
    expect(aboutContent).toContain('<h1>About Us</h1>');
  });

  it('should detect file deletions and remove them from output', async () => {
    // Create an additional file first
    await fs.writeFile(path.join(sourceDir, 'contact.html'), `<!DOCTYPE html>
<html>
<head><title>Contact</title></head>
<body><h1>Contact Us</h1></body>
</html>`);

    // Start file watcher
    watcher = await watch({
      source: sourceDir,
      output: outputDir,
      debounceMs: 100
    });

    // Wait for initial build
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Verify both files exist
    expect(await fileExists(path.join(outputDir, 'index.html'))).toBe(true);
    expect(await fileExists(path.join(outputDir, 'contact.html'))).toBe(true);
    
    // Delete the contact file
    await fs.unlink(path.join(sourceDir, 'contact.html'));
    
    // Wait for file watcher to process the deletion
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check that the file was removed from output
    expect(await fileExists(path.join(outputDir, 'index.html'))).toBe(true);
    expect(await fileExists(path.join(outputDir, 'contact.html'))).toBe(false);
  });

  it('should handle component file additions and trigger page rebuilds', async () => {
    // Create a page that will include the new component
    await fs.writeFile(path.join(sourceDir, 'page.html'), `<!DOCTYPE html>
<html>
<head><title>Page</title></head>
<body>
  <include src="/.components/sidebar.html" />
  <main>Content</main>
</body>
</html>`);

    // Start file watcher
    watcher = await watch({
      source: sourceDir,
      output: outputDir,
      debounceMs: 100
    });

    // Wait for initial build
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Verify initial state - sidebar include should show as not found
    const initialContent = await fs.readFile(path.join(outputDir, 'page.html'), 'utf-8');
    expect(initialContent).toContain('<!-- Include not found: /.components/sidebar.html -->');
    
    // Add the new component
    await fs.writeFile(path.join(sourceDir, '.components', 'sidebar.html'), '<aside>Sidebar content</aside>');
    
    // Wait for file watcher to process the addition and rebuild
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check that the page was rebuilt with the new component
    const updatedContent = await fs.readFile(path.join(outputDir, 'page.html'), 'utf-8');
    expect(updatedContent).toContain('<aside>Sidebar content</aside>');
    expect(updatedContent).not.toContain('<!-- Include not found: /.components/sidebar.html -->');
  });

  it('should handle component file deletions and update dependent pages', async () => {
    // Create a page that includes the component
    await fs.writeFile(path.join(sourceDir, 'page.html'), `<!DOCTYPE html>
<html>
<head><title>Page</title></head>
<body>
  <include src="/.components/header.html" />
  <main>Content</main>
</body>
</html>`);

    // Start file watcher
    watcher = await watch({
      source: sourceDir,
      output: outputDir,
      debounceMs: 100
    });

    // Wait for initial build
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Verify initial state - header should be included
    const initialContent = await fs.readFile(path.join(outputDir, 'page.html'), 'utf-8');
    expect(initialContent).toContain('<header>Header</header>');
    
    // Delete the component
    await fs.unlink(path.join(sourceDir, '.components', 'header.html'));
    
    // Wait for file watcher to process the deletion and rebuild
    await new Promise(resolve => setTimeout(resolve, 1000)); // Increased wait time
    
    // Check that the page was rebuilt with missing component message
    const updatedContent = await fs.readFile(path.join(outputDir, 'page.html'), 'utf-8');
    expect(updatedContent).toContain('<!-- Include not found: /.components/header.html -->');
    expect(updatedContent).not.toContain('<header>Header</header>');
  });

  it('should handle asset file additions and copy them to output', async () => {
    // Create the CSS directory first
    await fs.mkdir(path.join(sourceDir, 'css'), { recursive: true });
    
    // Create a page that references an asset
    await fs.writeFile(path.join(sourceDir, 'index.html'), `<!DOCTYPE html>
<html>
<head>
  <title>Home</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body><h1>Welcome</h1></body>
</html>`);

    // Start file watcher
    watcher = await watch({
      source: sourceDir,
      output: outputDir,
      debounceMs: 100
    });

    // Wait for initial build
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Verify CSS doesn't exist yet
    expect(await fileExists(path.join(outputDir, 'css', 'style.css'))).toBe(false);
    
    // Add the CSS file to existing directory
    await fs.writeFile(path.join(sourceDir, 'css', 'style.css'), 'body { margin: 0; }');
    
    // Wait for file watcher to process the addition
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check that the CSS file was copied to output
    expect(await fileExists(path.join(outputDir, 'css', 'style.css'))).toBe(true);
    
    const cssContent = await fs.readFile(path.join(outputDir, 'css', 'style.css'), 'utf-8');
    expect(cssContent).toContain('body { margin: 0; }');
  });

  it('should handle rapid file additions and deletions without losing events', async () => {
    // Start file watcher
    watcher = await watch({
      source: sourceDir,
      output: outputDir,
      debounceMs: 200 // Slightly higher debounce for this test
    });

    // Wait for initial build
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Add files sequentially to ensure they're processed
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(path.join(sourceDir, `temp${i}.html`), `<h1>Temp ${i}</h1>`);
      await new Promise(resolve => setTimeout(resolve, 50)); // Small delay between adds
    }
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Delete some files sequentially
    for (let i = 0; i < 3; i++) {
      await fs.unlink(path.join(sourceDir, `temp${i}.html`));
      await new Promise(resolve => setTimeout(resolve, 50)); // Small delay between deletes
    }
    
    // Wait for all processing to complete
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Check final state
    expect(await fileExists(path.join(outputDir, 'temp0.html'))).toBe(false);
    expect(await fileExists(path.join(outputDir, 'temp1.html'))).toBe(false);
    expect(await fileExists(path.join(outputDir, 'temp2.html'))).toBe(false);
    expect(await fileExists(path.join(outputDir, 'temp3.html'))).toBe(true);
    expect(await fileExists(path.join(outputDir, 'temp4.html'))).toBe(true);
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
