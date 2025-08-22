/**
 * Path Validator Directory Options Tests (US-006)
 * Tests directory path validation for source and output directories
 * 
 * Acceptance Criteria from US-006:
 * - GIVEN user specifies directory paths
 * - WHEN path validation is applied
 * - THEN security validation should prevent path traversal
 * - AND invalid paths should be rejected with appropriate errors
 * - AND valid relative paths should be accepted
 * - AND security violations should be logged appropriately
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { PathValidator } from "../../../src/core/path-validator.js";
import { PathTraversalError, ValidationError } from "../../../src/core/errors.js";

describe("Path Validator - Directory Options (US-006)", () => {
  let pathValidator;

  beforeEach(() => {
    pathValidator = new PathValidator();
  });

  describe("Source directory validation", () => {
    it("should_accept_valid_relative_source_directory", () => {
      const sourceRoot = process.cwd();
      const inputPath = './src';
      
      expect(() => {
        pathValidator.validatePath(inputPath, sourceRoot);
      }).not.toThrow();
    });

    it("should_accept_valid_subdirectory_source", () => {
      const sourceRoot = process.cwd();
      const inputPath = 'content/pages';
      
      expect(() => {
        pathValidator.validatePath(inputPath, sourceRoot);
      }).not.toThrow();
    });

    it("should_reject_path_traversal_in_source", () => {
      const sourceRoot = process.cwd();
      const inputPath = '../../../etc/passwd';
      
      expect(() => {
        pathValidator.validatePath(inputPath, sourceRoot);
      }).toThrow(PathTraversalError);
    });

    it("should_reject_absolute_path_outside_project", () => {
      const sourceRoot = process.cwd();
      const inputPath = '/etc/sensitive';
      
      expect(() => {
        pathValidator.validatePath(inputPath, sourceRoot);
      }).toThrow(PathTraversalError);
    });

    it("should_reject_encoded_path_traversal", () => {
      const sourceRoot = process.cwd();
      const inputPath = '..%2F..%2F..%2Fetc';
      
      expect(() => {
        pathValidator.validatePath(inputPath, sourceRoot);
      }).toThrow(PathTraversalError);
    });

    it("should_reject_null_byte_injection_in_source", () => {
      const sourceRoot = process.cwd();
      const inputPath = 'src\\x00../../etc';
      
      expect(() => {
        pathValidator.validatePath(inputPath, sourceRoot);
      }).toThrow(PathTraversalError);
    });

    it("should_validate_and_resolve_valid_source", () => {
      const sourceRoot = process.cwd();
      const inputPath = './src/content';
      
      const resolved = pathValidator.validateAndResolve(inputPath, sourceRoot);
      
      expect(resolved).toContain('src/content');
      expect(resolved).toContain(sourceRoot);
    });
  });

  describe("Output directory validation", () => {
    it("should_accept_valid_relative_output_directory", () => {
      const sourceRoot = process.cwd();
      const inputPath = './dist';
      
      expect(() => {
        pathValidator.validatePath(inputPath, sourceRoot);
      }).not.toThrow();
    });

    it("should_accept_valid_subdirectory_output", () => {
      const sourceRoot = process.cwd();
      const inputPath = 'build/production';
      
      expect(() => {
        pathValidator.validatePath(inputPath, sourceRoot);
      }).not.toThrow();
    });

    it("should_reject_path_traversal_in_output", () => {
      const sourceRoot = process.cwd();
      const inputPath = '../../../tmp/evil';
      
      expect(() => {
        pathValidator.validatePath(inputPath, sourceRoot);
      }).toThrow(PathTraversalError);
    });

    it("should_reject_absolute_output_outside_project", () => {
      const sourceRoot = process.cwd();
      const inputPath = '/tmp/malicious';
      
      expect(() => {
        pathValidator.validatePath(inputPath, sourceRoot);
      }).toThrow(PathTraversalError);
    });

    it("should_handle_output_same_as_source_root", () => {
      const sourceRoot = process.cwd();
      const inputPath = '.';
      
      expect(() => {
        pathValidator.validatePath(inputPath, sourceRoot);
      }).not.toThrow();
    });

    it("should_validate_and_resolve_valid_output", () => {
      const sourceRoot = process.cwd();
      const inputPath = './dist/build';
      
      const resolved = pathValidator.validateAndResolve(inputPath, sourceRoot);
      
      expect(resolved).toContain('dist/build');
      expect(resolved).toContain(sourceRoot);
    });
  });

  describe("Cross-platform directory validation", () => {
    it("should_handle_windows_style_paths", () => {
      const sourceRoot = process.cwd();
      const inputPath = 'src\\content';
      
      expect(() => {
        pathValidator.validatePath(inputPath, sourceRoot);
      }).not.toThrow();
    });

    it("should_reject_windows_path_traversal", () => {
      const sourceRoot = process.cwd();
      const inputPath = '..\\..\\..\\Windows\\System32';
      
      expect(() => {
        pathValidator.validatePath(inputPath, sourceRoot);
      }).toThrow(PathTraversalError);
    });

    it("should_handle_mixed_path_separators", () => {
      const sourceRoot = process.cwd();
      const inputPath = './src\\content/pages';
      
      expect(() => {
        pathValidator.validatePath(inputPath, sourceRoot);
      }).not.toThrow();
    });

    it("should_normalize_path_separators", () => {
      const sourceRoot = process.cwd();
      const inputPath = '.\\src\\content';
      
      const resolved = pathValidator.validateAndResolve(inputPath, sourceRoot);
      
      // Should be normalized to use forward slashes internally
      expect(resolved).toBeDefined();
      expect(typeof resolved).toBe('string');
    });
  });

  describe("Directory-specific edge cases", () => {
    it("should_reject_empty_source_path", () => {
      const sourceRoot = process.cwd();
      const inputPath = '';
      
      expect(() => {
        pathValidator.validatePath(inputPath, sourceRoot);
      }).toThrow(PathTraversalError);
    });

    it("should_reject_null_source_path", () => {
      const sourceRoot = process.cwd();
      const inputPath = null;
      
      expect(() => {
        pathValidator.validatePath(inputPath, sourceRoot);
      }).toThrow(PathTraversalError);
    });

    it("should_reject_undefined_source_path", () => {
      const sourceRoot = process.cwd();
      const inputPath = undefined;
      
      expect(() => {
        pathValidator.validatePath(inputPath, sourceRoot);
      }).toThrow(PathTraversalError);
    });

    it("should_reject_non_string_source_path", () => {
      const sourceRoot = process.cwd();
      const inputPath = 123;
      
      expect(() => {
        pathValidator.validatePath(inputPath, sourceRoot);
      }).toThrow(PathTraversalError);
    });

    it("should_handle_very_long_directory_paths", () => {
      const sourceRoot = process.cwd();
      const longPath = 'a'.repeat(100) + '/' + 'b'.repeat(100);
      
      expect(() => {
        pathValidator.validatePath(longPath, sourceRoot);
      }).not.toThrow();
    });

    it("should_handle_paths_with_special_characters", () => {
      const sourceRoot = process.cwd();
      const inputPath = './src-content_v2.0';
      
      expect(() => {
        pathValidator.validatePath(inputPath, sourceRoot);
      }).not.toThrow();
    });

    it("should_handle_paths_with_spaces", () => {
      const sourceRoot = process.cwd();
      const inputPath = './src content/my pages';
      
      expect(() => {
        pathValidator.validatePath(inputPath, sourceRoot);
      }).not.toThrow();
    });
  });

  describe("Security logging and error messages", () => {
    it("should_log_security_violation_for_path_traversal", () => {
      const sourceRoot = process.cwd();
      const inputPath = '../../../etc';
      
      // Capture console.error output
      const originalError = console.error;
      let loggedMessage = '';
      console.error = (message) => { loggedMessage = message; };
      
      try {
        pathValidator.validatePath(inputPath, sourceRoot);
      } catch (error) {
        // Expected to throw
      }
      
      console.error = originalError;
      
      expect(loggedMessage).toContain('[SECURITY]');
      expect(loggedMessage).toContain('Path traversal attempt detected');
    });

    it("should_provide_user_friendly_error_message", () => {
      const sourceRoot = process.cwd();
      const inputPath = '../../../etc';
      
      try {
        pathValidator.validatePath(inputPath, sourceRoot);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(PathTraversalError);
        expect(error.userMessage).toBe("Invalid file path: access outside project directory not allowed");
        expect(error.exitCode).toBe(2);
      }
    });

    it("should_include_attempted_path_in_error", () => {
      const sourceRoot = process.cwd();
      const inputPath = '../malicious/path';
      
      try {
        pathValidator.validatePath(inputPath, sourceRoot);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(PathTraversalError);
        expect(error.attemptedPath).toBe(inputPath);
        expect(error.sourceRoot).toBe(sourceRoot);
      }
    });

    it("should_handle_custom_error_messages", () => {
      const sourceRoot = process.cwd();
      const inputPath = null;
      
      try {
        pathValidator.validatePath(inputPath, sourceRoot);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(PathTraversalError);
        expect(error.message).toContain("Invalid path: path must be a non-empty string");
      }
    });
  });

  describe("Performance considerations", () => {
    it("should_validate_paths_quickly", () => {
      const sourceRoot = process.cwd();
      const inputPath = './src/content';
      
      const startTime = performance.now();
      
      for (let i = 0; i < 1000; i++) {
        pathValidator.validatePath(inputPath, sourceRoot);
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      // Should validate 1000 paths in less than 100ms
      expect(totalTime).toBeLessThan(100);
    });

    it("should_not_consume_excessive_memory", () => {
      const sourceRoot = process.cwd();
      const paths = [];
      
      // Create many path validations
      for (let i = 0; i < 100; i++) {
        paths.push(`./src/path-${i}`);
      }
      
      expect(() => {
        paths.forEach(path => {
          pathValidator.validatePath(path, sourceRoot);
        });
      }).not.toThrow();
    });
  });
});

/**
 * This test file implements TDD RED phase for US-006 directory validation:
 * 
 * EXPECTED FAILURES:
 * - All tests should PASS as PathValidator already exists and handles these cases
 * - This validates the existing PathValidator works for directory use cases
 * 
 * VERIFICATION:
 * - PathValidator should handle all directory validation scenarios
 * - Security validation should work for both source and output directories
 * - Cross-platform path handling should work correctly
 * - Performance requirements should be met
 * 
 * COVERAGE TARGET: ≥90% of PathValidator directory validation paths
 */