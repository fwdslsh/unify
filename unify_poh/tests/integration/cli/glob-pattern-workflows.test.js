/**
 * Integration Tests for Complete Glob Pattern Workflows
 * Tests end-to-end glob pattern functionality from CLI to file processing
 * 
 * Tests the complete flow: CLI parsing -> FileClassifier -> GlobPatternProcessor -> File output
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ArgsParser } from '../../../src/cli/args-parser.js';
import { FileClassifier } from '../../../src/core/file-classifier.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('Glob Pattern Workflows Integration', () => {
  let tempDir;
  let parser;
  let classifier;

  beforeEach(() => {
    tempDir = `/tmp/unify-test-${Date.now()}`;
    mkdirSync(tempDir, { recursive: true });
    parser = new ArgsParser();
    classifier = new FileClassifier();
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('CLI to FileClassifier Workflow', () => {
    test('should_parse_cli_and_configure_file_classifier_correctly', () => {
      // Arrange - Simulate CLI input
      const args = [
        'build',
        '--copy', 'assets/**',
        '--ignore', 'temp/**',
        '--render', 'experiments/**',
        '--auto-ignore', 'true'
      ];

      // Act - Parse CLI and configure classifier
      const parsed = parser.parse(args);
      const validation = parser.validate(parsed);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      classifier.configureGlobPatterns({
        copy: parsed.copy,
        ignore: parsed.ignore,
        render: parsed.render,
        autoIgnore: parsed.autoIgnore
      });

      // Assert - Test file classification with configured patterns
      const assetResult = classifier.classifyFile('assets/image.png');
      const tempResult = classifier.classifyFile('temp/cache.html');
      const experimentResult = classifier.classifyFile('experiments/test.html');
      const normalResult = classifier.classifyFile('pages/index.html');

      expect(assetResult.action).toBe('COPY');
      expect(assetResult.tier).toBe(3);
      
      expect(tempResult.action).toBe('IGNORED');
      expect(tempResult.tier).toBe(2);
      
      expect(experimentResult.action).toBe('EMIT');
      expect(experimentResult.tier).toBe(1);
      
      expect(normalResult.action).toBe('EMIT');
      expect(normalResult.tier).toBe(3);
    });

    test('should_handle_complex_pattern_combinations', () => {
      // Arrange
      const args = [
        'build',
        '--copy', 'assets/**',
        '--copy', 'docs/**/*.pdf',
        '--ignore', 'temp/**',
        '--ignore', '*.tmp',
        '--ignore-render', 'raw/**',
        '--ignore-copy', 'private/**',
        '--render', 'experiments/**',
        '--render', '!experiments/disabled/**'
      ];

      // Act
      const parsed = parser.parse(args);
      classifier.configureGlobPatterns({
        copy: parsed.copy,
        ignore: parsed.ignore,
        ignoreRender: parsed.ignoreRender,
        ignoreCopy: parsed.ignoreCopy,
        render: parsed.render,
        autoIgnore: parsed.autoIgnore
      });

      // Assert - Test various file scenarios
      const testCases = [
        // Basic asset copying
        { file: 'assets/logo.png', expected: 'COPY', tier: 3 },
        { file: 'docs/manual.pdf', expected: 'COPY', tier: 3 },
        
        // Ignore rules
        { file: 'temp/file.html', expected: 'IGNORED', tier: 2 },
        { file: 'cache.tmp', expected: 'IGNORED', tier: 2 },
        
        // Specific ignore rules
        { file: 'raw/data.json', expected: 'COPY', tier: 3 }, // ignore-render but can copy
        { file: 'private/secret.png', expected: 'IGNORED', tier: 2 }, // ignore-copy
        
        // Render overrides
        { file: 'experiments/feature.html', expected: 'EMIT', tier: 1 },
        { file: 'experiments/disabled/old.html', expected: 'EMIT', tier: 3 }, // Negation - falls back to default
        
        // Default behavior
        { file: 'pages/about.html', expected: 'EMIT', tier: 3 }
      ];

      for (const { file, expected, tier } of testCases) {
        const result = classifier.classifyFile(file);
        expect(result.action).toBe(expected);
        expect(result.tier).toBe(tier);
      }
    });

    test('should_handle_dry_run_mode_simulation', () => {
      // Arrange - Simulate dry-run with various files
      const parsed = parser.parse([
        'build', 
        '--dry-run',
        '--copy', 'assets/**',
        '--ignore', 'temp/**'
      ]);

      classifier.configureGlobPatterns({
        copy: parsed.copy,
        ignore: parsed.ignore
      });

      // Act - Simulate dry run classification
      const files = [
        'index.html',
        'assets/style.css', 
        'temp/cache.dat',
        'pages/about.md',
        '_layout.html'
      ];

      const results = files.map(file => ({
        file,
        ...classifier.classifyFile(file)
      }));

      // Assert - Verify classification decisions
      expect(results[0]).toMatchObject({ file: 'index.html', action: 'EMIT' });
      expect(results[1]).toMatchObject({ file: 'assets/style.css', action: 'COPY' });
      expect(results[2]).toMatchObject({ file: 'temp/cache.dat', action: 'IGNORED' });
      expect(results[3]).toMatchObject({ file: 'pages/about.md', action: 'EMIT' });
      expect(results[4]).toMatchObject({ file: '_layout.html', action: 'IGNORED' });

      // Should have detailed reasons
      results.forEach(result => {
        expect(result.reason).toBeTruthy();
        expect(result.tier).toBeGreaterThan(0);
      });
    });
  });

  describe('GitIgnore Integration Workflow', () => {
    test('should_load_gitignore_and_respect_patterns', () => {
      // Arrange - Create .gitignore file
      const gitignoreContent = `
# Dependencies
node_modules/
bower_components/

# Build outputs
dist/
build/

# Temporary files
*.tmp
*.log

# Keep some important files
!dist/important.html
      `.trim();
      
      writeFileSync(join(tempDir, '.gitignore'), gitignoreContent);

      // Act - Parse CLI with auto-ignore enabled
      const parsed = parser.parse(['build', '--auto-ignore', 'true']);
      classifier.configureGlobPatterns({ autoIgnore: parsed.autoIgnore });
      
      // Simulate gitignore loading (in real usage, this would be done by the build system)
      const gitignorePatterns = [
        'node_modules/',
        'bower_components/',
        'dist/',
        'build/',
        '*.tmp',
        '*.log',
        '!dist/important.html'
      ];
      classifier.loadGitignorePatterns(gitignorePatterns);

      // Assert - Test gitignore respect
      const testCases = [
        { file: 'node_modules/package.json', expected: 'IGNORED' },
        { file: 'bower_components/jquery.js', expected: 'IGNORED' },
        { file: 'dist/index.html', expected: 'IGNORED' },
        { file: 'dist/important.html', expected: 'EMIT' }, // Negation pattern
        { file: 'cache.tmp', expected: 'IGNORED' },
        { file: 'app.log', expected: 'IGNORED' },
        { file: 'src/index.html', expected: 'EMIT' } // Not in gitignore
      ];

      for (const { file, expected } of testCases) {
        const result = classifier.classifyFile(file);
        expect(result.action).toBe(expected);
        if (expected === 'IGNORED' && !file.includes('important')) {
          expect(result.reason).toContain('.gitignore');
        }
      }
    });

    test('should_allow_explicit_overrides_of_gitignore', () => {
      // Arrange - GitIgnore with explicit overrides
      const parsed = parser.parse([
        'build',
        '--render', 'node_modules/my-local-package/**',
        '--render', 'dist/assets/**',  // Use render (Tier 1) to override gitignore
        '--auto-ignore', 'true'
      ]);

      classifier.configureGlobPatterns({
        render: parsed.render,
        autoIgnore: parsed.autoIgnore
      });

      classifier.loadGitignorePatterns(['node_modules/', 'dist/']);

      // Act & Assert - Explicit patterns should override gitignore
      const localPackageResult = classifier.classifyFile('node_modules/my-local-package/index.html');
      const distAssetResult = classifier.classifyFile('dist/assets/page.html'); // Use HTML file
      const normalNodeResult = classifier.classifyFile('node_modules/react/index.html');

      expect(localPackageResult.action).toBe('EMIT'); // Override gitignore
      expect(localPackageResult.tier).toBe(1);

      expect(distAssetResult.action).toBe('EMIT'); // Override gitignore with render pattern
      expect(distAssetResult.tier).toBe(1);

      expect(normalNodeResult.action).toBe('IGNORED'); // Still ignored
      expect(normalNodeResult.tier).toBe(2);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should_handle_invalid_patterns_gracefully', () => {
      // Arrange - Try to parse invalid patterns
      const args = ['build', '--copy', ''];

      // Act
      const parsed = parser.parse(args);
      const validation = parser.validate(parsed);

      // Assert - Should detect invalid patterns
      expect(parsed.errors.length).toBeGreaterThan(0);
      expect(parsed.errors).toContain('Empty glob pattern not allowed');
    });

    test('should_provide_warnings_for_performance_issues', () => {
      // Arrange
      const args = ['build', '--copy', '**/*'];

      // Act
      const parsed = parser.parse(args);

      // Assert - Should warn about performance
      expect(parsed.warnings.length).toBeGreaterThan(0);
      expect(parsed.warnings.some(w => w.includes('performance'))).toBe(true);
    });

    test('should_handle_conflicting_patterns_appropriately', () => {
      // Arrange - Create conflicting patterns
      const warnings = [];
      classifier.onWarning = (warning) => warnings.push(warning);

      // Act
      classifier.configureGlobPatterns({
        copy: ['assets/**'],
        ignoreCopy: ['assets/**']
      });

      // Assert - Should warn about conflicts
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some(w => w.includes('Conflicting'))).toBe(true);
    });

    test('should_handle_mixed_file_types_correctly', () => {
      // Arrange - Mix of renderable, assets, and unknown files
      classifier.configureGlobPatterns({
        copy: ['data/**'],
        ignore: ['temp/**']
      });

      // Act - Classify various file types
      const testFiles = [
        'index.html',     // Renderable
        'style.css',      // Asset
        'data.json',      // Asset (due to extension)
        'README',         // Unknown
        'data/config.xml', // Asset (via copy rule)
        'temp/cache.dat', // Ignored
        '_layout.html'    // Fragment (auto-ignored)
      ];

      const results = testFiles.map(file => ({
        file,
        ...classifier.classifyFile(file)
      }));

      // Assert - Each file type classified correctly
      expect(results[0].action).toBe('EMIT');   // HTML
      expect(results[1].action).toBe('COPY');   // CSS
      expect(results[2].action).toBe('COPY');   // JSON
      expect(results[3].action).toBe('SKIP');   // Unknown
      expect(results[4].action).toBe('COPY');   // Copy rule
      expect(results[5].action).toBe('IGNORED'); // Ignore rule
      expect(results[6].action).toBe('IGNORED'); // Fragment
    });
  });

  describe('Performance and Scalability', () => {
    test('should_handle_large_pattern_sets_efficiently', () => {
      // Arrange - Create many patterns
      const copyPatterns = [];
      const ignorePatterns = [];
      
      for (let i = 0; i < 50; i++) {
        copyPatterns.push(`assets/type${i}/**`);
        ignorePatterns.push(`temp${i}/**`);
      }

      classifier.configureGlobPatterns({
        copy: copyPatterns,
        ignore: ignorePatterns
      });

      // Act - Measure classification performance
      const startTime = performance.now();
      
      const testFiles = [];
      for (let i = 0; i < 100; i++) {
        testFiles.push(`assets/type${i % 50}/file${i}.png`);
      }
      
      const results = testFiles.map(file => classifier.classifyFile(file));
      
      const endTime = performance.now();
      const duration = endTime - startTime;

      // Assert - Should complete quickly and correctly
      expect(duration).toBeLessThan(100); // Under 100ms for 100 patterns + 100 files
      expect(results.length).toBe(100);
      expect(results.every(r => r.action === 'COPY')).toBe(true);
    });

    test('should_maintain_correctness_with_complex_precedence', () => {
      // Arrange - Complex precedence scenario
      classifier.configureGlobPatterns({
        copy: ['**/*.css', '**/*.js'],           // Tier 3
        ignore: ['assets/**'],                   // Tier 2
        ignoreRender: ['scripts/**'],            // Tier 2
        ignoreCopy: ['styles/vendor/**'],        // Tier 2
        render: ['assets/critical/**']           // Tier 1
      });

      // Act - Test precedence rules
      const testCases = [
        // Tier 1 should win over everything
        { file: 'assets/critical/main.html', expected: 'EMIT', tier: 1 },
        
        // Tier 2 ignore should win over Tier 3 copy
        { file: 'assets/normal.css', expected: 'IGNORED', tier: 2 },
        
        // Specific ignore rules
        { file: 'scripts/app.js', expected: 'COPY', tier: 3 }, // ignore-render but can copy
        { file: 'styles/vendor/bootstrap.css', expected: 'IGNORED', tier: 2 }, // ignore-copy
        
        // Default behavior
        { file: 'components/header.css', expected: 'COPY', tier: 3 }
      ];

      // Assert - Precedence rules enforced correctly
      for (const { file, expected, tier } of testCases) {
        const result = classifier.classifyFile(file);
        expect(result.action).toBe(expected);
        expect(result.tier).toBe(tier);
      }
    });
  });
});