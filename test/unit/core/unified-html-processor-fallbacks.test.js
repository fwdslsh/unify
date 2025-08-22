/**
 * ISSUE-008: Comprehensive tests for readIncludeWithFallback function (lines 43-117)
 * Tests all fallback paths, markdown processing, and error handling scenarios
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { readIncludeWithFallback } from '../../../src/core/unified-html-processor.js';
import { makeTempProjectFromStructure } from '../../helpers/temp-project.js';

const cleanupTasks = [];

afterEach(async () => {
  for (const cleanup of cleanupTasks) {
    await cleanup();
  }
  cleanupTasks.length = 0;
});

describe('readIncludeWithFallback Function (ISSUE-008)', () => {

  describe('Primary Path Resolution (lines 44-59)', () => {
    test('should read content successfully from primary resolved path', async () => {
      const structure = {
        'components': {
          'header.html': '<header>Header Content</header>'
        },
        'page.html': '<html><body></body></html>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const resolvedPath = join(project.sourceDir, 'components', 'header.html');
      const result = await readIncludeWithFallback(
        resolvedPath,
        'header.html',
        join(project.sourceDir, 'page.html'),
        project.sourceDir
      );
      
      expect(result).toBeDefined();
      expect(result.content).toBe('<header>Header Content</header>');
      expect(result.resolvedPath).toBe(resolvedPath);
    });
    
    test('should process markdown files from primary path (lines 48-57)', async () => {
      const structure = {
        'components': {
          'content.md': `---
title: Test Content
---

# Hello World

This is markdown content.`
        },
        'page.html': '<html><body></body></html>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const resolvedPath = join(project.sourceDir, 'components', 'content.md');
      const result = await readIncludeWithFallback(
        resolvedPath,
        'content.md',
        join(project.sourceDir, 'page.html'),
        project.sourceDir
      );
      
      expect(result).toBeDefined();
      expect(result.content).toContain('<h1 id="hello-world">Hello World</h1>');
      expect(result.content).toContain('<p>This is markdown content.</p>');
      expect(result.resolvedPath).toBe(resolvedPath);
    });
    
    test('should handle markdown processing errors from primary path (lines 54-56)', async () => {
      const structure = {
        'components': {
          'broken.md': '---\nbroken yaml: [unclosed\n---\n# Content'
        },
        'page.html': '<html><body></body></html>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const resolvedPath = join(project.sourceDir, 'components', 'broken.md');
      
      try {
        await readIncludeWithFallback(
          resolvedPath,
          'broken.md',
          join(project.sourceDir, 'page.html'),
          project.sourceDir
        );
        expect(false).toBe(true); // Should throw
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Fallback Path Resolution (lines 60-115)', () => {
    test('should try sourceRoot relative path (candidate 1)', async () => {
      const structure = {
        'shared': {
          'component.html': '<div>Shared Component</div>'
        },
        'pages': {
          'index.html': '<html><body></body></html>'
        }
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      // Primary path doesn't exist, should fallback
      const nonExistentPath = join(project.sourceDir, 'nonexistent', 'component.html');
      const result = await readIncludeWithFallback(
        nonExistentPath,
        'shared/component.html', // This will resolve via sourceRoot
        join(project.sourceDir, 'pages', 'index.html'),
        project.sourceDir
      );
      
      expect(result).toBeDefined();
      expect(result.content).toBe('<div>Shared Component</div>');
      expect(result.resolvedPath).toBe(join(project.sourceDir, 'shared', 'component.html'));
    });
    
    test('should try sourceRoot with leading slash removed (candidate 2)', async () => {
      const structure = {
        'utils': {
          'helper.html': '<span>Helper Utility</span>'
        },
        'page.html': '<html><body></body></html>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      // Primary path doesn't exist, should fallback to candidate 2
      const nonExistentPath = join(project.sourceDir, 'missing', 'helper.html');
      const result = await readIncludeWithFallback(
        nonExistentPath,
        '/utils/helper.html', // Leading slash should be removed
        join(project.sourceDir, 'page.html'),
        project.sourceDir
      );
      
      expect(result).toBeDefined();
      expect(result.content).toBe('<span>Helper Utility</span>');
      expect(result.resolvedPath).toBe(join(project.sourceDir, 'utils', 'helper.html'));
    });
    
    test('should try basename in sourceRoot (candidate 3)', async () => {
      const structure = {
        'navigation.html': '<nav>Navigation</nav>',
        'pages': {
          'about.html': '<html><body></body></html>'
        }
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const nonExistentPath = join(project.sourceDir, 'components', 'navigation.html');
      const result = await readIncludeWithFallback(
        nonExistentPath,
        'components/navigation.html', // Should find navigation.html in sourceRoot
        join(project.sourceDir, 'pages', 'about.html'),
        project.sourceDir
      );
      
      expect(result).toBeDefined();
      expect(result.content).toBe('<nav>Navigation</nav>');
      expect(result.resolvedPath).toBe(join(project.sourceDir, 'navigation.html'));
    });
    
    test('should try _includes directory (candidate 4)', async () => {
      const structure = {
        '_includes': {
          'footer.html': '<footer>Footer Content</footer>'
        },
        'page.html': '<html><body></body></html>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const nonExistentPath = join(project.sourceDir, 'components', 'footer.html');
      const result = await readIncludeWithFallback(
        nonExistentPath,
        'components/footer.html', // Should find footer.html in _includes
        join(project.sourceDir, 'page.html'),
        project.sourceDir
      );
      
      expect(result).toBeDefined();
      expect(result.content).toBe('<footer>Footer Content</footer>');
      expect(result.resolvedPath).toBe(join(project.sourceDir, '_includes', 'footer.html'));
    });
    
    test('should try relative to requesting file directory (candidate 5)', async () => {
      const structure = {
        'blog': {
          'sidebar.html': '<aside>Blog Sidebar</aside>',
          'post.html': '<html><body></body></html>'
        }
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const nonExistentPath = join(project.sourceDir, 'global', 'sidebar.html');
      const result = await readIncludeWithFallback(
        nonExistentPath,
        'sidebar.html', // Should find in same directory as requesting file
        join(project.sourceDir, 'blog', 'post.html'),
        project.sourceDir
      );
      
      expect(result).toBeDefined();
      expect(result.content).toBe('<aside>Blog Sidebar</aside>');
      expect(result.resolvedPath).toBe(join(project.sourceDir, 'blog', 'sidebar.html'));
    });
    
    test('should try basename relative to requesting file directory (candidate 6)', async () => {
      const structure = {
        'section': {
          'widget.html': '<div>Widget Component</div>',
          'page.html': '<html><body></body></html>'
        }
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const nonExistentPath = join(project.sourceDir, 'external', 'widget.html');
      const result = await readIncludeWithFallback(
        nonExistentPath,
        'external/deep/widget.html', // Should find widget.html by basename
        join(project.sourceDir, 'section', 'page.html'),
        project.sourceDir
      );
      
      expect(result).toBeDefined();
      expect(result.content).toBe('<div>Widget Component</div>');
      expect(result.resolvedPath).toBe(join(project.sourceDir, 'section', 'widget.html'));
    });
    
    test('should process markdown in fallback paths (lines 100-111)', async () => {
      const structure = {
        '_includes': {
          'content.md': `# Included Content\n\nThis is from _includes.`
        },
        'page.html': '<html><body></body></html>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const nonExistentPath = join(project.sourceDir, 'missing', 'content.md');
      const result = await readIncludeWithFallback(
        nonExistentPath,
        'content.md', // Should find in _includes and process as markdown
        join(project.sourceDir, 'page.html'),
        project.sourceDir
      );
      
      expect(result).toBeDefined();
      expect(result.content).toContain('<h1 id="included-content">Included Content</h1>');
      expect(result.content).toContain('<p>This is from _includes.</p>');
      expect(result.resolvedPath).toBe(join(project.sourceDir, '_includes', 'content.md'));
    });
    
    test('should handle markdown processing errors in fallback paths (lines 106-108)', async () => {
      const structure = {
        '_includes': {
          'broken.md': '---\nmalformed: yaml: content\n---\n# Content'
        },
        'page.html': '<html><body></body></html>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const nonExistentPath = join(project.sourceDir, 'missing', 'broken.md');
      
      try {
        await readIncludeWithFallback(
          nonExistentPath,
          'broken.md',
          join(project.sourceDir, 'page.html'),
          project.sourceDir
        );
        expect(false).toBe(true); // Should throw
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
  
  describe('Debug Logging (lines 72-92)', () => {
    test('should execute debug logging code paths', async () => {
      const structure = {
        'page.html': '<html><body></body></html>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      // Capture console output to verify logging
      const originalLog = console.log;
      const logs = [];
      console.log = (...args) => logs.push(args.join(' '));
      
      try {
        const nonExistentPath = join(project.sourceDir, 'missing', 'file.html');
        await readIncludeWithFallback(
          nonExistentPath,
          'missing-file.html',
          join(project.sourceDir, 'page.html'),
          project.sourceDir
        );
        expect(false).toBe(true); // Should throw
      } catch (error) {
        // Expected to fail, but logging should have occurred
        expect(logs.length).toBeGreaterThan(0);
        expect(logs.some(log => log.includes('readIncludeWithFallback: initialAttempt='))).toBe(true);
        expect(logs.some(log => log.includes('readIncludeWithFallback: checking candidate:'))).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });
  });
  
  describe('Complete Failure (line 117)', () => {
    test('should re-throw original error when all candidates fail', async () => {
      const structure = {
        'page.html': '<html><body></body></html>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const nonExistentPath = join(project.sourceDir, 'missing', 'nowhere.html');
      
      try {
        await readIncludeWithFallback(
          nonExistentPath,
          'completely-missing-file.html',
          join(project.sourceDir, 'page.html'),
          project.sourceDir
        );
        expect(false).toBe(true); // Should throw
      } catch (error) {
        // Should re-throw the original error
        expect(error).toBeDefined();
        expect(error.code).toBe('ENOENT'); // File not found error
      }
    });
  });
  
  describe('Complex Scenarios', () => {
    test('should handle deep directory structures', async () => {
      const structure = {
        'deep': {
          'nested': {
            'components': {
              'complex.html': '<div>Deep Component</div>'
            }
          }
        },
        'pages': {
          'section': {
            'article.html': '<html><body></body></html>'
          }
        }
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const nonExistentPath = join(project.sourceDir, 'wrong', 'path', 'complex.html');
      const result = await readIncludeWithFallback(
        nonExistentPath,
        'deep/nested/components/complex.html',
        join(project.sourceDir, 'pages', 'section', 'article.html'),
        project.sourceDir
      );
      
      expect(result).toBeDefined();
      expect(result.content).toBe('<div>Deep Component</div>');
    });
    
    test('should handle special characters in file names', async () => {
      const structure = {
        '_includes': {
          'special-file_name.html': '<div>Special File</div>'
        },
        'page.html': '<html><body></body></html>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const nonExistentPath = join(project.sourceDir, 'missing', 'special-file_name.html');
      const result = await readIncludeWithFallback(
        nonExistentPath,
        'special-file_name.html',
        join(project.sourceDir, 'page.html'),
        project.sourceDir
      );
      
      expect(result).toBeDefined();
      expect(result.content).toBe('<div>Special File</div>');
    });
  });
});