#!/usr/bin/env bun

import fs from 'fs/promises';
import path from 'path';
import { processHtmlUnified } from './src/core/unified-html-processor.js';

// Test DOM include processing directly
async function testDOMIncludeProcessing() {
  console.log('🧪 Testing DOM include processing directly...');
  
  // Create temp directory structure
  const tempDir = '/tmp/dom-include-debug';
  const sourceDir = path.join(tempDir, 'src');
  const componentDir = path.join(sourceDir, '.components');
  
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.mkdir(componentDir, { recursive: true });
    
    // Create test component with style
    await fs.writeFile(path.join(componentDir, 'alert.html'), `<style>
.alert { 
  color: red; 
  padding: 1rem; 
  border: 1px solid red; 
  border-radius: 4px;
  background: #fff5f5;
}
</style>

<div class="alert">
  <strong>Alert Title</strong>
  <p>Alert Message</p>
</div>`);
    
    // Test HTML content with DOM include
    const testHTML = `<!DOCTYPE html>
<html>
<head>
  <title>DOM Include Test</title>
</head>
<body>
  <h1>Testing DOM Includes</h1>
  
  <include src=".components/alert.html"></include>
  
  <p>End of page</p>
</body>
</html>`;

    console.log('📄 Input HTML:');
    console.log(testHTML);
    console.log('\n');

    // Process includes using the main function
    const config = {
      componentsDir: '.components',
      perfection: false,
      minify: false,
      optimize: false
    };
    
    const testFilePath = path.join(sourceDir, 'test.html');
    const result = await processHtmlUnified(testHTML, testFilePath, sourceDir, null, config);
    
    console.log('✅ Processed Result:');
    console.log(result);
    
    console.log('\n🔍 Analysis:');
    const finalContent = result.content || result;
    console.log('Contains <include> tags:', finalContent.includes('<include'));
    console.log('Contains alert content:', finalContent.includes('Alert Title'));
    console.log('Contains alert styles:', finalContent.includes('.alert'));
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

testDOMIncludeProcessing();
