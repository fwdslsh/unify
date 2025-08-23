/**
 * Unit tests for InitCommand
 * Tests template downloading, GitHub API integration, and file extraction
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { InitCommand } from '../../../src/cli/commands/init-command.js';
import { ValidationError, FileSystemError } from '../../../src/core/errors.js';

describe('InitCommand', () => {
  let initCommand;
  let tempDir;

  beforeEach(() => {
    initCommand = new InitCommand();
    tempDir = `/tmp/unify-test-${Date.now()}`;
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      const { rmSync } = await import('fs');
      rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    test('should_initialize_with_default_template_registry_when_created', () => {
      const command = new InitCommand();
      
      expect(command).toBeDefined();
      expect(command.templates).toBeDefined();
      expect(command.templates.size).toBeGreaterThan(0);
      expect(command.templates.has('default')).toBe(true);
      expect(command.templates.has('basic')).toBe(true);
      expect(command.templates.has('blog')).toBe(true);
      expect(command.templates.has('docs')).toBe(true);
      expect(command.templates.has('portfolio')).toBe(true);
    });

    test('should_configure_github_api_client_when_created', () => {
      const command = new InitCommand();
      
      expect(command.githubApi).toBeDefined();
      expect(command.githubApi.baseUrl).toBe('https://api.github.com');
    });
  });

  describe('validateOptions', () => {
    test('should_pass_validation_when_valid_template_provided', () => {
      const options = { template: 'default', targetDir: tempDir };
      
      expect(() => initCommand.validateOptions(options)).not.toThrow();
    });

    test('should_use_default_template_when_no_template_specified', () => {
      const options = { targetDir: tempDir };
      
      expect(() => initCommand.validateOptions(options)).not.toThrow();
      expect(options.template).toBe('default');
    });

    test('should_throw_validation_error_when_unknown_template_specified', () => {
      const options = { template: 'unknown-template', targetDir: tempDir };
      
      expect(() => initCommand.validateOptions(options)).toThrow(ValidationError);
      expect(() => initCommand.validateOptions(options)).toThrow('Unknown template: unknown-template');
    });

    test('should_throw_validation_error_when_target_directory_not_specified', () => {
      const options = { template: 'default' };
      
      expect(() => initCommand.validateOptions(options)).toThrow(ValidationError);
      expect(() => initCommand.validateOptions(options)).toThrow('Target directory is required');
    });

    test('should_warn_when_target_directory_not_empty', async () => {
      // Create non-empty directory
      const { mkdirSync, writeFileSync } = await import('fs');
      mkdirSync(tempDir, { recursive: true });
      writeFileSync(`${tempDir}/existing-file.txt`, 'content');
      
      const options = { template: 'default', targetDir: tempDir };
      const warnings = [];
      
      // Mock console.warn to capture warnings
      const originalWarn = console.warn;
      console.warn = (message) => warnings.push(message);
      
      try {
        initCommand.validateOptions(options);
        expect(warnings.length).toBeGreaterThan(0);
        expect(warnings[0]).toContain('not empty');
      } finally {
        console.warn = originalWarn;
      }
    });
  });

  describe('listAvailableTemplates', () => {
    test('should_return_all_available_templates_when_called', () => {
      const templates = initCommand.listAvailableTemplates();
      
      expect(Array.isArray(templates)).toBe(true);
      expect(templates).toContain('default');
      expect(templates).toContain('basic');
      expect(templates).toContain('blog');
      expect(templates).toContain('docs');
      expect(templates).toContain('portfolio');
      expect(templates.length).toBe(5);
    });
  });

  describe('downloadTemplate', () => {
    test('should_download_template_from_github_when_valid_template_requested', async () => {
      const options = { template: 'default', targetDir: tempDir };
      
      // Mock GitHub API response
      const mockDownloadUrl = 'https://api.github.com/repos/fwdslsh/unify-templates/zipball/main';
      initCommand.githubApi.getTemplateDownloadUrl = async () => mockDownloadUrl;
      initCommand.downloadAndExtract = async () => ({ success: true, filesExtracted: 5 });
      
      const result = await initCommand.downloadTemplate(options);
      
      expect(result.success).toBe(true);
      expect(result.filesExtracted).toBeGreaterThan(0);
    });

    test('should_handle_github_api_errors_when_template_not_found', async () => {
      const options = { template: 'nonexistent', targetDir: tempDir };
      
      // Mock GitHub API to throw error
      initCommand.githubApi.getTemplateDownloadUrl = async () => {
        throw new Error('Template not found in repository');
      };
      
      await expect(initCommand.downloadTemplate(options)).rejects.toThrow('Template not found in repository');
    });

    test('should_handle_network_errors_when_github_unavailable', async () => {
      const options = { template: 'default', targetDir: tempDir };
      
      // Mock network error
      initCommand.githubApi.getTemplateDownloadUrl = async () => {
        throw new Error('Network error: Failed to connect to api.github.com');
      };
      
      await expect(initCommand.downloadTemplate(options)).rejects.toThrow('Network error');
    });

    test('should_provide_progress_feedback_when_downloading', async () => {
      const options = { template: 'default', targetDir: tempDir };
      const progressMessages = [];
      
      // Mock console.log to capture progress
      const originalLog = console.log;
      console.log = (message) => progressMessages.push(message);
      
      // Mock successful download
      initCommand.githubApi.getTemplateDownloadUrl = async () => 'https://example.com/template.zip';
      initCommand.downloadAndExtract = async () => ({ success: true, filesExtracted: 5 });
      
      try {
        await initCommand.downloadTemplate(options);
        expect(progressMessages.some(msg => msg.includes('Downloading'))).toBe(true);
        expect(progressMessages.some(msg => msg.includes('Extracting'))).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('extractTemplate', () => {
    test('should_extract_zip_archive_when_valid_zip_provided', async () => {
      // Create a minimal valid ZIP file buffer
      // This is a valid empty ZIP file in base64: UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==
      const validZipBase64 = 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==';
      const validZipBuffer = Buffer.from(validZipBase64, 'base64');
      
      const result = await initCommand.extractTemplate(validZipBuffer.buffer, tempDir);
      
      expect(result).toBeDefined();
      expect(typeof result.filesExtracted).toBe('number');
      expect(result.filesExtracted).toBe(0); // Empty ZIP has 0 files
      expect(result.preservedStructure).toBe(true);
    });

    test('should_handle_corrupted_zip_files_when_invalid_archive_provided', async () => {
      const invalidZip = new ArrayBuffer(10); // Invalid zip data
      
      await expect(initCommand.extractTemplate(invalidZip, tempDir)).rejects.toThrow('Invalid or corrupted template archive');
    });

    test('should_preserve_directory_structure_when_extracting', async () => {
      // Test that the extraction maintains the original directory structure
      // Use the same valid empty ZIP buffer
      const validZipBase64 = 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==';
      const validZipBuffer = Buffer.from(validZipBase64, 'base64');
      
      const result = await initCommand.extractTemplate(validZipBuffer.buffer, tempDir);
      
      expect(result.preservedStructure).toBe(true);
    });
  });

  describe('execute', () => {
    test('should_complete_successfully_when_valid_options_provided', async () => {
      const options = { template: 'default', targetDir: tempDir };
      
      // Mock all dependencies
      initCommand.githubApi.getTemplateDownloadUrl = async () => 'https://example.com/template.zip';
      initCommand.downloadAndExtract = async () => ({ success: true, filesExtracted: 5 });
      
      const result = await initCommand.execute(options);
      
      expect(result.success).toBe(true);
      expect(result.template).toBe('default');
      expect(result.targetDir).toBe(tempDir);
      expect(result.filesExtracted).toBeGreaterThan(0);
    });

    test('should_provide_next_steps_guidance_when_initialization_complete', async () => {
      const options = { template: 'default', targetDir: tempDir };
      const outputMessages = [];
      
      // Mock console.log to capture output
      const originalLog = console.log;
      console.log = (message) => outputMessages.push(message);
      
      // Mock successful execution
      initCommand.githubApi.getTemplateDownloadUrl = async () => 'https://example.com/template.zip';
      initCommand.downloadAndExtract = async () => ({ success: true, filesExtracted: 5 });
      
      try {
        await initCommand.execute(options);
        
        const nextStepsMessage = outputMessages.find(msg => msg.includes('Next steps'));
        expect(nextStepsMessage).toBeDefined();
        expect(outputMessages.some(msg => msg.includes('cd '))).toBe(true);
        expect(outputMessages.some(msg => msg.includes('unify build'))).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });

    test('should_handle_file_system_errors_when_directory_creation_fails', async () => {
      const options = { template: 'default', targetDir: '/invalid/path/that/cannot/be/created' };
      
      await expect(initCommand.execute(options)).rejects.toThrow(FileSystemError);
    });

    test('should_measure_execution_time_when_process_completes', async () => {
      const options = { template: 'default', targetDir: tempDir };
      
      // Mock successful execution
      initCommand.githubApi.getTemplateDownloadUrl = async () => 'https://example.com/template.zip';
      initCommand.downloadAndExtract = async () => ({ success: true, filesExtracted: 5 });
      
      const result = await initCommand.execute(options);
      
      expect(result.executionTime).toBeGreaterThan(0);
      expect(typeof result.executionTime).toBe('number');
    });
  });

  describe('GitHub API integration', () => {
    test('should_construct_correct_api_url_when_requesting_template', () => {
      const templateName = 'blog';
      const expectedUrl = 'https://api.github.com/repos/fwdslsh/unify-templates/zipball/main';
      
      const actualUrl = initCommand.githubApi.buildTemplateUrl(templateName);
      expect(actualUrl).toBe(expectedUrl);
    });

    test('should_handle_rate_limiting_when_api_requests_exceed_limit', async () => {
      // Mock rate limit error
      initCommand.githubApi.getTemplateDownloadUrl = async () => {
        const error = new Error('API rate limit exceeded');
        error.status = 403;
        throw error;
      };
      
      const options = { template: 'default', targetDir: tempDir };
      
      await expect(initCommand.downloadTemplate(options)).rejects.toThrow('API rate limit exceeded');
    });

    test('should_include_user_agent_when_making_api_requests', () => {
      const userAgent = initCommand.githubApi.getUserAgent();
      
      expect(userAgent).toContain('unify');
      expect(userAgent).toContain('0.6.0');
    });
  });

  describe('error handling', () => {
    test('should_provide_helpful_error_when_network_unavailable', async () => {
      const options = { template: 'default', targetDir: tempDir };
      
      // Mock network error
      initCommand.githubApi.getTemplateDownloadUrl = async () => {
        throw new Error('ENOTFOUND api.github.com');
      };
      
      try {
        await initCommand.downloadTemplate(options);
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error.message.toLowerCase()).toContain('network');
        expect(error.message).toContain('Check your internet connection');
      }
    });

    test('should_suggest_manual_template_when_github_fails', async () => {
      const options = { template: 'default', targetDir: tempDir };
      
      // Mock persistent GitHub error
      initCommand.githubApi.getTemplateDownloadUrl = async () => {
        throw new Error('GitHub service unavailable');
      };
      
      try {
        await initCommand.downloadTemplate(options);
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error.message).toContain('manual');
        expect(error.message).toContain('https://github.com/fwdslsh/unify-templates');
      }
    });
  });
});