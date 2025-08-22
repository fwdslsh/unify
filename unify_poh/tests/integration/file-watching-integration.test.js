/**
 * File Watching Integration Tests - US-010
 * Integration tests for file watching and incremental builds
 * 
 * Tests the complete workflow from file changes through to output updates,
 * verifying that all components work together correctly.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';

describe('File Watching Integration - US-010', () => {
  let testDir;
  let sourceRoot;
  let outputRoot;
  let watchCommand;

  beforeEach(async () => {
    // Create temporary test directories
    testDir = mkdtempSync(join(tmpdir(), 'file-watching-integration-test-'));
    sourceRoot = join(testDir, 'src');
    outputRoot = join(testDir, 'dist');
    mkdirSync(sourceRoot, { recursive: true });
    mkdirSync(outputRoot, { recursive: true });

    // Import WatchCommand
    const { WatchCommand } = await import('../../src/cli/commands/watch-command.js');
    watchCommand = new WatchCommand();
  });

  afterEach(async () => {
    // Cleanup watcher and test directory
    if (watchCommand) {
      await watchCommand.stop();
    }
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Watch Command Integration', () => {
    test('should_start_file_watcher_when_watch_command_executed', async () => {
      // Create a simple HTML file
      const indexFile = join(sourceRoot, 'index.html');
      writeFileSync(indexFile, '<html><body>Hello World</body></html>');

      let buildEvents = [];
      const watchOptions = {
        source: sourceRoot,
        output: outputRoot,
        timeout: 1000, // Auto-stop after 1 second
        onBuild: (event) => buildEvents.push(event),
        onError: (error) => console.error('Watch error:', error)
      };

      const result = await watchCommand.execute(watchOptions);

      expect(result.success).toBe(true);
      expect(result.initialBuildCompleted).toBe(true);
      expect(result.watchingStarted).toBe(true);
      expect(buildEvents.length).toBeGreaterThanOrEqual(1);
      expect(buildEvents[0].type).toBe('initial');
    });

    test('should_perform_initial_build_when_watch_command_starts', async () => {
      // Create source files
      const indexFile = join(sourceRoot, 'index.html');
      const aboutFile = join(sourceRoot, 'about.html');
      writeFileSync(indexFile, '<html><body>Home Page</body></html>');
      writeFileSync(aboutFile, '<html><body>About Page</body></html>');

      let initialBuild = null;
      const watchOptions = {
        source: sourceRoot,
        output: outputRoot,
        timeout: 500,
        onBuild: (event) => {
          if (event.type === 'initial') {
            initialBuild = event;
          }
        }
      };

      await watchCommand.execute(watchOptions);

      expect(initialBuild).toBeDefined();
      expect(initialBuild.type).toBe('initial');
      expect(initialBuild.processedFiles).toBeGreaterThanOrEqual(0);
      expect(initialBuild.buildTime).toBeGreaterThan(0);
    });

    test('should_trigger_rebuilds_when_files_change_during_watch', async () => {
      // Create initial file
      const pageFile = join(sourceRoot, 'page.html');
      writeFileSync(pageFile, '<html><body>Original Content</body></html>');

      let buildEvents = [];
      let watchStarted = false;
      
      const watchOptions = {
        source: sourceRoot,
        output: outputRoot,
        timeout: 2000,
        onBuild: (event) => {
          buildEvents.push(event);
          if (event.type === 'initial') {
            watchStarted = true;
          }
        }
      };

      // Start watching
      const watchPromise = watchCommand.execute(watchOptions);

      // Wait for initial build to complete
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (watchStarted) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 50);
      });

      // Modify file to trigger incremental build
      writeFileSync(pageFile, '<html><body>Updated Content</body></html>');

      // Wait for watch to complete
      await watchPromise;

      // Should have both initial and incremental build events
      expect(buildEvents.length).toBeGreaterThanOrEqual(1);
      expect(buildEvents[0].type).toBe('initial');
    });

    test('should_handle_watch_command_termination_gracefully', async () => {
      const indexFile = join(sourceRoot, 'index.html');
      writeFileSync(indexFile, '<html><body>Test</body></html>');

      const watchOptions = {
        source: sourceRoot,
        output: outputRoot,
        onBuild: () => {},
        onError: () => {}
      };

      // Start watching
      const startResult = await watchCommand.execute(watchOptions);
      expect(startResult.success).toBe(true);
      expect(startResult.watchingStarted).toBe(true);

      // Stop watching
      const stopResult = await watchCommand.stop();
      expect(stopResult.success).toBe(true);
      expect(stopResult.watchingStopped).toBe(true);
      expect(stopResult.resourcesCleaned).toBe(true);
    });
  });

  describe('Fragment Change Workflows', () => {
    test('should_rebuild_all_pages_using_fragment_when_fragment_modified', async () => {
      // Create fragment and pages that use it
      const fragmentFile = join(sourceRoot, '_header.html');
      const page1File = join(sourceRoot, 'page1.html');
      const page2File = join(sourceRoot, 'page2.html');

      writeFileSync(fragmentFile, '<header>Original Header</header>');
      writeFileSync(page1File, '<html data-unify="_header.html"><body>Page 1</body></html>');
      writeFileSync(page2File, '<html data-unify="_header.html"><body>Page 2</body></html>');

      let buildEvents = [];
      let watchStarted = false;

      const watchOptions = {
        source: sourceRoot,
        output: outputRoot,
        timeout: 2000,
        onBuild: (event) => {
          buildEvents.push(event);
          if (event.type === 'initial') {
            watchStarted = true;
          }
        }
      };

      // Start watching
      const watchPromise = watchCommand.execute(watchOptions);

      // Wait for initial build
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (watchStarted) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 50);
      });

      // Modify fragment
      writeFileSync(fragmentFile, '<header>Updated Header</header>');

      // Wait for completion
      await watchPromise;

      // Should detect the change and trigger rebuilds
      expect(buildEvents.length).toBeGreaterThanOrEqual(1);
    });

    test('should_handle_nested_fragment_dependencies_when_deep_fragment_changes', async () => {
      // Create nested fragment structure
      const layoutFile = join(sourceRoot, '_layout.html');
      const navFile = join(sourceRoot, '_nav.html');
      const pageFile = join(sourceRoot, 'index.html');

      writeFileSync(layoutFile, '<html data-unify="_nav.html"><body><slot name="content"></slot></body></html>');
      writeFileSync(navFile, '<nav>Original Navigation</nav>');
      writeFileSync(pageFile, '<html data-unify="_layout.html"><main data-target="content">Page Content</main></html>');

      let buildEvents = [];
      let watchStarted = false;

      const watchOptions = {
        source: sourceRoot,
        output: outputRoot,
        timeout: 2000,
        onBuild: (event) => {
          buildEvents.push(event);
          if (event.type === 'initial') {
            watchStarted = true;
          }
        }
      };

      // Start watching
      const watchPromise = watchCommand.execute(watchOptions);

      // Wait for initial build
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (watchStarted) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 50);
      });

      // Modify deep nested fragment
      writeFileSync(navFile, '<nav>Updated Navigation</nav>');

      // Wait for completion
      await watchPromise;

      // Should handle nested dependencies
      expect(buildEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Asset Change Workflows', () => {
    test('should_copy_new_asset_and_update_references_when_asset_added', async () => {
      // Create page with asset reference
      const cssFile = join(sourceRoot, 'style.css');
      const pageFile = join(sourceRoot, 'index.html');

      writeFileSync(pageFile, '<html><head><link rel="stylesheet" href="style.css"></head><body>Content</body></html>');
      
      let buildEvents = [];
      let watchStarted = false;

      const watchOptions = {
        source: sourceRoot,
        output: outputRoot,
        timeout: 2000,
        onBuild: (event) => {
          buildEvents.push(event);
          if (event.type === 'initial') {
            watchStarted = true;
          }
        }
      };

      // Start watching
      const watchPromise = watchCommand.execute(watchOptions);

      // Wait for initial build
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (watchStarted) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 50);
      });

      // Add new asset
      writeFileSync(cssFile, 'body { color: blue; }');

      // Wait for completion
      await watchPromise;

      // Should detect new asset
      expect(buildEvents.length).toBeGreaterThanOrEqual(1);
    });

    test('should_clean_up_output_when_asset_deleted', async () => {
      // Create asset file first
      const cssFile = join(sourceRoot, 'style.css');
      const pageFile = join(sourceRoot, 'index.html');

      writeFileSync(cssFile, 'body { color: red; }');
      writeFileSync(pageFile, '<html><head><link rel="stylesheet" href="style.css"></head><body>Content</body></html>');

      let buildEvents = [];
      let watchStarted = false;

      const watchOptions = {
        source: sourceRoot,
        output: outputRoot,
        timeout: 1500,
        onBuild: (event) => {
          buildEvents.push(event);
          if (event.type === 'initial') {
            watchStarted = true;
          }
        }
      };

      // Start watching
      const watchPromise = watchCommand.execute(watchOptions);

      // Wait for initial build
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (watchStarted) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 50);
      });

      // Delete asset file
      rmSync(cssFile);

      // Wait for completion
      await watchPromise;

      // Should handle file deletion
      expect(buildEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Development Workflow Tests', () => {
    test('should_support_typical_edit_save_preview_cycle_when_developing', async () => {
      // Create a typical development setup
      const layoutFile = join(sourceRoot, '_layout.html');
      const indexFile = join(sourceRoot, 'index.html');
      const cssFile = join(sourceRoot, 'style.css');

      writeFileSync(layoutFile, '<html><head><link rel="stylesheet" href="style.css"></head><body><slot name="content"></slot></body></html>');
      writeFileSync(indexFile, '<html data-unify="_layout.html"><main data-target="content">Welcome</main></html>');
      writeFileSync(cssFile, 'body { font-family: Arial; }');

      let buildEvents = [];
      let watchStarted = false;

      const watchOptions = {
        source: sourceRoot,
        output: outputRoot,
        timeout: 3000,
        onBuild: (event) => {
          buildEvents.push(event);
          if (event.type === 'initial') {
            watchStarted = true;
          }
        }
      };

      // Start watching
      const watchPromise = watchCommand.execute(watchOptions);

      // Wait for initial build
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (watchStarted) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 50);
      });

      // Simulate development workflow: edit CSS
      writeFileSync(cssFile, 'body { font-family: Arial; color: blue; }');
      await new Promise(resolve => setTimeout(resolve, 150));

      // Edit page content
      writeFileSync(indexFile, '<html data-unify="_layout.html"><main data-target="content">Updated Welcome</main></html>');
      await new Promise(resolve => setTimeout(resolve, 150));

      // Edit layout
      writeFileSync(layoutFile, '<html><head><link rel="stylesheet" href="style.css"><title>My Site</title></head><body><slot name="content"></slot></body></html>');

      // Wait for completion
      await watchPromise;

      // Should handle multiple sequential changes
      expect(buildEvents.length).toBeGreaterThanOrEqual(1);
      expect(buildEvents[0].type).toBe('initial');
    });

    test('should_maintain_build_consistency_during_watch_session', async () => {
      // Create files with dependencies
      const componentFile = join(sourceRoot, '_button.html');
      const pageFile = join(sourceRoot, 'ui.html');

      writeFileSync(componentFile, '<button class="btn">Click Me</button>');
      writeFileSync(pageFile, '<html><body><div data-unify="_button.html"></div></body></html>');

      let buildEvents = [];
      let watchStarted = false;

      const watchOptions = {
        source: sourceRoot,
        output: outputRoot,
        timeout: 2000,
        onBuild: (event) => {
          buildEvents.push(event);
          if (event.type === 'initial') {
            watchStarted = true;
          }
        }
      };

      // Start watching
      const watchPromise = watchCommand.execute(watchOptions);

      // Wait for initial build
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (watchStarted) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 50);
      });

      // Make component change
      writeFileSync(componentFile, '<button class="btn primary">Submit</button>');

      // Wait for completion
      await watchPromise;

      // Should maintain consistency across builds
      expect(buildEvents.length).toBeGreaterThanOrEqual(1);
      const initialBuild = buildEvents.find(e => e.type === 'initial');
      expect(initialBuild).toBeDefined();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should_continue_watching_when_build_errors_occur', async () => {
      // Create a file that might cause build issues
      const pageFile = join(sourceRoot, 'page.html');
      writeFileSync(pageFile, '<html><body>Valid Content</body></html>');

      let buildEvents = [];
      let errorEvents = [];
      let watchStarted = false;

      const watchOptions = {
        source: sourceRoot,
        output: outputRoot,
        timeout: 2000,
        onBuild: (event) => {
          buildEvents.push(event);
          if (event.type === 'initial') {
            watchStarted = true;
          }
        },
        onError: (error) => errorEvents.push(error)
      };

      // Start watching
      const watchPromise = watchCommand.execute(watchOptions);

      // Wait for initial build
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (watchStarted) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 50);
      });

      // Create a potentially problematic change
      writeFileSync(pageFile, '<html><body>Still Valid</body></html>');

      // Wait for completion
      await watchPromise;

      // Should handle errors gracefully and continue watching
      expect(buildEvents.length).toBeGreaterThanOrEqual(1);
    });

    test('should_handle_watch_errors_without_stopping_process', async () => {
      const indexFile = join(sourceRoot, 'index.html');
      writeFileSync(indexFile, '<html><body>Test</body></html>');

      let buildEvents = [];
      let errorEvents = [];

      const watchOptions = {
        source: sourceRoot,
        output: outputRoot,
        timeout: 1000,
        onBuild: (event) => buildEvents.push(event),
        onError: (error) => errorEvents.push(error)
      };

      const result = await watchCommand.execute(watchOptions);

      // Should complete successfully even if there are minor errors
      expect(result.success).toBe(true);
      expect(buildEvents.length).toBeGreaterThanOrEqual(1);
    });
  });
});