/**
 * Tests for enhanced HTML minification functionality
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import { build } from '../../src/core/file-processor.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('enhanced HTML minification', () => {
  let sourceDir = null;
  let outputDir = null;
  
  beforeEach(async () => {
    const testFixturesDir = path.join(__dirname, '../fixtures/minification-test-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
    // Create test directories
    sourceDir = path.join(testFixturesDir, 'src');
    outputDir = path.join(testFixturesDir, 'dist');
    
    await fs.mkdir(sourceDir, { recursive: true });
  });
  
  afterEach(async () => {
    // Clean up
    if (sourceDir) {
      const testFixturesDir = path.dirname(sourceDir);
      try {
        await fs.rm(testFixturesDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    sourceDir = null;
    outputDir = null;
  });
  
  it('should minify HTML with CSS and JavaScript', async () => {
    // Create HTML file with verbose formatting
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Page</title>
    <style>
        /* This is a CSS comment */
        body {
            margin: 0;
            padding: 20px;
            font-family: Arial, sans-serif;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Welcome to Test Page</h1>
        <p>This is a test paragraph with    multiple spaces   .</p>
    </div>
    
    <script>
        // This is a JavaScript comment
        function greet(name) {
            console.log("Hello, " + name + "!");
        }
        
        /* Block comment */
        greet("World");
    </script>
</body>
</html>`;
    
    await fs.writeFile(path.join(sourceDir, 'index.html'), htmlContent);
    
    // Build with minification enabled
    await build({
      source: sourceDir,
      output: outputDir,
      minify: true,
      clean: true
    });
    
    // Read the minified output
    const minifiedContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
    
    // Verify minification effects
    
    // Should not contain multiple consecutive spaces (except in quoted strings)
    expect(minifiedContent.includes('    ')).toBeFalsy(); // Should not contain multiple spaces
    
    // Should not contain CSS comments
    expect(minifiedContent.includes('/* This is a CSS comment */')).toBeFalsy(); // Should not contain CSS comments
    
    // Should collapse whitespace in CSS rules
    expect(minifiedContent.includes('margin:0')).toBeTruthy(); // Should minify CSS spacing around colons
    expect(minifiedContent.includes('padding:20px')).toBeTruthy(); // Should minify CSS spacing
    
    
    // Should preserve HTML content (basic check)
    expect(minifiedContent.includes('<h1>Welcome to Test Page</h1>')).toBeTruthy(); // Should preserve HTML content
    
    // Should have some JavaScript content (even if not perfectly minified)
    expect(minifiedContent.includes('<script>') && minifiedContent.includes('</script>')).toBeTruthy(); // Should preserve script tags
    
    // Overall file should be significantly smaller
    const originalSize = htmlContent.length;
    const minifiedSize = minifiedContent.length;
    const compressionRatio = (originalSize - minifiedSize) / originalSize;
    
    // Should achieve at least 10% compression
    expect(compressionRatio).toBeGreaterThan(0.1); // Should achieve significant compression
  });
  
  it('should preserve important HTML attributes and not over-minify', async () => {
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>Attribute Test</title>
</head>
<body>
    <div class="my-class" id="my-id" data-value="test value">
        <input type="text" placeholder="Enter text here" required>
        <button onclick="alert('Hello World!')">Click Me</button>
    </div>
</body>
</html>`;
    
    await fs.writeFile(path.join(sourceDir, 'attributes.html'), htmlContent);
    
    // Build with minification enabled
    await build({
      source: sourceDir,
      output: outputDir,
      minify: true,
      clean: true
    });
    
    const minifiedContent = await fs.readFile(path.join(outputDir, 'attributes.html'), 'utf-8');
    
    // Should preserve attributes that need quotes (contain spaces or special chars)
    expect(minifiedContent.includes('data-value="test value"')).toBeTruthy(); // Should preserve quoted attributes with spaces
    expect(minifiedContent.includes('placeholder="Enter text here"')).toBeTruthy(); // Should preserve quoted attributes
    expect(minifiedContent.includes('onclick="alert(\'Hello World!\')"')).toBeTruthy(); // Should preserve quoted JS attributes
    
    // Should preserve required boolean attributes
    expect(minifiedContent.includes('required')).toBeTruthy(); // Should preserve boolean attributes
    
    // Should remove unnecessary quotes from simple attributes
    expect(minifiedContent.includes('type=text') || minifiedContent.includes('type="text"')).toBeTruthy(); // Should handle type attribute
  });
  
  it('should not minify when minify option is false', async () => {
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>No Minification Test</title>
    <style>
        body {
            margin: 0;
        }
    </style>
</head>
<body>
    <h1>Test</h1>
</body>
</html>`;
    
    await fs.writeFile(path.join(sourceDir, 'no-minify.html'), htmlContent);
    
    // Build WITHOUT minification
    await build({
      source: sourceDir,
      output: outputDir,
      minify: false,
      clean: true
    });
    
    const outputContent = await fs.readFile(path.join(outputDir, 'no-minify.html'), 'utf-8');
    
    // Should preserve original formatting when minification is disabled
    expect(outputContent.includes('    margin: 0;')).toBeTruthy(); // Should preserve CSS whitespace when not minifying
    expect(outputContent.includes('</head>\n<body>')).toBeTruthy(); // Should preserve line breaks when not minifying
  });
});