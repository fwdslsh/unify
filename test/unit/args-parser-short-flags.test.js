/**
 * Tests for short argument flags
 * Verifies -c and -l flags work correctly
 */

import { describe, it, expect } from 'bun:test';
import { parseArgs } from '../../src/cli/args-parser.js';

describe('Short Argument Flags', () => {
  describe('-c flag for components', () => {
    it('should parse -c as components directory', () => {
      const args = parseArgs(['build', '-c', 'partials']);
      
      expect(args.command).toBe('build');
      expect(args.components).toBe('partials');
    });

    it('should work with other arguments', () => {
      const args = parseArgs(['build', '-s', 'src', '-c', 'includes', '-o', 'dist']);
      
      expect(args.source).toBe('src');
      expect(args.components).toBe('includes');
      expect(args.output).toBe('dist');
    });

    it('should fail when -c has no value', () => {
      expect(() => {
        parseArgs(['build', '-c']);
      }).toThrow(/Unknown option/);
    });
  });

  describe('-l flag for layouts', () => {
    it('should parse -l as layouts directory', () => {
      const args = parseArgs(['build', '-l', 'templates']);
      
      expect(args.command).toBe('build');
      expect(args.layouts).toBe('templates');
    });

    it('should work with components flag', () => {
      const args = parseArgs(['build', '-c', 'partials', '-l', 'templates']);
      
      expect(args.components).toBe('partials');
      expect(args.layouts).toBe('templates');
    });

    it('should work with long form', () => {
      const args = parseArgs(['build', '--components', 'partials', '-l', 'templates']);
      
      expect(args.components).toBe('partials');
      expect(args.layouts).toBe('templates');
    });
  });

  describe('Mixed short and long flags', () => {
    it('should handle all combinations', () => {
      const args = parseArgs([
        'serve',
        '-s', 'content',
        '--output', 'public',
        '-l', 'templates',
        '--components', 'partials',
        '-p', '8080'
      ]);
      
      expect(args.command).toBe('serve');
      expect(args.source).toBe('content');
      expect(args.output).toBe('public');
      expect(args.layouts).toBe('templates');
      expect(args.components).toBe('partials');
      expect(args.port).toBe(8080);
    });
  });

  describe('Backwards compatibility', () => {
    it('should still support long flags', () => {
      const args = parseArgs(['build', '--components', 'includes', '--layouts', 'templates']);
      
      expect(args.components).toBe('includes');
      expect(args.layouts).toBe('templates');
    });

    it('should prefer last value when flag specified multiple times', () => {
      const args = parseArgs(['build', '-c', 'first', '--components', 'second']);
      
      expect(args.components).toBe('second');
    });
  });
});