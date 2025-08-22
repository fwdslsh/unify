/**
 * Error Classes Tests
 * Ensures comprehensive coverage of error handling functionality
 * 
 * Required for coverage: ≥90% per file, ≥95% global
 */

import { describe, it, expect } from "bun:test";
import { 
  UnifyError, 
  PathTraversalError, 
  FileSystemError, 
  ValidationError 
} from "../../../src/core/errors.js";

describe("UnifyError Base Class", () => {
  it("should create error with default exit code", () => {
    const error = new UnifyError("Test message");
    
    expect(error.message).toBe("Test message");
    expect(error.name).toBe("UnifyError");
    expect(error.exitCode).toBe(1);
    expect(error.userMessage).toBe("Test message");
    expect(error instanceof Error).toBe(true);
  });

  it("should create error with custom exit code and user message", () => {
    const error = new UnifyError("Internal message", 2, "User-friendly message");
    
    expect(error.message).toBe("Internal message");
    expect(error.exitCode).toBe(2);
    expect(error.userMessage).toBe("User-friendly message");
  });

  it("should use message as userMessage when userMessage is null", () => {
    const error = new UnifyError("Test message", 1, null);
    
    expect(error.userMessage).toBe("Test message");
  });
});

describe("PathTraversalError", () => {
  it("should create path traversal error with default message", () => {
    const error = new PathTraversalError("../../../etc/passwd", "/safe/project");
    
    expect(error.name).toBe("PathTraversalError");
    expect(error.message).toBe("Path traversal attempt detected: ../../../etc/passwd");
    expect(error.attemptedPath).toBe("../../../etc/passwd");
    expect(error.sourceRoot).toBe("/safe/project");
    expect(error.exitCode).toBe(2);
    expect(error.userMessage).toBe("Invalid file path: access outside project directory not allowed");
  });

  it("should create path traversal error with custom message", () => {
    const error = new PathTraversalError("malicious.txt", "/safe", "Custom security message");
    
    expect(error.message).toBe("Custom security message");
    expect(error.attemptedPath).toBe("malicious.txt");
    expect(error.sourceRoot).toBe("/safe");
  });

  it("should inherit from UnifyError", () => {
    const error = new PathTraversalError("test", "/root");
    
    expect(error instanceof UnifyError).toBe(true);
    expect(error instanceof Error).toBe(true);
  });
});

describe("FileSystemError", () => {
  it("should create file system error with operation and path", () => {
    const error = new FileSystemError("read", "/path/to/file.txt", "Permission denied");
    
    expect(error.name).toBe("FileSystemError");
    expect(error.message).toBe("File read failed for /path/to/file.txt: Permission denied");
    expect(error.operation).toBe("read");
    expect(error.path).toBe("/path/to/file.txt");
    expect(error.exitCode).toBe(1);
  });

  it("should handle write operations", () => {
    const error = new FileSystemError("write", "/output/file.html", "Disk full");
    
    expect(error.message).toBe("File write failed for /output/file.html: Disk full");
    expect(error.operation).toBe("write");
    expect(error.path).toBe("/output/file.html");
  });

  it("should inherit from UnifyError", () => {
    const error = new FileSystemError("delete", "/temp.txt", "File not found");
    
    expect(error instanceof UnifyError).toBe(true);
    expect(error instanceof Error).toBe(true);
  });
});

describe("ValidationError", () => {
  it("should create validation error with argument and reason", () => {
    const error = new ValidationError("--invalid-flag", "Unknown command line option");
    
    expect(error.name).toBe("ValidationError");
    expect(error.message).toBe("Invalid argument '--invalid-flag': Unknown command line option");
    expect(error.argument).toBe("--invalid-flag");
    expect(error.reason).toBe("Unknown command line option");
    expect(error.exitCode).toBe(2);
    expect(error.userMessage).toBe("Invalid argument '--invalid-flag': Unknown command line option");
  });

  it("should handle path validation errors", () => {
    const error = new ValidationError("/invalid/path", "Path does not exist");
    
    expect(error.message).toBe("Invalid argument '/invalid/path': Path does not exist");
    expect(error.argument).toBe("/invalid/path");
    expect(error.reason).toBe("Path does not exist");
  });

  it("should inherit from UnifyError", () => {
    const error = new ValidationError("test", "test reason");
    
    expect(error instanceof UnifyError).toBe(true);
    expect(error instanceof Error).toBe(true);
  });
});

// Helper function to spy on console methods
function spyOn(obj, method) {
  const original = obj[method];
  const calls = [];
  
  obj[method] = (...args) => {
    calls.push(args);
  };
  
  obj[method].toHaveBeenCalledWith = (expected) => {
    const found = calls.some(call => call.some(arg => arg === expected));
    expect(found).toBe(true);
  };
  
  obj[method].mockRestore = () => {
    obj[method] = original;
  };
  
  return obj[method];
}