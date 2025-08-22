/**
 * Unit tests for custom error classes
 * Tests error construction, formatting, and recovery behavior
 */

import { test, expect, describe } from 'bun:test';
import {
  UnifyError,
  IncludeNotFoundError,
  CircularDependencyError,
  PathTraversalError,
  MalformedDirectiveError,
  MaxDepthExceededError,
  FileSystemError,
  InvalidArgumentError,
  BuildError,
  ServerError,
  LayoutError,
  ComponentError
} from '../../../src/utils/errors.js';

describe('UnifyError (Base Class)', () => {
  test('should create basic error with message only', () => {
    const error = new UnifyError('Something went wrong');
    
    expect(error.name).toBe('UnifyError');
    expect(error.message).toBe('Something went wrong');
    expect(error.filePath).toBe(null);
    expect(error.lineNumber).toBe(null);
    expect(error.suggestions).toEqual([]);
  });

  test('should create error with file path', () => {
    const error = new UnifyError('File error', '/path/to/file.html');
    
    expect(error.filePath).toBe('/path/to/file.html');
    expect(error.message).toBe('File error in /path/to/file.html');
  });

  test('should create error with file path and line number', () => {
    const error = new UnifyError('Parse error', '/path/to/file.html', 42);
    
    expect(error.lineNumber).toBe(42);
    expect(error.message).toBe('Parse error in /path/to/file.html:42');
  });

  test('should create error with suggestions array', () => {
    const suggestions = ['Try this', 'Or that'];
    const error = new UnifyError('Need help', null, null, suggestions);
    
    expect(error.suggestions).toEqual(suggestions);
  });

  test('should handle non-array suggestions', () => {
    const error = new UnifyError('Test', null, null, 'single suggestion');
    
    expect(error.suggestions).toEqual([]);
  });

  test('should not be recoverable by default', () => {
    const error = new UnifyError('Fatal error');
    
    expect(error.isRecoverable()).toBe(false);
  });

  test('should generate warning comment', () => {
    const error = new UnifyError('File not found', '/test.html');
    
    const comment = error.toWarningComment();
    expect(comment).toBe('<!-- WARNING: File not found -->');
  });

  test('should format for CLI without file info', () => {
    const error = new UnifyError('Basic error');
    
    const formatted = error.formatForCLI();
    expect(formatted).toBe('ERROR UnifyError: Basic error');
  });

  test('should format for CLI with file path', () => {
    const error = new UnifyError('File error', '/test.html');
    
    const formatted = error.formatForCLI();
    expect(formatted).toContain('ERROR UnifyError: File error');
    expect(formatted).toContain('File: /test.html');
  });

  test('should format for CLI with file path and line number', () => {
    const error = new UnifyError('Parse error', '/test.html', 10);
    
    const formatted = error.formatForCLI();
    expect(formatted).toContain('File: /test.html:10');
  });

  test('should format for CLI with suggestions', () => {
    const error = new UnifyError('Help needed', null, null, ['Try this', 'Or that']);
    
    const formatted = error.formatForCLI();
    expect(formatted).toContain('Suggestions:');
    expect(formatted).toContain('   - Try this');
    expect(formatted).toContain('   - Or that');
  });
});

describe('IncludeNotFoundError', () => {
  test('should create with include path and parent file', () => {
    const error = new IncludeNotFoundError('missing.html', '/parent.html');
    
    expect(error.name).toBe('IncludeNotFoundError');
    expect(error.includePath).toBe('missing.html');
    expect(error.parentFile).toBe('/parent.html');
    expect(error.searchPaths).toEqual([]);
    expect(error.message).toContain('Include not found: missing.html');
    expect(error.suggestions.length).toBeGreaterThan(0);
  });

  test('should create with search paths', () => {
    const searchPaths = ['/path1', '/path2'];
    const error = new IncludeNotFoundError('missing.html', '/parent.html', searchPaths);
    
    expect(error.searchPaths).toEqual(searchPaths);
    expect(error.suggestions.some(s => s.includes('/path1, /path2'))).toBe(true);
  });

  test('should create with components directory', () => {
    const error = new IncludeNotFoundError('missing.html', '/parent.html', [], '_components');
    
    expect(error.suggestions.some(s => s.includes('_components/'))).toBe(true);
  });

  test('should be recoverable', () => {
    const error = new IncludeNotFoundError('missing.html', '/parent.html');
    
    expect(error.isRecoverable()).toBe(true);
  });
});

describe('CircularDependencyError', () => {
  test('should create with dependency chain', () => {
    const chain = ['file1.html', 'file2.html', 'file3.html'];
    const error = new CircularDependencyError('file1.html', chain);
    
    expect(error.name).toBe('CircularDependencyError');
    expect(error.dependencyChain).toEqual(chain);
    expect(error.message).toContain('file1.html → file2.html → file3.html → file1.html');
    expect(error.suggestions.length).toBeGreaterThan(0);
  });

  test('should not be recoverable by default', () => {
    const error = new CircularDependencyError('file.html', ['file1.html']);
    
    expect(error.isRecoverable()).toBe(false);
  });
});

