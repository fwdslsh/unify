/**
 * Serve Command Implementation
 * Implements the `serve` command from the Unify specification
 * 
 * Provides HTTP development server with live reload functionality via Server-Sent Events.
 * Follows the workflow specified in the application spec:
 * 1. Performs initial build
 * 2. Starts HTTP server on specified port/host
 * 3. Enables live reload via Server-Sent Events
 * 4. Starts file watcher for source directory
 * 5. Rebuilds incrementally on file changes
 * 6. Notifies browser of changes via SSE
 */

import { BuildCommand } from './build-command.js';
import { FileWatcher } from '../../core/file-watcher.js';
import { IncrementalBuilder } from '../../core/incremental-builder.js';
import { createLogger } from '../../utils/logger.js';

/**
 * ServeCommand implements the `unify serve` command
 */
export class ServeCommand {
  constructor(dependencies = {}) {
    // Allow dependency injection for testing
    this.buildCommand = dependencies.buildCommand || new BuildCommand();
    this.fileWatcher = dependencies.fileWatcher || new FileWatcher();
    this.incrementalBuilder = dependencies.incrementalBuilder || new IncrementalBuilder();
    this.logger = dependencies.logger || createLogger('SERVE');
    this.serverFactory = dependencies.serverFactory || this._createBunServer.bind(this);
    this.fileFactory = dependencies.fileFactory || this._createBunFile.bind(this);
    this.server = null;
    this.isServing = false;
    this.sseClients = new Set();
    this.buildInProgress = false;
  }

  /**
   * Execute the serve command
   * @param {Object} options - Serve options
   * @param {string} options.source - Source directory path
   * @param {string} options.output - Output directory path
   * @param {number} [options.port=3000] - Server port
   * @param {string} [options.host='localhost'] - Server host
   * @param {boolean} [options.clean] - Clean output directory before initial build
   * @param {boolean} [options.verbose] - Enable verbose logging
   * @returns {Promise<Object>} Serve result
   */
  async execute(options) {
    const startTime = Date.now();
    
    try {
      // Set defaults
      const serveOptions = {
        port: options.port || 3000,
        host: options.host || 'localhost',
        ...options
      };

      this.logger.info('Starting development server', {
        source: serveOptions.source,
        output: serveOptions.output,
        port: serveOptions.port,
        host: serveOptions.host
      });

      // 1. Perform initial build
      this.logger.info('Performing initial build...');
      const buildResult = await this.buildCommand.execute({
        source: serveOptions.source,
        output: serveOptions.output,
        clean: serveOptions.clean,
        verbose: serveOptions.verbose,
        minify: false, // Disable minification for development
        failOn: [], // Don't fail on warnings/security in dev server
        logger: this.logger.child('BUILD')
      });

      if (!buildResult.success) {
        return {
          success: false,
          error: `Initial build failed: ${buildResult.error}`,
          initialBuildCompleted: false,
          serverStarted: false,
          watchingStarted: false
        };
      }

      this.logger.info('Initial build completed', {
        processedFiles: buildResult.processedFiles,
        buildTime: buildResult.buildTime
      });

      // 2. Start HTTP server
      const serverResult = await this._startHttpServer(serveOptions);
      if (!serverResult.success) {
        return {
          success: false,
          error: serverResult.error,
          initialBuildCompleted: true,
          serverStarted: false,
          watchingStarted: false
        };
      }

      // 3. Start file watching
      const watchResult = await this._startFileWatching(serveOptions);
      if (!watchResult.success) {
        // Stop the server if watch setup failed
        await this._stopHttpServer();
        return {
          success: false,
          error: watchResult.error,
          initialBuildCompleted: true,
          serverStarted: true,
          watchingStarted: false
        };
      }

      this.isServing = true;

      // Log success message
      console.log(`✅ Development server started!`);
      console.log(`🌐 Server running at http://${serveOptions.host}:${serveOptions.port}/`);
      console.log(`📁 Serving files from ${serveOptions.output}`);
      console.log(`👀 Watching ${serveOptions.source} for changes`);
      console.log(`🔄 Live reload enabled at http://${serveOptions.host}:${serveOptions.port}/__events`);
      console.log('\nPress Ctrl+C to stop');

      return {
        success: true,
        initialBuildCompleted: true,
        serverStarted: true,
        watchingStarted: true,
        port: serveOptions.port,
        host: serveOptions.host,
        buildTime: Date.now() - startTime,
        url: `http://${serveOptions.host}:${serveOptions.port}/`
      };

    } catch (error) {
      this.logger.error('Serve command failed', { error: error.message });
      return {
        success: false,
        error: error.message,
        initialBuildCompleted: false,
        serverStarted: false,
        watchingStarted: false,
        buildTime: Date.now() - startTime
      };
    }
  }

