import { test, expect, describe } from 'bun:test';
import { parseArgs } from '../../src/cli/args-parser.js';

describe('CLI Args Parser - Pattern Configuration', () => {
  describe('New Pattern Options', () => {
    test('should parse --includes-dir option', () => {
      const args = parseArgs(['build', '--includes-dir', 'components']);
      
      expect(args.command).toBe('build');
      expect(args.includesDir).toBe('components');
    });

    test('should parse --layouts-dir option', () => {
      const args = parseArgs(['build', '--layouts-dir', 'layouts']);
      
      expect(args.command).toBe('build');
      expect(args.layoutsDir).toBe('layouts');
    });

    test('should parse --component-pattern option', () => {
      const args = parseArgs(['build', '--component-pattern', '*.component.*']);
      
      expect(args.command).toBe('build');
      expect(args.componentPattern).toBe('*.component.*');
    });

    test('should parse --layout-pattern option', () => {
      const args = parseArgs(['build', '--layout-pattern', '*.layout.*']);
      
      expect(args.command).toBe('build');
      expect(args.layoutPattern).toBe('*.layout.*');
    });

    test('should parse --layout-filename option', () => {
      const args = parseArgs(['build', '--layout-filename', 'default.layout.html']);
      
      expect(args.command).toBe('build');
      expect(args.layoutFilename).toBe('default.layout.html');
    });

    test('should parse multiple pattern options together', () => {
      const args = parseArgs([
        'build',
        '--includes-dir', 'components',
        '--layouts-dir', 'layouts', 
        '--component-pattern', '*.component.*',
        '--layout-pattern', '*.layout.*|default.*',
        '--layout-filename', 'base.html'
      ]);
      
      expect(args.command).toBe('build');
      expect(args.includesDir).toBe('components');
      expect(args.layoutsDir).toBe('layouts');
      expect(args.componentPattern).toBe('*.component.*');
      expect(args.layoutPattern).toBe('*.layout.*|default.*');
      expect(args.layoutFilename).toBe('base.html');
    });

    test('should combine pattern options with existing options', () => {
      const args = parseArgs([
        'build',
        '--source', 'src',
        '--output', 'public',
        '--includes-dir', 'components',
        '--pretty-urls',
        '--component-pattern', '*.component.*'
      ]);
      
      expect(args.command).toBe('build');
      expect(args.source).toBe('src');
      expect(args.output).toBe('public');
      expect(args.includesDir).toBe('components');
      expect(args.prettyUrls).toBe(true);
      expect(args.componentPattern).toBe('*.component.*');
    });
  });

  describe('Default Values', () => {
    test('should have null defaults for pattern options', () => {
      const args = parseArgs(['build']);
      
      expect(args.includesDir).toBe(null);
      expect(args.layoutsDir).toBe(null);
      expect(args.componentPattern).toBe(null);
      expect(args.layoutPattern).toBe(null);
      expect(args.layoutFilename).toBe(null);
    });
  });

  describe('Valid Options Recognition', () => {
    test('should recognize new pattern options as valid', () => {
      // This test ensures the new options are included in validOptions array
      // by testing that they don't throw "Unknown option" errors
      
      expect(() => parseArgs(['build', '--includes-dir', 'components'])).not.toThrow();
      expect(() => parseArgs(['build', '--layouts-dir', 'layouts'])).not.toThrow();
      expect(() => parseArgs(['build', '--component-pattern', '*.component.*'])).not.toThrow();
      expect(() => parseArgs(['build', '--layout-pattern', '*.layout.*'])).not.toThrow();
      expect(() => parseArgs(['build', '--layout-filename', 'base.html'])).not.toThrow();
    });
  });

  describe('Real-world Usage Examples', () => {
    test('should parse card.component.html pattern example', () => {
      const args = parseArgs([
        'build',
        '--component-pattern', '*.component.*',
        '--layout-pattern', '*.layout.*',
        '--includes-dir', 'src/components'
      ]);
      
      expect(args.componentPattern).toBe('*.component.*');
      expect(args.layoutPattern).toBe('*.layout.*');
      expect(args.includesDir).toBe('src/components');
    });

    test('should parse default.layout.html pattern example', () => {
      const args = parseArgs([
        'build',
        '--layout-pattern', 'default.*|*.layout.*',
        '--layout-filename', 'default.layout.html',
        '--layouts-dir', 'src/layouts'
      ]);
      
      expect(args.layoutPattern).toBe('default.*|*.layout.*');
      expect(args.layoutFilename).toBe('default.layout.html');
      expect(args.layoutsDir).toBe('src/layouts');
    });

    test('should parse migration from underscore convention', () => {
      const args = parseArgs([
        'build',
        '--includes-dir', 'includes',
        '--component-pattern', 'component.*',
        '--layout-pattern', 'layout.*',
        '--layout-filename', 'layout.html'
      ]);
      
      expect(args.includesDir).toBe('includes');
      expect(args.componentPattern).toBe('component.*');
      expect(args.layoutPattern).toBe('layout.*');
      expect(args.layoutFilename).toBe('layout.html');
    });
  });
});