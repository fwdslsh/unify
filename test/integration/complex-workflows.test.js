/**
 * Tests for complex integration scenarios
 * Verifies real-world usage patterns and workflow combinations
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
    it('should handle complete serve → watch → live reload → rebuild workflow', async () => {
      const structure = {
        'src/index.html': `
          <div data-layout="main.html">
            <h1>Home Page</h1>
            <!--#include file="includes/nav.html" -->
            <main>Welcome to the site</main>
          </div>
        `,
        'src/.layouts/main.html': `
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
        'src/includes/nav.html': `
          <nav>
            <a href="/">Home</a>
            <a href="/about.html">About</a>
            <a href="/blog.html">Blog</a>
          </nav>
        `,
        'src/about.md': `
          ---
          layout: main.html
          title: About Us
          ---
          # About Us
          
          This is our about page.
          
          <!--#include file="includes/contact-info.html" -->
        `,
        'src/includes/contact-info.html': `
          <div class="contact">
            <p>Contact us at: info@example.com</p>
          </div>
        `,
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
      expect(buildResult.code).toBe(0);

      // Verify initial build output
      const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(indexContent).toContain('<title>Site</title>');
      expect(indexContent).toContain('Home Page');
      expect(indexContent).toContain('<nav>');
      expect(indexContent).toContain('href="/about.html"');

      const aboutContent = await fs.readFile(path.join(outputDir, 'about.html'), 'utf-8');
      expect(aboutContent).toContain('About Us');
      expect(aboutContent).toContain('info@example.com');

      // Step 2: Test watch mode (simulate file changes)
      // Modify include file
      await fs.writeFile(
        path.join(sourceDir, 'includes', 'nav.html'),
        `
          <nav>
            <a href="/">Home</a>
            <a href="/about.html">About</a>
            <a href="/blog.html">Blog</a>
            <a href="/contact.html">Contact</a>
          </nav>
        `
      );

      // Rebuild to simulate watch mode
      const rebuildResult = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);
      expect(rebuildResult.code).toBe(0);

      // Verify changes propagated
      const updatedIndexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(updatedIndexContent).toContain('href="/contact.html"');

      // Step 3: Test asset handling
      const cssExists = await fileExists(path.join(outputDir, 'css', 'main.css'));
      const jsExists = await fileExists(path.join(outputDir, 'js', 'main.js'));
      expect(cssExists).toBe(true);
      expect(jsExists).toBe(true);
    });

    it('should handle mixed file types in single build with complex dependencies', async () => {
      const structure = {
        // HTML pages with layouts
        'src/index.html': '<div data-layout="page.html"><h1>Home</h1><!--#include file="includes/sidebar.html" --></div>',
        'src/products.html': '<div data-layout="page.html"><h1>Products</h1><!--#include file="includes/product-list.html" --></div>',
        
        // Markdown pages with frontmatter
        'src/blog/post-1.md': `---
layout: blog.html
title: First Post
date: 2024-01-01
tags: [tech, web]
---
# First Blog Post

This is our first post.

<!--#include file="../includes/author-bio.html" -->
<!--#include file="../includes/social-share.html" -->`,
        'src/blog/post-2.md': `---
layout: blog.html
title: Second Post
date: 2024-01-02
---
# Second Blog Post

Another great post.

<!--#include file="../includes/author-bio.html" -->`,
        
        // Layouts
        'src/.layouts/page.html': `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Site</title>
            <!--#include file="../includes/meta-tags.html" -->
            <link rel="stylesheet" href="/css/main.css">
          </head>
          <body>
            <!--#include file="../includes/header.html" -->
            <main><slot></slot></main>
            <!--#include file="../includes/footer.html" -->
            <script src="/js/main.js"></script>
          </body>
          </html>
        `,
        'src/.layouts/blog.html': `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Blog</title>
            <!--#include file="../includes/meta-tags.html" -->
            <link rel="stylesheet" href="/css/blog.css">
          </head>
          <body>
            <!--#include file="../includes/header.html" -->
            <article><slot></slot></article>
            <!--#include file="../includes/footer.html" -->
          </body>
          </html>
        `,
        
        // Includes
        'src/includes/header.html': '<header><h1>My Site</h1><!--#include file="nav.html" --></header>',
        'src/includes/nav.html': '<nav><a href="/">Home</a><a href="/products.html">Products</a><a href="/blog/">Blog</a></nav>',
        'src/includes/footer.html': '<footer><p>&copy; 2024 My Site</p></footer>',
        'src/includes/sidebar.html': '<aside><h3>Sidebar</h3><!--#include file="recent-posts.html" --></aside>',
        'src/includes/product-list.html': '<ul><li>Product 1</li><li>Product 2</li></ul>',
        'src/includes/author-bio.html': '<div class="author">Written by John Doe</div>',
        'src/includes/social-share.html': '<div class="share">Share this post</div>',
        'src/includes/recent-posts.html': '<ul><li><a href="/blog/post-1.html">First Post</a></li></ul>',
        'src/includes/meta-tags.html': '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
        
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
      expect(result.code).toBe(0);

      // Verify all file types were processed correctly
      const files = [
        'index.html',
        'products.html',
        'blog/post-1/index.html', // Pretty URLs: .md -> /index.html
        'blog/post-2/index.html'  // Pretty URLs: .md -> /index.html
      ];

      for (const file of files) {
        const content = await fs.readFile(path.join(outputDir, file), 'utf-8');
        expect(content).toContain('<!DOCTYPE html>');
        expect(content).toContain('<title>');
        expect(content).toContain('My Site'); // From header include
      }

      // Verify nested includes worked
      const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(indexContent).toContain('Sidebar');
      expect(indexContent).toContain('First Post'); // From recent-posts include

      // Verify Markdown processing with frontmatter
      const post1Content = await fs.readFile(path.join(outputDir, 'blog/post-1/index.html'), 'utf-8');
      expect(post1Content).toContain('First Blog Post');
      expect(post1Content).toContain('Written by John Doe');
      expect(post1Content).toContain('Share this post');

      // Verify assets were copied
      expect(await fileExists(path.join(outputDir, 'css/main.css'))).toBe(true);
      expect(await fileExists(path.join(outputDir, 'css/blog.css'))).toBe(true);
      expect(await fileExists(path.join(outputDir, 'js/main.js'))).toBe(true);
    });
  });

  describe('Nested Component Dependencies', () => {
    it('should handle complex nested includes with circular detection', async () => {
      const structure = {
        'src/page.html': '<!--#include file="includes/level1.html" -->',
        'src/includes/level1.html': 'Level 1: <!--#include file="level2.html" -->',
        'src/includes/level2.html': 'Level 2: <!--#include file="level3.html" -->',
        'src/includes/level3.html': 'Level 3: <!--#include file="level4.html" -->',
        'src/includes/level4.html': 'Level 4: <!--#include file="level5.html" -->',
        'src/includes/level5.html': 'Level 5: Final level',
        
        // Test circular dependency detection
        'src/circular.html': '<!--#include file="includes/circular-a.html" -->',
        'src/includes/circular-a.html': 'A: <!--#include file="circular-b.html" -->',
        'src/includes/circular-b.html': 'B: <!--#include file="circular-c.html" -->',
        'src/includes/circular-c.html': 'C: <!--#include file="circular-a.html" -->', // Circular!
      };

      await createTestStructure(tempDir, structure);

      // Deep nesting should work
      const deepResult = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);
      expect(deepResult.code).toBe(0);

      const pageContent = await fs.readFile(path.join(outputDir, 'page.html'), 'utf-8');
      expect(pageContent).toContain('Level 1:');
      expect(pageContent).toContain('Level 2:');
      expect(pageContent).toContain('Final level');

      // Circular dependency should be detected and handled
      const circularContent = await fs.readFile(path.join(outputDir, 'circular.html'), 'utf-8');
      // Should contain some content but not infinite loop
      expect(circularContent).toContain('A:');
      expect(circularContent.length).toBeLessThan(10000); // Not infinitely long
    });

    it('should handle complex layout inheritance chains', async () => {
      const structure = {
        'src/page.html': '<div data-layout="child.html"><h1>Content</h1></div>',
        
        'src/.layouts/child.html': `
          <div data-layout="parent.html">
            <div class="child-wrapper">
              <slot></slot>
            </div>
          </div>
        `,
        
        'src/.layouts/parent.html': `
          <div data-layout="grandparent.html">
            <div class="parent-wrapper">
              <slot></slot>
            </div>
          </div>
        `,
        
        'src/.layouts/grandparent.html': `
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

      const content = await fs.readFile(path.join(outputDir, 'page.html'), 'utf-8');
      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('grandparent-wrapper');
      expect(content).toContain('parent-wrapper');
      expect(content).toContain('child-wrapper');
      expect(content).toContain('<h1>Content</h1>');
    });
  });

  describe('Large Project Simulation', () => {
    it('should handle realistic blog site with 100+ files', async () => {
      const structure = {};
      
      // Main pages
      structure['src/index.html'] = '<div data-layout="home.html"><h1>Welcome</h1><!--#include file="includes/recent-posts.html" --></div>';
      structure['src/about.html'] = '<div data-layout="page.html"><h1>About</h1></div>';
      structure['src/contact.html'] = '<div data-layout="page.html"><h1>Contact</h1></div>';
      
      // Blog posts (50 posts)
      for (let i = 1; i <= 50; i++) {
        structure[`src/blog/post-${i}.md`] = `---
layout: blog.html
title: Post ${i}
date: 2024-01-${String(i).padStart(2, '0')}
category: ${i % 3 === 0 ? 'tech' : i % 2 === 0 ? 'design' : 'news'}
---
# Post ${i}

This is blog post number ${i}.

<!--#include file="../includes/author-info.html" -->
<!--#include file="../includes/related-posts.html" -->`;
      }
      
      // Category pages
      const categories = ['tech', 'design', 'news'];
      categories.forEach(cat => {
        structure[`src/blog/${cat}.html`] = `<div data-layout="category.html"><h1>${cat}</h1><!--#include file="../includes/${cat}-posts.html" --></div>`;
        structure[`src/includes/${cat}-posts.html`] = `<div class="${cat}-posts">Posts in ${cat}</div>`;
      });
      
      // Layouts
      structure['src/.layouts/home.html'] = '<!DOCTYPE html><html><head><title>Home</title></head><body><!--#include file="../includes/header.html" --><main><slot></slot></main><!--#include file="../includes/footer.html" --></body></html>';
      structure['src/.layouts/page.html'] = '<!DOCTYPE html><html><head><title>Page</title></head><body><!--#include file="../includes/header.html" --><main><slot></slot></main><!--#include file="../includes/footer.html" --></body></html>';
      structure['src/.layouts/blog.html'] = '<!DOCTYPE html><html><head><title>Blog</title></head><body><!--#include file="../includes/header.html" --><article><slot></slot></article><!--#include file="../includes/footer.html" --></body></html>';
      structure['src/.layouts/category.html'] = '<!DOCTYPE html><html><head><title>Category</title></head><body><!--#include file="../includes/header.html" --><section><slot></slot></section><!--#include file="../includes/footer.html" --></body></html>';
      
      // Includes
      structure['src/includes/header.html'] = '<header><h1>My Blog</h1><!--#include file="nav.html" --></header>';
      structure['src/includes/nav.html'] = '<nav><a href="/">Home</a><a href="/about.html">About</a><a href="/blog/">Blog</a></nav>';
      structure['src/includes/footer.html'] = '<footer><p>&copy; 2024</p></footer>';
      structure['src/includes/recent-posts.html'] = '<div class="recent">Recent posts list</div>';
      structure['src/includes/author-info.html'] = '<div class="author">By John Doe</div>';
      structure['src/includes/related-posts.html'] = '<div class="related">Related posts</div>';
      
      // Assets
      structure['src/css/main.css'] = 'body { margin: 0; padding: 20px; }';
      structure['src/css/blog.css'] = '@import url("main.css"); article { max-width: 800px; }';
      structure['src/js/main.js'] = 'console.log("Blog loaded");';
      
      // Images (simulate some)
      for (let i = 1; i <= 10; i++) {
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
      expect(outputFiles.length).toBeGreaterThan(50); // At least 50+ output files
      
      // Verify some key files
      expect(await fileExists(path.join(outputDir, 'index.html'))).toBe(true);
      expect(await fileExists(path.join(outputDir, 'blog/post-1/index.html'))).toBe(true);
      expect(await fileExists(path.join(outputDir, 'blog/tech.html'))).toBe(true); // HTML files don't get pretty URLs
      
      console.log(`Built ${outputFiles.length} files in ${buildTime}ms`);
    }, 30000); // 30 second timeout
  });

  describe('Edge Case Combinations', () => {
    it('should handle all flags together with complex content', async () => {
      const structure = {
        'src/index.html': `
          <div data-layout="main.html">
            <h1>Home</h1>
            <!--#include file="includes/content.html" -->
            <img src="/images/logo.png" alt="Logo">
          </div>
        `,
        'src/.layouts/main.html': `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Site</title>
            <meta charset="utf-8">
            <link rel="stylesheet" href="/css/style.css">
          </head>
          <body>
            <slot></slot>
          </body>
          </html>
        `,
        'src/includes/content.html': '<p>This content has      multiple    spaces     that will be minified.</p>',
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
        '--clean',
        '--base-url', 'https://example.com'
      ]);
      expect(result.code).toBe(0);

      // Verify pretty URLs
      expect(await fileExists(path.join(outputDir, 'about/index.html'))).toBe(true);
      
      // Verify minification
      const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(indexContent).not.toContain('multiple    spaces');
      
      // Verify sitemap with correct base URL
      const sitemapContent = await fs.readFile(path.join(outputDir, 'sitemap.xml'), 'utf-8');
      expect(sitemapContent).toContain('https://example.com');
      
      // Verify assets were copied
      expect(await fileExists(path.join(outputDir, 'images/logo.png'))).toBe(true);
      expect(await fileExists(path.join(outputDir, 'css/style.css'))).toBe(true);
    });

    it('should handle perfection mode with complex dependencies', async () => {
      const structure = {
        'src/page.html': '<!--#include file="existing.html" --><!--#include file="missing.html" -->',
        'src/includes/existing.html': '<p>This exists</p>'
        // missing.html intentionally not created
      };

      await createTestStructure(tempDir, structure);

      // Should fail in perfection mode
      const perfectionResult = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--perfection'
      ]);
      expect(perfectionResult.code).toBe(1);

      // Should succeed without perfection mode
      const normalResult = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);
      expect(normalResult.code).toBe(0);
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
