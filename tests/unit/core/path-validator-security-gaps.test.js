/**
 * Path Validator Security Coverage Gap Tests - ISSUE-002
 * Tests missing coverage lines identified in coverage analysis
 * Lines to cover: 28,32,68-69,106,108,133,144-157,253,259,264,281,286,293-294,296-298
 */

import { describe, test, expect, beforeEach, spyOn } from 'bun:test';
import { PathValidator } from '../../../src/core/path-validator.js';
import { PathTraversalError } from '../../../src/core/errors.js';

describe('PathValidator Security Coverage Gaps', () => {
  let validator;

  beforeEach(() => {
    validator = new PathValidator();
  });

  describe('Invalid Input Validation Edge Cases', () => {
    test('should_handle_null_input_path_correctly', () => {
      const sourceRoot = '/safe/project/src';
      
      expect(() => {
        validator.validatePath(null, sourceRoot);
      }).toThrow(PathTraversalError);
    });

    test('should_handle_undefined_input_path_correctly', () => {
      const sourceRoot = '/safe/project/src';
      
      expect(() => {
        validator.validatePath(undefined, sourceRoot);
      }).toThrow(PathTraversalError);
    });

    test('should_handle_empty_string_input_path', () => {
      const sourceRoot = '/safe/project/src';
      
      expect(() => {
        validator.validatePath('', sourceRoot);
      }).toThrow(PathTraversalError);
    });

    test('should_handle_non_string_input_path', () => {
      const sourceRoot = '/safe/project/src';
      
      expect(() => {
        validator.validatePath(123, sourceRoot);
      }).toThrow(PathTraversalError);
    });

    test('should_handle_null_source_root', () => {
      expect(() => {
        validator.validatePath('/some/path', null);
      }).toThrow(PathTraversalError);
    });

    test('should_handle_undefined_source_root', () => {
      expect(() => {
        validator.validatePath('/some/path', undefined);
      }).toThrow(PathTraversalError);
    });

    test('should_handle_empty_string_source_root', () => {
      expect(() => {
        validator.validatePath('/some/path', '');
      }).toThrow(PathTraversalError);
    });

    test('should_handle_non_string_source_root', () => {
      expect(() => {
        validator.validatePath('/some/path', 123);
      }).toThrow(PathTraversalError);
    });
  });

  describe('System Directory Protection Edge Cases', () => {
    test('should_block_system_directory_access_when_not_legitimate_working_path', () => {
      const sourceRoot = '/safe/project/src';
      
      expect(() => {
        validator.validatePath('/etc/passwd', sourceRoot);
      }).toThrow(PathTraversalError);
    });

    test('should_allow_system_directory_access_from_legitimate_working_path', () => {
      // Test when source root is in /tmp (legitimate working directory)
      const sourceRoot = '/tmp/test-project';
      const inputPath = 'layouts/main.html'; // Relative path within working directory
      
      expect(() => {
        validator.validatePath(inputPath, sourceRoot);
      }).not.toThrow();
    });

    test('should_handle_resolution_mismatch_edge_case', () => {
      // This tests line 108: resolve(normalizedSourceRoot, relativePath) !== resolvedPath
      const sourceRoot = '/safe/project/src';
      
      // Use a complex path that might cause resolution mismatch
      expect(() => {
        validator.validatePath('/etc/passwd', sourceRoot);
      }).toThrow(PathTraversalError);
    });
  });

  describe('URL Decoding Edge Cases', () => {
    test('should_handle_malformed_url_encoding_gracefully', () => {
      const sourceRoot = '/safe/project/src';
      const malformedPath = '%GG%HH%invalid'; // Invalid URL encoding
      
      // Should not throw due to URL decoding failure, should use original path
      expect(() => {
        validator.validatePath(malformedPath, sourceRoot);
      }).not.toThrow();
    });

    test('should_handle_partial_url_encoding', () => {
      const sourceRoot = '/safe/project/src';
      const partialPath = 'test%2Ffile.html'; // Partially encoded path
      
      expect(() => {
        validator.validatePath(partialPath, sourceRoot);
      }).not.toThrow();
    });

    test('should_handle_url_decoding_exception_path', () => {
      // Spy on decodeURIComponent to simulate failure
      const originalDecode = global.decodeURIComponent;
      global.decodeURIComponent = () => {
        throw new Error('Decoding failed');
      };

      try {
        const sourceRoot = '/safe/project/src';
        const inputPath = 'test/file.html';
        
        expect(() => {
          validator.validatePath(inputPath, sourceRoot);
        }).not.toThrow();
      } finally {
        // Restore original function
        global.decodeURIComponent = originalDecode;
      }
    });
  });

  describe('Legitimate Working Path Detection', () => {
    test('should_identify_tmp_directory_as_legitimate', () => {
      const validator = new PathValidator();
      const result = validator._isLegitimateWorkingPath('/tmp/test-project/file.html');
      expect(result).toBe(true);
    });

    test('should_identify_var_tmp_directory_as_legitimate', () => {
      const validator = new PathValidator();
      const result = validator._isLegitimateWorkingPath('/var/tmp/test-project/file.html');
      expect(result).toBe(true);
    });

    test('should_identify_env_tmpdir_as_legitimate', () => {
      // Mock environment variables
      const originalTMPDIR = process.env.TMPDIR;
      process.env.TMPDIR = '/custom/tmp';

      try {
        const validator = new PathValidator();
        const result = validator._isLegitimateWorkingPath('/custom/tmp/test-project/file.html');
        expect(result).toBe(true);
      } finally {
        process.env.TMPDIR = originalTMPDIR;
      }
    });

    test('should_identify_env_temp_as_legitimate', () => {
      // Mock environment variables
      const originalTEMP = process.env.TEMP;
      process.env.TEMP = '/custom/temp';

      try {
        const validator = new PathValidator();
        const result = validator._isLegitimateWorkingPath('/custom/temp/test-project/file.html');
        expect(result).toBe(true);
      } finally {
        process.env.TEMP = originalTEMP;
      }
    });

    test('should_identify_env_tmp_as_legitimate', () => {
      // Mock environment variables
      const originalTMP = process.env.TMP;
      process.env.TMP = '/custom/tmp';

      try {
        const validator = new PathValidator();
        const result = validator._isLegitimateWorkingPath('/custom/tmp/test-project/file.html');
        expect(result).toBe(true);
      } finally {
        process.env.TMP = originalTMP;
      }
    });

    test('should_handle_empty_environment_variables', () => {
      // Mock empty environment variables
      const originalTMPDIR = process.env.TMPDIR;
      const originalTEMP = process.env.TEMP;
      const originalTMP = process.env.TMP;
      
      process.env.TMPDIR = '';
      process.env.TEMP = '';
      process.env.TMP = '';

      try {
        const validator = new PathValidator();
        const result = validator._isLegitimateWorkingPath('/tmp/test-project/file.html');
        expect(result).toBe(true); // Should still work with /tmp/
      } finally {
        process.env.TMPDIR = originalTMPDIR;
        process.env.TEMP = originalTEMP;
        process.env.TMP = originalTMP;
      }
    });

    test('should_reject_non_legitimate_working_paths', () => {
      const validator = new PathValidator();
      const result = validator._isLegitimateWorkingPath('/etc/passwd');
      expect(result).toBe(false);
    });

    test('should_normalize_windows_paths_in_working_path_check', () => {
      const validator = new PathValidator();
      const result = validator._isLegitimateWorkingPath('C:\\tmp\\test\\file.html');
      expect(result).toBe(false); // C:\tmp is not in our Unix tmp list
    });
  });

  describe('Malicious Pattern Detection Edge Cases', () => {
    test('should_detect_exact_system_directory_matches', () => {
      const validator = new PathValidator();
      const result = validator._containsMaliciousPatterns('/etc');
      expect(result).toBe(true);
    });

    test('should_detect_system_directory_with_trailing_slash', () => {
      const validator = new PathValidator();
      const result = validator._containsMaliciousPatterns('/etc/');
      expect(result).toBe(true);
    });

    test('should_detect_windows_system_paths', () => {
      const validator = new PathValidator();
      const result = validator._containsMaliciousPatterns('\\etc\\passwd');
      expect(result).toBe(true);
    });

    test('should_detect_case_insensitive_system_paths', () => {
      const validator = new PathValidator();
      const result = validator._containsMaliciousPatterns('/ETC/PASSWD');
      expect(result).toBe(true);
    });

    test('should_detect_url_encoded_null_bytes', () => {
      const validator = new PathValidator();
      const result = validator._containsMaliciousPatterns('file%00.txt');
      expect(result).toBe(true);
    });

    test('should_detect_hex_encoded_null_bytes', () => {
      const validator = new PathValidator();
      const result = validator._containsMaliciousPatterns('file\\x00.txt');
      expect(result).toBe(true);
    });

    test('should_detect_windows_traversal_at_start', () => {
      const validator = new PathValidator();
      const result = validator._containsMaliciousPatterns('\\..\\..\\system32');
      expect(result).toBe(true);
    });

    test('should_allow_legitimate_layout_paths_with_high_traversal_count', () => {
      const validator = new PathValidator();
      
      // 3+ traversals but legitimate layout pattern
      const result = validator._containsMaliciousPatterns('../../../_layouts/main.html');
      expect(result).toBe(false);
    });

    test('should_block_non_layout_paths_with_3_plus_traversals', () => {
      const validator = new PathValidator();
      
      // 3+ traversals without legitimate layout pattern
      const result = validator._containsMaliciousPatterns('../../../etc/passwd');
      expect(result).toBe(true);
    });

    test('should_always_block_excessive_traversal_over_5_levels', () => {
      const validator = new PathValidator();
      
      // Even with layout pattern, 6+ traversals should be blocked
      const result = validator._containsMaliciousPatterns('../../../../../../_layouts/main.html');
      expect(result).toBe(true);
    });

    test('should_handle_common_mixed_separator_patterns', () => {
      const validator = new PathValidator();
      
      // Common mixed pattern: ./dir\subdir/file
      const result = validator._containsMaliciousPatterns('./src\\content/page.html');
      expect(result).toBe(false);
    });

    test('should_handle_simple_mixed_separator_patterns', () => {
      const validator = new PathValidator();
      
      // Simple mixed pattern: dir\subdir/file
      const result = validator._containsMaliciousPatterns('src\\content/page.html');
      expect(result).toBe(false);
    });

    test('should_block_complex_mixed_separator_patterns', () => {
      const validator = new PathValidator();
      
      // Complex suspicious mixed patterns
      const result = validator._containsMaliciousPatterns('..\\..\\system/etc/passwd\\file');
      expect(result).toBe(true);
    });
  });

  describe('Path Resolution and Validation Edge Cases', () => {
    test('should_handle_validateAndResolve_with_complex_path', () => {
      const sourceRoot = '/safe/project/src';
      const inputPath = './components/../layouts/main.html';
      
      const result = validator.validateAndResolve(inputPath, sourceRoot);
      expect(result).toStartWith(sourceRoot);
    });

    test('should_handle_legitimate_layout_patterns_in_traversal_validation', () => {
      const sourceRoot = '/safe/project/src';
      
      // Should allow _layouts directory traversal
      expect(() => {
        validator.validatePath('../_layouts/main.html', sourceRoot);
      }).not.toThrow();
    });

    test('should_handle_legitimate_includes_patterns', () => {
      const sourceRoot = '/safe/project/src';
      
      // Should allow _includes directory traversal
      expect(() => {
        validator.validatePath('../_includes/header.html', sourceRoot);
      }).not.toThrow();
    });

    test('should_handle_legitimate_components_patterns', () => {
      const sourceRoot = '/safe/project/src';
      
      // Should allow _components directory traversal
      expect(() => {
        validator.validatePath('../_components/button.html', sourceRoot);
      }).not.toThrow();
    });

    test('should_handle_legitimate_output_directory_patterns', () => {
      const sourceRoot = '/safe/project/src';
      
      // Should allow common output directories
      expect(() => {
        validator.validatePath('../dist/index.html', sourceRoot);
      }).not.toThrow();

      expect(() => {
        validator.validatePath('../build/index.html', sourceRoot);
      }).not.toThrow();
    });

    test('should_handle_legitimate_asset_directory_patterns', () => {
      const sourceRoot = '/safe/project/src';
      
      // Should allow asset directories
      expect(() => {
        validator.validatePath('../assets/styles.css', sourceRoot);
      }).not.toThrow();

      expect(() => {
        validator.validatePath('../static/images/logo.png', sourceRoot);
      }).not.toThrow();
    });

    test('should_block_traversal_without_legitimate_patterns', () => {
      const sourceRoot = '/safe/project/src';
      
      // Should block traversal to non-legitimate directories
      expect(() => {
        validator.validatePath('../secrets/config.json', sourceRoot);
      }).toThrow(PathTraversalError);
    });
  });

  describe('Null Byte Detection', () => {
    test('should_detect_actual_null_bytes', () => {
      const validator = new PathValidator();
      const result = validator._containsNullBytes('file\0.txt');
      expect(result).toBe(true);
    });

    test('should_detect_hex_null_bytes', () => {
      const validator = new PathValidator();
      const result = validator._containsNullBytes('file\\x00.txt');
      expect(result).toBe(true);
    });

    test('should_detect_url_encoded_null_bytes', () => {
      const validator = new PathValidator();
      const result = validator._containsNullBytes('file%00.txt');
      expect(result).toBe(true);
    });

    test('should_return_false_for_clean_paths', () => {
      const validator = new PathValidator();
      const result = validator._containsNullBytes('clean/file.txt');
      expect(result).toBe(false);
    });
  });
});