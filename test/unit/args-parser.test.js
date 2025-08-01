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
  
  
  it('should parse layouts option', () => {
    const args = parseArgs(['build', '--layouts', 'templates']);
    expect(args.layouts).toBe('templates');
  });
  
  it('should parse components option', () => {
    const args = parseArgs(['build', '--components', 'ui']);
    expect(args.components).toBe('ui');
  });
  
  it('should use default values', () => {
    const args = parseArgs(['build']);
    expect(args.source).toBe('src');
    expect(args.output).toBe('dist');
    expect(args.layouts).toBe('.layouts');
    expect(args.components).toBe('.components');
    expect(args.port).toBe(3000);
  });
  
  it('should throw error for unknown option', () => {
    expect(() => {
      parseArgs(['build', '--unknown']);
    }).toThrow(/Unknown option/);
  });
});