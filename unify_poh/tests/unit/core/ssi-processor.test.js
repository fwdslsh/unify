/**
 * SSI Processor Tests
 * US-024: Apache SSI Include Processing (Legacy Support)
 * 
 * Test-Driven Development approach for SSI include processing
 * Following Red-Green-Refactor methodology
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join, resolve } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { SSIProcessor } from '../../../src/core/ssi-processor.js';

describe('SSIProcessor', () => {
  let tempDir;
  let processor;

  beforeEach(() => {
    // Create temporary directory for test files
    tempDir = join(process.cwd(), 'test-temp-ssi', Math.random().toString(36));
    mkdirSync(tempDir, { recursive: true });
    
    // Initialize processor with temp directory as source root
    processor = new SSIProcessor(tempDir);
  });

  afterEach(() => {
    // Clean up temporary directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Basic SSI Include Functionality', () => {
    test('should_process_file_include_directive_when_referenced_file_exists', async () => {
      // Arrange
      const headerContent = '<header><h1>Site Header</h1></header>';
      const pageContent = 'Before include\n<!--#include file="header.html" -->\nAfter include';
      
      writeFileSync(join(tempDir, 'header.html'), headerContent);
      writeFileSync(join(tempDir, 'page.html'), pageContent);
      
      // Act
      const result = await processor.processIncludes(pageContent, join(tempDir, 'page.html'));
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.content).toContain(headerContent);
      expect(result.content).not.toContain('<!--#include file="header.html" -->');
      expect(result.content).toEqual(`Before include\n${headerContent}\nAfter include`);
    });

    test('should_process_virtual_include_directive_when_referenced_file_exists', async () => {
      // Arrange
      const navContent = '<nav><ul><li>Home</li><li>About</li></ul></nav>';
      const pageContent = 'Content start\n<!--#include virtual="/components/nav.html" -->\nContent end';
      
      mkdirSync(join(tempDir, 'components'), { recursive: true });
      writeFileSync(join(tempDir, 'components', 'nav.html'), navContent);
      writeFileSync(join(tempDir, 'page.html'), pageContent);
      
      // Act
      const result = await processor.processIncludes(pageContent, join(tempDir, 'page.html'));
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.content).toContain(navContent);
      expect(result.content).not.toContain('<!--#include virtual="/components/nav.html" -->');
      expect(result.content).toEqual(`Content start\n${navContent}\nContent end`);
    });

    test('should_process_multiple_includes_in_single_file_when_all_exist', async () => {
      // Arrange
      const headerContent = '<header>Header</header>';
      const footerContent = '<footer>Footer</footer>';
      const pageContent = `
        <!--#include file="header.html" -->
        <main>Page content</main>
        <!--#include virtual="/shared/footer.html" -->
      `.trim();
      
      writeFileSync(join(tempDir, 'header.html'), headerContent);
      mkdirSync(join(tempDir, 'shared'), { recursive: true });
      writeFileSync(join(tempDir, 'shared', 'footer.html'), footerContent);
      
      // Act
      const result = await processor.processIncludes(pageContent, join(tempDir, 'page.html'));
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.content).toContain(headerContent);
      expect(result.content).toContain(footerContent);
      expect(result.content).toContain('<main>Page content</main>');
      expect(result.includesProcessed).toBe(2);
    });
  });

  describe('Path Resolution', () => {
    test('should_resolve_file_include_relative_to_current_file_when_in_subdirectory', async () => {
      // Arrange
      const sharedContent = '<div>Shared content</div>';
      const pageContent = '<!--#include file="../shared/common.html" -->';
      
      mkdirSync(join(tempDir, 'pages'), { recursive: true });
      mkdirSync(join(tempDir, 'shared'), { recursive: true });
      writeFileSync(join(tempDir, 'shared', 'common.html'), sharedContent);
      
      // Act
      const result = await processor.processIncludes(pageContent, join(tempDir, 'pages', 'about.html'));
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.content).toBe(sharedContent);
    });

    test('should_resolve_virtual_include_from_source_root_when_absolute_path', async () => {
      // Arrange
      const layoutContent = '<div class="layout">Content</div>';
      const pageContent = '<!--#include virtual="/layouts/base.html" -->';
      
      mkdirSync(join(tempDir, 'layouts'), { recursive: true });
      mkdirSync(join(tempDir, 'deep', 'nested'), { recursive: true });
      writeFileSync(join(tempDir, 'layouts', 'base.html'), layoutContent);
      
      // Act - Process from deeply nested file
      const result = await processor.processIncludes(pageContent, join(tempDir, 'deep', 'nested', 'page.html'));
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.content).toBe(layoutContent);
    });

    test('should_resolve_file_include_in_same_directory_when_no_path_prefix', async () => {
      // Arrange
      const sidebarContent = '<aside>Sidebar</aside>';
      const pageContent = '<!--#include file="sidebar.html" -->';
      
      mkdirSync(join(tempDir, 'blog'), { recursive: true });
      writeFileSync(join(tempDir, 'blog', 'sidebar.html'), sidebarContent);
      
      // Act
      const result = await processor.processIncludes(pageContent, join(tempDir, 'blog', 'post.html'));
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.content).toBe(sidebarContent);
    });
  });

  describe('Markdown Include Processing', () => {
    test('should_process_markdown_file_include_and_convert_to_html', async () => {
      // Arrange
      const markdownContent = '# Header\n\nThis is **bold** text.';
      const expectedHtml = '<h1 id="header">Header</h1>\n<p>This is <strong>bold</strong> text.</p>';
      const pageContent = 'Start\n<!--#include file="content.md" -->\nEnd';
      
      writeFileSync(join(tempDir, 'content.md'), markdownContent);
      
      // Act
      const result = await processor.processIncludes(pageContent, join(tempDir, 'page.html'));
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.content).toContain('<h1');
      expect(result.content).toContain('<strong>bold</strong>');
      expect(result.content).not.toContain('**bold**');
    });

    test('should_process_markdown_virtual_include_and_exclude_frontmatter', async () => {
      // Arrange
      const markdownWithFrontmatter = `---
title: Test Page
description: A test page
---
# Content

This is the actual content.`;
      const pageContent = '<!--#include virtual="/docs/api.md" -->';
      
      mkdirSync(join(tempDir, 'docs'), { recursive: true });
      writeFileSync(join(tempDir, 'docs', 'api.md'), markdownWithFrontmatter);
      
      // Act
      const result = await processor.processIncludes(pageContent, join(tempDir, 'page.html'));
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.content).toContain('<h1');
      expect(result.content).toContain('This is the actual content.');
      expect(result.content).not.toContain('title: Test Page');
      expect(result.content).not.toContain('---');
    });

    test('should_handle_nested_markdown_includes_recursively', async () => {
      // Arrange
      const intro = '## Introduction\nWelcome to the docs.';
      const section1 = '### Section 1\n<!--#include file="subsection.md" -->';
      const subsection = '#### Subsection\nDetailed information.';
      const main = '# Main\n<!--#include file="intro.md" -->\n<!--#include file="section1.md" -->';
      
      writeFileSync(join(tempDir, 'intro.md'), intro);
      writeFileSync(join(tempDir, 'section1.md'), section1);
      writeFileSync(join(tempDir, 'subsection.md'), subsection);
      
      // Act
      const result = await processor.processIncludes(main, join(tempDir, 'main.md'));
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.content).toContain('<h1');
      expect(result.content).toContain('<h2');
      expect(result.content).toContain('<h3');
      expect(result.content).toContain('<h4');
      expect(result.content).toContain('Welcome to the docs.');
      expect(result.content).toContain('Detailed information.');
    });
  });

  describe('Error Handling', () => {
    test('should_generate_warning_and_keep_directive_when_file_include_missing', async () => {
      // Arrange
      const pageContent = 'Before\n<!--#include file="nonexistent.html" -->\nAfter';
      
      // Act
      const result = await processor.processIncludes(pageContent, join(tempDir, 'page.html'));
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.content).toBe(pageContent); // Original content unchanged
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('File not found');
      expect(result.warnings[0]).toContain('nonexistent.html');
    });

    test('should_generate_warning_and_keep_directive_when_virtual_include_missing', async () => {
      // Arrange
      const pageContent = 'Content\n<!--#include virtual="/missing/file.html" -->\nMore content';
      
      // Act
      const result = await processor.processIncludes(pageContent, join(tempDir, 'page.html'));
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.content).toBe(pageContent);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('File not found');
      expect(result.warnings[0]).toContain('/missing/file.html');
    });

    test('should_ignore_malformed_include_directive_without_error', async () => {
      // Arrange
      const pageContent = `
        Valid content
        <!--#include file= -->
        <!--#include -->
        <!--#include file="valid.html" -->
        More content
      `;
      const validContent = '<p>Valid include</p>';
      writeFileSync(join(tempDir, 'valid.html'), validContent);
      
      // Act
      const result = await processor.processIncludes(pageContent, join(tempDir, 'page.html'));
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.content).toContain(validContent);
      expect(result.content).toContain('<!--#include file= -->'); // Malformed directive preserved
      expect(result.content).toContain('<!--#include -->'); // Malformed directive preserved
      expect(result.includesProcessed).toBe(1);
    });
  });

  describe('Security and Path Traversal', () => {
    test('should_reject_file_include_with_path_traversal_attempt', async () => {
      // Arrange
      const pageContent = '<!--#include file="../../etc/passwd" -->';
      
      // Act
      const result = await processor.processIncludes(pageContent, join(tempDir, 'page.html'));
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.content).toBe(pageContent); // Original content unchanged
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Path traversal');
    });

    test('should_reject_virtual_include_with_path_traversal_attempt', async () => {
      // Arrange
      const pageContent = '<!--#include virtual="../../../secret.txt" -->';
      
      // Act
      const result = await processor.processIncludes(pageContent, join(tempDir, 'page.html'));
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.content).toBe(pageContent);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Path traversal');
    });

    test('should_reject_absolute_path_outside_source_root', async () => {
      // Arrange
      const pageContent = '<!--#include file="/etc/hosts" -->';
      
      // Act
      const result = await processor.processIncludes(pageContent, join(tempDir, 'page.html'));
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.content).toBe(pageContent);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('outside source root');
    });
  });

  describe('Circular Dependency Detection', () => {
    test('should_detect_direct_circular_include_and_prevent_infinite_loop', async () => {
      // Arrange - A includes B, B includes A
      const fileA = '<!--#include file="fileB.html" -->';
      const fileB = '<!--#include file="fileA.html" -->';
      
      writeFileSync(join(tempDir, 'fileA.html'), fileA);
      writeFileSync(join(tempDir, 'fileB.html'), fileB);
      
      // Act
      const result = await processor.processIncludes(fileA, join(tempDir, 'fileA.html'));
      
      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Circular dependency');
      expect(result.error).toContain('fileA.html');
      expect(result.error).toContain('fileB.html');
    });

    test('should_detect_indirect_circular_include_with_full_path', async () => {
      // Arrange - A includes B, B includes C, C includes A
      const fileA = '<!--#include file="fileB.html" -->';
      const fileB = '<!--#include file="fileC.html" -->';
      const fileC = '<!--#include file="fileA.html" -->';
      
      writeFileSync(join(tempDir, 'fileA.html'), fileA);
      writeFileSync(join(tempDir, 'fileB.html'), fileB);
      writeFileSync(join(tempDir, 'fileC.html'), fileC);
      
      // Act
      const result = await processor.processIncludes(fileA, join(tempDir, 'fileA.html'));
      
      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Circular dependency');
      expect(result.error).toContain('fileA.html → fileB.html → fileC.html → fileA.html');
    });

    test('should_stop_at_maximum_depth_limit_and_generate_error', async () => {
      // Arrange - Create deep nesting beyond limit
      const maxDepth = 5; // Set low limit for testing
      processor = new SSIProcessor(tempDir, { maxDepth });
      
      // Create chain: level1 -> level2 -> level3 -> ... -> level6
      for (let i = 1; i <= 6; i++) {
        const nextLevel = i < 6 ? `<!--#include file="level${i + 1}.html" -->` : 'Final content';
        writeFileSync(join(tempDir, `level${i}.html`), nextLevel);
      }
      
      // Act
      const result = await processor.processIncludes('<!--#include file="level1.html" -->', join(tempDir, 'main.html'));
      
      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum include depth');
      expect(result.error).toContain(maxDepth.toString());
    });
  });

  describe('Integration Points', () => {
    test('should_return_dependencies_for_tracking_system', async () => {
      // Arrange
      const headerContent = '<header>Header</header>';
      const pageContent = '<!--#include file="header.html" -->\n<!--#include virtual="/shared/footer.html" -->';
      
      writeFileSync(join(tempDir, 'header.html'), headerContent);
      mkdirSync(join(tempDir, 'shared'), { recursive: true });
      writeFileSync(join(tempDir, 'shared', 'footer.html'), '<footer>Footer</footer>');
      
      // Act
      const result = await processor.processIncludes(pageContent, join(tempDir, 'page.html'));
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.dependencies).toHaveLength(2);
      expect(result.dependencies).toContain(join(tempDir, 'header.html'));
      expect(result.dependencies).toContain(join(tempDir, 'shared', 'footer.html'));
    });

    test('should_provide_processing_statistics_for_monitoring', async () => {
      // Arrange
      const pageContent = `
        <!--#include file="part1.html" -->
        <!--#include file="part2.html" -->
        <!--#include file="missing.html" -->
      `;
      
      writeFileSync(join(tempDir, 'part1.html'), 'Part 1');
      writeFileSync(join(tempDir, 'part2.html'), 'Part 2');
      
      // Act
      const result = await processor.processIncludes(pageContent, join(tempDir, 'page.html'));
      
      // Assert
      expect(result.statistics).toBeDefined();
      expect(result.statistics.totalDirectives).toBe(3);
      expect(result.statistics.successfulIncludes).toBe(2);
      expect(result.statistics.failedIncludes).toBe(1);
      expect(result.statistics.processingTime).toBeGreaterThan(0);
    });
  });

  describe('Directive Variations', () => {
    test('should_handle_case_insensitive_directive_keywords', async () => {
      // Arrange
      const testContent = '<div>Test content</div>';
      const pageContent = `
        <!--#INCLUDE file="test1.html" -->
        <!--#Include File="test2.html" -->
        <!--#include VIRTUAL="test3.html" -->
      `;
      
      writeFileSync(join(tempDir, 'test1.html'), testContent);
      writeFileSync(join(tempDir, 'test2.html'), testContent);
      writeFileSync(join(tempDir, 'test3.html'), testContent);
      
      // Act
      const result = await processor.processIncludes(pageContent, join(tempDir, 'page.html'));
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.includesProcessed).toBe(3);
      expect((result.content.match(new RegExp(testContent, 'g')) || []).length).toBe(3);
    });

    test('should_handle_extra_whitespace_in_directives', async () => {
      // Arrange
      const testContent = '<p>Content</p>';
      const pageContent = `
        <!--#   include    file  =  "test1.html"   -->
        <!--# include virtual="/test2.html" -->
      `;
      
      writeFileSync(join(tempDir, 'test1.html'), testContent);
      writeFileSync(join(tempDir, 'test2.html'), testContent);
      
      // Act
      const result = await processor.processIncludes(pageContent, join(tempDir, 'page.html'));
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.includesProcessed).toBe(2);
    });

    test('should_handle_single_and_double_quotes_in_paths', async () => {
      // Arrange
      const testContent = '<span>Test</span>';
      const pageContent = `
        <!--#include file="test1.html" -->
        <!--#include file='test2.html' -->
        <!--#include virtual="/test3.html" -->
        <!--#include virtual='/test4.html' -->
      `;
      
      writeFileSync(join(tempDir, 'test1.html'), testContent);
      writeFileSync(join(tempDir, 'test2.html'), testContent);
      writeFileSync(join(tempDir, 'test3.html'), testContent);
      writeFileSync(join(tempDir, 'test4.html'), testContent);
      
      // Act
      const result = await processor.processIncludes(pageContent, join(tempDir, 'page.html'));
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.includesProcessed).toBe(4);
    });
  });

  describe('Performance and Edge Cases', () => {
    test('should_handle_empty_include_file_without_error', async () => {
      // Arrange
      const pageContent = 'Before\n<!--#include file="empty.html" -->\nAfter';
      writeFileSync(join(tempDir, 'empty.html'), ''); // Empty file
      
      // Act
      const result = await processor.processIncludes(pageContent, join(tempDir, 'page.html'));
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.content).toBe('Before\n\nAfter');
      expect(result.includesProcessed).toBe(1);
    });

    test('should_handle_large_include_file_efficiently', async () => {
      // Arrange
      const largeContent = '<div>' + 'x'.repeat(100000) + '</div>'; // 100KB content
      const pageContent = '<!--#include file="large.html" -->';
      writeFileSync(join(tempDir, 'large.html'), largeContent);
      
      // Act
      const startTime = Date.now();
      const result = await processor.processIncludes(pageContent, join(tempDir, 'page.html'));
      const processingTime = Date.now() - startTime;
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.content).toBe(largeContent);
      expect(processingTime).toBeLessThan(1000); // Should process in under 1 second
    });

    test('should_handle_multiple_includes_of_same_file_efficiently', async () => {
      // Arrange
      const sharedContent = '<div>Shared</div>';
      const pageContent = `
        <!--#include file="shared.html" -->
        Some content
        <!--#include file="shared.html" -->
        More content
        <!--#include file="shared.html" -->
      `;
      writeFileSync(join(tempDir, 'shared.html'), sharedContent);
      
      // Act
      const result = await processor.processIncludes(pageContent, join(tempDir, 'page.html'));
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.includesProcessed).toBe(3);
      expect((result.content.match(/<div>Shared<\/div>/g) || []).length).toBe(3);
      expect(result.statistics.cacheHits).toBeGreaterThan(0); // Should use cache for repeated includes
    });
  });
});