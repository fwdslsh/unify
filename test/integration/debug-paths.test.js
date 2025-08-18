/**
 * Simple test to debug path resolution issue
 */

import { describe, it, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from '../../src/core/file-processor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

it('Debug path resolution issue', async () => {
  const testDir = path.join(__dirname, '../test-temp/debug-paths');
  const sourceDir = path.join(testDir, 'src');
  const outputDir = path.join(testDir, 'dist');
  const componentsDir = path.join(sourceDir, 'custom_components');
  const layoutsDir = path.join(sourceDir, 'site_layouts');

  // Clean up and create test directories
  await fs.rm(testDir, { recursive: true, force: true });
  await fs.mkdir(testDir, { recursive: true });
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(componentsDir, { recursive: true });
  await fs.mkdir(layoutsDir, { recursive: true });

  // Create a simple component
  await fs.writeFile(
    path.join(componentsDir, 'alert.html'),
    `<div class="alert">Alert content</div>`
  );

  // Create a default layout
  await fs.writeFile(
    path.join(layoutsDir, 'default.html'),
    `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body><slot></slot></body>
</html>`
  );

  // Create the test page WITHOUT data-removed (should use default layout)
  await fs.writeFile(
    path.join(sourceDir, 'test.html'),
    `<div>
  <h1>Test Page</h1>
  <p>This should use the default layout.</p>
  <include src="/custom_components/alert.html" />
</div>`
  );

  console.log('=== CONFIG VALUES ===');
  console.log('sourceDir:', sourceDir);
  console.log('componentsDir:', componentsDir);
  console.log('layoutsDir:', layoutsDir);

  try {
    // Build the site
    await build({
      source: sourceDir,
      output: outputDir,
      components: componentsDir,
      layouts: layoutsDir
    });
    
    console.log('✅ Build succeeded');
  } catch (error) {
    console.log('❌ Build failed:', error.message);
    throw error;
  }
});
