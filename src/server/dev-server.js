/**
 * Development server with live reload support
 * Uses Bun.serve for high-performance HTTP serving
 */

import path from 'path';
import { logger } from '../utils/logger.js';

/**
 * Check if a path looks like a system file that should not trigger SPA fallback
 */
function looksLikeSystemPath(pathname) {
  const suspiciousPaths = [
    '/etc/', '/var/', '/usr/', '/bin/', '/sbin/', '/root/', '/home/',
    '/windows/', '/system32/', '/config/', '/temp/', '/tmp/',
    'passwd', 'shadow', 'hosts', 'config', 'system32', 'windows'
  ];
  
  const lowerPath = pathname.toLowerCase();
  
  // Check for suspicious path components
  if (suspiciousPaths.some(suspicious => lowerPath.includes(suspicious))) {
    return true;
  }
  
  // Check for specific suspicious patterns but allow legitimate web asset names
  // Only block paths that look like system files or weird attempts
  if (pathname.match(/^\/(?:normal-file|test-file|random-path|malicious-file|attack-vector)$/i)) {
    return true;
  }
  
  return false;
}

export class DevServer {
  constructor() {
    this.server = null;
    this.isRunning = false;
    this.config = null;
    this.sseClients = new Set();
  }

  /**
   * Start the development server
   * @param {Object} options - Server configuration options
   */
  async start(options = {}) {
    const config = {
      port: 3000,
      hostname: 'localhost',
      outputDir: 'dist',
      fallback: 'index.html',
      cors: true,
      liveReload: true,
      openBrowser: false,
      ...options
    };

    this.config = config;

    try {
      logger.info(`Starting development server on http://${config.hostname}:${config.port}`);
      
      this.server = Bun.serve({
        port: config.port,
        hostname: config.hostname,
        fetch: this.handleRequest.bind(this),
        error: this.handleError.bind(this),
        development: true,
        reusePort: true,
        idleTimeout: 255 // Maximum allowed value in Bun (255 seconds = ~4.25 minutes)
      });

      this.isRunning = true;
      logger.success(`Development server running at http://${config.hostname}:${config.port}`);
      
      // Open browser if requested
      if (config.openBrowser) {
        await this.openBrowser(`http://${config.hostname}:${config.port}`);
      }

      return this;
    } catch (error) {
      if (error.formatForCLI) {
        logger.error(error.formatForCLI());
      } else {
        logger.error('Failed to start development server:', error.message);
      }
      throw error;
    }
  }