describe('PathTraversalError', () => {
  test('should create with attempted path and source root', () => {
    const error = new PathTraversalError('../../../etc/passwd', '/app/src');
    
    expect(error.name).toBe('PathTraversalError');
    expect(error.attemptedPath).toBe('../../../etc/passwd');
    expect(error.sourceRoot).toBe('/app/src');
    expect(error.message).toContain('Path traversal attempt blocked');
    expect(error.suggestions.some(s => s.includes('/app/src'))).toBe(true);
  });

  test('should be recoverable', () => {
    const error = new PathTraversalError('../bad.html', '/src');
    
    expect(error.isRecoverable()).toBe(true);
  });
});

describe('MalformedDirectiveError', () => {
  test('should create with directive, file, and line', () => {
    const error = new MalformedDirectiveError('<!--#includ file="test" -->', '/file.html', 5);
    
    expect(error.name).toBe('MalformedDirectiveError');
    expect(error.directive).toBe('<!--#includ file="test" -->');
    expect(error.filePath).toBe('/file.html');
    expect(error.lineNumber).toBe(5);
    expect(error.suggestions.some(s => s.includes('<!--#include file='))).toBe(true);
  });
});

describe('MaxDepthExceededError', () => {
  test('should create with depth information', () => {
    const error = new MaxDepthExceededError('/deep.html', 15, 10);
    
    expect(error.name).toBe('MaxDepthExceededError');
    expect(error.depth).toBe(15);
    expect(error.maxDepth).toBe(10);
    expect(error.message).toContain('Maximum include depth (10) exceeded at depth 15');
    expect(error.suggestions.some(s => s.includes('10 or fewer levels'))).toBe(true);
  });

  test('should be recoverable', () => {
    const error = new MaxDepthExceededError('/file.html', 5, 3);
    
    expect(error.isRecoverable()).toBe(true);
  });
});

describe('FileSystemError', () => {
  test('should create read error with suggestions', () => {
    const originalError = new Error('ENOENT: no such file');
    const error = new FileSystemError('read', '/missing.html', originalError);
    
    expect(error.name).toBe('FileSystemError');
    expect(error.operation).toBe('read');
    expect(error.originalError).toBe(originalError);
    expect(error.message).toContain('File system error during read: ENOENT: no such file');
    expect(error.suggestions.some(s => s.includes('Check if the file exists'))).toBe(true);
  });

  test('should create write error with suggestions', () => {
    const originalError = new Error('EACCES: permission denied');
    const error = new FileSystemError('write', '/output.html', originalError);
    
    expect(error.operation).toBe('write');
    expect(error.suggestions.some(s => s.includes('write permissions'))).toBe(true);
  });

  test('should create mkdir error with suggestions', () => {
    const originalError = new Error('EACCES: permission denied');
    const error = new FileSystemError('mkdir', '/new-dir', originalError);
    
    expect(error.operation).toBe('mkdir');
    expect(error.suggestions.some(s => s.includes('directory creation permissions'))).toBe(true);
  });

  test('should handle unknown operations', () => {
    const originalError = new Error('Unknown error');
    const error = new FileSystemError('unknown', '/file.html', originalError);
    
    expect(error.operation).toBe('unknown');
    expect(error.suggestions).toEqual([]);
  });
});

describe('InvalidArgumentError', () => {
  test('should create with argument details', () => {
    const error = new InvalidArgumentError('--port', 'invalid', 'must be a number');
    
    expect(error.name).toBe('InvalidArgumentError');
    expect(error.argument).toBe('--port');
    expect(error.value).toBe('invalid');
    expect(error.reason).toBe('must be a number');
    expect(error.message).toContain('Invalid argument --port: invalid (must be a number)');
    expect(error.suggestions.some(s => s.includes('--port value: invalid'))).toBe(true);
  });
});

describe('BuildError', () => {
  test('should create with basic message', () => {
    const error = new BuildError('Build failed due to errors');
    
    expect(error.name).toBe('BuildError');
    expect(error.errors).toEqual([]);
    expect(error.message).toContain('Build failed: Build failed due to errors');
    expect(error.suggestions.some(s => s.includes('DEBUG=*'))).toBe(true);
  });

  test('should create with error array', () => {
    const errors = [
      { error: 'Include file not found: missing.html' },
      { error: 'Invalid syntax in file.html' }
    ];
    const error = new BuildError('Multiple errors occurred', errors);
    
    expect(error.errors).toEqual(errors);
    expect(error.suggestions.some(s => s.includes('Fix the 2 error(s)'))).toBe(true);
  });

  test('should analyze include errors', () => {
    const errors = [
      { error: 'Include file not found: missing1.html' },
      { error: 'Include file not found: missing2.html' }
    ];
    const error = new BuildError('Include errors', errors);
    
    expect(error.suggestions.some(s => s.includes('include files exist'))).toBe(true);
  });

  test('should analyze circular dependency errors', () => {
    const errors = [
      { error: 'Circular dependency detected: a.html -> b.html -> a.html' }
    ];
    const error = new BuildError('Circular errors', errors);
    
    expect(error.suggestions.some(s => s.includes('circular dependencies'))).toBe(true);
  });
});

