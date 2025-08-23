/**
 * Unit Tests for .gitignore Integration
 * Tests the integration of .gitignore patterns with GlobPatternProcessor
 * 
 * Ensures .gitignore files are properly loaded and respected
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { GlobPatternProcessor } from '../../../src/core/glob-pattern-processor.js';
import { FileClassifier } from '../../../src/core/file-classifier.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('GitIgnore Integration', () => {
  let processor;
  let tempDir;

  beforeEach(() => {
    tempDir = `/tmp/unify-test-${Date.now()}`;
    mkdirSync(tempDir, { recursive: true });
    processor = new GlobPatternProcessor();
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('GitIgnore File Loading', () => {
    test('should_load_gitignore_patterns_from_file', () => {
      // Arrange
      const gitignoreContent = `
# Comments should be ignored
node_modules/
*.log
temp/**
!temp/keep/
      `.trim();
      
      writeFileSync(join(tempDir, '.gitignore'), gitignoreContent);

      // Act
      processor.loadGitignore(tempDir);

      // Assert
      const nodeModulesResult = processor.classifyFile('node_modules/package/index.js');
      const logResult = processor.classifyFile('app.log');
      const tempResult = processor.classifyFile('temp/cache.dat');
      const keepResult = processor.classifyFile('temp/keep/important.html');

      expect(nodeModulesResult.action).toBe('IGNORED');
      expect(logResult.action).toBe('IGNORED');
      expect(tempResult.action).toBe('IGNORED');
      expect(keepResult.action).toBe('EMIT'); // Negation pattern
    });

    test('should_handle_missing_gitignore_file_gracefully', () => {
      // Act & Assert - Should not throw
      expect(() => {
        processor.loadGitignore(tempDir);
      }).not.toThrow();

      // Should still work normally
      const result = processor.classifyFile('index.html');
      expect(result.action).toBe('EMIT');
    });

    test('should_ignore_comments_and_empty_lines', () => {
      // Arrange
      const gitignoreContent = `
# This is a comment

# Another comment
node_modules/

# Final comment
      `;
      
      writeFileSync(join(tempDir, '.gitignore'), gitignoreContent);

      // Act
      processor.loadGitignore(tempDir);

      // Assert
      const result = processor.classifyFile('node_modules/package.json');
      expect(result.action).toBe('IGNORED');
      expect(result.reason).toContain('.gitignore');
    });
  });

  describe('Auto-Ignore Behavior', () => {
    test('should_respect_gitignore_when_auto_ignore_enabled', () => {
      // Arrange
      processor.setAutoIgnore(true);
      writeFileSync(join(tempDir, '.gitignore'), 'build/');

      // Act
      processor.loadGitignore(tempDir);
      const result = processor.classifyFile('build/output.html');

      // Assert
      expect(result.action).toBe('IGNORED');
      expect(result.tier).toBe(2);
    });

    test('should_ignore_gitignore_when_auto_ignore_disabled', () => {
      // Arrange
      processor.setAutoIgnore(false);
      writeFileSync(join(tempDir, '.gitignore'), 'temp/');

      // Act
      processor.loadGitignore(tempDir);
      const result = processor.classifyFile('temp/file.html');

      // Assert
      expect(result.action).toBe('EMIT'); // Not ignored
    });
  });

  describe('GitIgnore with Explicit Overrides', () => {
    test('should_allow_render_override_of_gitignore', () => {
      // Arrange
      writeFileSync(join(tempDir, '.gitignore'), 'experiments/');
      processor.loadGitignore(tempDir);
      processor.addRenderPattern('experiments/public/**'); // Tier 1 override

      // Act
      const result = processor.classifyFile('experiments/public/demo.html');

      // Assert
      expect(result.action).toBe('EMIT'); // Render wins over gitignore
      expect(result.tier).toBe(1);
    });

    test('should_apply_gitignore_when_no_explicit_override', () => {
      // Arrange
      writeFileSync(join(tempDir, '.gitignore'), 'drafts/');
      processor.loadGitignore(tempDir);

      // Act
      const result = processor.classifyFile('drafts/post.html');

      // Assert
      expect(result.action).toBe('IGNORED');
      expect(result.tier).toBe(2);
      expect(result.reason).toContain('.gitignore');
    });
  });

  describe('Complex GitIgnore Patterns', () => {
    test('should_handle_nested_directories', () => {
      // Arrange
      writeFileSync(join(tempDir, '.gitignore'), 'src/**/test.js');

      // Act
      processor.loadGitignore(tempDir);

      // Assert
      const result1 = processor.classifyFile('src/utils/test.js');
      const result2 = processor.classifyFile('src/components/header/test.js');
      const result3 = processor.classifyFile('src/index.html'); // Should not match

      expect(result1.action).toBe('IGNORED');
      expect(result2.action).toBe('IGNORED');
      expect(result3.action).toBe('EMIT'); // Not ignored
    });

    test('should_handle_extension_patterns', () => {
      // Arrange
      writeFileSync(join(tempDir, '.gitignore'), '*.tmp\n*.log');

      // Act
      processor.loadGitignore(tempDir);

      // Assert
      const tmpResult = processor.classifyFile('cache.tmp');
      const logResult = processor.classifyFile('debug.log');
      const htmlResult = processor.classifyFile('index.html');

      expect(tmpResult.action).toBe('IGNORED');
      expect(logResult.action).toBe('IGNORED');
      expect(htmlResult.action).toBe('EMIT');
    });

    test('should_handle_negation_patterns', () => {
      // Arrange
      writeFileSync(join(tempDir, '.gitignore'), 'logs/\n!logs/important.html');

      // Act
      processor.loadGitignore(tempDir);

      // Assert
      const normalLog = processor.classifyFile('logs/debug.log');
      const importantLog = processor.classifyFile('logs/important.html');

      expect(normalLog.action).toBe('IGNORED');
      expect(importantLog.action).toBe('EMIT'); // Not ignored due to negation
    });
  });

  describe('FileClassifier Integration', () => {
    test('should_integrate_with_file_classifier_gitignore_loading', () => {
      // This test verifies that the FileClassifier can load gitignore patterns
      // and they work correctly with the GlobPatternProcessor integration

      // Arrange
      const classifier = new FileClassifier();
      writeFileSync(join(tempDir, '.gitignore'), 'node_modules/\nbuild/');

      // Act
      classifier.configureGlobPatterns({ autoIgnore: true });
      classifier.loadGitignorePatterns(['node_modules/', 'build/']); // Simulate file reading
      
      const nodeModulesResult = classifier.classifyFile('node_modules/package.json');
      const buildResult = classifier.classifyFile('build/index.html');
      const srcResult = classifier.classifyFile('src/index.html');

      // Assert
      expect(nodeModulesResult.action).toBe('IGNORED');
      expect(buildResult.action).toBe('IGNORED');
      expect(srcResult.action).toBe('EMIT'); // Not in gitignore
    });
  });

  describe('Error Handling', () => {
    test('should_handle_invalid_gitignore_patterns_gracefully', () => {
      // Arrange - Create gitignore with potentially problematic content
      writeFileSync(join(tempDir, '.gitignore'), 'valid/\n\n\n# comment\nvalid2/');

      // Act & Assert - Should not throw
      expect(() => {
        processor.loadGitignore(tempDir);
      }).not.toThrow();

      // Should still process valid patterns
      const result = processor.classifyFile('valid/file.html');
      expect(result.action).toBe('IGNORED');
    });

    test('should_handle_unreadable_gitignore_gracefully', () => {
      // Act & Assert - Non-existent directory should not throw
      expect(() => {
        processor.loadGitignore('/non/existent/directory');
      }).not.toThrow();
    });
  });

  describe('Performance', () => {
    test('should_efficiently_process_large_gitignore_files', () => {
      // Arrange - Create a large gitignore file
      const patterns = [];
      for (let i = 0; i < 100; i++) {
        patterns.push(`pattern${i}/`);
      }
      writeFileSync(join(tempDir, '.gitignore'), patterns.join('\n'));

      // Act
      const startTime = performance.now();
      processor.loadGitignore(tempDir);
      
      // Test classification performance
      for (let i = 0; i < 50; i++) {
        processor.classifyFile(`pattern${i}/file.html`);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;

      // Assert - Should complete quickly (under 50ms for 100 patterns + 50 classifications)
      expect(duration).toBeLessThan(50);
    });
  });
});