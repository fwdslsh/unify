/**
 * Tests for --minify CLI option in ArgsParser
 */

import { describe, test, expect } from 'bun:test';
import { ArgsParser } from '../../../src/cli/args-parser.js';

describe('ArgsParser --minify option', () => {
  let parser;

  test('should_default_minify_to_false_when_not_specified', () => {
    parser = new ArgsParser();
    const result = parser.parse(['build']);
    
    expect(result.minify).toBe(false);
  });

  test('should_set_minify_to_true_when_specified', () => {
    parser = new ArgsParser();
    const result = parser.parse(['build', '--minify']);
    
    expect(result.minify).toBe(true);
  });

  test('should_parse_minify_with_other_options_when_combined', () => {
    parser = new ArgsParser();
    const result = parser.parse(['build', '--minify', '--pretty-urls', '--clean']);
    
    expect(result.minify).toBe(true);
    expect(result.prettyUrls).toBe(true);
    expect(result.clean).toBe(true);
  });

  test('should_include_minify_in_help_text_when_requested', () => {
    parser = new ArgsParser();
    const helpText = parser.getHelpText();
    
    expect(helpText).toContain('--minify');
    expect(helpText).toContain('Enable HTML minification for production builds');
  });
});