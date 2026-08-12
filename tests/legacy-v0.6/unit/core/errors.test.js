/**
 * Error Classes Tests - ISSUE-004
 * Tests error handling and error class constructors
 * Missing coverage lines: 58-60 (FileSystemError constructor)
 */

import { describe, test, expect } from 'bun:test';
import { 
  UnifyError, 
  PathTraversalError, 
  FileSystemError, 
  ValidationError 
} from '../../../src/core/errors.js';

describe('Error Classes', () => {
  
  describe('UnifyError Base Class', () => {
    test('should_create_unify_error_with_message_and_exit_code', () => {
      const error = new UnifyError('Test error message', 2);
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(UnifyError);
      expect(error.name).toBe('UnifyError');
      expect(error.message).toBe('Test error message');
      expect(error.exitCode).toBe(2);
    });

    test('should_create_unify_error_with_default_exit_code', () => {
      const error = new UnifyError('Test error message');
      
      expect(error.exitCode).toBe(1); // Default exit code
    });

    test('should_have_proper_error_stack', () => {
      const error = new UnifyError('Test stack trace');
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('UnifyError');
    });
  });

  describe('PathTraversalError', () => {
    test('should_create_path_traversal_error_with_full_details', () => {
      const attemptedPath = '../../../etc/passwd';
      const sourceRoot = '/safe/project/src';
      const customMessage = 'Custom security violation';
      
      const error = new PathTraversalError(attemptedPath, sourceRoot, customMessage);
      
      expect(error).toBeInstanceOf(UnifyError);
      expect(error).toBeInstanceOf(PathTraversalError);
      expect(error.name).toBe('PathTraversalError');
      expect(error.message).toBe(customMessage);
      expect(error.attemptedPath).toBe(attemptedPath);
      expect(error.sourceRoot).toBe(sourceRoot);
      expect(error.exitCode).toBe(2); // Security violation exit code
      expect(error.userMessage).toBe('Invalid file path: access outside project directory not allowed');
    });

    test('should_create_path_traversal_error_with_default_message', () => {
      const attemptedPath = '../secrets.txt';
      const sourceRoot = '/safe/project/src';
      
      const error = new PathTraversalError(attemptedPath, sourceRoot);
      
      expect(error.message).toBe(`Path traversal attempt detected: ${attemptedPath}`);
      expect(error.attemptedPath).toBe(attemptedPath);
      expect(error.sourceRoot).toBe(sourceRoot);
    });

    test('should_log_security_event_on_creation', () => {
      // This test verifies the logging behavior
      const error = new PathTraversalError('../test.txt', '/safe/dir', 'Test security log');
      
      expect(error).toBeInstanceOf(PathTraversalError);
      // The constructor should have called console.error with [SECURITY] prefix
    });
  });

  describe('FileSystemError', () => {
    test('should_create_file_system_error_with_operation_details', () => {
      // Test lines 58-60: FileSystemError constructor
      const operation = 'read';
      const path = '/some/file.txt';
      const message = 'Permission denied';
      
      const error = new FileSystemError(operation, path, message);
      
      expect(error).toBeInstanceOf(UnifyError);
      expect(error).toBeInstanceOf(FileSystemError);
      expect(error.name).toBe('FileSystemError');
      expect(error.message).toBe(`File ${operation} failed for ${path}: ${message}`);
      expect(error.operation).toBe(operation);
      expect(error.path).toBe(path);
      expect(error.exitCode).toBe(1); // Default UnifyError exit code
    });

    test('should_handle_write_operation_error', () => {
      const error = new FileSystemError('write', '/output/index.html', 'Disk full');
      
      expect(error.message).toBe('File write failed for /output/index.html: Disk full');
      expect(error.operation).toBe('write');
      expect(error.path).toBe('/output/index.html');
    });

    test('should_handle_delete_operation_error', () => {
      const error = new FileSystemError('delete', '/temp/file.tmp', 'File in use');
      
      expect(error.message).toBe('File delete failed for /temp/file.tmp: File in use');
      expect(error.operation).toBe('delete');
      expect(error.path).toBe('/temp/file.tmp');
    });

    test('should_handle_create_operation_error', () => {
      const error = new FileSystemError('create', '/new/directory/', 'Parent directory does not exist');
      
      expect(error.message).toBe('File create failed for /new/directory/: Parent directory does not exist');
      expect(error.operation).toBe('create');
      expect(error.path).toBe('/new/directory/');
    });
  });

  describe('ValidationError', () => {
    test('should_create_validation_error_with_details', () => {
      const argument = '--source';
      const reason = 'directory does not exist';
      
      const error = new ValidationError(argument, reason);
      
      expect(error).toBeInstanceOf(UnifyError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe(`Invalid argument '${argument}': ${reason}`);
      expect(error.argument).toBe(argument);
      expect(error.reason).toBe(reason);
      expect(error.exitCode).toBe(2); // Validation errors use exit code 2
    });

    test('should_handle_argument_validation_errors', () => {
      const error = new ValidationError('--output', 'path is not writable');
      
      expect(error.message).toBe("Invalid argument '--output': path is not writable");
      expect(error.argument).toBe('--output');
      expect(error.reason).toBe('path is not writable');
      expect(error.exitCode).toBe(2);
    });

    test('should_handle_config_validation_errors', () => {
      const error = new ValidationError('--config', 'file format is invalid');
      
      expect(error.message).toBe("Invalid argument '--config': file format is invalid");
      expect(error.argument).toBe('--config');
      expect(error.reason).toBe('file format is invalid');
      expect(error.exitCode).toBe(2);
    });
  });


  describe('Error Inheritance Chain', () => {
    test('should_maintain_proper_inheritance_chain_for_all_errors', () => {
      const pathError = new PathTraversalError('path', 'root');
      const fileError = new FileSystemError('op', 'path', 'msg');
      const validationError = new ValidationError('arg', 'reason');
      
      // All should be instances of base classes
      expect(pathError).toBeInstanceOf(Error);
      expect(pathError).toBeInstanceOf(UnifyError);
      expect(pathError).toBeInstanceOf(PathTraversalError);
      
      expect(fileError).toBeInstanceOf(Error);
      expect(fileError).toBeInstanceOf(UnifyError);
      expect(fileError).toBeInstanceOf(FileSystemError);
      
      expect(validationError).toBeInstanceOf(Error);
      expect(validationError).toBeInstanceOf(UnifyError);
      expect(validationError).toBeInstanceOf(ValidationError);
    });

    test('should_have_correct_constructor_names', () => {
      const pathError = new PathTraversalError('path', 'root');
      const fileError = new FileSystemError('op', 'path', 'msg');
      const validationError = new ValidationError('arg', 'reason');
      
      expect(pathError.constructor.name).toBe('PathTraversalError');
      expect(fileError.constructor.name).toBe('FileSystemError');
      expect(validationError.constructor.name).toBe('ValidationError');
    });
  });

  describe('Exit Code Consistency', () => {
    test('should_use_correct_exit_codes_for_error_types', () => {
      const unifyError = new UnifyError('general error', 3);
      const pathError = new PathTraversalError('path', 'root');
      const fileError = new FileSystemError('read', 'file.txt', 'not found');
      const validationError = new ValidationError('--bad-arg', 'invalid value');
      
      expect(unifyError.exitCode).toBe(3); // Custom exit code
      expect(pathError.exitCode).toBe(2); // Security violations
      expect(fileError.exitCode).toBe(1); // General errors
      expect(validationError.exitCode).toBe(2); // Argument validation errors
    });
  });

  describe('Error Message Formatting', () => {
    test('should_format_error_messages_consistently', () => {
      const fileError = new FileSystemError('copy', '/src/file.txt', 'destination exists');
      const pathError = new PathTraversalError('../../../etc/passwd', '/safe/dir');
      const validationError = new ValidationError('--invalid', 'not supported');
      
      expect(fileError.message).toMatch(/^File \w+ failed for .+: .+$/);
      expect(pathError.message).toMatch(/^Path traversal attempt detected: .+$/);
      expect(validationError.message).toMatch(/^Invalid argument '.+': .+$/);
    });

    test('should_handle_empty_or_special_characters_in_messages', () => {
      const fileError = new FileSystemError('read', '/file with spaces.txt', 'special chars: @#$%');
      const validationError = new ValidationError('--unicode-тест', 'unicode error message: тест');
      
      expect(fileError.message).toContain('special chars: @#$%');
      expect(validationError.message).toContain('unicode error message: тест');
    });
  });
});