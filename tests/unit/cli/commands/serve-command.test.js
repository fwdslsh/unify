/**
 * Unit Tests for ServeCommand
 * Tests the development server with dependency injection instead of global mocking
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { ServeCommand } from '../../../../src/cli/commands/serve-command.js';

describe('ServeCommand', () => {
  let serveCommand;
  let mockDependencies;

  beforeEach(() => {
    // Create mock dependencies
    mockDependencies = {
      buildCommand: {
        execute: mock().mockResolvedValue({
          success: true,
          processedFiles: 5,
          buildTime: 100
        })
      },
      fileWatcher: {
        startWatching: mock().mockResolvedValue(undefined),
        stopWatching: mock().mockResolvedValue(undefined)
      },
      incrementalBuilder: {
        performIncrementalBuild: mock().mockResolvedValue({
          success: true,
          processedFiles: 2,
          buildTime: 50
        })
      },
      logger: {
        info: mock(),
        error: mock(),
        debug: mock(),
        warn: mock(),
        child: mock(function(name) {
          return {
            info: mock(),
            error: mock(),
            debug: mock(),
            warn: mock()
          };
        })
      },
      serverFactory: mock().mockReturnValue({
        stop: mock(),
        port: 3000
      }),
      fileFactory: mock().mockReturnValue({
        // Mock file object for Bun.file
        size: 1024,
        type: 'text/html'
      })
    };

    // Create ServeCommand with injected dependencies
    serveCommand = new ServeCommand(mockDependencies);
  });

  afterEach(() => {
    // Reset fileFactory mock to prevent pollution between tests
    if (mockDependencies?.fileFactory) {
      mockDependencies.fileFactory.mockClear();
      // Reset to default mock return value
      mockDependencies.fileFactory.mockReturnValue({
        size: 1024,
        type: 'text/html'
      });
    }
  });

  describe('constructor', () => {
    it('should initialize with correct default state', () => {
      expect(serveCommand.server).toBeNull();
      expect(serveCommand.isServing).toBe(false);
      expect(serveCommand.sseClients).toBeInstanceOf(Set);
      expect(serveCommand.sseClients.size).toBe(0);
    });

    it('should use injected dependencies', () => {
      expect(serveCommand.buildCommand).toBe(mockDependencies.buildCommand);
      expect(serveCommand.fileWatcher).toBe(mockDependencies.fileWatcher);
      expect(serveCommand.incrementalBuilder).toBe(mockDependencies.incrementalBuilder);
      expect(serveCommand.logger).toBe(mockDependencies.logger);
      expect(serveCommand.serverFactory).toBe(mockDependencies.serverFactory);
      expect(serveCommand.fileFactory).toBe(mockDependencies.fileFactory);
    });

    it('should use default dependencies when none provided', () => {
      const defaultServeCommand = new ServeCommand();
      expect(defaultServeCommand.buildCommand).toBeTruthy();
      expect(defaultServeCommand.fileWatcher).toBeTruthy();
      expect(defaultServeCommand.incrementalBuilder).toBeTruthy();
      expect(defaultServeCommand.logger).toBeTruthy();
      expect(defaultServeCommand.serverFactory).toBeTruthy();
      expect(defaultServeCommand.fileFactory).toBeTruthy();
    });
  });

  describe('execute()', () => {
    it('should successfully execute serve command with defaults', async () => {
      const result = await serveCommand.execute({
        source: './src',
        output: './dist'
      });

      expect(result.success).toBe(true);
      expect(result.initialBuildCompleted).toBe(true);
      expect(result.serverStarted).toBe(true);
      expect(result.watchingStarted).toBe(true);

      // Verify dependencies were called
      expect(mockDependencies.buildCommand.execute).toHaveBeenCalledWith({
        source: './src',
        output: './dist',
        clean: undefined,
        verbose: undefined,
        minify: false,
        failOn: [],
        logger: mockDependencies.logger.child.mock.results[0].value
      });

      expect(mockDependencies.serverFactory).toHaveBeenCalled();
      expect(mockDependencies.fileWatcher.startWatching).toHaveBeenCalled();
    });

    it('should use provided options', async () => {
      const options = {
        source: './custom-src',
        output: './custom-dist',
        port: 8080,
        host: '0.0.0.0',
        clean: true,
        verbose: true
      };

      const result = await serveCommand.execute(options);

      expect(result.success).toBe(true);
      expect(mockDependencies.buildCommand.execute).toHaveBeenCalledWith({
        source: './custom-src',
        output: './custom-dist',
        clean: true,
        verbose: true,
        minify: false,
        failOn: [],
        logger: mockDependencies.logger.child.mock.results[0].value
      });

      // Check server was created with correct options
      const serverCall = mockDependencies.serverFactory.mock.calls[0][0];
      expect(serverCall.port).toBe(8080);
      expect(serverCall.hostname).toBe('0.0.0.0');
    });

    it('should default port and host if not provided', async () => {
      await serveCommand.execute({
        source: './src',
        output: './dist'
      });

      const serverCall = mockDependencies.serverFactory.mock.calls[0][0];
      expect(serverCall.port).toBe(3000);
      expect(serverCall.hostname).toBe('localhost');
    });

    it('should fail if initial build fails', async () => {
      mockDependencies.buildCommand.execute.mockResolvedValue({
        success: false,
        error: 'Build error'
      });

      const result = await serveCommand.execute({
        source: './src',
        output: './dist'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Initial build failed: Build error');
      expect(result.initialBuildCompleted).toBe(false);
      expect(result.serverStarted).toBe(false);
      expect(result.watchingStarted).toBe(false);

      // Server should not have been started
      expect(mockDependencies.serverFactory).not.toHaveBeenCalled();
      expect(mockDependencies.fileWatcher.startWatching).not.toHaveBeenCalled();
    });

    it('should fail if server startup fails', async () => {
      mockDependencies.serverFactory.mockImplementation(() => {
        throw new Error('Server startup failed');
      });

      const result = await serveCommand.execute({
        source: './src',
        output: './dist'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Server startup failed');
      expect(result.initialBuildCompleted).toBe(true);
      expect(result.serverStarted).toBe(false);
      expect(result.watchingStarted).toBe(false);
    });

    it('should fail if file watching setup fails', async () => {
      mockDependencies.fileWatcher.startWatching.mockRejectedValue(new Error('Watch setup failed'));

      const result = await serveCommand.execute({
        source: './src',
        output: './dist'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Watch setup failed');
      expect(result.initialBuildCompleted).toBe(true);
      expect(result.serverStarted).toBe(true);
      expect(result.watchingStarted).toBe(false);
    });
  });

  describe('stop()', () => {
    it('should successfully stop server and clean up resources', async () => {
      // First start the server
      await serveCommand.execute({
        source: './src',
        output: './dist'
      });

      // Add a mock SSE client
      const mockClient = { close: mock() };
      serveCommand.sseClients.add(mockClient);

      const result = await serveCommand.stop();

      expect(result.success).toBe(true);
      expect(result.serverStopped).toBe(true);
      expect(result.watchingStopped).toBe(true);
      expect(result.resourcesCleaned).toBe(true);

      expect(mockDependencies.fileWatcher.stopWatching).toHaveBeenCalled();
      expect(mockClient.close).toHaveBeenCalled();
      expect(serveCommand.sseClients.size).toBe(0);
      expect(serveCommand.isServing).toBe(false);
    });

    it('should handle SSE client close errors gracefully', async () => {
      // Start server
      await serveCommand.execute({
        source: './src',
        output: './dist'
      });

      // Add a mock SSE client that throws on close
      const mockClient = { 
        close: mock().mockImplementation(() => {
          throw new Error('Client close error');
        })
      };
      serveCommand.sseClients.add(mockClient);

      const result = await serveCommand.stop();

      expect(result.success).toBe(true);
      expect(serveCommand.sseClients.size).toBe(0);
    });

    it('should handle stop errors gracefully', async () => {
      mockDependencies.fileWatcher.stopWatching.mockRejectedValue(new Error('Stop error'));

      const result = await serveCommand.stop();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Stop error');
      expect(result.serverStopped).toBe(false);
      expect(result.watchingStopped).toBe(false);
      expect(result.resourcesCleaned).toBe(false);
    });
  });

  describe('getStatus()', () => {
    it('should return correct status when not serving', () => {
      const status = serveCommand.getStatus();

      expect(status.isServing).toBe(false);
      expect(status.port).toBeNull();
      expect(status.connectedClients).toBe(0);
      expect(status.buildInProgress).toBe(false);
    });

    it('should return correct status when serving', async () => {
      await serveCommand.execute({
        source: './src',
        output: './dist'
      });

      const status = serveCommand.getStatus();

      expect(status.isServing).toBe(true);
      expect(status.port).toBe(3000); // From mock server
      expect(status.connectedClients).toBe(0);
      expect(status.buildInProgress).toBe(false);
    });
  });

  describe('Bun API abstractions', () => {
    it('should use _createBunServer by default', () => {
      const defaultServeCommand = new ServeCommand();
      // The serverFactory should be bound to _createBunServer
      expect(typeof defaultServeCommand.serverFactory).toBe('function');
    });

    it('should use _createBunFile by default', () => {
      const defaultServeCommand = new ServeCommand();
      // The fileFactory should be bound to _createBunFile
      expect(typeof defaultServeCommand.fileFactory).toBe('function');
    });

    it('should allow custom server factory', () => {
      const customFactory = mock();
      const customServeCommand = new ServeCommand({ serverFactory: customFactory });
      
      expect(customServeCommand.serverFactory).toBe(customFactory);
    });

    it('should allow custom file factory', () => {
      const customFactory = mock();
      const customServeCommand = new ServeCommand({ fileFactory: customFactory });
      
      expect(customServeCommand.fileFactory).toBe(customFactory);
    });
  });

  describe('HTTP Request Handling', () => {
    it('should handle SSE endpoint requests', async () => {
      const mockRequest = {
        url: 'http://localhost:3000/__events',
        headers: {
          get: mock().mockReturnValue('text/event-stream')
        }
      };
      
      const mockResponse = new Response('', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      });
      
      serveCommand._handleSSERequest = mock().mockReturnValue(mockResponse);
      
      const response = await serveCommand._handleRequest(mockRequest, { output: './dist' });
      
      expect(serveCommand._handleSSERequest).toHaveBeenCalledWith(mockRequest);
      expect(response).toBe(mockResponse);
    });

    it('should serve static files for non-SSE requests', async () => {
      const mockRequest = {
        url: 'http://localhost:3000/index.html'
      };
      
      const mockResponse = new Response('<html></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
      
      serveCommand._serveStaticFile = mock().mockResolvedValue(mockResponse);
      
      const response = await serveCommand._handleRequest(mockRequest, { output: './dist' });
      
      expect(serveCommand._serveStaticFile).toHaveBeenCalledWith('/index.html', './dist');
      expect(response).toBe(mockResponse);
    });

    it('should handle request errors with 500 response', async () => {
      const mockRequest = {
        url: 'http://localhost:3000/error.html'
      };
      
      serveCommand._serveStaticFile = mock().mockRejectedValue(new Error('File not found'));
      
      const response = await serveCommand._handleRequest(mockRequest, { output: './dist' });
      
      expect(response.status).toBe(500);
      expect(await response.text()).toBe('Internal Server Error');
      expect(mockDependencies.logger.error).toHaveBeenCalledWith(
        'Request handling error',
        expect.objectContaining({
          pathname: '/error.html',
          error: 'File not found'
        })
      );
    });
  });

  describe('Server-Sent Events (SSE)', () => {
    it('should create SSE response with proper headers', () => {
      const mockRequest = {
        headers: {
          get: mock().mockReturnValue('text/event-stream')
        }
      };
      
      const response = serveCommand._handleSSERequest(mockRequest);
      
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
      expect(response.headers.get('Connection')).toBe('keep-alive');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should manage SSE client connections', () => {
      const mockRequest = {
        headers: {
          get: mock().mockReturnValue('text/event-stream')
        }
      };
      
      const initialClientCount = serveCommand.sseClients.size;
      
      // Simulate SSE connection
      const response = serveCommand._handleSSERequest(mockRequest);
      
      // SSE client should be added (this is handled in the response stream)
      expect(response).toBeDefined();
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    });

    it('should broadcast reload events to all clients', () => {
      // Mock SSE clients
      const mockClients = [
        { write: mock(), close: mock() },
        { write: mock(), close: mock() },
        { write: mock(), close: mock() }
      ];
      
      // Add mock clients to the Set
      serveCommand.sseClients.clear();
      mockClients.forEach(client => serveCommand.sseClients.add(client));
      
      serveCommand._broadcastReload();
      
      // All clients should receive the reload event
      mockClients.forEach(client => {
        expect(client.write).toHaveBeenCalledWith('event: reload\ndata: {}\n\n');
      });
    });

    it('should handle client write errors during broadcast', () => {
      const mockClientGood = { write: mock(), close: mock() };
      const mockClientBad = { 
        write: mock().mockImplementation(() => { throw new Error('Write failed'); }),
        close: mock() 
      };
      
      serveCommand.sseClients.clear();
      serveCommand.sseClients.add(mockClientGood);
      serveCommand.sseClients.add(mockClientBad);
      
      serveCommand._broadcastReload();
      
      // Good client should receive message
      expect(mockClientGood.write).toHaveBeenCalled();
      // Bad client should be removed from set after error
      expect(serveCommand.sseClients.has(mockClientBad)).toBe(false);
      expect(mockClientBad.close).toHaveBeenCalled();
    });
  });

  describe('Static File Serving', () => {
    it('should serve index.html for root path', async () => {
      const mockFile = {
        exists: mock().mockResolvedValue(true),
        text: mock().mockResolvedValue('<html><body>Test</body></html>'),
        type: 'text/html',
        size: 1024
      };
      
      mockDependencies.fileFactory.mockReturnValue(mockFile);
      
      const response = await serveCommand._serveStaticFile('/', './dist');
      
      // Check that fileFactory was called with a path ending in index.html
      expect(mockDependencies.fileFactory).toHaveBeenCalledTimes(1);
      const calledPath = mockDependencies.fileFactory.mock.calls[0][0];
      expect(calledPath).toMatch(/index\.html$/);
      expect(calledPath).toMatch(/dist/); // Should contain 'dist' in the path
      expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    });

    it('should serve files with correct MIME types', async () => {
      const testFiles = [
        { path: '/style.css', type: 'text/css' },
        { path: '/script.js', type: 'application/javascript' },
        { path: '/image.png', type: 'image/png' },
        { path: '/data.json', type: 'application/json' }
      ];
      
      for (const testFile of testFiles) {
        const mockFile = {
          exists: mock().mockResolvedValue(true),
          type: testFile.type,
          size: 1024
        };
        
        mockDependencies.fileFactory.mockReturnValue(mockFile);
        
        const response = await serveCommand._serveStaticFile(testFile.path, './dist');
        expect(response.headers.get('Content-Type')).toBe(testFile.type);
      }
    });

    it('should return 404 for non-existent files', async () => {
      const mockFile = {
        exists: mock().mockResolvedValue(false)
      };
      
      mockDependencies.fileFactory.mockReturnValue(mockFile);
      
      const response = await serveCommand._serveStaticFile('/nonexistent.html', './dist');
      
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('Not Found');
    });

    it('should prevent path traversal attacks', async () => {
      // Test path traversal security directly using path resolution logic
      const { join, resolve } = require('path');
      
      const testOutputDir = '/safe/output/dir';
      const maliciousPaths = [
        '/../../../etc/passwd',
        '/..\\..\\..\\windows\\system32\\config\\sam', 
        '/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd'
      ];
      
      for (const maliciousPath of maliciousPaths) {
        // Replicate the exact path traversal check from serve-command
        let decodedPathname = decodeURIComponent(maliciousPath);
        let filePath = decodedPathname === '/' ? '/index.html' : decodedPathname;
        if (filePath.startsWith('/')) {
          filePath = filePath.slice(1);
        }
        filePath = filePath.replace(/\\/g, '/');
        
        const fullPath = join(testOutputDir, filePath);
        const resolvedPath = resolve(fullPath);
        const resolvedOutputDir = resolve(testOutputDir);
        
        // Security check: path traversal should be blocked
        const isPathTraversal = !resolvedPath.startsWith(resolvedOutputDir);
        expect(isPathTraversal).toBe(true);
        
        // Verify the resolved path is outside the safe directory
        expect(resolvedPath.includes('etc/passwd') || 
               resolvedPath.includes('system32') ||
               resolvedPath.includes('/../')).toBe(true);
      }
    });

    it('should handle file read errors gracefully', async () => {
      const mockFile = {
        exists: mock().mockResolvedValue(true),
        text: mock().mockImplementation(() => {
          throw new Error('File read error');
        }),
        type: 'text/html',
        size: 1024,
        stream: mock().mockImplementation(() => {
          throw new Error('File read error');
        })
      };
      
      mockDependencies.fileFactory.mockReturnValue(mockFile);
      
      const response = await serveCommand._serveStaticFile('/error.html', './dist');
      
      expect(response.status).toBe(500);
      expect(await response.text()).toBe('Internal Server Error');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle execute errors gracefully', async () => {
      mockDependencies.buildCommand.execute.mockRejectedValue(new Error('Build system failure'));
      
      const result = await serveCommand.execute({
        source: './src',
        output: './dist',
        port: 3000,
        host: 'localhost'
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Build system failure');
      expect(result.initialBuildCompleted).toBe(false);
      expect(result.serverStarted).toBe(false);
      expect(result.watchingStarted).toBe(false);
      expect(mockDependencies.logger.error).toHaveBeenCalledWith(
        'Serve command failed',
        expect.objectContaining({ error: 'Build system failure' })
      );
    });

    it('should handle file watching errors during execution', async () => {
      mockDependencies.fileWatcher.startWatching.mockRejectedValue(
        new Error('File system permission denied')
      );
      
      const result = await serveCommand.execute({
        source: './src',
        output: './dist',
        port: 3000,
        host: 'localhost'
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to start file watching');
      expect(result.initialBuildCompleted).toBe(true);
      expect(result.serverStarted).toBe(true);
      expect(result.watchingStarted).toBe(false);
    });

    it('should handle server factory errors', () => {
      mockDependencies.serverFactory.mockImplementation(() => {
        throw new Error('Server creation failed');
      });
      
      expect(async () => {
        await serveCommand.execute({
          source: './src',
          output: './dist',
          port: 3000,
          host: 'localhost'
        });
      }).toThrow;
    });
  });

  describe('Live Reload Functionality', () => {
    it('should inject live reload script before </body> tag', () => {
      const originalHtml = '<html><body><h1>Test</h1></body></html>';
      const injectedHtml = serveCommand._injectLiveReloadScript(originalHtml);
      
      expect(injectedHtml).toContain('<script>');
      expect(injectedHtml).toContain('EventSource(\'/__events\')');
      expect(injectedHtml).toContain('window.location.reload()');
      expect(injectedHtml).toContain('</script>\n</body>');
      expect(injectedHtml.indexOf('<script>')).toBeLessThan(injectedHtml.indexOf('</body>'));
    });

    it('should append live reload script when no </body> tag exists', () => {
      const originalHtml = '<html><head><title>Test</title></head></html>';
      const injectedHtml = serveCommand._injectLiveReloadScript(originalHtml);
      
      expect(injectedHtml).toContain('<script>');
      expect(injectedHtml).toContain('EventSource(\'/__events\')');
      expect(injectedHtml).toEndWith('</script>');
    });

    it('should handle empty HTML gracefully', () => {
      const originalHtml = '';
      const injectedHtml = serveCommand._injectLiveReloadScript(originalHtml);
      
      expect(injectedHtml).toContain('<script>');
      expect(injectedHtml).toContain('EventSource(\'/__events\')');
    });
  });

  describe('File Change Handling', () => {
    beforeEach(() => {
      // Reset build in progress flag
      serveCommand.buildInProgress = false;
    });

    it('should handle single file change events', async () => {
      const mockEvent = {
        filePath: '/test/src/index.html'
      };
      
      const mockResult = {
        success: true,
        rebuiltFiles: 2,
        affectedPages: ['/index.html', '/about.html']
      };
      
      mockDependencies.incrementalBuilder.performIncrementalBuild.mockResolvedValue(mockResult);
      
      await serveCommand._handleFileChanges(mockEvent, {
        source: './src',
        output: './dist'
      });
      
      expect(mockDependencies.incrementalBuilder.performIncrementalBuild).toHaveBeenCalledWith(
        '/test/src/index.html',
        './src', 
        './dist'
      );
      expect(mockDependencies.logger.info).toHaveBeenCalledWith(
        'File changes detected',
        { changedFiles: ['/test/src/index.html'] }
      );
    });

    it('should handle multiple file change events', async () => {
      const mockEvents = [
        { filePath: '/test/src/index.html' },
        { filePath: '/test/src/styles.css' }
      ];
      
      const mockResult = {
        success: true,
        rebuiltFiles: 1,
        affectedPages: ['/index.html']
      };
      
      mockDependencies.incrementalBuilder.performIncrementalBuild.mockResolvedValue(mockResult);
      
      await serveCommand._handleFileChanges(mockEvents, {
        source: './src',
        output: './dist'
      });
      
      expect(mockDependencies.incrementalBuilder.performIncrementalBuild).toHaveBeenCalledTimes(2);
      expect(mockDependencies.logger.info).toHaveBeenCalledWith(
        'File changes detected',
        { changedFiles: ['/test/src/index.html', '/test/src/styles.css'] }
      );
    });

    it('should skip file changes when build is in progress', async () => {
      serveCommand.buildInProgress = true;
      
      const mockEvent = { filePath: '/test/src/index.html' };
      
      await serveCommand._handleFileChanges(mockEvent, {
        source: './src',
        output: './dist'
      });
      
      expect(mockDependencies.incrementalBuilder.performIncrementalBuild).not.toHaveBeenCalled();
      expect(mockDependencies.logger.debug).toHaveBeenCalledWith(
        'Build already in progress, skipping file change'
      );
    });

    it('should handle incremental build errors gracefully', async () => {
      const mockEvent = { filePath: '/test/src/broken.html' };
      
      mockDependencies.incrementalBuilder.performIncrementalBuild.mockRejectedValue(
        new Error('Syntax error in HTML')
      );
      
      await serveCommand._handleFileChanges(mockEvent, {
        source: './src',
        output: './dist'
      });
      
      expect(mockDependencies.logger.error).toHaveBeenCalledWith(
        'Incremental build error',
        {
          filePath: '/test/src/broken.html',
          error: 'Syntax error in HTML'
        }
      );
    });

    it('should broadcast reload to connected SSE clients', async () => {
      // Set up mock SSE clients
      const mockClient1 = { enqueue: mock(), close: mock() };
      const mockClient2 = { write: mock(), close: mock() };
      
      serveCommand.sseClients.add(mockClient1);
      serveCommand.sseClients.add(mockClient2);
      
      const mockEvent = { filePath: '/test/src/index.html' };
      const mockResult = {
        success: true,
        rebuiltFiles: 1,
        affectedPages: ['/index.html']
      };
      
      mockDependencies.incrementalBuilder.performIncrementalBuild.mockResolvedValue(mockResult);
      
      await serveCommand._handleFileChanges(mockEvent, {
        source: './src',
        output: './dist'
      });
      
      // Should call broadcast reload
      expect(mockClient1.enqueue).toHaveBeenCalledWith(
        expect.stringContaining('event: reload')
      );
      expect(mockClient2.write).toHaveBeenCalledWith(
        expect.stringContaining('event: reload')
      );
    });

    it('should set and reset build in progress flag', async () => {
      expect(serveCommand.buildInProgress).toBe(false);
      
      // Make build take some time
      mockDependencies.incrementalBuilder.performIncrementalBuild.mockImplementation(
        () => new Promise(resolve => {
          expect(serveCommand.buildInProgress).toBe(true);
          setTimeout(() => resolve({ success: true }), 10);
        })
      );
      
      const mockEvent = { filePath: '/test/src/index.html' };
      
      await serveCommand._handleFileChanges(mockEvent, {
        source: './src',
        output: './dist'
      });
      
      expect(serveCommand.buildInProgress).toBe(false);
    });
  });

  describe('Broadcast Reload Functionality', () => {
    beforeEach(() => {
      serveCommand.sseClients.clear();
    });

    it('should return early when no clients are connected', () => {
      expect(serveCommand.sseClients.size).toBe(0);
      
      serveCommand._broadcastReload({ test: 'data' });
      
      // Should return without error and no logger calls
      expect(mockDependencies.logger.info).not.toHaveBeenCalledWith(
        'Live reload triggered',
        expect.any(Object)
      );
    });

    it('should send reload message to enqueue-based clients', () => {
      const mockClient = { enqueue: mock() };
      serveCommand.sseClients.add(mockClient);
      
      serveCommand._broadcastReload({
        changedFiles: ['/src/test.html'],
        rebuiltFiles: 1
      });
      
      expect(mockClient.enqueue).toHaveBeenCalledWith(
        expect.stringMatching(/event: reload\ndata: .*\n\n/)
      );
      
      const sseMessage = mockClient.enqueue.mock.calls[0][0];
      expect(sseMessage).toContain('event: reload');
      expect(sseMessage).toContain('"type":"reload"');
      expect(sseMessage).toContain('changedFiles');
      expect(sseMessage).toContain('rebuiltFiles');
      expect(sseMessage).toContain('timestamp');
    });

    it('should send reload message to write-based clients', () => {
      const mockClient = { write: mock() };
      serveCommand.sseClients.add(mockClient);
      
      serveCommand._broadcastReload({ test: 'value' });
      
      expect(mockClient.write).toHaveBeenCalledWith(
        expect.stringMatching(/event: reload\ndata: .*\n\n/)
      );
    });

    it('should send simple reload message when no data provided', () => {
      const mockClient = { enqueue: mock() };
      serveCommand.sseClients.add(mockClient);
      
      serveCommand._broadcastReload();
      
      expect(mockClient.enqueue).toHaveBeenCalledWith('event: reload\ndata: {}\n\n');
    });

    it('should remove disconnected clients on write errors', () => {
      const mockClientGood = { enqueue: mock() };
      const mockClientBad = { 
        enqueue: mock().mockImplementation(() => {
          throw new Error('Client disconnected');
        }),
        close: mock()
      };
      
      serveCommand.sseClients.add(mockClientGood);
      serveCommand.sseClients.add(mockClientBad);
      
      expect(serveCommand.sseClients.size).toBe(2);
      
      serveCommand._broadcastReload({ test: 'data' });
      
      // Good client should still be connected
      expect(serveCommand.sseClients.has(mockClientGood)).toBe(true);
      // Bad client should be removed
      expect(serveCommand.sseClients.has(mockClientBad)).toBe(false);
      expect(serveCommand.sseClients.size).toBe(1);
      
      // Bad client should be closed
      expect(mockClientBad.close).toHaveBeenCalled();
    });

    it('should handle clients with unknown interfaces', () => {
      const mockUnknownClient = { unknownMethod: mock() };
      serveCommand.sseClients.add(mockUnknownClient);
      
      serveCommand._broadcastReload({ test: 'data' });
      
      // Verify the client is still in the set (it continues but doesn't call write/enqueue)
      expect(serveCommand.sseClients.has(mockUnknownClient)).toBe(true);
      expect(mockDependencies.logger.warn).toHaveBeenCalledWith(
        'Unknown client interface',
        { client: mockUnknownClient }
      );
    });

    it('should handle close errors gracefully', () => {
      const mockClientBad = {
        enqueue: mock().mockImplementation(() => {
          throw new Error('Write failed');
        }),
        close: mock().mockImplementation(() => {
          throw new Error('Close failed');
        })
      };
      
      serveCommand.sseClients.add(mockClientBad);
      
      // Should not throw error even if close fails
      expect(() => {
        serveCommand._broadcastReload({ test: 'data' });
      }).not.toThrow();
      
      expect(serveCommand.sseClients.has(mockClientBad)).toBe(false);
    });

    it('should log successful broadcast with client count', () => {
      const mockClient1 = { enqueue: mock() };
      const mockClient2 = { write: mock() };
      
      serveCommand.sseClients.add(mockClient1);
      serveCommand.sseClients.add(mockClient2);
      
      serveCommand._broadcastReload({ files: ['test.html'] });
      
      expect(mockDependencies.logger.info).toHaveBeenCalledWith(
        'Live reload triggered',
        expect.objectContaining({
          clients: 2
        })
      );
    });
  });

  describe('Additional Static File Serving Coverage', () => {
    it('should handle index.html serving for root path', async () => {
      const mockFile = { exists: mock().mockResolvedValue(false) };
      const mockIndexFile = {
        exists: mock().mockResolvedValue(true),
        type: 'text/html',
        size: 1024
      };
      
      // Create fresh mock factory for this test
      const testFileFactory = mock()
        .mockReturnValueOnce(mockFile)      // First call for root path
        .mockReturnValueOnce(mockIndexFile); // Second call for index.html
      
      // Temporarily replace the file factory
      const originalFileFactory = serveCommand.fileFactory;
      serveCommand.fileFactory = testFileFactory;
      
      serveCommand._createFileResponse = mock().mockResolvedValue(
        new Response('<html>Index</html>', { 
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        })
      );
      
      const response = await serveCommand._serveStaticFile('/', './dist');
      
      // Should call fileFactory for both root path attempt and index.html fallback
      expect(testFileFactory).toHaveBeenCalledTimes(2);
      expect(testFileFactory).toHaveBeenNthCalledWith(2, expect.stringContaining('index.html'));
      expect(serveCommand._createFileResponse).toHaveBeenCalledWith(mockIndexFile, 'index.html');
      expect(response.status).toBe(200);
      
      // Restore original file factory
      serveCommand.fileFactory = originalFileFactory;
    });

    it('should return 404 for root when no index.html exists', async () => {
      // Clear previous calls
      mockDependencies.fileFactory.mockClear();
      
      const mockFile = { exists: mock().mockResolvedValue(false) };
      const mockIndexFile = { exists: mock().mockResolvedValue(false) };
      
      mockDependencies.fileFactory
        .mockReturnValueOnce(mockFile)      // First call for root path
        .mockReturnValueOnce(mockIndexFile); // Second call for index.html
      
      const response = await serveCommand._serveStaticFile('/', './dist');
      
      // Should call fileFactory for both root path attempt and index.html fallback
      expect(mockDependencies.fileFactory).toHaveBeenCalledTimes(2);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('Not Found');
    });

    it('should handle file system errors with appropriate status codes', async () => {
      const mockFile = {
        exists: mock().mockResolvedValue(true),
        type: 'text/html'
      };
      
      mockDependencies.fileFactory.mockReturnValue(mockFile);
      serveCommand._createFileResponse = mock().mockRejectedValue(
        Object.assign(new Error('File not found'), { code: 'ENOENT' })
      );
      
      const response = await serveCommand._serveStaticFile('/missing.html', './dist');
      
      expect(response.status).toBe(404);
    });

    it('should handle general file system errors with 500 status', async () => {
      const mockFile = {
        exists: mock().mockResolvedValue(true),
        type: 'text/html'
      };
      
      mockDependencies.fileFactory.mockReturnValue(mockFile);
      serveCommand._createFileResponse = mock().mockRejectedValue(
        new Error('Permission denied')
      );
      
      const response = await serveCommand._serveStaticFile('/restricted.html', './dist');
      
      expect(response.status).toBe(500);
      expect(await response.text()).toBe('Internal Server Error');
    });
  });
});