  /**
   * Stop the development server and clean up resources
   * @returns {Promise<Object>} Stop result
   */
  async stop() {
    try {
      this.logger.info('Stopping development server...');

      // Stop file watching
      await this.fileWatcher.stopWatching();

      // Close all SSE connections
      for (const client of this.sseClients) {
        try {
          client.close();
        } catch (e) {
          // Ignore client close errors
        }
      }
      this.sseClients.clear();

      // Stop HTTP server
      await this._stopHttpServer();

      this.isServing = false;
      this.logger.info('Development server stopped');

      return {
        success: true,
        serverStopped: true,
        watchingStopped: true,
        resourcesCleaned: true
      };
    } catch (error) {
      this.logger.error('Error stopping server', { error: error.message });
      return {
        success: false,
        error: error.message,
        serverStopped: false,
        watchingStopped: false,
        resourcesCleaned: false
      };
    }
  }

  /**
   * Create a Bun server instance (wrapper for dependency injection)
   * @private
   * @param {Object} config - Server configuration
   * @returns {Object} Server instance
   */
  _createBunServer(config) {
    return Bun.serve(config);
  }

  /**
   * Create a Bun file instance (wrapper for dependency injection)
   * @private
   * @param {string} path - File path
   * @returns {Object} File instance
   */
  _createBunFile(path) {
    return Bun.file(path);
  }

  /**
   * Start HTTP server with static file serving and SSE endpoint
   * @private
   * @param {Object} options - Server options
   * @returns {Promise<Object>} Server start result
   */
  async _startHttpServer(options) {
    try {
      const server = this.serverFactory({
        port: options.port,
        hostname: options.host,
        fetch: (req) => this._handleRequest(req, options),
        error: (error) => {
          this.logger.error('Server error', { error: error.message });
          return new Response('Internal Server Error', { status: 500 });
        },
        // Configure timeout for SSE connections (4 minutes, max allowed is 255 seconds)
        idleTimeout: 240
      });

      this.server = server;
      
      this.logger.info('HTTP server started', {
        port: options.port,
        host: options.host,
        outputDir: options.output
      });

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to start HTTP server', { error: error.message });
      
      // Provide helpful error messages for common issues
      if (error.code === 'EADDRINUSE') {
        return {
          success: false,
          error: `Port ${options.port} is already in use. Try a different port with --port.`
        };
      } else if (error.code === 'EACCES') {
        return {
          success: false,
          error: `Permission denied to bind to port ${options.port}. Try using a port above 1024.`
        };
      } else {
        return {
          success: false,
          error: `Failed to start server: ${error.message}`
        };
      }
    }
  }

  /**
   * Stop HTTP server
   * @private
   * @returns {Promise<void>}
   */
  async _stopHttpServer() {
    if (this.server) {
      try {
        this.server.stop();
        this.server = null;
      } catch (error) {
        this.logger.error('Error stopping HTTP server', { error: error.message });
      }
    }
  }

  /**
   * Start file watching for source directory changes
   * @private
   * @param {Object} options - Watch options
   * @returns {Promise<Object>} Watch start result
   */
  async _startFileWatching(options) {
    try {
      const watchOptions = {
        debounceMs: 100,
        onChange: async (events) => {
          await this._handleFileChanges(events, options);
        },
        onError: (error) => {
          this.logger.error('File watch error', { error: error.message });
          // Don't stop the server on watch errors, just log them
        }
      };

      await this.fileWatcher.startWatching(options.source, watchOptions);
      
      this.logger.info('File watching started', { source: options.source });
      
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to start file watching', { error: error.message });
      return {
        success: false,
        error: `Failed to start file watching: ${error.message}`
      };
    }
  }

