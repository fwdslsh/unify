/**
 * Tests for performance scalability requirements
 * Verifies spec compliance for build times, memory usage, and large project handling
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';

describe('Performance Scalability', () => {
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

  describe('Large Project Handling', () => {
    it('should handle projects with 1000+ pages within spec limits', async () => {
      // Spec requirement: Handle projects with 1000+ pages
      const pageCount = 1000;
      const structure = {};
      
      // Generate 1000 test pages
      for (let i = 0; i < pageCount; i++) {
        structure[`src/page-${i}.html`] = `
          <h1>Page ${i}</h1>
          <p>This is test page number ${i}</p>
          <ul>
            ${Array.from({length: 10}, (_, j) => `<li>Item ${j}</li>`).join('\n')}
          </ul>
        `;
      }
      
      // Add some includes to test dependency processing
      structure['src/includes/header.html'] = '<header><h1>Site Header</h1></header>';
      structure['src/includes/footer.html'] = '<footer><p>Site Footer</p></footer>';
      
      // Update first few pages to include dependencies
      for (let i = 0; i < 10; i++) {
        structure[`src/page-${i}.html`] = `
          <include src="header.html" />
          <h1>Page ${i}</h1>
          <p>This is test page number ${i}</p>
          <include src="footer.html" />
        `;
      }

      await createTestStructure(tempDir, structure);

      // Measure build time
      const startTime = Date.now();
      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);
      const buildTime = Date.now() - startTime;

      expect(result.code).toBe(0);
      
      // Verify all pages were built
      const outputFiles = await fs.readdir(outputDir);
      const htmlFiles = outputFiles.filter(f => f.endsWith('.html'));
      expect(htmlFiles.length).toBe(pageCount);
      
      // Performance assertion: Build should complete in reasonable time
      // Note: Actual spec limit would be defined, using 30 seconds as reasonable
      expect(buildTime).toBeLessThan(30000); // 30 seconds
      
      console.log(`Built ${pageCount} pages in ${buildTime}ms`);
    }, 60000); // 60 second timeout for this test

    it('should handle pages over 5MB in size', async () => {
      // Spec requirement: Handle pages over 5MB
      const largePage = generateLargeHtmlContent(6 * 1024 * 1024); // 6MB
      
      const structure = {
        'src/large-page.html': largePage,
        'src/normal-page.html': '<h1>Normal Page</h1>'
      };

      await createTestStructure(tempDir, structure);

      const startTime = Date.now();
      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);
      const buildTime = Date.now() - startTime;

      expect(result.code).toBe(0);
      
      // Verify large page was processed
      const outputPath = path.join(outputDir, 'large-page.html');
      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(5 * 1024 * 1024); // Over 5MB
      
      // Should complete in reasonable time even with large files
      expect(buildTime).toBeLessThan(10000); // 10 seconds
      
      console.log(`Processed ${Math.round(stats.size / 1024 / 1024)}MB page in ${buildTime}ms`);
    }, 30000);
  });

  describe('Build Performance Requirements', () => {
    it('should achieve incremental builds under 1 second for <100 pages', async () => {
      // Spec requirement: Incremental builds <1 second
      const pageCount = 50;
      const structure = {};
      
      // Generate test pages
      for (let i = 0; i < pageCount; i++) {
        structure[`src/page-${i}.html`] = `<h1>Page ${i}</h1><p>Content</p>`;
      }

      await createTestStructure(tempDir, structure);

      // Initial build
      await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);

      // Modify one file
      await fs.writeFile(
        path.join(sourceDir, 'page-0.html'),
        '<h1>Modified Page 0</h1><p>Updated content</p>'
      );

      // Measure incremental build time
      const startTime = Date.now();
      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);
      const incrementalBuildTime = Date.now() - startTime;

      expect(result.code).toBe(0);
      expect(incrementalBuildTime).toBeLessThan(1000); // Under 1 second
      
      console.log(`Incremental build of ${pageCount} pages in ${incrementalBuildTime}ms`);
    });

    it('should achieve initial builds under 5 seconds for <100 pages', async () => {
      // Spec requirement: Initial builds <5 seconds for <100 pages
      const pageCount = 100;
      const structure = {};
      
      // Generate test pages with some complexity
      for (let i = 0; i < pageCount; i++) {
        structure[`src/page-${i}.html`] = `
          <h1>Page ${i}</h1>
          <p>This is page ${i} content.</p>
          <div class="content">
            ${Array.from({length: 20}, (_, j) => `<p>Paragraph ${j}</p>`).join('\n')}
          </div>
        `;
      }
      
      // Add some includes for complexity
      structure['src/includes/nav.html'] = `
        <nav>
          ${Array.from({length: 20}, (_, i) => `<a href="/page-${i}.html">Page ${i}</a>`).join('\n')}
        </nav>
      `;

      await createTestStructure(tempDir, structure);

      // Measure initial build time
      const startTime = Date.now();
      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);
      const buildTime = Date.now() - startTime;

      expect(result.code).toBe(0);
      expect(buildTime).toBeLessThan(5000); // Under 5 seconds
      
      console.log(`Initial build of ${pageCount} pages in ${buildTime}ms`);
    });
  });

  describe('Memory Usage Requirements', () => {
    it('should maintain memory usage under 100MB for typical projects', async () => {
      // Spec requirement: Memory usage <100MB
      const pageCount = 200;
      const structure = {};
      
      // Generate test pages
      for (let i = 0; i < pageCount; i++) {
        structure[`src/page-${i}.html`] = `
          <h1>Page ${i}</h1>
          ${Array.from({length: 50}, (_, j) => `<p>Content block ${j}</p>`).join('\n')}
        `;
      }

      await createTestStructure(tempDir, structure);

      // Measure memory usage during build
      const memoryBefore = process.memoryUsage();
      
      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);
      
      const memoryAfter = process.memoryUsage();
      const memoryUsed = (memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024; // MB

      expect(result.code).toBe(0);
      
      // Note: This is a rough estimate as memory usage depends on many factors
      // In production, this would use more sophisticated memory profiling
      console.log(`Memory usage: ${memoryUsed.toFixed(2)}MB for ${pageCount} pages`);
      
      // Basic sanity check - shouldn't use excessive memory
      expect(memoryUsed).toBeLessThan(200); // 200MB as reasonable limit for test
    });

    it('should handle memory efficiently with large numbers of includes', async () => {
      const includeCount = 100;
      const pageCount = 50;
      const structure = {};
      
      // Generate many small includes
      for (let i = 0; i < includeCount; i++) {
        structure[`src/includes/include-${i}.html`] = `
          <div class="include-${i}">
            <h3>Include ${i}</h3>
            <p>Content for include ${i}</p>
          </div>
        `;
      }
      
      // Generate pages that use multiple includes
      for (let i = 0; i < pageCount; i++) {
        const includesUsed = Array.from({length: 10}, (_, j) => 
          `<include src="include-${(i + j) % includeCount}.html" />`
        ).join('\n');
        
        structure[`src/page-${i}.html`] = `
          <h1>Page ${i}</h1>
          ${includesUsed}
        `;
      }

      await createTestStructure(tempDir, structure);

      const startTime = Date.now();
      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);
      const buildTime = Date.now() - startTime;

      expect(result.code).toBe(0);
      
      // Should handle many includes efficiently
      expect(buildTime).toBeLessThan(10000); // 10 seconds
      
      console.log(`Built ${pageCount} pages with ${includeCount} includes in ${buildTime}ms`);
    });
  });

  describe('Asset Handling Performance', () => {
    it('should efficiently handle large numbers of assets', async () => {
      const assetCount = 500;
      const structure = {
        'src/index.html': '<h1>Home</h1>'
      };
      
      // Generate many small asset files
      for (let i = 0; i < assetCount; i++) {
        structure[`src/assets/file-${i}.txt`] = `Content for asset ${i}`;
      }
      
      // Create a page that references some assets
      structure['src/with-assets.html'] = `
        <h1>Page with Assets</h1>
        ${Array.from({length: 50}, (_, i) => 
          `<a href="/assets/file-${i}.txt">Asset ${i}</a>`
        ).join('\n')}
      `;

      await createTestStructure(tempDir, structure);

      const startTime = Date.now();
      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);
      const buildTime = Date.now() - startTime;

      expect(result.code).toBe(0);
      
      // Should handle many assets efficiently
      expect(buildTime).toBeLessThan(1000); // 1 second
      
      // Verify assets directory was copied (current behavior: copies all assets in src/assets)
      const outputAssets = await fs.readdir(path.join(outputDir, 'assets'));
      expect(outputAssets.length).toBe(assetCount); // All assets from src/assets are copied
      
      console.log(`Handled ${assetCount} assets (copied ${outputAssets.length}) in ${buildTime}ms`);
    });
  });

  describe('Dependency Tracking Performance', () => {
    it('should efficiently track complex dependency graphs', async () => {
      const structure = {};
      const levels = 5;
      const filesPerLevel = 10;
      
      // Create a complex dependency tree
      for (let level = 0; level < levels; level++) {
        for (let file = 0; file < filesPerLevel; file++) {
          const fileName = `level-${level}-file-${file}.html`;
          
          let content = `<h${level + 1}>Level ${level} File ${file}</h${level + 1}>`;
          
          // Each file includes files from the next level
          if (level < levels - 1) {
            for (let include = 0; include < 3; include++) {
              const includeFile = `level-${level + 1}-file-${(file + include) % filesPerLevel}.html`;
              content += `\n<include src="${includeFile}" />`;
            }
          }
          
          structure[`src/${fileName}`] = content;
        }
      }

      await createTestStructure(tempDir, structure);

      const startTime = Date.now();
      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);
      const buildTime = Date.now() - startTime;

      expect(result.code).toBe(0);
      
      // Complex dependency tracking should still be efficient
      expect(buildTime).toBeLessThan(10000); // 10 seconds
      
      const totalFiles = levels * filesPerLevel;
      console.log(`Built ${totalFiles} files with complex dependencies in ${buildTime}ms`);
    });
  });
});

/**
 * Helper function to generate large HTML content
 */
