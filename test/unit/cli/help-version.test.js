/**
 * Unit tests for CLI help and version output
 * Tests help formatting, version display, and exit codes
 */

import { test, expect, describe } from 'bun:test';
import { runCLI } from '../../helpers/cli-runner.js';

describe('CLI Help and Version', () => {
  test('should display help with --help flag', async () => {
    const result = await runCLI(['--help']);
    
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Usage');
    expect(result.stdout).toContain('Commands');
    expect(result.stdout).toContain('build');
    expect(result.stdout).toContain('serve');
    expect(result.stdout).toContain('watch');
    expect(result.stdout).toContain('init');
    expect(result.stdout).toContain('Options');
  });
  
  test('should display help with -h flag', async () => {
    const result = await runCLI(['-h']);
    
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Usage');
    expect(result.stdout).toContain('Commands');
  });
  
  test('should display version with --version flag', async () => {
    const result = await runCLI(['--version']);
    
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/unify v\d+\.\d+\.\d+/);
  });
  
  test('should display version with -v flag', async () => {
    const result = await runCLI(['-v']);
    
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/unify v\d+\.\d+\.\d+/);
  });
  
  test('help should include all main options', async () => {
    const result = await runCLI(['--help']);
    
    expect(result.code).toBe(0);
    
    // Check for key options
    expect(result.stdout).toContain('--source');
    expect(result.stdout).toContain('--output');
    expect(result.stdout).toContain('--clean');
    expect(result.stdout).toContain('--pretty-urls');
    expect(result.stdout).toContain('--copy');
    expect(result.stdout).toContain('--ignore');
    expect(result.stdout).toContain('--default-layout');
    expect(result.stdout).toContain('--dry-run');
    expect(result.stdout).toContain('--log-level');
    expect(result.stdout).toContain('--fail-level');
  });
  
  test('help should include examples', async () => {
    const result = await runCLI(['--help']);
    
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Examples');
  });
  
  test('help should be well-formatted and readable', async () => {
    const result = await runCLI(['--help']);
    
    expect(result.code).toBe(0);
    
    // Check for proper formatting
    const lines = result.stdout.split('\n');
    expect(lines.length).toBeGreaterThan(10); // Should have substantial content
    
    // Should not have excessively long lines
    const longLines = lines.filter(line => line.length > 120);
    expect(longLines.length).toBeLessThan(lines.length * 0.1); // Less than 10% long lines
  });
  
  test('help flag takes precedence when placed first', async () => {
    const result = await runCLI(['--help', 'invalid-command']);
    
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Usage');
  });
  
  test('version flag takes precedence when placed first', async () => {
    const result = await runCLI(['--version', 'invalid-command']);
    
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/unify v\d+\.\d+\.\d+/);
  });
});