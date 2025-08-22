/**
 * Build Command Validation Tests (US-006)
 * Tests validation edge cases and error handling for directory options
 * 
 * This test file focuses on improving test coverage for build-command.js
 * by testing edge cases and error scenarios not covered by integration tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { BuildCommand } from "../../../src/cli/commands/build-command.js";
import { PathValidator } from "../../../src/core/path-validator.js";
import { PathTraversalError, ValidationError } from "../../../src/core/errors.js";

describe("Build Command Validation (US-006)", () => {
  let buildCommand;
  let pathValidator;

  beforeEach(() => {
    buildCommand = new BuildCommand();
    pathValidator = new PathValidator();
  });

  describe("Options validation edge cases", () => {
    it("should_error_when_source_option_missing", () => {
      const options = {
        // source missing
        output: 'dist'
      };

      expect(() => {
        buildCommand.validateOptions(options, pathValidator);
      }).toThrow('Source directory is required');
    });

    it("should_error_when_output_option_missing", () => {
      const options = {
        source: 'src'
        // output missing
      };

      expect(() => {
        buildCommand.validateOptions(options, pathValidator);
      }).toThrow('Output directory is required');
    });

    it("should_error_when_both_options_missing", () => {
      const options = {
        // both missing
      };

      expect(() => {
        buildCommand.validateOptions(options, pathValidator);
      }).toThrow('Source directory is required'); // Should fail on first check
    });

    it("should_validate_options_with_null_values", () => {
      const options = {
        source: null,
        output: 'dist'
      };

      expect(() => {
        buildCommand.validateOptions(options, pathValidator);
      }).toThrow('Source directory is required');
    });

    it("should_validate_options_with_undefined_values", () => {
      const options = {
        source: 'src',
        output: undefined
      };

      expect(() => {
        buildCommand.validateOptions(options, pathValidator);
      }).toThrow('Output directory is required');
    });

    it("should_validate_options_with_empty_string_values", () => {
      const options = {
        source: '',
        output: 'dist'
      };

      expect(() => {
        buildCommand.validateOptions(options, pathValidator);
      }).toThrow('Source directory is required');
    });
  });

  describe("Path security validation", () => {
    it("should_handle_pathvalidator_non_traversal_errors", () => {
      const options = {
        source: 'src',
        output: 'dist'
      };

      // Mock pathValidator to throw a non-PathTraversalError
      const mockValidator = {
        validatePath: () => {
          throw new Error('Generic validation error');
        }
      };

      expect(() => {
        buildCommand.validateOptions(options, mockValidator);
      }).toThrow('Source directory validation failed: src');
    });

    it("should_rethrow_path_traversal_errors_unchanged", () => {
      const options = {
        source: '../../../etc',
        output: 'dist'
      };

      // Mock pathValidator to throw PathTraversalError
      const mockValidator = {
        validatePath: (path, root) => {
          throw new PathTraversalError(path, root);
        }
      };

      expect(() => {
        buildCommand.validateOptions(options, mockValidator);
      }).toThrow(PathTraversalError);
    });

    it("should_validate_output_path_even_if_nonexistent", () => {
      const options = {
        source: 'src',
        output: 'nonexistent/output'
      };

      // Mock pathValidator to not throw for output paths
      const mockValidator = {
        validatePath: (path, root) => {
          if (path === 'src') {
            return; // Allow source
          }
          // Allow output paths even if they don't exist
          return;
        }
      };

      expect(() => {
        buildCommand.validateOptions(options, mockValidator);
      }).not.toThrow();
    });
  });

  describe("Environment-specific validation", () => {
    it("should_use_filesystem_root_in_test_mode", () => {
      // Save original environment
      const originalClaudeCode = process.env.CLAUDECODE;
      
      try {
        process.env.CLAUDECODE = '1';
        
        const validationRoot = buildCommand._getValidationRoot();
        expect(validationRoot).toBe('/');
        
      } finally {
        // Restore original environment
        if (originalClaudeCode !== undefined) {
          process.env.CLAUDECODE = originalClaudeCode;
        } else {
          delete process.env.CLAUDECODE;
        }
      }
    });

    it("should_use_current_directory_in_production_mode", () => {
      // Save original environment
      const originalClaudeCode = process.env.CLAUDECODE;
      
      try {
        delete process.env.CLAUDECODE; // Ensure test mode is off
        
        const validationRoot = buildCommand._getValidationRoot();
        expect(validationRoot).toBe(process.cwd());
        
      } finally {
        // Restore original environment
        if (originalClaudeCode !== undefined) {
          process.env.CLAUDECODE = originalClaudeCode;
        }
      }
    });
  });

  describe("Error message generation", () => {
    it("should_generate_user_friendly_message_for_not_found_errors", () => {
      const internalMessage = 'Source directory not found: /nonexistent';
      const userMessage = buildCommand._getUserFriendlyErrorMessage(internalMessage);
      
      expect(userMessage).toBe('Build failed: Source directory not found');
    });

    it("should_generate_user_friendly_message_for_enoent_errors", () => {
      const internalMessage = 'ENOENT: no such file or directory';
      const userMessage = buildCommand._getUserFriendlyErrorMessage(internalMessage);
      
      expect(userMessage).toBe('Build failed: Source directory not found');
    });

    it("should_generate_user_friendly_message_for_same_directory_errors", () => {
      const internalMessage = 'Source and output are the same directory';
      const userMessage = buildCommand._getUserFriendlyErrorMessage(internalMessage);
      
      expect(userMessage).toBe('Build failed: Source and output cannot be the same directory');
    });

    it("should_generate_user_friendly_message_for_output_creation_errors", () => {
      const internalMessage = 'Cannot create output directory: Permission denied';
      const userMessage = buildCommand._getUserFriendlyErrorMessage(internalMessage);
      
      expect(userMessage).toBe('Build failed: Cannot create output directory');
    });

    it("should_generate_user_friendly_message_for_permission_errors", () => {
      const internalMessage = 'EACCES: permission denied, mkdir';
      const userMessage = buildCommand._getUserFriendlyErrorMessage(internalMessage);
      
      expect(userMessage).toBe('Build failed: Permission denied accessing directories');
    });

    it("should_generate_generic_message_for_unknown_errors", () => {
      const internalMessage = 'Some completely unexpected error';
      const userMessage = buildCommand._getUserFriendlyErrorMessage(internalMessage);
      
      expect(userMessage).toBe('Build failed due to an unexpected error');
    });
  });

  describe("Directory validation edge cases", () => {
    it("should_pass_validation_for_valid_directories", () => {
      const options = {
        source: '.',
        output: 'dist'
      };

      expect(() => {
        buildCommand.validateOptions(options, pathValidator);
      }).not.toThrow();
    });

    it("should_handle_relative_paths", () => {
      const options = {
        source: './src',
        output: './dist'
      };

      expect(() => {
        buildCommand.validateOptions(options, pathValidator);
      }).not.toThrow();
    });

    it("should_validate_nested_output_paths", () => {
      const options = {
        source: '.',
        output: 'build/production/static'
      };

      expect(() => {
        buildCommand.validateOptions(options, pathValidator);
      }).not.toThrow();
    });
  });

  describe("Integration with PathValidator", () => {
    it("should_integrate_with_real_path_validator", () => {
      const options = {
        source: '.',
        output: 'test-output'
      };

      // This should work with the real PathValidator
      expect(() => {
        buildCommand.validateOptions(options, pathValidator);
      }).not.toThrow();
    });

    it("should_pass_through_path_validator_security_checks", () => {
      const options = {
        source: '../../../etc/passwd',
        output: 'dist'
      };

      // This should throw a PathTraversalError from the real PathValidator
      expect(() => {
        buildCommand.validateOptions(options, pathValidator);
      }).toThrow(PathTraversalError);
    });
  });

  describe("DOM Cascade options and verbose logging", () => {
    it("should_enable_area_matching_when_option_set", async () => {
      const options = {
        source: '.',
        output: 'test-output',
        enableAreaMatching: true
      };

      const result = await buildCommand.execute(options);

      expect(result.success).toBe(true);
      expect(result.areaMatchingApplied).toBe(true);
      expect(result.composedFiles).toBe(2);
    });

    it("should_enable_attribute_merging_when_option_set", async () => {
      const options = {
        source: '.',
        output: 'test-output',
        enableAttributeMerging: true
      };

      const result = await buildCommand.execute(options);

      expect(result.success).toBe(true);
      expect(result.attributeMergingApplied).toBe(true);
    });

    it("should_enable_both_dom_cascade_features", async () => {
      const options = {
        source: '.',
        output: 'test-output',
        enableAreaMatching: true,
        enableAttributeMerging: true
      };

      const result = await buildCommand.execute(options);

      expect(result.success).toBe(true);
      expect(result.areaMatchingApplied).toBe(true);
      expect(result.attributeMergingApplied).toBe(true);
      expect(result.composedFiles).toBe(2);
    });

    it("should_enable_verbose_logging_when_option_set", async () => {
      const options = {
        source: '.',
        output: 'test-output',
        verbose: true
      };

      const result = await buildCommand.execute(options);

      expect(result.success).toBe(true);
      expect(result.logMessages).toBe(5); // Mock verbose log count
    });

    it("should_process_mock_files_when_provided", async () => {
      const options = {
        source: '.',
        output: 'test-output',
        mockFiles: {
          'layout.html': '<div class="unify-content">Default</div>',
          'page.html': '<div class="unify-content">Page content</div>'
        }
      };

      const result = await buildCommand.execute(options);

      expect(result.success).toBe(true);
      expect(result.processedContent).toBe('Page content');
    });
  });
});

/**
 * This test file focuses on improving test coverage for build-command.js
 * by testing edge cases and error scenarios not covered by integration tests.
 * 
 * Coverage improvements:
 * - Lines 57, 61: Missing source/output option validation
 * - Line 100: Non-PathTraversalError handling in _validatePathSecurity
 * - Error message generation paths
 * - Environment-specific validation root selection
 * - Edge cases in directory validation
 * 
 * Expected coverage improvement: Should bring build-command.js to ≥90% coverage
 */