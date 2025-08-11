import { describe, test, expect } from 'bun:test';

/**
 * Unit tests for init command argument parsing
 * 
 * These tests focus on the argument parsing logic which can be tested
 * in isolation without mocking complex dependencies.
 * 
 * Note: The main init functionality is tested through integration tests
 * in test/integration/init.test.js and repository service unit tests
 * in test/unit/repository-service.test.js
 */

describe('Init Command Argument Parsing', () => {
  test('should parse init command with template argument', async () => {
    const { parseArgs } = await import('../../src/cli/args-parser.js');
    
    const args = parseArgs(['init', 'basic']);
    expect(args.command).toBe('init');
    expect(args.template).toBe('basic');
  });

  test('should parse init command without template argument', async () => {
    const { parseArgs } = await import('../../src/cli/args-parser.js');
    
    const args = parseArgs(['init']);
    expect(args.command).toBe('init');
    expect(args.template).toBeNull();
  });

  test('should parse init command with different template names', async () => {
    const { parseArgs } = await import('../../src/cli/args-parser.js');
    
    const templates = ['basic', 'blog', 'docs', 'portfolio', 'custom-name'];
    
    for (const template of templates) {
      const args = parseArgs(['init', template]);
      expect(args.command).toBe('init');
      expect(args.template).toBe(template);
    }
  });

  test('should handle init command with flags', async () => {
    const { parseArgs } = await import('../../src/cli/args-parser.js');
    
    const args = parseArgs(['init', 'basic', '--verbose']);
    expect(args.command).toBe('init');
    expect(args.template).toBe('basic');
    expect(args.verbose).toBe(true);
  });

  test('should handle init command with version flag', async () => {
    const { parseArgs } = await import('../../src/cli/args-parser.js');
    
    const args = parseArgs(['init', '--version']);
    expect(args.command).toBe('init');
    expect(args.version).toBe(true);
  });

  test('should handle init command with help flag', async () => {
    const { parseArgs } = await import('../../src/cli/args-parser.js');
    
    const args = parseArgs(['init', '--help']);
    expect(args.command).toBe('init');
    expect(args.help).toBe(true);
  });
});