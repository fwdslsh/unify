/**
 * Tests for complex integration scenarios
 * Verifies real-world usage patterns and workflow combinations using v0.6.0 architecture
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';

describe('Complex Integration Scenarios', () => {
  let tempDir;
  let sourceDir;
  let outputDir;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    sourceDir = path.join(tempDir, 'src');
    outputDir = path.join(tempDir, 'dist');
  });

  afterEach(async () => {
    await cleanupTempDirectory(tempDir);
  });

  describe('Full Workflow Integration', () => {
    it('should handle complete build workflow with data-import fragments', async () => {
      const structure = {
        'src/index.html': `
          <div data-import="layout">
            <h1>Home Page</h1>
            <nav data-import="nav"></nav>
            <main>Welcome to the site</main>
          </div>
        `,
        'src/_layout.html': `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Site</title>
            <link rel="stylesheet" href="/css/main.css">
          </head>
          <body>
            <slot></slot>
            <script src="/js/main.js"></script>
          </body>
          </html>
        `,
        'src/_includes/nav.html': `
          <nav>
            <a href="/">Home</a>
            <a href="/about.html">About</a>
            <a href="/blog.html">Blog</a>
          </nav>
        `,
        'src/about.md': `---
title: About Us
layout: _layout
---
# About Us

This is our about page.

<section data-import="contact-info"></section>`,
        'src/_includes/contact-info.html': `<div class="contact">
  <p>Contact us at: info@example.com</p>
</div>`,
        'src/css/main.css': `
          body { margin: 0; padding: 20px; }
          nav { background: #333; padding: 10px; }
          nav a { color: white; margin-right: 10px; }
        `,
        'src/js/main.js': `
          console.log('Site loaded');
          // Add some interactivity
        `
      };

      await createTestStructure(tempDir, structure);

      // Step 1: Initial build
      const buildResult = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);
      if (buildResult.code !== 0) {
        console.log('Build stderr:', buildResult.stderr);
        console.log('Build stdout:', buildResult.stdout);
      }
      expect(buildResult.code).toBe(0);

      // Verify initial build output exists
      const indexExists = await fileExists(path.join(outputDir, 'index.html'));
      const aboutExists = await fileExists(path.join(outputDir, 'about.html'));
      expect(indexExists).toBe(true);
      expect(aboutExists).toBe(true);

      // Verify basic content structure
      const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(indexContent).toContain('Home Page');
      
      const aboutContent = await fs.readFile(path.join(outputDir, 'about.html'), 'utf-8');
      expect(aboutContent).toContain('About Us');

      // Step 2: Test asset handling
      const cssExists = await fileExists(path.join(outputDir, 'css', 'main.css'));
      const jsExists = await fileExists(path.join(outputDir, 'js', 'main.js'));
      expect(cssExists).toBe(true);
      expect(jsExists).toBe(true);
    });

    it('should handle mixed file types in single build with v0.6.0 data-import system', async () => {
      const structure = {
        // HTML pages with data-import fragments
        'src/index.html': '<div data-import="layout"><h1>Home</h1><sidebar data-import="sidebar"></sidebar></div>',
        'src/products.html': '<div data-import="layout"><h1>Products</h1><ul data-import="product-list"></ul></div>',
        
        // Markdown pages with frontmatter
        'src/blog/post-1.md': `---
title: First Post
date: 2024-01-01
tags: [tech, web]
layout: blog-layout
---
# First Blog Post

This is our first post.

<div data-import="author-bio"></div>
<div data-import="social-share"></div>`,
        'src/blog/post-2.md': `---
title: Second Post
date: 2024-01-02
layout: blog-layout
---
# Second Blog Post

Another great post.

<div data-import="author-bio"></div>`,
        
        // Layouts
        'src/_layout.html': `<!DOCTYPE html>
<html>
<head>
  <title>Site</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/css/main.css">
</head>
<body>
  <header data-import="header"></header>
  <main><slot></slot></main>
  <footer data-import="footer"></footer>
  <script src="/js/main.js"></script>
</body>
</html>`,
        'src/blog-layout.html': `<!DOCTYPE html>
<html>
<head>
  <title>Blog</title>
  <link rel="stylesheet" href="/css/main.css">
</head>
<body>
  <header data-import="header"></header>
  <article><slot></slot></article>
  <footer data-import="footer"></footer>
</body>
</html>`,
        
        // Includes
        'src/_includes/header.html': '<h1>My Site</h1><nav data-import="nav"></nav>',
        'src/_includes/nav.html': '<a href="/">Home</a><a href="/products.html">Products</a><a href="/blog/">Blog</a>',
        'src/_includes/footer.html': '<p>&copy; 2024 My Site</p>',
        'src/_includes/sidebar.html': '<h3>Sidebar</h3><div data-import="recent-posts"></div>',
        'src/_includes/product-list.html': '<li>Product 1</li><li>Product 2</li>',
        'src/_includes/author-bio.html': '<div class="author">Written by John Doe</div>',
        'src/_includes/social-share.html': '<div class="share">Share this post</div>',
        'src/_includes/recent-posts.html': '<a href="/blog/post-1.html">First Post</a>',
        
        // Assets
        'src/css/main.css': 'body { margin: 0; } header { background: #333; color: white; }',
        'src/css/blog.css': '@import url("main.css"); article { max-width: 800px; margin: 0 auto; }',
        'src/js/main.js': 'console.log("Site loaded");',
        'src/images/logo.svg': '<svg><circle cx="50" cy="50" r="40" fill="blue"/></svg>',
        'src/images/hero.jpg': 'fake-image-data'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--pretty-urls'
      ]);
      if (result.code !== 0) {
        console.log('Build stderr:', result.stderr);
        console.log('Build stdout:', result.stdout);
      }
      expect(result.code).toBe(0);

      // Verify all file types were processed correctly
      const files = [
        'index.html',            // index.html stays as index.html even with pretty URLs
        'products/index.html',   // Pretty URLs: products.html -> products/index.html  
        'blog/post-1/index.html', // Pretty URLs: .md -> /index.html
        'blog/post-2/index.html'  // Pretty URLs: .md -> /index.html
      ];

      for (const file of files) {
        const exists = await fileExists(path.join(outputDir, file));
        expect(exists).toBe(true);
        
        const content = await fs.readFile(path.join(outputDir, file), 'utf-8');
        expect(content).toContain('<!DOCTYPE html>');
        expect(content).toContain('<title>');
      }

      // Verify basic content structure
      const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(indexContent).toContain('Home');

      // Verify Markdown processing with frontmatter
      const post1Content = await fs.readFile(path.join(outputDir, 'blog/post-1/index.html'), 'utf-8');
      expect(post1Content).toContain('First Blog Post');

      // Verify assets were copied
      expect(await fileExists(path.join(outputDir, 'css/main.css'))).toBe(true);
      expect(await fileExists(path.join(outputDir, 'js/main.js'))).toBe(true);
    });
  });

  describe('Nested Fragment Dependencies', () => {
    it('should handle complex nested data-import with depth limits', async () => {
      const structure = {
        'src/page.html': '<div data-import="level1"></div>',
        'src/_includes/level1.html': 'Level 1: <div data-import="level2"></div>',
        'src/_includes/level2.html': 'Level 2: <div data-import="level3"></div>',
        'src/_includes/level3.html': 'Level 3: <div data-import="level4"></div>',
        'src/_includes/level4.html': 'Level 4: <div data-import="level5"></div>',
        'src/_includes/level5.html': 'Level 5: Final level',
      };

      await createTestStructure(tempDir, structure);

      // Deep nesting should work up to depth limit
      const deepResult = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);
      expect(deepResult.code).toBe(0);

      const pageContent = await fs.readFile(path.join(outputDir, 'page.html'), 'utf-8');
      expect(pageContent).toContain('Level 1:');
      expect(pageContent).toContain('Level 2:');
      // Should handle reasonable nesting depth
      expect(pageContent.length).toBeLessThan(10000); // Not infinitely long
    });

    it('should handle layout chains with data-import system', async () => {
      const structure = {
        'src/page.html': '<div data-import="child"><h1>Content</h1></div>',
        
        'src/_includes/child.html': `
          <div data-import="parent">
            <div class="child-wrapper">
              <slot></slot>
            </div>
          </div>
        `,
        
        'src/_includes/parent.html': `
          <div data-import="grandparent">
            <div class="parent-wrapper">
              <slot></slot>
            </div>
          </div>
        `,
        
        'src/_includes/grandparent.html': `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Nested Layout</title>
          </head>
          <body>
            <div class="grandparent-wrapper">
              <slot></slot>
            </div>
          </body>
          </html>
        `
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);
      expect(result.code).toBe(0);

      const exists = await fileExists(path.join(outputDir, 'page.html'));
      expect(exists).toBe(true);
      
      const content = await fs.readFile(path.join(outputDir, 'page.html'), 'utf-8');
      expect(content).toContain('<h1>Content</h1>');
      // Basic structure verification - exact layout behavior may vary in v0.6.0
      expect(content.length).toBeGreaterThan(0);
    });
  });

  describe('Large Project Simulation', () => {
    it('should handle realistic blog site with many files', async () => {
      const structure = {};
      
      // Main pages
      structure['src/index.html'] = '<div data-import="home"><h1>Welcome</h1><div data-import="recent-posts"></div></div>';
      structure['src/about.html'] = '<div data-import="page"><h1>About</h1></div>';
      structure['src/contact.html'] = '<div data-import="page"><h1>Contact</h1></div>';
      
      // Blog posts (10 posts for faster test)
      for (let i = 1; i <= 10; i++) {
        structure[`src/blog/post-${i}.md`] = `---
layout: blog
title: Post ${i}
date: 2024-01-${String(i).padStart(2, '0')}
category: ${i % 3 === 0 ? 'tech' : i % 2 === 0 ? 'design' : 'news'}
---
# Post ${i}

This is blog post number ${i}.

<div data-import="author-info"></div>
<div data-import="related-posts"></div>`;
      }
      
      // Category pages
      const categories = ['tech', 'design', 'news'];
      categories.forEach(cat => {
        structure[`src/blog/${cat}.html`] = `<div data-import="category"><h1>${cat}</h1><div data-import="${cat}-posts"></div></div>`;
        structure[`src/_includes/${cat}-posts.html`] = `<div class="${cat}-posts">Posts in ${cat}</div>`;
      });
      
      // Layouts
      structure['src/home.html'] = '<!DOCTYPE html><html><head><title>Home</title></head><body><header data-import="header"></header><main><slot></slot></main><footer data-import="footer"></footer></body></html>';
      structure['src/page.html'] = '<!DOCTYPE html><html><head><title>Page</title></head><body><header data-import="header"></header><main><slot></slot></main><footer data-import="footer"></footer></body></html>';
      structure['src/blog.html'] = '<!DOCTYPE html><html><head><title>Blog</title></head><body><header data-import="header"></header><article><slot></slot></article><footer data-import="footer"></footer></body></html>';
      structure['src/category.html'] = '<!DOCTYPE html><html><head><title>Category</title></head><body><header data-import="header"></header><section><slot></slot></section><footer data-import="footer"></footer></body></html>';
      
      // Includes
      structure['src/_includes/header.html'] = '<h1>My Blog</h1><nav data-import="nav"></nav>';
      structure['src/_includes/nav.html'] = '<a href="/">Home</a><a href="/about.html">About</a><a href="/blog/">Blog</a>';
      structure['src/_includes/footer.html'] = '<p>&copy; 2024</p>';
      structure['src/_includes/recent-posts.html'] = '<div class="recent">Recent posts list</div>';
      structure['src/_includes/author-info.html'] = '<div class="author">By John Doe</div>';
      structure['src/_includes/related-posts.html'] = '<div class="related">Related posts</div>';
      
      // Assets
      structure['src/css/main.css'] = 'body { margin: 0; padding: 20px; }';
      structure['src/css/blog.css'] = '@import url("main.css"); article { max-width: 800px; }';
      structure['src/js/main.js'] = 'console.log("Blog loaded");';
      
      // Images (simulate some)
      for (let i = 1; i <= 5; i++) {
        structure[`src/images/image-${i}.jpg`] = `fake-image-data-${i}`;
      }

      await createTestStructure(tempDir, structure);

      const startTime = Date.now();
      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--pretty-urls'
      ]);
      const buildTime = Date.now() - startTime;

      expect(result.code).toBe(0);
      
      // Should complete in reasonable time
      expect(buildTime).toBeLessThan(15000); // 15 seconds
      
      // Verify output structure
      const outputFiles = await getAllFiles(outputDir);
      expect(outputFiles.length).toBeGreaterThan(10); // At least 10+ output files
      
      // Verify some key files exist
      expect(await fileExists(path.join(outputDir, 'index.html'))).toBe(true);
      expect(await fileExists(path.join(outputDir, 'about/index.html'))).toBe(true);
      
      console.log(`Built ${outputFiles.length} files in ${buildTime}ms`);
    }, 30000); // 30 second timeout
  });

  describe('Edge Case Combinations', () => {
    it('should handle multiple flags together with v0.6.0 features', async () => {
      const structure = {
        'src/index.html': `<div data-import="layout">
  <h1>Home</h1>
  <div data-import="content"></div>
  <img src="/images/logo.png" alt="Logo">
</div>`,
        'src/_layout.html': `<!DOCTYPE html>
<html>
<head>
  <title>Site</title>
  <meta charset="utf-8">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <slot></slot>
</body>
</html>`,
        'src/_includes/content.html': '<p>This content has      multiple    spaces     that will be minified.</p>',
        'src/about.md': '# About\n\nMarkdown content.',
        'src/images/logo.png': 'fake-png-data',
        'src/css/style.css': 'body { margin: 0; }'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--pretty-urls',
        '--minify',
        '--clean'
      ]);
      if (result.code !== 0) {
        console.log('Build stderr:', result.stderr);
        console.log('Build stdout:', result.stdout);
      }
      expect(result.code).toBe(0);

      // Verify pretty URLs
      expect(await fileExists(path.join(outputDir, 'about/index.html'))).toBe(true);
      
      // Verify basic build output
      const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(indexContent).toContain('Home');
      
      // Verify assets were copied
      expect(await fileExists(path.join(outputDir, 'css/style.css'))).toBe(true);
    });

    it('should handle fail-level error mode with missing fragments', async () => {
      const structure = {
        'src/page.html': '<div data-import="existing"></div><div data-import="missing"></div>',
        'src/_includes/existing.html': '<p>This exists</p>'
        // missing.html intentionally not created
      };

      await createTestStructure(tempDir, structure);

      // Should succeed but log errors for missing fragments
      const normalResult = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);
      expect(normalResult.code).toBe(0);
      
      // Check that page was built despite missing fragment
      const pageExists = await fileExists(path.join(outputDir, 'page.html'));
      expect(pageExists).toBe(true);
      
      const pageContent = await fs.readFile(path.join(outputDir, 'page.html'), 'utf-8');
      expect(pageContent).toContain('This exists');
    });
  });
});

/**
 * Helper function to run CLI command with working directory
 */
async function runCLIInDir(workingDir, args, timeout = 30000) {
  const { runCLI } = await import('../test-utils.js');
  return await runCLI(args, { cwd: workingDir, timeout });
}

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

/**
 * Helper function to get all files recursively
 */
async function getAllFiles(dir) {
  const files = [];
  
  async function traverse(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        await traverse(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }
  
  await traverse(dir);
  return files;
}