describe('ServerError', () => {
  test('should create with message only', () => {
    const error = new ServerError('Failed to start server');
    
    expect(error.name).toBe('ServerError');
    expect(error.port).toBe(null);
    expect(error.message).toContain('Server error: Failed to start server');
  });

  test('should create with port suggestions', () => {
    const error = new ServerError('Port already in use', 3000);
    
    expect(error.port).toBe(3000);
    expect(error.suggestions.some(s => s.includes('--port 3001'))).toBe(true);
    expect(error.suggestions.some(s => s.includes('another process'))).toBe(true);
    expect(error.suggestions.some(s => s.includes('--port 0'))).toBe(true);
  });
});

describe('LayoutError', () => {
  test('should create with layout path and reason', () => {
    const error = new LayoutError('/layouts/main.html', 'file not found');
    
    expect(error.name).toBe('LayoutError');
    expect(error.layoutPath).toBe('/layouts/main.html');
    expect(error.reason).toBe('file not found');
    expect(error.alternatives).toEqual([]);
    expect(error.message).toContain('Layout not found: /layouts/main.html (file not found)');
  });

  test('should create with alternatives', () => {
    const alternatives = ['/layouts/_default.html', '/layouts/base.html'];
    const error = new LayoutError('/layouts/missing.html', 'not found', alternatives);
    
    expect(error.alternatives).toEqual(alternatives);
    expect(error.suggestions.some(s => s.includes('/layouts/_default.html, /layouts/base.html'))).toBe(true);
  });

  test('should include content placeholder suggestion', () => {
    const error = new LayoutError('/layout.html', 'test');
    
    expect(error.suggestions.some(s => s.includes('{{ content }}'))).toBe(true);
  });
});

describe('ComponentError', () => {
  test('should create with component path and reason', () => {
    const error = new ComponentError('/components/header.html', 'invalid syntax');
    
    expect(error.name).toBe('ComponentError');
    expect(error.componentPath).toBe('/components/header.html');
    expect(error.reason).toBe('invalid syntax');
    expect(error.parentFile).toBe(null);
    expect(error.message).toContain('Component error: invalid syntax');
  });

  test('should create with parent file reference', () => {
    const error = new ComponentError('/components/nav.html', 'not found', '/pages/index.html');
    
    expect(error.parentFile).toBe('/pages/index.html');
    expect(error.suggestions.some(s => s.includes('Referenced from: /pages/index.html'))).toBe(true);
  });
});

describe('Error Integration', () => {
  test('all error classes should extend UnifyError', () => {
    const errors = [
      new IncludeNotFoundError('test', 'parent'),
      new CircularDependencyError('file', ['chain']),
      new PathTraversalError('path', 'root'),
      new MalformedDirectiveError('directive', 'file', 1),
      new MaxDepthExceededError('file', 5, 3),
      new FileSystemError('read', 'file', new Error('test')),
      new InvalidArgumentError('arg', 'value', 'reason'),
      new BuildError('message'),
      new ServerError('message'),
      new LayoutError('path', 'reason'),
      new ComponentError('path', 'reason')
    ];
    
    errors.forEach(error => {
      expect(error).toBeInstanceOf(UnifyError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBeTruthy();
      expect(error.message).toBeTruthy();
      expect(typeof error.isRecoverable).toBe('function');
      expect(typeof error.toWarningComment).toBe('function');
      expect(typeof error.formatForCLI).toBe('function');
    });
  });

  test('recoverable errors should return true for isRecoverable', () => {
    const recoverableErrors = [
      new IncludeNotFoundError('test', 'parent'),
      new PathTraversalError('path', 'root'),
      new MaxDepthExceededError('file', 5, 3)
    ];
    
    recoverableErrors.forEach(error => {
      expect(error.isRecoverable()).toBe(true);
    });
  });

  test('non-recoverable errors should return false for isRecoverable', () => {
    const nonRecoverableErrors = [
      new CircularDependencyError('file', ['chain']),
      new MalformedDirectiveError('directive', 'file', 1),
      new FileSystemError('read', 'file', new Error('test')),
      new InvalidArgumentError('arg', 'value', 'reason'),
      new BuildError('message'),
      new ServerError('message'),
      new LayoutError('path', 'reason'),
      new ComponentError('path', 'reason')
    ];
    
    nonRecoverableErrors.forEach(error => {
      expect(error.isRecoverable()).toBe(false);
    });
  });
});