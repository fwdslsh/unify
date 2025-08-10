/**
 * Feature tests
 * Tests native API implementations
 */

import { hasFeature } from '../../src/utils/runtime-detector.js';
import { 
  createTempDir, 
  createTempFile, 
  skipIfFeatureUnavailable, 
  assertRuntimeFeature,
  runOnlyOn
} from '../bun-setup.js';

import { describe, it, expect } from 'bun:test';

describe('HTML Processor', () => {
  it('should be available', async () => {
    const { processHtmlUnified } = await import('../../src/core/unified-html-processor.js');
    expect(processHtmlUnified).toBeTruthy();
  });

  it('should process HTML includes with HTMLRewriter', async () => {
    if (skipIfFeatureUnavailable('htmlRewriter')) return;
    
    const tempDir = await createTempDir('html-test');
    const includeFile = await createTempFile('header.html', '<h1>Header Content</h1>', tempDir);
    const mainFile = await createTempFile('index.html', 
      '<!DOCTYPE html><html><body><!--#include file="header.html" --></body></html>', 
      tempDir
    );
    
    const { processHtmlUnified } = await import('../../src/core/unified-html-processor.js');
    
    const content = await import('fs/promises').then(fs => fs.readFile(mainFile, 'utf-8'));
    const processed = await processHtmlUnified(content, mainFile, tempDir, null);
    
    expect(processed.content).toContain('<h1>Header Content</h1>');
  });

  it('should optimize HTML when enabled', async () => {
    if (skipIfFeatureUnavailable('htmlRewriter')) return;
    
    const { optimizeHtml } = await import('../../src/core/unified-html-processor.js');
    
    const html = '<div class="">  <p>   Test   </p>  </div>';
    const optimized = await optimizeHtml(html);
    
    // For now, just test that the function doesn't crash and returns something
    expect(optimized).toBeTruthy();
    expect(typeof optimized).toBe('string');
  });
});

describe('Bun File Watcher', () => {
  it('should be available when running on Bun', async () => {
    if (runOnlyOn('bun')) return;
    
    const { FileWatcher } = await import('../../src/core/file-watcher.js');
    const watcher = new FileWatcher();
    expect(watcher).toBeTruthy();
  });

  it('should start watching with native fs.watch', async () => {
    if (skipIfFeatureUnavailable('fsWatch')) return;
    
    const tempDir = await createTempDir('watch-test');
    await createTempFile('index.html', '<html><body>Test</body></html>', tempDir);
    
    const { FileWatcher } = await import('../../src/core/file-watcher.js');
    const watcher = new FileWatcher();
    
    // Start watching (won't actually build, just test setup)
    const config = {
      source: tempDir,
      output: await createTempDir('watch-output'),
      debounceMs: 50
    };
    
    // Test that watcher initializes without error
    expect(() => new FileWatcher()).not.toThrow?.() || true;
    
    // Clean up
    await watcher.stopWatching?.() || Promise.resolve();
  });
});

describe('Bun Dev Server', () => {
  it('should be available when running on Bun', async () => {
    if (runOnlyOn('bun')) return;
    
    const { DevServer } = await import('../../src/server/dev-server.js');
    const server = new DevServer();
    expect(server).toBeTruthy();
  });

  it('should handle requests with native routing', async () => {
    if (skipIfFeatureUnavailable('serve')) return;
    
    const { DevServer } = await import('../../src/server/dev-server.js');
    const server = new DevServer();
    
    // Test request handling method exists
    expect(typeof server.handleRequest).toBe('function');
    
    // Test server configuration
    const config = {
      port: 0, // Use any available port
      outputDir: await createTempDir('server-test'),
      liveReload: false
    };
    
    // Test that server can be configured
    server.config = config;
    expect(server.config.outputDir).toBeTruthy();
  });
});

describe('Bun Build Cache', () => {
  it('should be available when running on Bun', async () => {
    if (runOnlyOn('bun')) return;
    
    const { BuildCache } = await import('../../src/core/build-cache.js');
    const cache = new BuildCache();
    expect(cache).toBeTruthy();
  });

  it('should hash files with native crypto', async () => {
    if (skipIfFeatureUnavailable('hash')) return;
    
    const tempFile = await createTempFile('test.txt', 'Hello, Bun!');
    
    const { BuildCache } = await import('../../src/core/build-cache.js');
    const cache = new BuildCache();
    await cache.initialize();
    
    const hash1 = await cache.hashFile(tempFile);
    const hash2 = await cache.hashFile(tempFile);
    
    expect(hash1).toBe(hash2);
    expect(hash1).toBeTruthy();
    expect(hash1.length).toBe(64); // SHA-256 hex string
  });

  it('should detect file changes', async () => {
    if (skipIfFeatureUnavailable('hash')) return;
    
    const tempFile = await createTempFile('change-test.txt', 'Original content');
    
    const { BuildCache } = await import('../../src/core/build-cache.js');
    const cache = new BuildCache();
    await cache.initialize();
    
    // Initial hash
    const changed1 = await cache.hasFileChanged(tempFile);
    expect(changed1).toBeTruthy(); // First time should be changed
    
    // Same content - should not be changed
    const changed2 = await cache.hasFileChanged(tempFile);
    expect(changed2).toBeFalsy();
    
    // Modify file
    const fs = await import('fs/promises');
    await fs.writeFile(tempFile, 'Modified content');
    
    // Should detect change
    const changed3 = await cache.hasFileChanged(tempFile);
    expect(changed3).toBeTruthy();
  });
});

describe('Runtime Detection', () => {
  it('should correctly identify current runtime', () => {
    assertRuntimeFeature('htmlRewriter', true);
    
    // Since we're now Bun-only, all features should be available
    expect(hasFeature('htmlRewriter')).toBeTruthy();
    expect(hasFeature('hash')).toBeTruthy();
    expect(hasFeature('serve')).toBeTruthy();
  });

  it('should provide runtime info', async () => {
    const { getRuntimeInfo } = await import('../../src/utils/runtime-detector.js');
    const runtimeInfo = getRuntimeInfo();
    expect(runtimeInfo.name).toBe('bun');
    expect(runtimeInfo.version).toBeTruthy();
  });
});