  /**
   * Handle HTTP requests (static files and SSE endpoint)
   * @private
   * @param {Request} req - HTTP request
   * @param {Object} options - Server options
   * @returns {Response} HTTP response
   */
  async _handleRequest(req, options) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    try {
      // Handle Server-Sent Events endpoint for live reload
      if (pathname === '/__events') {
        return this._handleSSERequest(req);
      }

      // Serve static files from output directory
      return await this._serveStaticFile(pathname, options.output);
    } catch (error) {
      this.logger.error('Request handling error', { 
        pathname, 
        error: error.message 
      });
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  /**
   * Handle Server-Sent Events requests for live reload
   * @private
   * @param {Request} req - SSE request
   * @returns {Response} SSE response
   */
  _handleSSERequest(req) {
    // Create SSE response stream
    let controller;
    const self = this; // Capture 'this' context for use in stream callbacks
    
    const stream = new ReadableStream({
      start(ctrl) {
        controller = ctrl;
        
        // Send initial connection message
        const data = JSON.stringify({
          type: 'connected',
          timestamp: Date.now()
        });
        ctrl.enqueue(`data: ${data}\n\n`);
      },
      cancel() {
        // Clean up when client disconnects
        if (self.sseClients.has(controller)) {
          self.sseClients.delete(controller);
        }
      }
    });

    // Store client for broadcasting updates
    this.sseClients.add(controller);

    // Return SSE response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      }
    });
  }

  /**
   * Serve static files from output directory
   * @private
   * @param {string} pathname - Request pathname
   * @param {string} outputDir - Output directory
   * @returns {Promise<Response>} Static file response
   */
  async _serveStaticFile(pathname, outputDir) {
    const { join } = await import('path');
    
    // URL decode the pathname to handle encoded path traversal attempts
    let decodedPathname;
    try {
      decodedPathname = decodeURIComponent(pathname);
    } catch (error) {
      // Invalid URL encoding
      return new Response('Bad Request', { status: 400 });
    }
    
    // Normalize pathname and prevent directory traversal
    let filePath = decodedPathname === '/' ? '/index.html' : decodedPathname;
    if (filePath.startsWith('/')) {
      filePath = filePath.slice(1);
    }
    
    // Normalize backslashes to forward slashes for cross-platform security
    filePath = filePath.replace(/\\/g, '/');
    
    const fullPath = join(outputDir, filePath);
    
    // Security: Ensure the resolved path is within output directory
    const { resolve } = await import('path');
    const resolvedPath = resolve(fullPath);
    const resolvedOutputDir = resolve(outputDir);
    
    
    if (!resolvedPath.startsWith(resolvedOutputDir)) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      // Use file factory to create file object and check if it exists
      const file = this.fileFactory(resolvedPath);
      
      // Check if file exists using file object
      const fileExists = await file.exists();
      if (!fileExists) {
        // If requesting root and file doesn't exist, it might be a directory
        if (decodedPathname === '/') {
          // Try to serve index.html from directory
          const indexPath = join(outputDir, 'index.html');
          const indexFile = this.fileFactory(indexPath);
          const indexExists = await indexFile.exists();
          if (indexExists) {
            return await this._createFileResponse(indexFile, 'index.html');
          }
        }
        return new Response('Not Found', { status: 404 });
      }

      return await this._createFileResponse(file, filePath);
      
    } catch (error) {
      // Handle file read errors
      if (error.code === 'ENOENT') {
        return new Response('Not Found', { status: 404 });
      }
      
      // Return 500 for other file system errors
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  /**
   * Create response with proper MIME type and live reload injection
   * @private
   * @param {Object} file - File object
   * @param {string} filePath - File path for MIME type detection
   * @returns {Promise<Response>} File response
   */
  async _createFileResponse(file, filePath) {
    // Get MIME type
    const mimeType = this._getMimeType(filePath);
    
    // Add live reload script to HTML files
    if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
      const content = await file.text();
      const modifiedContent = this._injectLiveReloadScript(content);
      return new Response(modifiedContent, {
        headers: { 'Content-Type': mimeType }
      });
    }
    
    // For non-HTML files, return with appropriate MIME type
    return new Response(file, {
      headers: { 'Content-Type': mimeType }
    });
  }

  /**
   * Get MIME type for file extension
   * @private
   * @param {string} filePath - File path
   * @returns {string} MIME type
   */
  _getMimeType(filePath) {
    const extension = filePath.toLowerCase().split('.').pop();
    
    const mimeTypes = {
      'html': 'text/html; charset=utf-8',
      'htm': 'text/html; charset=utf-8',
      'css': 'text/css',
      'js': 'application/javascript',
      'json': 'application/json',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'ico': 'image/x-icon',
      'txt': 'text/plain',
      'xml': 'application/xml',
      'pdf': 'application/pdf'
    };
    
    return mimeTypes[extension] || 'application/octet-stream';
  }

  /**
   * Inject live reload script into HTML content
   * @private
   * @param {string} html - Original HTML content
   * @returns {string} HTML with live reload script
   */
  _injectLiveReloadScript(html) {
    const liveReloadScript = `
    <script>
      (function() {
        console.log('[Unify] Live reload enabled');
        const eventSource = new EventSource('/__events');
        
        eventSource.onopen = function() {
          console.log('[Unify] Connected to live reload server');
        };
        
        eventSource.onmessage = function(event) {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'reload') {
              console.log('[Unify] Reloading page due to file changes:', data.changedFiles);
              window.location.reload();
            }
          } catch (e) {
            console.warn('[Unify] Invalid message from live reload server:', event.data);
          }
        };
        
        eventSource.onerror = function() {
          console.warn('[Unify] Live reload connection error - will retry automatically');
        };
      })();
    </script>`;

    // Inject before closing </body> tag, or at end if no </body>
    if (html.includes('</body>')) {
      return html.replace('</body>', `${liveReloadScript}\n</body>`);
    } else {
      return html + liveReloadScript;
    }
  }

  /**
   * Handle file change events and trigger rebuilds
   * @private
   * @param {Object|Object[]} events - File change events
   * @param {Object} options - Server options
   */
  async _handleFileChanges(events, options) {
    if (this.buildInProgress) {
      this.logger.debug('Build already in progress, skipping file change');
      return;
    }

    this.buildInProgress = true;

    try {
      const eventArray = Array.isArray(events) ? events : [events];
      const changedFiles = eventArray.map(e => e.filePath);
      
      this.logger.info('File changes detected', { changedFiles });
      
      let totalRebuiltFiles = 0;
      let allAffectedPages = [];

      // Process each changed file
      for (const event of eventArray) {
        try {
          const result = await this.incrementalBuilder.performIncrementalBuild(
            event.filePath,
            options.source,
            options.output
          );

          if (result.success) {
            totalRebuiltFiles += result.rebuiltFiles || 0;
            allAffectedPages.push(...(result.affectedPages || []));
          }
        } catch (error) {
          this.logger.error('Incremental build error', {
            filePath: event.filePath,
            error: error.message
          });
        }
      }

      // Notify connected clients of changes
      if (this.sseClients.size > 0) {
        this._broadcastReload({
          changedFiles,
          rebuiltFiles: totalRebuiltFiles,
          affectedPages: allAffectedPages
        });
      }

    } catch (error) {
      this.logger.error('File change handling error', { error: error.message });
    } finally {
      this.buildInProgress = false;
    }
  }

  /**
   * Broadcast reload message to all connected SSE clients
   * @private
   * @param {Object} [data={}] - Optional data to include in reload message
   */
  _broadcastReload(data = {}) {
    if (this.sseClients.size === 0) {
      return;
    }

    const reloadMessage = Object.keys(data).length > 0 ? JSON.stringify({
      type: 'reload',
      ...data,
      timestamp: Date.now()
    }) : '{}';

    const sseMessage = `event: reload\ndata: ${reloadMessage}\n\n`;

    // Send message to all clients and clean up disconnected ones
    for (const client of [...this.sseClients]) {
      try {
        // Support both ReadableStream controllers (enqueue) and mock clients (write)
        if (typeof client.enqueue === 'function') {
          client.enqueue(sseMessage);
        } else if (typeof client.write === 'function') {
          client.write(sseMessage);
        } else {
          this.logger.warn('Unknown client interface', { client });
          continue;
        }
      } catch (error) {
        // Remove client if it's no longer connected
        this.sseClients.delete(client);
        // Close client connection if possible
        if (client.close && typeof client.close === 'function') {
          try {
            client.close();
          } catch (closeError) {
            // Ignore close errors
          }
        }
      }
    }

    this.logger.info('Live reload triggered', {
      clients: this.sseClients.size,
      rebuiltFiles: data.rebuiltFiles || 0
    });
  }

  /**
   * Get server status information
   * @returns {Object} Server status
   */
  getStatus() {
    return {
      isServing: this.isServing,
      port: this.server ? this.server.port : null,
      connectedClients: this.sseClients.size,
      buildInProgress: this.buildInProgress
    };
  }
}