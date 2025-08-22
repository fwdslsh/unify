/**
 * HTML Processor Dependency Tracking Tests
 * US-024: Apache SSI Include Processing - Dependency Integration
 * 
 * Tests for dependency tracking integration with SSI includes
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join, resolve } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { HtmlProcessor } from '../../../src/core/html-processor.js';
import { PathValidator } from '../../../src/core/path-validator.js';

describe('HtmlProcessor Dependency Tracking', () => {
  let tempDir;
  let processor;
  let pathValidator;

  beforeEach(() => {
    // Create temporary directory for test files
    tempDir = join(process.cwd(), 'test-temp-deps', Math.random().toString(36));
    mkdirSync(tempDir, { recursive: true });
    
    // Initialize processor and validator
    pathValidator = new PathValidator();
    processor = new HtmlProcessor(pathValidator);
  });

  afterEach(() => {
    // Clean up temporary directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('SSI Dependency Tracking', () => {
    test('should_track_ssi_file_include_dependencies', async () => {
      // Arrange
      const headerContent = '<header>Header</header>';
      const pageContent = `
        <html>
          <body>
            <!--#include file="header.html" -->
            <main>Content</main>
          </body>
        </html>
      `;
      
      writeFileSync(join(tempDir, 'header.html'), headerContent);
      
      // Act
      const result = await processor.processFile(
        join(tempDir, 'page.html'), 
        pageContent, 
        {}, 
        tempDir
      );
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0]).toBe(join(tempDir, 'header.html'));
    });

    test('should_track_ssi_virtual_include_dependencies', async () => {
      // Arrange
      const navContent = '<nav>Navigation</nav>';
      const pageContent = `
        <html>
          <body>
            <!--#include virtual="/components/nav.html" -->
            <main>Content</main>
          </body>
        </html>
      `;
      
      mkdirSync(join(tempDir, 'components'), { recursive: true });
      writeFileSync(join(tempDir, 'components', 'nav.html'), navContent);
      
      // Act
      const result = await processor.processFile(
        join(tempDir, 'page.html'), 
        pageContent, 
        {}, 
        tempDir
      );
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0]).toBe(join(tempDir, 'components', 'nav.html'));
    });

    test('should_track_multiple_ssi_include_dependencies', async () => {
      // Arrange
      const headerContent = '<header>Header</header>';
      const footerContent = '<footer>Footer</footer>';
      const sidebarContent = '<aside>Sidebar</aside>';
      
      const pageContent = `
        <html>
          <body>
            <!--#include file="header.html" -->
            <!--#include virtual="/shared/footer.html" -->
            <!--#include file="sidebar.html" -->
            <main>Content</main>
          </body>
        </html>
      `;
      
      writeFileSync(join(tempDir, 'header.html'), headerContent);
      writeFileSync(join(tempDir, 'sidebar.html'), sidebarContent);
      mkdirSync(join(tempDir, 'shared'), { recursive: true });
      writeFileSync(join(tempDir, 'shared', 'footer.html'), footerContent);
      
      // Act
      const result = await processor.processFile(
        join(tempDir, 'page.html'), 
        pageContent, 
        {}, 
        tempDir
      );
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.dependencies).toHaveLength(3);
      expect(result.dependencies).toContain(join(tempDir, 'header.html'));
      expect(result.dependencies).toContain(join(tempDir, 'shared', 'footer.html'));
      expect(result.dependencies).toContain(join(tempDir, 'sidebar.html'));
    });

    test('should_track_nested_ssi_include_dependencies', async () => {
      // Arrange
      const logoContent = '<img src="/logo.png" alt="Logo">';
      const headerContent = '<header><!--#include file="logo.html" --></header>';
      const pageContent = `
        <html>
          <body>
            <!--#include file="header.html" -->
            <main>Content</main>
          </body>
        </html>
      `;
      
      writeFileSync(join(tempDir, 'logo.html'), logoContent);
      writeFileSync(join(tempDir, 'header.html'), headerContent);
      
      // Act
      const result = await processor.processFile(
        join(tempDir, 'page.html'), 
        pageContent, 
        {}, 
        tempDir
      );
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.dependencies).toHaveLength(2);
      expect(result.dependencies).toContain(join(tempDir, 'header.html'));
      expect(result.dependencies).toContain(join(tempDir, 'logo.html'));
    });

    test('should_not_track_dependencies_for_missing_includes', async () => {
      // Arrange
      const pageContent = `
        <html>
          <body>
            <!--#include file="header.html" -->
            <!--#include file="missing.html" -->
            <main>Content</main>
          </body>
        </html>
      `;
      
      writeFileSync(join(tempDir, 'header.html'), '<header>Header</header>');
      
      // Act
      const result = await processor.processFile(
        join(tempDir, 'page.html'), 
        pageContent, 
        {}, 
        tempDir
      );
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.dependencies).toHaveLength(1); // Only the found file
      expect(result.dependencies[0]).toBe(join(tempDir, 'header.html'));
    });

    test('should_track_markdown_include_dependencies', async () => {
      // Arrange
      const markdownContent = '# Title\n\nContent here.';
      const pageContent = `
        <html>
          <body>
            <!--#include file="content.md" -->
          </body>
        </html>
      `;
      
      writeFileSync(join(tempDir, 'content.md'), markdownContent);
      
      // Act
      const result = await processor.processFile(
        join(tempDir, 'page.html'), 
        pageContent, 
        {}, 
        tempDir
      );
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0]).toBe(join(tempDir, 'content.md'));
    });
  });

  describe('Integration with Build System', () => {
    test('should_provide_dependencies_for_file_watcher_integration', async () => {
      // Arrange
      const headerContent = '<header>Version 1</header>';
      const pageContent = '<!--#include file="header.html" -->';
      
      writeFileSync(join(tempDir, 'header.html'), headerContent);
      
      // Act - First build
      const result1 = await processor.processFile(
        join(tempDir, 'page.html'), 
        pageContent, 
        {}, 
        tempDir
      );
      
      // Simulate file change
      const updatedHeaderContent = '<header>Version 2</header>';
      writeFileSync(join(tempDir, 'header.html'), updatedHeaderContent);
      
      // Clear processor cache to simulate file watcher restart
      processor.clearCache();
      
      // Act - Second build after dependency change
      const result2 = await processor.processFile(
        join(tempDir, 'page.html'), 
        pageContent, 
        {}, 
        tempDir
      );
      
      // Assert
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      
      // Same dependencies tracked
      expect(result1.dependencies).toEqual(result2.dependencies);
      expect(result1.dependencies[0]).toBe(join(tempDir, 'header.html'));
      
      // Different content due to file change
      expect(result1.html).toContain('Version 1');
      expect(result2.html).toContain('Version 2');
    });

    test('should_handle_complex_dependency_chains_for_build_optimization', async () => {
      // Arrange - Create a complex dependency chain
      const config = '<script>window.config = {}</script>';
      const analytics = '<!--#include file="config.html" --><script>analytics()</script>';
      const footer = '<!--#include file="analytics.html" --><footer>Footer</footer>';
      const layout = '<!--#include file="footer.html" -->';
      const page = '<!--#include file="layout.html" --><main>Page</main>';
      
      writeFileSync(join(tempDir, 'config.html'), config);
      writeFileSync(join(tempDir, 'analytics.html'), analytics);
      writeFileSync(join(tempDir, 'footer.html'), footer);
      writeFileSync(join(tempDir, 'layout.html'), layout);
      
      // Act
      const result = await processor.processFile(
        join(tempDir, 'page.html'), 
        page, 
        {}, 
        tempDir
      );
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.dependencies).toHaveLength(4); // All files in the chain
      expect(result.dependencies).toContain(join(tempDir, 'config.html'));
      expect(result.dependencies).toContain(join(tempDir, 'analytics.html'));
      expect(result.dependencies).toContain(join(tempDir, 'footer.html'));
      expect(result.dependencies).toContain(join(tempDir, 'layout.html'));
      
      // Verify final output contains all parts
      expect(result.html).toContain('window.config = {}');
      expect(result.html).toContain('analytics()');
      expect(result.html).toContain('<footer>Footer</footer>');
      expect(result.html).toContain('<main>Page</main>');
    });
  });
});