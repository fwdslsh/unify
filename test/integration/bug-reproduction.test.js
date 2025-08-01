/**
 * Simple reproduction test for DOM Mode include processing bug
 */

import { describe, it, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from '../../src/core/file-processor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

it('DOM Mode include processing bug reproduction', async () => {
  const testDir = path.join(__dirname, '../test-temp/bug-reproduction');
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
    `<div class="alert">
  <strong>Title</strong>
  <p>Message</p>
</div>`
  );

  // Create a simple layout
  await fs.writeFile(
    path.join(layoutsDir, 'blog.html'),
    `<!DOCTYPE html>
<html>
<head>
  <title><slot name="title">My Blog</slot></title>
</head>
<body>
  <main>
    <slot></slot>
  </main>
</body>
</html>`
  );

  // Create the test page with DOM-style includes
  await fs.writeFile(
    path.join(sourceDir, 'blog.html'),
    `<body data-layout="/site_layouts/blog.html">
  <template target="title">Welcome to DOM Mode</template>

  <h2>Hello!</h2>
  <p>This is a test page.</p>

  <include src="/custom_components/alert.html" />
</body>`
  );

  // Build the site
  console.log('Building site...');
  await build({
    source: sourceDir,
    output: outputDir,
    components: componentsDir,
    layouts: layoutsDir
  });

  // Read the output file
  const outputFile = path.join(outputDir, 'blog.html');
  const outputContent = await fs.readFile(outputFile, 'utf-8');
  
  console.log('=== OUTPUT CONTENT ===');
  console.log(outputContent);
  console.log('=== END OUTPUT ===');

  // Check the two main issues:
  
  // Issue 1: <include> elements should be processed and replaced
  const hasIncludeElements = outputContent.includes('<include');
  console.log(`Has <include> elements: ${hasIncludeElements}`);
  
  // Issue 2: Component directories should not be copied to output
  const outputComponentsPath = path.join(outputDir, 'custom_components');
  let componentDirExists = false;
  try {
    await fs.access(outputComponentsPath);
    componentDirExists = true;
  } catch (error) {
    componentDirExists = false;
  }
  console.log(`Component directory copied to output: ${componentDirExists}`);
  
  const outputLayoutsPath = path.join(outputDir, 'site_layouts');
  let layoutsDirExists = false;
  try {
    await fs.access(outputLayoutsPath);
    layoutsDirExists = true;
  } catch (error) {
    layoutsDirExists = false;
  }
  console.log(`Layouts directory copied to output: ${layoutsDirExists}`);

  // Report the issues
  const issues = [];
  if (hasIncludeElements) {
    issues.push('<include> elements are not being processed');
  }
  if (componentDirExists) {
    issues.push('Component directory is being copied to output');
  }
  if (layoutsDirExists) {
    issues.push('Layouts directory is being copied to output');
  }

  if (issues.length > 0) {
    console.log('\n🐛 ISSUES FOUND:');
    issues.forEach((issue, i) => console.log(`${i + 1}. ${issue}`));
    
    expect(issues.length).toBe(0);
  } else {
    console.log('\n✅ All DOM Mode processing working correctly!');
  }
});
