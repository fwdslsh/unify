/**
 * Unit tests for test assertion helpers
 * Tests all the custom assertion functions used in the test suite
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdir, writeFile, rmdir } from 'fs/promises';
import { join } from 'path';
import {
  expectBuildSuccess,
  expectBuildFailure,
  expectOutputContains,
  expectOutputNotContains,
  expectFileExists,
  expectFileNotExists,
  expectFileContent,
  expectFileContentContains,
  expectFileContentNotContains,
  expectValidHtml,
  expectHeadContains,
  expectDirectoryStructure,
  expectDirectoryNotContains,
  expectPerformance,
  expectMemoryUsage,
  expectDryRunClassification,
  expectSlotInjection
} from '../../helpers/assertions.js';

const testDir = '/tmp/assertions-test';
const cleanupTasks = [];

beforeEach(async () => {
  // Create clean test directory
  try {
    await rmdir(testDir, { recursive: true });
  } catch {}
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  // Cleanup tasks
  for (const cleanup of cleanupTasks) {
    await cleanup();
  }
  cleanupTasks.length = 0;
  
  // Remove test directory
  try {
    await rmdir(testDir, { recursive: true });
  } catch {}
});

describe('Build Result Assertions', () => {
  test('expectBuildSuccess should pass for successful builds', () => {
    const result = {
      code: 0,
      stdout: 'Build completed successfully',
      stderr: 'Warning: something minor'
    };
    
    expectBuildSuccess(result);
  });

  test('expectBuildSuccess should fail for build errors', () => {
    const result = {
      code: 0,
      stdout: 'Build completed',
      stderr: 'Error: something went wrong'
    };
    
    expect(() => {
      expectBuildSuccess(result);
    }).toThrow();
  });

  test('expectBuildSuccess should fail for non-zero exit codes', () => {
    const result = {
      code: 1,
      stdout: '',
      stderr: ''
    };
    
    expect(() => {
      expectBuildSuccess(result);
    }).toThrow();
  });

  test('expectBuildFailure should pass for failed builds', () => {
    const result = {
      code: 1,
      stdout: '',
      stderr: 'Build failed'
    };
    
    expectBuildFailure(result);
  });

  test('expectBuildFailure should accept custom exit codes', () => {
    const result = {
      code: 2,
      stdout: '',
      stderr: 'Argument error'
    };
    
    expectBuildFailure(result, 2);
  });

  test('expectBuildFailure should fail for success codes', () => {
    const result = {
      code: 0,
      stdout: 'Success',
      stderr: ''
    };
    
    expect(() => {
      expectBuildFailure(result);
    }).toThrow();
  });
});

describe('Output Content Assertions', () => {
  test('expectOutputContains should find patterns in stdout', () => {
    const result = {
      stdout: 'Build completed successfully',
      stderr: ''
    };
    
    expectOutputContains(result, ['Build completed', 'successfully']);
  });

  test('expectOutputContains should find patterns in stderr', () => {
    const result = {
      stdout: '',
      stderr: 'Warning: minor issue detected'
    };
    
    expectOutputContains(result, ['Warning', 'detected']);
  });

  test('expectOutputContains should fail when patterns not found', () => {
    const result = {
      stdout: 'Build completed',
      stderr: ''
    };
    
    expect(() => {
      expectOutputContains(result, ['missing pattern']);
    }).toThrow();
  });

  test('expectOutputNotContains should pass when patterns absent', () => {
    const result = {
      stdout: 'Build completed successfully',
      stderr: ''
    };
    
    expectOutputNotContains(result, ['Error', 'Failed']);
  });

  test('expectOutputNotContains should fail when patterns found', () => {
    const result = {
      stdout: 'Build completed',
      stderr: 'Error occurred'
    };
    
    expect(() => {
      expectOutputNotContains(result, ['Error']);
    }).toThrow();
  });
});

describe('File Existence Assertions', () => {
  test('expectFileExists should pass for existing files', async () => {
    const filePath = join(testDir, 'test.txt');
    await writeFile(filePath, 'test content');
    
    await expectFileExists(testDir, 'test.txt');
  });

  test('expectFileExists should fail for missing files', async () => {
    await expect(expectFileExists(testDir, 'missing.txt')).rejects.toThrow('Expected file to exist: missing.txt');
  });

  test('expectFileNotExists should pass for missing files', async () => {
    await expectFileNotExists(testDir, 'missing.txt');
  });

  test('expectFileNotExists should fail for existing files', async () => {
    const filePath = join(testDir, 'test.txt');
    await writeFile(filePath, 'test content');
    
    await expect(expectFileNotExists(testDir, 'test.txt')).rejects.toThrow('Expected file to not exist: test.txt');
  });
});

describe('File Content Assertions', () => {
  test('expectFileContent should match exact content', async () => {
    const filePath = join(testDir, 'test.txt');
    await writeFile(filePath, 'exact content');
    
    await expectFileContent(testDir, 'test.txt', 'exact content');
  });

  test('expectFileContent should trim whitespace', async () => {
    const filePath = join(testDir, 'test.txt');
    await writeFile(filePath, '  content with spaces  \n');
    
    await expectFileContent(testDir, 'test.txt', 'content with spaces');
  });

  test('expectFileContent should fail for different content', async () => {
    const filePath = join(testDir, 'test.txt');
    await writeFile(filePath, 'actual content');
    
    await expect(expectFileContent(testDir, 'test.txt', 'expected content')).rejects.toThrow();
  });

  test('expectFileContentContains should find all patterns', async () => {
    const filePath = join(testDir, 'test.html');
    await writeFile(filePath, '<html><head><title>Test</title></head><body>Content</body></html>');
    
    await expectFileContentContains(testDir, 'test.html', ['<title>Test</title>', 'Content']);
  });

  test('expectFileContentContains should fail when pattern missing', async () => {
    const filePath = join(testDir, 'test.html');
    await writeFile(filePath, '<html><body>Content</body></html>');
    
    await expect(expectFileContentContains(testDir, 'test.html', ['missing pattern'])).rejects.toThrow();
  });

  test('expectFileContentNotContains should pass when patterns absent', async () => {
    const filePath = join(testDir, 'test.html');
    await writeFile(filePath, '<html><body>Clean content</body></html>');
    
    await expectFileContentNotContains(testDir, 'test.html', ['error', 'warning']);
  });

  test('expectFileContentNotContains should fail when pattern found', async () => {
    const filePath = join(testDir, 'test.html');
    await writeFile(filePath, '<html><body>Content with error</body></html>');
    
    await expect(expectFileContentNotContains(testDir, 'test.html', ['error'])).rejects.toThrow();
  });
});

describe('HTML Validation Assertions', () => {
  test('expectValidHtml should pass for well-formed HTML', () => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Test</title>
</head>
<body>
  <h1>Content</h1>
</body>
</html>`;
    
    expectValidHtml(html);
  });

  test('expectValidHtml should fail for missing DOCTYPE', () => {
    const html = '<html><head></head><body></body></html>';
    
    expect(() => {
      expectValidHtml(html);
    }).toThrow();
  });

  test('expectValidHtml should fail for missing html tags', () => {
    const html = '<!DOCTYPE html><head></head><body></body>';
    
    expect(() => {
      expectValidHtml(html);
    }).toThrow();
  });

  test('expectValidHtml should fail for missing head tags', () => {
    const html = '<!DOCTYPE html><html><body></body></html>';
    
    expect(() => {
      expectValidHtml(html);
    }).toThrow();
  });

  test('expectValidHtml should fail for missing body tags', () => {
    const html = '<!DOCTYPE html><html><head></head></html>';
    
    expect(() => {
      expectValidHtml(html);
    }).toThrow();
  });

  test('expectValidHtml should handle self-closing tags', () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <img src="image.jpg" alt="test" />
</body>
</html>`;
    
    expectValidHtml(html);
  });
});

describe('HTML Head Assertions', () => {
  test('expectHeadContains should find title', () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Test Page</title>
</head>
<body></body>
</html>`;
    
    expectHeadContains(html, { title: 'Test Page' });
  });

  test('expectHeadContains should find meta tags', () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="description" content="Test description">
  <meta name="keywords" content="test, page">
</head>
<body></body>
</html>`;
    
    expectHeadContains(html, {
      meta: [
        { name: 'description', content: 'Test description' },
        { name: 'keywords', content: 'test, page' }
      ]
    });
  });

  test('expectHeadContains should find link tags', () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="style.css">
  <link rel="icon" href="favicon.ico">
</head>
<body></body>
</html>`;
    
    expectHeadContains(html, {
      links: [
        { rel: 'stylesheet', href: 'style.css' },
        { rel: 'icon', href: 'favicon.ico' }
      ]
    });
  });

  test('expectHeadContains should fail for missing head', () => {
    const html = '<!DOCTYPE html><html><body></body></html>';
    
    expect(() => {
      expectHeadContains(html, { title: 'Test' });
    }).toThrow('No <head> element found in HTML');
  });

  test('expectHeadContains should fail for missing title', () => {
    const html = '<!DOCTYPE html><html><head></head><body></body></html>';
    
    expect(() => {
      expectHeadContains(html, { title: 'Missing Title' });
    }).toThrow();
  });
});

describe('Directory Structure Assertions', () => {
  test('expectDirectoryStructure should find all expected files', async () => {
    await writeFile(join(testDir, 'index.html'), '<html></html>');
    await writeFile(join(testDir, 'style.css'), 'body {}');
    await mkdir(join(testDir, 'assets'));
    await writeFile(join(testDir, 'assets', 'image.jpg'), 'fake image');
    
    await expectDirectoryStructure(testDir, [
      'index.html',
      'style.css',
      'assets/image.jpg'
    ]);
  });

  test('expectDirectoryStructure should fail for missing files', async () => {
    await writeFile(join(testDir, 'index.html'), '<html></html>');
    
    await expect(expectDirectoryStructure(testDir, [
      'index.html',
      'missing.html'
    ])).rejects.toThrow();
  });

  test('expectDirectoryNotContains should pass when files absent', async () => {
    await writeFile(join(testDir, 'index.html'), '<html></html>');
    
    await expectDirectoryNotContains(testDir, [
      'unwanted.html',
      'temp.txt'
    ]);
  });

  test('expectDirectoryNotContains should fail when files present', async () => {
    await writeFile(join(testDir, 'index.html'), '<html></html>');
    await writeFile(join(testDir, 'unwanted.html'), '<html></html>');
    
    await expect(expectDirectoryNotContains(testDir, [
      'unwanted.html'
    ])).rejects.toThrow();
  });
});

describe('Performance Assertions', () => {
  test('expectPerformance should pass for fast builds', () => {
    expectPerformance(100, 1000); // 100ms is less than 1000ms limit
  });

  test('expectPerformance should fail for slow builds', () => {
    expect(() => {
      expectPerformance(2000, 1000); // 2000ms exceeds 1000ms limit
    }).toThrow();
  });

  test('expectMemoryUsage should pass for efficient memory usage', () => {
    expectMemoryUsage(50 * 1024 * 1024, 100 * 1024 * 1024); // 50MB < 100MB limit
  });

  test('expectMemoryUsage should fail for excessive memory usage', () => {
    expect(() => {
      expectMemoryUsage(200 * 1024 * 1024, 100 * 1024 * 1024); // 200MB > 100MB limit
    }).toThrow();
  });
});

describe('Dry Run Assertions', () => {
  test('expectDryRunClassification should find classifications', () => {
    const result = {
      code: 0,
      stdout: `[COPY] assets/style.css
[PROCESS] index.html
[COPY] images/logo.png`,
      stderr: ''
    };
    
    expectDryRunClassification(result, {
      'style.css': 'copy',
      'index.html': 'process',
      'logo.png': 'copy'
    });
  });

  test('expectDryRunClassification should fail for wrong classifications', () => {
    const result = {
      code: 0,
      stdout: '[COPY] style.css',
      stderr: ''
    };
    
    expect(() => {
      expectDryRunClassification(result, {
        'style.css': 'process' // Expected process, got copy
      });
    }).toThrow();
  });

  test('expectDryRunClassification should fail for failed builds', () => {
    const result = {
      code: 1,
      stdout: '',
      stderr: 'Build failed'
    };
    
    expect(() => {
      expectDryRunClassification(result, {});
    }).toThrow();
  });
});

describe('Slot Injection Assertions', () => {
  test('expectSlotInjection should pass for properly processed HTML', () => {
    const html = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <header>Custom Header</header>
  <main>Main Content</main>
  <footer>Custom Footer</footer>
</body>
</html>`;
    
    const expectedSlots = {
      header: 'Custom Header',
      main: 'Main Content',
      footer: 'Custom Footer'
    };
    
    expectSlotInjection(html, expectedSlots);
  });

  test('expectSlotInjection should fail when slot containers remain', () => {
    const html = `<!DOCTYPE html>
<html>
<body>
  <slot name="header">Default</slot>
</body>
</html>`;
    
    expect(() => {
      expectSlotInjection(html, {});
    }).toThrow();
  });

  test('expectSlotInjection should fail when data-target remains', () => {
    const html = `<!DOCTYPE html>
<html>
<body>
  <div data-target="header">Content</div>
</body>
</html>`;
    
    expect(() => {
      expectSlotInjection(html, {});
    }).toThrow();
  });

  test('expectSlotInjection should fail when data-import remains', () => {
    const html = `<!DOCTYPE html>
<html>
<body>
  <div data-import="layout.html">Content</div>
</body>
</html>`;
    
    expect(() => {
      expectSlotInjection(html, {});
    }).toThrow();
  });

  test('expectSlotInjection should fail when expected content missing', () => {
    const html = `<!DOCTYPE html>
<html>
<body>
  <header>Wrong Content</header>
</body>
</html>`;
    
    expect(() => {
      expectSlotInjection(html, { header: 'Expected Content' });
    }).toThrow();
  });
});

describe('Edge Cases and Error Handling', () => {
  test('should handle empty output patterns', () => {
    const result = { stdout: 'test', stderr: '' };
    
    expectOutputContains(result, []);
    expectOutputNotContains(result, []);
  });

  test('should handle missing directory in file operations', async () => {
    await expect(expectFileExists('/nonexistent', 'file.txt')).rejects.toThrow();
  });

  test('should handle complex HTML in head validation', () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Complex & "Special" 'Characters'</title>
  <meta name="description" content="Description with &amp; entities">
</head>
<body></body>
</html>`;
    
    expectHeadContains(html, {
      title: 'Complex & "Special" \'Characters\'',
      meta: [
        { name: 'description', content: 'Description with &amp; entities' }
      ]
    });
  });

  test('should handle nested directory structures', async () => {
    await mkdir(join(testDir, 'deeply', 'nested', 'path'), { recursive: true });
    await writeFile(join(testDir, 'deeply', 'nested', 'path', 'file.txt'), 'content');
    
    await expectDirectoryStructure(testDir, ['deeply/nested/path/file.txt']);
  });
});