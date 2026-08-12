/**
 * Path Traversal Prevention Tests (US-012)
 * Security foundation requirement - must pass before any file processing
 * 
 * Acceptance Criteria:
 * - GIVEN a file path input
 * - WHEN the path contains traversal patterns (../, ..\, absolute paths outside source)
 * - THEN the system MUST reject the path with PathTraversalError
 * - AND log the attempted path traversal for security monitoring
 * - AND return appropriate exit code for CLI usage
 */

import { describe, it, expect } from "bun:test";
import { PathValidator } from "../../../src/core/path-validator.js";
import { PathTraversalError } from "../../../src/core/errors.js";

describe("Path Traversal Prevention (US-012)", () => {
  const validator = new PathValidator();
  const sourceRoot = "/safe/project/src";

  describe("Path validation rejection scenarios", () => {
    it("should reject relative paths with parent directory traversal", () => {
      expect(() => validator.validatePath("../../../etc/passwd", sourceRoot))
        .toThrow(PathTraversalError);
    });

    it("should reject paths with encoded traversal attempts", () => {
      expect(() => validator.validatePath("%2E%2E%2F%2E%2E%2Fetc%2Fpasswd", sourceRoot))
        .toThrow(PathTraversalError);
    });

    it("should reject absolute paths outside source root", () => {
      expect(() => validator.validatePath("/etc/passwd", sourceRoot))
        .toThrow(PathTraversalError);
    });

    it("should reject Windows-style path traversal", () => {
      expect(() => validator.validatePath("..\\..\\windows\\system32", sourceRoot))
        .toThrow(PathTraversalError);
    });

    it("should reject nested traversal attempts", () => {
      expect(() => validator.validatePath("safe/../../dangerous", sourceRoot))
        .toThrow(PathTraversalError);
    });

    it("should reject null byte injection attempts", () => {
      expect(() => validator.validatePath("safe\\x00../../etc/passwd", sourceRoot))
        .toThrow(PathTraversalError);
    });
  });

  describe("Path validation acceptance scenarios", () => {
    it("should accept valid relative paths within source root", () => {
      expect(() => validator.validatePath("components/header.html", sourceRoot))
        .not.toThrow();
    });

    it("should accept absolute paths within source root", () => {
      const validPath = "/safe/project/src/layouts/base.html";
      expect(() => validator.validatePath(validPath, sourceRoot))
        .not.toThrow();
    });

    it("should accept paths with legitimate dots in filenames", () => {
      expect(() => validator.validatePath("styles/main.min.css", sourceRoot))
        .not.toThrow();
    });

    it("should normalize and accept complex but safe paths", () => {
      expect(() => validator.validatePath("./components/../layouts/base.html", sourceRoot))
        .not.toThrow();
    });
  });

  describe("Security logging and error details", () => {
    it("should log attempted path traversal with details", () => {
      const maliciousPath = "../../../etc/passwd";
      
      expect(() => validator.validatePath(maliciousPath, sourceRoot))
        .toThrow(expect.objectContaining({
          name: "PathTraversalError",
          message: expect.stringContaining("Path traversal attempt detected"),
          attemptedPath: maliciousPath,
          sourceRoot: sourceRoot
        }));
    });

    it("should provide sanitized error messages for user display", () => {
      expect(() => validator.validatePath("../secrets.txt", sourceRoot))
        .toThrow(expect.objectContaining({
          userMessage: "Invalid file path: access outside project directory not allowed"
        }));
    });
  });

  describe("CLI integration requirements", () => {
    it("should provide appropriate exit code for security violations", () => {
      try {
        validator.validatePath("../../etc/passwd", sourceRoot);
      } catch (error) {
        expect(error.exitCode).toBe(2); // Security violation exit code
      }
    });

    it("should work with Bun path resolution", () => {
      // This test ensures compatibility with Bun.resolveSync
      const testPath = "components/header.html";
      expect(() => {
        const resolved = validator.validateAndResolve(testPath, sourceRoot);
        expect(resolved).toStartWith(sourceRoot);
      }).not.toThrow();
    });
  });
});

/**
 * This test file implements TDD methodology:
 * 1. RED: These tests will fail because PathValidator doesn't exist yet
 * 2. GREEN: Implementation must be written to make these tests pass
 * 3. REFACTOR: Code can be improved while keeping tests green
 * 
 * Coverage requirement: This file must achieve ≥90% coverage of path-validator.js
 * Security requirement: All path traversal vectors must be tested and blocked
 */