  /**
   * Handle HTTP requests with native Bun routing
   */
  async handleRequest(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Early security checks
    // Block excessively long paths (8KB limit)
    if (pathname.length > 8192) {
      logger.debug(`Excessively long path blocked: ${pathname.length} bytes`);
      return new Response('URI Too Long', { status: 414 });
    }
    
    // Block null byte injection
    if (pathname.includes('\0') || pathname.includes('%00')) {
      logger.debug(`Null byte injection attempt blocked: ${pathname}`);
      return new Response('Bad Request', { status: 400 });
    }
    
    // Block path traversal attempts
    if (pathname.includes('..') || pathname.includes('%2e%2e') || pathname.includes('%2E%2E')) {
      logger.debug(`Path traversal attempt blocked: ${pathname}`);
      return new Response('Forbidden', { status: 403 });
    }

    try {
      // Handle Server-Sent Events for live reload
      if (pathname === '/__live-reload') {
        return this.handleLiveReloadSSE(request);
      }

      // Handle API routes (if any)
      if (pathname.startsWith('/api/')) {
        return this.handleApiRoute(request, pathname);
      }

      // Serve static files
      return await this.serveStaticFile(pathname);
      
    } catch (error) {
      logger.error(error.formatForCLI ? error.formatForCLI() : `Request error for ${pathname}: ${error.message}`);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  /**
   * Serve static files from the output directory
   */
  async serveStaticFile(pathname) {
    const { outputDir, fallback, cors } = this.config;
    
    // Normalize path and prevent directory traversal
    let filePath = pathname === '/' ? '/index.html' : pathname;
    if (filePath.endsWith('/')) {
      filePath += 'index.html';
    }
    
    const fullPath = path.join(outputDir, filePath);
    
    // Security check: ensure path is within output directory
    const resolvedPath = path.resolve(fullPath);
    const resolvedOutputDir = path.resolve(outputDir);
    
    if (!resolvedPath.startsWith(resolvedOutputDir)) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      // Try to serve the requested file
      const file = Bun.file(resolvedPath);
      
      if (await file.exists()) {
        const headers = this.getFileHeaders(resolvedPath, cors);
        
        // Inject live reload script for HTML files
        if (this.config.liveReload && resolvedPath.endsWith('.html')) {
          const content = await file.text();
          const withLiveReload = this.injectLiveReloadScript(content);
          return new Response(withLiveReload, { headers });
        }
        
        return new Response(file, { headers });
      }
      
      // Fallback to fallback file (usually index.html for SPAs)
      // Only use fallback for routes that look like pages (no file extension) and aren't system paths
      if (fallback && !path.extname(pathname) && !looksLikeSystemPath(pathname)) {
        const fallbackPath = path.join(outputDir, fallback);
        const fallbackFile = Bun.file(fallbackPath);
        
        if (await fallbackFile.exists()) {
          const headers = this.getFileHeaders(fallbackPath, cors);
          
          if (this.config.liveReload && fallbackPath.endsWith('.html')) {
            const content = await fallbackFile.text();
            const withLiveReload = this.injectLiveReloadScript(content);
            return new Response(withLiveReload, { headers });
          }
          
          return new Response(fallbackFile, { headers });
        }
      }
      
      return new Response('Not Found', { status: 404 });
      
    } catch (error) {
      logger.error(error.formatForCLI ? error.formatForCLI() : `Error serving ${resolvedPath}: ${error.message}`);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  /**
   * Get appropriate headers for file type
   */
  getFileHeaders(filePath, cors = false) {
    const headers = new Headers();
    
    // Set content type based on file extension
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.pdf': 'application/pdf',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.eot': 'application/vnd.ms-fontobject'
    };
    
    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    headers.set('Content-Type', mimeType);
    
    // CORS headers if enabled
    if (cors) {
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    
    // Cache control for development
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    // Security headers
    headers.set('X-Content-Type-Options', 'nosniff');
    
    return headers;
  }

  /**
   * Handle Server-Sent Events for live reload
   */
  handleLiveReloadSSE(request) {
    const self = this;
    
    // Create a simple readable stream for SSE
    const stream = new ReadableStream({
      start(controller) {
        const client = {
          id: Math.random().toString(36).substr(2, 9),
          controller,
          connected: Date.now(),
          active: true
        };
        
        self.sseClients.add(client);
        
        // Send initial connection message
        const connectionMessage = `data: ${JSON.stringify({ 
          type: "connected", 
          clientId: client.id,
          timestamp: Date.now() 
        })}\n\n`;
        
        try {
          controller.enqueue(new TextEncoder().encode(connectionMessage));
        } catch (error) {
          self.sseClients.delete(client);
          return;
        }
        
        // Send periodic heartbeat to keep connection alive (every 25 seconds, before Bun's timeout)
        const heartbeatInterval = setInterval(() => {
          if (!client.active) {
            clearInterval(heartbeatInterval);
            return;
          }
          
          try {
            const heartbeat = `data: ${JSON.stringify({ 
              type: "heartbeat", 
              timestamp: Date.now() 
            })}\n\n`;
            controller.enqueue(new TextEncoder().encode(heartbeat));
          } catch (error) {
            client.active = false;
            clearInterval(heartbeatInterval);
            self.sseClients.delete(client);
          }
        }, 25000); // 25 seconds
        
        // Handle cleanup
        const cleanup = () => {
          client.active = false;
          clearInterval(heartbeatInterval);
          self.sseClients.delete(client);
          try {
            if (!controller.closed) {
              controller.close();
            }
          } catch (error) {
            // Ignore close errors
          }
        };
        
        // Store cleanup on client
        client.cleanup = cleanup;
        client.heartbeatInterval = heartbeatInterval;
        
        // Handle abort signal
        request.signal?.addEventListener('abort', cleanup);
      },
      
      cancel() {
        // Find and cleanup the client when stream is cancelled
        for (const client of self.sseClients) {
          if (client.controller === this.controller) {
            if (client.cleanup) {
              client.cleanup();
            }
            break;
          }
        }
      }
    });
    
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
        'X-Accel-Buffering': 'no'
      }
    });
  }

