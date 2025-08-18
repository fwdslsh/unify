/**
 * Tests for CLI argument parser
 * Cross-runtime compatible test
 */

// Bun test framework
import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import { parseArgs } from '../../src/cli/args-parser.js';

describe('parseArgs', () => {
  it('should parse build command', () => {
    const args = parseArgs(['build']);
    expect(args.command).toBe('build');
  });
  
  it('should parse watch command', () => {
    const args = parseArgs(['watch']);
    expect(args.command).toBe('watch');
  });
  
  it('should handle help flag', () => {
    const args = parseArgs(['--help']);
    expect(args.help).toBe(true);
  });
  
  it('should handle version flag', () => {
    const args = parseArgs(['--version']);
    expect(args.version).toBe(true);
  });
  
  it('should parse source option', () => {
    const args = parseArgs(['build', '--source', 'my-src']);
    expect(args.source).toBe('my-src');
  });
  
  it('should parse output option', () => {
    const args = parseArgs(['build', '--output', 'my-dist']);
    expect(args.output).toBe('my-dist');
  });
  
  
  it('should use default values', () => {
    const args = parseArgs(['build']);
    expect(args.source).toBe('src');
    expect(args.output).toBe('dist');
    expect(args.port).toBe(3000);
  });
  
  it('should throw error for unknown option', () => {
    expect(() => {
      parseArgs(['build', '--unknown']);
    }).toThrow(/Unknown option/);
  });

  // v0.6.0 CLI Options Tests
  describe('v0.6.0 CLI Options', () => {
    it('should handle repeatable copy options', () => {
      const args = parseArgs(['build', '--copy', 'docs/**', '--copy', 'config/*.json']);
      expect(args.copy).toEqual(['docs/**', 'config/*.json']);
    });

    it('should handle repeatable ignore options', () => {
      const args = parseArgs(['build', '--ignore', 'temp/**', '--ignore', '*.tmp']);
      expect(args.ignore).toEqual(['temp/**', '*.tmp']);
    });

    it('should handle repeatable render options', () => {
      const args = parseArgs(['build', '--render', 'blog/**', '--render', 'docs/**']);
      expect(args.render).toEqual(['blog/**', 'docs/**']);
    });

    it('should handle repeatable ignore-render options', () => {
      const args = parseArgs(['build', '--ignore-render', 'temp/*.html', '--ignore-render', 'draft/**']);
      expect(args.ignoreRender).toEqual(['temp/*.html', 'draft/**']);
    });

    it('should handle repeatable ignore-copy options', () => {
      const args = parseArgs(['build', '--ignore-copy', 'assets/temp/*', '--ignore-copy', '*.tmp']);
      expect(args.ignoreCopy).toEqual(['assets/temp/*', '*.tmp']);
    });

    it('should handle repeatable default-layout options', () => {
      const args = parseArgs(['build', '--default-layout', 'main', '--default-layout', 'blog']);
      expect(args.defaultLayout).toEqual([
        { pattern: '*', layout: 'main' },
        { pattern: '*', layout: 'blog' }
      ]);
    });

    it('should handle dry-run flag', () => {
      const args = parseArgs(['build', '--dry-run']);
      expect(args.dryRun).toBe(true);
    });

    it('should handle auto-ignore boolean option', () => {
      const argsTrue = parseArgs(['build', '--auto-ignore', 'true']);
      expect(argsTrue.autoIgnore).toBe(true);

      const argsFalse = parseArgs(['build', '--auto-ignore', 'false']);
      expect(argsFalse.autoIgnore).toBe(false);
    });

    it('should handle log-level option', () => {
      const args = parseArgs(['build', '--log-level', 'debug']);
      expect(args.logLevel).toBe('debug');
    });

    it('should handle fail-level option', () => {
      const args = parseArgs(['build', '--fail-level', 'error']);
      expect(args.failLevel).toBe('error');
    });

    it('should handle pattern=layout syntax for default-layout', () => {
      const args = parseArgs(['build', '--default-layout', 'blog/**=_post.html']);
      expect(args.defaultLayout).toEqual([
        { pattern: 'blog/**', layout: '_post.html' }
      ]);
    });

    it('should handle mixed old and new options', () => {
      const args = parseArgs([
        'build', 
        '--source', 'my-src', 
        '--output', 'my-dist',
        '--copy', 'docs/**',
        '--ignore', 'temp/**',
        '--dry-run'
      ]);

      expect(args.source).toBe('my-src');
      expect(args.output).toBe('my-dist');
      expect(args.copy).toEqual(['docs/**']);
      expect(args.ignore).toEqual(['temp/**']);
      expect(args.dryRun).toBe(true);
    });

    it('should handle multiple values for repeatable options in single call', () => {
      const args = parseArgs([
        'build',
        '--copy', 'docs/**',
        '--copy', 'config/*.json', 
        '--copy', 'assets/special/**',
        '--ignore', 'temp/**',
        '--ignore', '*.tmp',
        '--ignore', 'draft/**'
      ]);

      expect(args.copy).toEqual(['docs/**', 'config/*.json', 'assets/special/**']);
      expect(args.ignore).toEqual(['temp/**', '*.tmp', 'draft/**']);
    });

    it('should set default values for new options', () => {
      const args = parseArgs(['build']);

      expect(args.copy).toEqual([]);
      expect(args.ignore).toEqual([]);
      expect(args.render).toEqual([]);
      expect(args.ignoreRender).toEqual([]);
      expect(args.ignoreCopy).toEqual([]);
      expect(args.defaultLayout).toEqual([]);
      expect(args.dryRun).toBe(false);
      expect(args.autoIgnore).toBe(true); // Default true per spec
      expect(args.logLevel).toBe('info'); // Default log level
    });

    it('should validate log-level values', () => {
      const validLevels = ['error', 'warn', 'info', 'debug'];
      
      for (const level of validLevels) {
        const args = parseArgs(['build', '--log-level', level]);
        expect(args.logLevel).toBe(level);
      }
    });

    it('should validate fail-level values', () => {
      const validLevels = ['error', 'warning'];
      
      for (const level of validLevels) {
        const args = parseArgs(['build', '--fail-level', level]);
        expect(args.failLevel).toBe(level);
      }
    });
  });
});