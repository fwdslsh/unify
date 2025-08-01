import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { rm, writeFile, readFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DevServer } from '../../src/server/dev-server.js';
import { FileWatcher } from '../../src/core/file-watcher.js';
import '../bun-setup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Live Reload Component Rebuild Integration', () => {
  let sourceDir;
  let outputDir;
  let testFixturesDir;
  let server;
  let watcher;
  let serverPort;
  
  beforeEach(async () => {
    testFixturesDir = join(__dirname, '../fixtures/integration-test-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
    sourceDir = join(testFixturesDir, 'src');
    outputDir = join(testFixturesDir, 'dist');
    
    await mkdir(sourceDir, { recursive: true });
    await mkdir(join(sourceDir, '.components'), { recursive: true });
    
    // Find available port
    serverPort = 3000 + Math.floor(Math.random() * 1000);
  });
  
  afterEach(async () => {
    if (watcher) {
      await watcher.stopWatching();
    }
    if (server) {
      await server.stop();
    }
    if (testFixturesDir) {
      await rm(testFixturesDir, { recursive: true, force: true });
    }
  });

  test('component changes trigger complete page rebuild before browser reload', async () => {
    // Create initial component and page
    await writeFile(join(sourceDir, '.components/status.html'), `<div class="status-v1">
  <span class="indicator">🔴</span>
  <span class="text">System Offline v1</span>
</div>`);

    await writeFile(join(sourceDir, 'index.html'), `<!DOCTYPE html>
<html>
<head><title>Status Page</title></head>
<body>
  <h1>System Status</h1>
  <!--#include virtual="/.components/status.html" -->
  <footer>Last updated: Never</footer>
</body>
</html>`);

    // Start development server
    server = new DevServer();
    await server.start({
      port: serverPort,
      outputDir: outputDir,
      liveReload: true
    });

    // Start file watcher with live reload integration
    watcher = new FileWatcher();
    const watchConfig = {
      source: sourceDir,
      output: outputDir,
      components: '.components',
      onReload: (eventType, filePath) => {
        server.broadcastReload();
      }
    };
    await watcher.startWatching(watchConfig);

    // Wait for initial build
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify initial content
    let output = await readFile(join(outputDir, 'index.html'), 'utf-8');
    expect(output).toContain('status-v1');
    expect(output).toContain('System Offline v1');
    expect(output).toContain('🔴');

    // Update component content
    await writeFile(join(sourceDir, '.components/status.html'), `<div class="status-v2">
  <span class="indicator">🟢</span>
  <span class="text">System Online v2 UPDATED</span>
  <span class="details">All services operational</span>
</div>`);

    // Wait for file watcher to process change and rebuild
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Verify content has been completely rebuilt
    output = await readFile(join(outputDir, 'index.html'), 'utf-8');
    
    // Should contain new content
    expect(output).toContain('status-v2');
    expect(output).toContain('System Online v2 UPDATED');
    expect(output).toContain('🟢');
    expect(output).toContain('All services operational');
    
    // Should NOT contain old content
    expect(output).not.toContain('status-v1');
    expect(output).not.toContain('System Offline v1');
    expect(output).not.toContain('🔴');
    
    // Page structure should remain
    expect(output).toContain('<h1>System Status</h1>');
    expect(output).toContain('<footer>Last updated: Never</footer>');
  }, 15000); // Increase timeout for this integration test

  test('nested component changes trigger rebuild of all dependent pages', async () => {
    // Create nested component structure
    await writeFile(join(sourceDir, '.components/user-info.html'), `<div class="user">
  <span class="name">John Doe v1</span>
  <span class="role">Admin v1</span>
</div>`);

    await writeFile(join(sourceDir, '.components/sidebar.html'), `<aside class="sidebar">
  <h3>User Panel</h3>
  <!--#include virtual="/.components/user-info.html" -->
  <nav>Navigation here</nav>
</aside>`);

    await writeFile(join(sourceDir, 'dashboard.html'), `<!DOCTYPE html>
<html>
<head><title>Dashboard</title></head>
<body>
  <!--#include virtual="/.components/sidebar.html" -->
  <main>Dashboard content</main>
</body>
</html>`);

    await writeFile(join(sourceDir, 'profile.html'), `<!DOCTYPE html>
<html>
<head><title>Profile</title></head>
<body>
  <!--#include virtual="/.components/sidebar.html" -->
  <main>Profile content</main>
</body>
</html>`);

    // Start development server and file watcher
    server = new DevServer();
    await server.start({
      port: serverPort,
      outputDir: outputDir,
      liveReload: true
    });

    watcher = new FileWatcher();
    await watcher.startWatching({
      source: sourceDir,
      output: outputDir,
      components: '.components',
      onReload: (eventType, filePath) => {
        server.broadcastReload();
      }
    });

    // Wait for initial build
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify initial content in both pages
    let dashboardOutput = await readFile(join(outputDir, 'dashboard.html'), 'utf-8');
    let profileOutput = await readFile(join(outputDir, 'profile.html'), 'utf-8');
    
    expect(dashboardOutput).toContain('John Doe v1');
    expect(dashboardOutput).toContain('Admin v1');
    expect(profileOutput).toContain('John Doe v1');
    expect(profileOutput).toContain('Admin v1');

    // Update the deeply nested user-info component
    await writeFile(join(sourceDir, '.components/user-info.html'), `<div class="user-updated">
  <span class="name">Jane Smith v2</span>
  <span class="role">Super Admin v2</span>
  <span class="badge">NEW ROLE</span>
</div>`);

    // Wait for file watcher to process the change
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Verify both pages have been updated
    dashboardOutput = await readFile(join(outputDir, 'dashboard.html'), 'utf-8');
    profileOutput = await readFile(join(outputDir, 'profile.html'), 'utf-8');
    
    [dashboardOutput, profileOutput].forEach(output => {
      // Should contain new content
      expect(output).toContain('user-updated');
      expect(output).toContain('Jane Smith v2');
      expect(output).toContain('Super Admin v2');
      expect(output).toContain('NEW ROLE');
      
      // Should NOT contain old content
      expect(output).not.toContain('John Doe v1');
      expect(output).not.toContain('Admin v1');
    });
    
    // Page-specific content should remain
    expect(dashboardOutput).toContain('Dashboard content');
    expect(profileOutput).toContain('Profile content');
  }, 15000);
});