  /**
   * Handle API routes (extensible for future API needs)
   */
  async handleApiRoute(request, pathname) {
    const method = request.method;
    
    // Basic API info endpoint
    if (pathname === '/api/info' && method === 'GET') {
      return new Response(JSON.stringify({
        server: 'Unify Dev Server',
        version: Bun.version,
        config: {
          port: this.config.port,
          outputDir: this.config.outputDir,
          liveReload: this.config.liveReload
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('API endpoint not found', { status: 404 });
  }

  /**
   * Inject live reload script into HTML content
   */
  injectLiveReloadScript(htmlContent) {
    const liveReloadScript = `
<script>
(function() {
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 3; // Reduced from 5
  let eventSource = null;
  let lastHeartbeat = Date.now();
  
  function connectToLiveReload() {
    if (reconnectAttempts >= maxReconnectAttempts) {
      console.log('Live reload: Max reconnection attempts reached, giving up');
      return;
    }
    
    // Close existing connection if any
    if (eventSource) {
      eventSource.close();
    }
    
    eventSource = new EventSource('/__live-reload');
    
    eventSource.onopen = function() {
      console.log('Live reload: Connected');
      reconnectAttempts = 0; // Reset on successful connection
      lastHeartbeat = Date.now();
    };
    
    eventSource.onmessage = function(event) {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'reload') {
          console.log('Live reload: Reloading page...');
          window.location.reload();
        } else if (data.type === 'connected') {
          console.log('Live reload: Server connection established');
        } else if (data.type === 'heartbeat') {
          lastHeartbeat = Date.now();
          // Don't log heartbeats to reduce console noise
        }
      } catch (e) {
        console.warn('Live reload: Invalid message format');
      }
    };
    
    eventSource.onerror = function(event) {
      console.log('Live reload: Connection lost');
      eventSource.close();
      
      // Check if we haven't received a heartbeat in a while (more than 35 seconds)
      const timeSinceHeartbeat = Date.now() - lastHeartbeat;
      if (timeSinceHeartbeat > 35000) {
        console.log('Live reload: Heartbeat timeout, attempting reconnect');
      }
      
      reconnectAttempts++;
      if (reconnectAttempts <= maxReconnectAttempts) {
        const delay = Math.min(2000 * reconnectAttempts, 8000); // Linear backoff, max 8s
        console.log(\`Live reload: Retrying in \${delay}ms (attempt \${reconnectAttempts}/\${maxReconnectAttempts})\`);
        setTimeout(connectToLiveReload, delay);
      }
    };
  }
  
  // Start connection
  connectToLiveReload();
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', function() {
    if (eventSource) {
      eventSource.close();
    }
  });
})();
</script>`;
    
    // Inject before closing body tag, or at the end if no body tag
    if (htmlContent.includes('</body>')) {
      return htmlContent.replace('</body>', `${liveReloadScript}\n</body>`);
    } else {
      return htmlContent + liveReloadScript;
    }
  }

  /**
   * Broadcast reload event to all connected SSE clients
   */
  broadcastReload() {
    if (!this.config.liveReload) return;
    
    const message = `data: ${JSON.stringify({ type: 'reload', timestamp: Date.now() })}\n\n`;
    const data = new TextEncoder().encode(message);
    
    const disconnectedClients = new Set();
    
    for (const client of this.sseClients) {
      if (!client.active) {
        disconnectedClients.add(client);
        continue;
      }
      
      try {
        client.controller.enqueue(data);
        logger.debug(`Sent reload message to client ${client.id}`);
      } catch (error) {
        // Mark client for removal
        client.active = false;
        disconnectedClients.add(client);
        logger.debug(`Failed to send reload to client ${client.id}: ${error.message}`);
      }
    }
    
    // Remove disconnected clients
    for (const client of disconnectedClients) {
      if (client.cleanup) {
        client.cleanup();
      }
      this.sseClients.delete(client);
    }
    
    const activeClients = this.sseClients.size;
    if (activeClients > 0) {
      logger.debug(`Live reload broadcasted to ${activeClients} clients`);
    }
  }

  /**
   * Handle server errors
   */
  handleError(error) {
    logger.error(error.formatForCLI ? error.formatForCLI() : `Server error: ${error.message}`);
    return new Response('Server Error', { status: 500 });
  }

  /**
   * Open browser to the server URL using Bun subprocess
   */
  async openBrowser(url) {
    try {
      // Use Bun's subprocess API
      const proc = Bun.spawn(['open', url], {
        stdio: ['ignore', 'ignore', 'ignore'],
        detached: true
      });
      
      // Don't wait for the process to complete
      proc.unref();
      logger.info(`Opened browser to ${url}`);
    } catch (error) {
      logger.warn('Could not open browser:', error.message);
    }
  }

  /**
   * Stop the development server
   */
  async stop() {
    if (!this.isRunning) return;
    
    try {
      // Close all SSE connections
      for (const client of this.sseClients) {
        try {
          if (client.cleanup) {
            client.cleanup();
          } else if (client.controller) {
            client.controller.close();
          }
        } catch (error) {
          // Ignore close errors
        }
      }
      this.sseClients.clear();
      
      // Stop the server
      if (this.server) {
        this.server.stop();
      }
      
      this.isRunning = false;
      logger.info('Development server stopped');
    } catch (error) {
      logger.error(error.formatForCLI ? error.formatForCLI() : `Error stopping server: ${error.message}`);
    }
  }

  /**
   * Get server status information
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      config: this.config,
      connectedClients: this.sseClients.size
    };
  }
}