/**
 * Integration tests for performance and scale
 * Tests large site builds, memory usage, and performance targets
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { makeTempProjectFromStructure } from '../../helpers/temp-project.js';
import { runBuild } from '../../helpers/cli-runner.js';
import { expectBuildSuccess } from '../../helpers/assertions.js';
import { measurePerformance, generateLargeSite, generateLargePage, PerformanceAssertions } from '../../helpers/performance.js';

const cleanupTasks = [];

afterEach(async () => {
  for (const cleanup of cleanupTasks) {
    await cleanup();
  }
  cleanupTasks.length = 0;
});

describe('Performance and Scale', () => {
  test('should build 100 pages in reasonable time', async () => {
    const siteStructure = generateLargeSite(100, {
      depth: 2,
      includesCount: 5,
      assetsCount: 10
    });
    
    const project = await makeTempProjectFromStructure(siteStructure);
    cleanupTasks.push(project.cleanup);
    
    const { result, duration, memoryUsed } = await measurePerformance(async () => {
      return await runBuild(project);
    });
    
    expectBuildSuccess(result);
    
    // Performance targets for 100 pages
    PerformanceAssertions.withinTimeLimit(duration, 5000, '100 page build'); // 5s
    PerformanceAssertions.withinMemoryLimit(memoryUsed, 50 * 1024 * 1024, '100 page build'); // 50MB
  }, { timeout: 15000 });
  
  test('should build 500 pages without memory issues', async () => {
    const siteStructure = generateLargeSite(500, {
      depth: 3,
      includesCount: 5,
      assetsCount: 20
    });
    
    const project = await makeTempProjectFromStructure(siteStructure);
    cleanupTasks.push(project.cleanup);
    
    const { result, duration, memoryUsed } = await measurePerformance(async () => {
      return await runBuild(project);
    });
    
    expectBuildSuccess(result);
    
    // Performance targets for 500 pages
    PerformanceAssertions.withinTimeLimit(duration, 15000, '500 page build'); // 15s
    PerformanceAssertions.withinMemoryLimit(memoryUsed, 100 * 1024 * 1024, '500 page build'); // 100MB
  }, { timeout: 30000 });
  
  test('should handle large individual pages', async () => {
    const largePage = generateLargePage(2); // 2MB page
    
    const structure = {
      'large.html': largePage,
      'normal.html': '<h1>Normal Page</h1><p>Regular content</p>'
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { result, duration, memoryUsed } = await measurePerformance(async () => {
      return await runBuild(project);
    });
    
    expectBuildSuccess(result);
    
    // Should handle large pages efficiently
    PerformanceAssertions.withinTimeLimit(duration, 3000, 'large page build'); // 3s
    PerformanceAssertions.withinMemoryLimit(memoryUsed, 30 * 1024 * 1024, 'large page build'); // 30MB
  }, { timeout: 10000 });
  
  test('should scale with many assets', async () => {
    const structure = {
      'index.html': '<h1>Home</h1>',
      'assets': {}
    };
    
    // Generate 200 asset files
    for (let i = 0; i < 200; i++) {
      structure.assets[`file-${i}.txt`] = `Asset content ${i}`;
      structure.assets[`image-${i}.jpg`] = 'FAKE_IMAGE_DATA_' + 'x'.repeat(1000);
    }
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { result, duration, memoryUsed } = await measurePerformance(async () => {
      return await runBuild(project);
    });
    
    expectBuildSuccess(result);
    
    // Should handle many assets efficiently
    PerformanceAssertions.withinTimeLimit(duration, 5000, 'many assets build'); // 5s
    PerformanceAssertions.withinMemoryLimit(memoryUsed, 50 * 1024 * 1024, 'many assets build'); // 50MB
  }, { timeout: 15000 });
  
  test('should handle deep directory structures', async () => {
    const structure = {};
    
    // Create deep nested structure (10 levels deep)
    let current = structure;
    for (let depth = 0; depth < 10; depth++) {
      current[`level-${depth}`] = {
        'index.html': `<h1>Level ${depth}</h1>`,
        'page.html': `<p>Content at level ${depth}</p>`
      };
      
      if (depth < 9) {
        current = current[`level-${depth}`];
      }
    }
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { result, duration } = await measurePerformance(async () => {
      return await runBuild(project);
    });
    
    expectBuildSuccess(result);
    
    // Should handle deep structures
    PerformanceAssertions.withinTimeLimit(duration, 3000, 'deep structure build'); // 3s
  }, { timeout: 10000 });
  
  test('should handle complex include hierarchies efficiently', async () => {
    const structure = {
      '_includes': {}
    };
    
    // Create 50 includes that reference each other
    for (let i = 0; i < 50; i++) {
      const nextInclude = i < 49 ? `<!--#include virtual="/_includes/include-${i + 1}.html" -->` : '';
      structure._includes[`include-${i}.html`] = `
        <div class="include-${i}">
          <h3>Include ${i}</h3>
          ${nextInclude}
        </div>
      `;
    }
    
    // Page that uses the first include (which chains to all others)
    structure['index.html'] = '<!--#include virtual="/_includes/include-0.html" -->';
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { result, duration, memoryUsed } = await measurePerformance(async () => {
      return await runBuild(project);
    });
    
    expectBuildSuccess(result);
    
    // Should handle complex includes efficiently
    PerformanceAssertions.withinTimeLimit(duration, 3000, 'complex includes build'); // 3s
    PerformanceAssertions.withinMemoryLimit(memoryUsed, 30 * 1024 * 1024, 'complex includes build'); // 30MB
  }, { timeout: 10000 });
  
  test('should demonstrate incremental build performance', async () => {
    const siteStructure = generateLargeSite(100);
    
    const project = await makeTempProjectFromStructure(siteStructure);
    cleanupTasks.push(project.cleanup);
    
    // Cold build
    const { duration: coldDuration } = await measurePerformance(async () => {
      return await runBuild(project);
    });
    
    // Incremental build (no changes)
    const { duration: incrementalDuration } = await measurePerformance(async () => {
      return await runBuild(project);
    });
    
    // Incremental should be faster (90% is reasonable for current implementation)
    PerformanceAssertions.incrementalImprovement(incrementalDuration, coldDuration, 0.9);
  }, { timeout: 20000 });
  
  test('should handle memory efficiently with large builds', async () => {
    const siteStructure = generateLargeSite(300, {
      depth: 3,
      includesCount: 10,
      assetsCount: 50
    });
    
    const project = await makeTempProjectFromStructure(siteStructure);
    cleanupTasks.push(project.cleanup);
    
    const baseline = process.memoryUsage().rss;
    
    const result = await runBuild(project);
    expectBuildSuccess(result);
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    const peak = process.memoryUsage().rss;
    const memoryUsed = peak - baseline;
    
    // Should not use excessive memory
    PerformanceAssertions.withinMemoryLimit(memoryUsed, 100 * 1024 * 1024, 'large build memory'); // 100MB
  }, { timeout: 25000 });
  
  test('should handle concurrent operations efficiently', async () => {
    const siteStructure = generateLargeSite(50);
    
    const project = await makeTempProjectFromStructure(siteStructure);
    cleanupTasks.push(project.cleanup);
    
    // Run multiple builds concurrently (simulating concurrent requests)
    const { duration } = await measurePerformance(async () => {
      const builds = Array.from({ length: 3 }, () => runBuild(project));
      const results = await Promise.all(builds);
      
      // All should succeed
      for (const result of results) {
        expectBuildSuccess(result);
      }
      
      return results[0]; // Return first result
    });
    
    // Concurrent builds should complete reasonably
    PerformanceAssertions.withinTimeLimit(duration, 10000, 'concurrent builds'); // 10s
  }, { timeout: 20000 });
  
  test('should handle stress test gracefully', async () => {
    // Create a stress test with multiple challenging aspects
    const structure = generateLargeSite(200, {
      depth: 4,
      includesCount: 8,
      assetsCount: 30
    });
    
    // Add large individual pages
    structure['large-1.html'] = generateLargePage(1);
    structure['large-2.html'] = generateLargePage(1);
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { result, duration, memoryUsed } = await measurePerformance(async () => {
      return await runBuild(project);
    });
    
    expectBuildSuccess(result);
    
    // Should handle stress test within reasonable bounds
    PerformanceAssertions.withinTimeLimit(duration, 20000, 'stress test'); // 20s
    PerformanceAssertions.withinMemoryLimit(memoryUsed, 150 * 1024 * 1024, 'stress test'); // 150MB
  }, { timeout: 30000 });
});