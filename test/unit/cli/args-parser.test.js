/**
 * Unit tests for CLI argument parsing
 * Tests argument validation, flag handling, and error cases
 */

import { test, expect, describe } from 'bun:test';
import { parseArgs } from '../../../src/cli/args-parser.js';

describe('CLI Argument Parsing', () => {
  test('should parse basic arguments correctly', () => {
    const args = ['build', '--source', 'src', '--output', 'dist'];
    const result = parseArgs(args);
    
    expect(result.command).toBe('build');
    expect(result.source).toBe('src');
    expect(result.output).toBe('dist');
  });
  
  test('should parse short flags correctly', () => {
    const args = ['build', '-s', 'content', '-o', 'public'];
    const result = parseArgs(args);
    
    expect(result.source).toBe('content');
    expect(result.output).toBe('public');
  });
  
  test('should parse boolean flags correctly', () => {
    const args = ['build', '--clean', '--pretty-urls', '--minify'];
    const result = parseArgs(args);
    
    expect(result.clean).toBe(true);
    expect(result.prettyUrls).toBe(true);
    expect(result.minify).toBe(true);
  });
  
  test('should handle repeated flags with last-wins precedence', () => {
    const args = ['build', '--source', 'first', '--source', 'second'];
    const result = parseArgs(args);
    
    expect(result.source).toBe('second');
  });
  
  test('should handle repeatable flags as arrays', () => {
    const args = [
      'build', 
      '--ignore', 'drafts/**',
      '--ignore', 'temp/**',
      '--copy', 'assets/**',
      '--copy', 'public/**'
    ];
    const result = parseArgs(args);
    
    expect(result.ignore).toEqual(['drafts/**', 'temp/**']);
    expect(result.copy).toEqual(['assets/**', 'public/**']);
  });
  
  test('should parse default layout rules correctly', () => {
    const args = [
      'build',
      '--default-layout', '_base.html',
      '--default-layout', 'blog/**=_post.html',
      '--default-layout', 'docs/**=_doc.html'
    ];
    const result = parseArgs(args);
    
    expect(result.defaultLayout).toEqual([
      { pattern: '*', layout: '_base.html' },
      { pattern: 'blog/**', layout: '_post.html' }, 
      { pattern: 'docs/**', layout: '_doc.html' }
    ]);
  });
  
  test('should validate port numbers', () => {
    expect(() => {
      parseArgs(['serve', '--port', 'abc']);
    }).toThrow('Port must be a number between 1 and 65535');
    
    expect(() => {
      parseArgs(['serve', '--port', '99999']);
    }).toThrow('Port must be a number between 1 and 65535');
  });
  
  test('should validate log levels', () => {
    expect(() => {
      parseArgs(['build', '--log-level', 'invalid']);
    }).toThrow('Invalid --log-level value: invalid');
    
    const result = parseArgs(['build', '--log-level', 'debug']);
    expect(result.logLevel).toBe('debug');
  });
  
  test('should validate fail levels', () => {
    expect(() => {
      parseArgs(['build', '--fail-level', 'invalid']);
    }).toThrow('Invalid --fail-level value: invalid');
    
    const result = parseArgs(['build', '--fail-level', 'warning']);
    expect(result.failLevel).toBe('warning');
  });
  
  test('should handle help flag', () => {
    const result = parseArgs(['--help']);
    expect(result.help).toBe(true);
  });
  
  test('should handle version flag', () => {
    const result = parseArgs(['--version']);
    expect(result.version).toBe(true);
  });
  
  test('should default to build command when no command specified', () => {
    const result = parseArgs(['--source', 'src']);
    expect(result.command).toBe('build');
  });
  
  test('should parse all supported commands', () => {
    const buildResult = parseArgs(['build']);
    expect(buildResult.command).toBe('build');
    
    const serveResult = parseArgs(['serve']);
    expect(serveResult.command).toBe('serve');
    
    const watchResult = parseArgs(['watch']);
    expect(watchResult.command).toBe('watch');
    
    const initResult = parseArgs(['init', 'blog']);
    expect(initResult.command).toBe('init');
    expect(initResult.template).toBe('blog');
  });
  
  test('should throw error for unknown command', () => {
    expect(() => {
      parseArgs(['unknown-command']);
    }).toThrow('Unknown command: unknown-command');
  });
  
  test('should handle complex argument combinations', () => {
    const args = [
      'build',
      '--source', 'content',
      '--output', 'public', 
      '--clean',
      '--pretty-urls',
      '--ignore', '**/drafts/**',
      '--ignore', '**/.DS_Store',
      '--copy', 'static/**',
      '--default-layout', '_base.html',
      '--default-layout', 'blog/**=_post.html',
      '--log-level', 'debug',
      '--fail-level', 'warning'
    ];
    
    const result = parseArgs(args);
    
    expect(result.command).toBe('build');
    expect(result.source).toBe('content');
    expect(result.output).toBe('public');
    expect(result.clean).toBe(true);
    expect(result.prettyUrls).toBe(true);
    expect(result.ignore).toEqual(['**/drafts/**', '**/.DS_Store']);
    expect(result.copy).toEqual(['static/**']);
    expect(result.defaultLayout).toEqual([
      { pattern: '*', layout: '_base.html' },
      { pattern: 'blog/**', layout: '_post.html' }
    ]);
    expect(result.logLevel).toBe('debug');
    expect(result.failLevel).toBe('warning');
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty arguments', () => {
      const result = parseArgs([]);
      expect(result.command).toBe('build'); // defaults to build
      expect(result.source).toBe('src');
      expect(result.output).toBe('dist');
    });

    test('should handle command suggestions for typos', () => {
      const testCases = [
        { input: 'bild', expected: 'build' },
        { input: 'buld', expected: 'build' },
        { input: 'serv', expected: 'serve' },
        { input: 'wat', expected: 'watch' },
        { input: 'ini', expected: 'init' }
      ];

      testCases.forEach(({ input, expected }) => {
        try {
          parseArgs([input]);
          expect(false).toBe(true); // Should throw
        } catch (error) {
          expect(error.message).toContain(`Unknown command: ${input}`);
          expect(error.suggestions).toContain(`Did you mean "${expected}"?`);
          expect(error.errorType).toBe('UsageError');
        }
      });
    });

    test('should not suggest commands for very different inputs', () => {
      try {
        parseArgs(['completely-different-command']);
        expect(false).toBe(true); // Should throw
      } catch (error) {
        expect(error.message).toContain('Unknown command: completely-different-command');
        expect(error.suggestions).not.toContain('Did you mean');
        expect(error.suggestions).toContain('Use --help to see valid options');
      }
    });

    test('should handle missing values for required options', () => {
      const testCases = [
        { args: ['build', '--copy'], expectedError: 'The --copy option requires a glob pattern value' },
        { args: ['build', '--ignore'], expectedError: 'The --ignore option requires a glob pattern value' },
        { args: ['build', '--ignore-render'], expectedError: 'The --ignore-render option requires a glob pattern value' },
        { args: ['build', '--ignore-copy'], expectedError: 'The --ignore-copy option requires a glob pattern value' },
        { args: ['build', '--render'], expectedError: 'The --render option requires a glob pattern value' },
        { args: ['build', '--default-layout'], expectedError: 'The --default-layout option requires a layout file or pattern=layout value' }
      ];

      testCases.forEach(({ args, expectedError }) => {
        expect(() => parseArgs(args)).toThrow(expectedError);
      });
    });

    test('should handle options that look like flags', () => {
      const testCases = [
        ['build', '--source', '--clean'], // --clean looks like a flag but is value for --source
        ['build', '--copy', '--minify'], // --minify looks like a flag but is value for --copy
        ['build', '--ignore', '--help'] // --help looks like a flag but is value for --ignore
      ];

      testCases.forEach(args => {
        expect(() => parseArgs(args)).toThrow();
      });
    });

    test('should validate auto-ignore boolean values', () => {
      expect(() => parseArgs(['build', '--auto-ignore', 'invalid']))
        .toThrow('Invalid --auto-ignore value: invalid');
      
      expect(() => parseArgs(['build', '--auto-ignore', 'yes']))
        .toThrow('Invalid --auto-ignore value: yes');

      const validTrue = parseArgs(['build', '--auto-ignore', 'true']);
      expect(validTrue.autoIgnore).toBe(true);

      const validFalse = parseArgs(['build', '--auto-ignore', 'false']);
      expect(validFalse.autoIgnore).toBe(false);
    });

    test('should handle port validation edge cases', () => {
      // First test that port works with valid values
      const validResult1 = parseArgs(['serve', '--port', '8080']);
      expect(validResult1.port).toBe(8080);

      const validResult2 = parseArgs(['build', '--port', '3000']);
      expect(validResult2.port).toBe(3000);

      // Test boundary values  
      const validResult3 = parseArgs(['serve', '--port', '1']);
      expect(validResult3.port).toBe(1);

      const validResult4 = parseArgs(['serve', '--port', '65535']);
      expect(validResult4.port).toBe(65535);

      // Test short flag
      const validResult5 = parseArgs(['serve', '-p', '8000']);
      expect(validResult5.port).toBe(8000);

      // Test single invalid port value
      expect(() => parseArgs(['serve', '--port', 'not-a-number']))
        .toThrow('Port must be a number between 1 and 65535');

      expect(() => parseArgs(['serve', '--port', '0']))
        .toThrow('Port must be a number between 1 and 65535');

      expect(() => parseArgs(['serve', '--port', '65536']))
        .toThrow('Port must be a number between 1 and 65535');
    });

    test('should handle log level validation edge cases', () => {
      const invalidLevels = [
        'invalid',
        'DEBUG', // case sensitivity
        'INFO',
        'WARN', 
        'ERROR',
        'trace',
        'fatal'
      ];

      invalidLevels.forEach(level => {
        expect(() => parseArgs(['build', '--log-level', level]))
          .toThrow(`Invalid --log-level value: ${level}`);
      });

      // Test missing log level value
      expect(() => parseArgs(['build', '--log-level']))
        .toThrow('The --log-level option requires a level value');

      // Test empty string - empty string doesn't satisfy nextArg && !nextArg.startsWith('-')
      // so it's treated as missing value
      expect(() => parseArgs(['build', '--log-level', '']))
        .toThrow('The --log-level option requires a level value');

      // Valid levels
      const validLevels = ['debug', 'info', 'warn', 'error'];
      validLevels.forEach(level => {
        const result = parseArgs(['build', '--log-level', level]);
        expect(result.logLevel).toBe(level);
      });
    });

    test('should handle fail level validation edge cases', () => {
      const invalidLevels = [
        'invalid',
        'WARNING', // case sensitivity  
        'ERROR',
        'none',
        'critical'
      ];

      invalidLevels.forEach(level => {
        expect(() => parseArgs(['build', '--fail-level', level]))
          .toThrow(`Invalid --fail-level value: ${level}`);
      });

      // Test missing fail level value
      expect(() => parseArgs(['build', '--fail-level']))
        .toThrow('The --fail-level option requires a level value');

      // Test empty string - treated as missing value
      expect(() => parseArgs(['build', '--fail-level', '']))
        .toThrow('The --fail-level option requires a level value');

      // Valid levels
      const validLevels = ['warning', 'error'];
      validLevels.forEach(level => {
        const result = parseArgs(['build', '--fail-level', level]);
        expect(result.failLevel).toBe(level);
      });
    });

    test('should handle unknown options', () => {
      const unknownOptions = [
        '--unknown',
        '--invalid-flag',
        '--non-existent',
        '-x',
        '-z'
      ];

      unknownOptions.forEach(option => {
        expect(() => parseArgs(['build', option]))
          .toThrow(`Unknown option: ${option}`);
      });
    });

    test('should handle default layout parsing edge cases', () => {
      // Pattern with equals in layout name - split(=, 2) only splits into 2 parts
      const result1 = parseArgs(['build', '--default-layout', 'blog/**=_post=special.html']);
      expect(result1.defaultLayout).toEqual([
        { pattern: 'blog/**', layout: '_post' }
      ]);

      // Multiple equals signs - only first split applies
      const result2 = parseArgs(['build', '--default-layout', 'docs/**=_doc=v2=final.html']);
      expect(result2.defaultLayout).toEqual([
        { pattern: 'docs/**', layout: '_doc' }
      ]);

      // Empty pattern before equals
      const result3 = parseArgs(['build', '--default-layout', '=_layout.html']);
      expect(result3.defaultLayout).toEqual([
        { pattern: '', layout: '_layout.html' }
      ]);

      // Layout without pattern (should get * pattern)
      const result4 = parseArgs(['build', '--default-layout', '_base.html']);
      expect(result4.defaultLayout).toEqual([
        { pattern: '*', layout: '_base.html' }
      ]);
    });

    test('should handle help and version with other arguments', () => {
      // Help with valid command and options
      const helpWithOptions = parseArgs(['build', '--source', 'src', '--help']);
      expect(helpWithOptions.help).toBe(true);
      expect(helpWithOptions.source).toBe('src');

      // Version with valid command
      const versionWithCommand = parseArgs(['build', '--version']);
      expect(versionWithCommand.version).toBe(true);

      // Help and version flags alone
      const helpOnly = parseArgs(['--help']);
      expect(helpOnly.help).toBe(true);

      const versionOnly = parseArgs(['--version']);
      expect(versionOnly.version).toBe(true);

      // Note: Invalid commands still throw errors even with help/version
      // This is the current implementation behavior
    });

    test('should handle init command with template edge cases', () => {
      // Init with template
      const result1 = parseArgs(['init', 'blog']);
      expect(result1.command).toBe('init');
      expect(result1.template).toBe('blog');

      // Init without template
      const result2 = parseArgs(['init']);
      expect(result2.command).toBe('init');
      expect(result2.template).toBe(null);

      // Init with options after template
      const result3 = parseArgs(['init', 'blog', '--source', 'content']);
      expect(result3.command).toBe('init');
      expect(result3.template).toBe('blog');
      expect(result3.source).toBe('content');
    });

    test('should handle multiple non-option arguments after command', () => {
      // Extra arguments are treated as unknown options and will throw errors
      // This is the current implementation behavior
      expect(() => parseArgs(['init', 'blog', 'extra', 'arguments']))
        .toThrow('Unknown option: extra');
      
      // Only valid init usage
      const result = parseArgs(['init', 'blog']);
      expect(result.command).toBe('init');
      expect(result.template).toBe('blog');
    });

    test('should handle short flag variations', () => {
      const result = parseArgs(['build', '-s', 'content', '-o', 'public', '-p', '8080', '--host', 'localhost']);
      expect(result.source).toBe('content');
      expect(result.output).toBe('public');
      expect(result.port).toBe(8080);
      expect(result.host).toBe('localhost');

      // Test -h for help, not host
      const helpResult = parseArgs(['build', '-h']);
      expect(helpResult.help).toBe(true);
    });

    test('should handle dry run option', () => {
      const result = parseArgs(['build', '--dry-run']);
      expect(result.dryRun).toBe(true);
    });

    test('should handle all repeatable options', () => {
      const args = [
        'build',
        '--ignore-render', 'drafts/**',
        '--ignore-render', 'temp/**',
        '--ignore-copy', 'private/**',
        '--ignore-copy', 'secret/**',
        '--render', 'experiments/**',
        '--render', 'beta/**'
      ];
      
      const result = parseArgs(args);
      expect(result.ignoreRender).toEqual(['drafts/**', 'temp/**']);
      expect(result.ignoreCopy).toEqual(['private/**', 'secret/**']);
      expect(result.render).toEqual(['experiments/**', 'beta/**']);
    });

    test('should handle special characters in patterns', () => {
      const args = [
        'build',
        '--ignore', '**/*.{tmp,bak}',
        '--copy', 'assets/**/*.{png,jpg,gif}',
        '--default-layout', 'special-[chars]=_layout.html'
      ];
      
      const result = parseArgs(args);
      expect(result.ignore).toEqual(['**/*.{tmp,bak}']);
      expect(result.copy).toEqual(['assets/**/*.{png,jpg,gif}']);
      expect(result.defaultLayout).toEqual([
        { pattern: 'special-[chars]', layout: '_layout.html' }
      ]);
    });
  });

  describe('Performance and Large Input Handling', () => {
    test('should handle large number of repeated options', () => {
      const args = ['build'];
      
      // Add 100 ignore patterns
      for (let i = 0; i < 100; i++) {
        args.push('--ignore', `pattern${i}/**`);
      }
      
      const result = parseArgs(args);
      expect(result.ignore).toHaveLength(100);
      expect(result.ignore[0]).toBe('pattern0/**');
      expect(result.ignore[99]).toBe('pattern99/**');
    });

    test('should handle very long argument values', () => {
      const longPath = 'a'.repeat(1000);
      const result = parseArgs(['build', '--source', longPath]);
      expect(result.source).toBe(longPath);
    });

    test('should handle complex nested patterns', () => {
      const complexPattern = 'deeply/nested/**/structure/**/*.{html,md,txt}';
      const result = parseArgs(['build', '--ignore', complexPattern]);
      expect(result.ignore).toEqual([complexPattern]);
    });
  });
});