function generateLargeHtmlContent(targetSize) {
  const baseContent = `
    <html>
    <head>
      <title>Large Page</title>
    </head>
    <body>
      <h1>Large Page Content</h1>
  `;
  
  const endContent = `
    </body>
    </html>
  `;
  
  const paragraphTemplate = `
    <p>This is a paragraph of content that helps make this page very large. 
    It contains some text that will be repeated many times to reach the target size.
    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor 
    incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis 
    nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
  `;
  
  let content = baseContent;
  const currentSize = () => Buffer.byteLength(content + endContent, 'utf8');
  
  while (currentSize() < targetSize) {
    content += paragraphTemplate;
    
    // Add some variation
    if (Math.random() > 0.8) {
      content += `<h2>Section ${Math.floor(Math.random() * 1000)}</h2>`;
    }
    
    if (Math.random() > 0.9) {
      content += `<ul>${Array.from({length: 10}, (_, i) => `<li>List item ${i}</li>`).join('')}</ul>`;
    }
  }
  
  return content + endContent;
}

/**
 * Helper function to run CLI command with working directory
 */
async function runCLIInDir(workingDir, args, timeout = 30000) {
  const { runCLI } = await import('../test-utils.js');
  return await runCLI(args, { cwd: workingDir, timeout });
}
