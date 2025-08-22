/**
 * Performance testing utilities
 * Provides timing and memory measurement helpers for Bun tests
 */

/**
 * Measures execution time of an async function
 * @param {Function} fn - Async function to measure
 * @returns {Promise<{result: any, duration: number}>} Result and duration in ms
 */
export async function measureTime(fn) {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  
  return { result, duration };
}

/**
 * Measures memory usage during function execution
 * @param {Function} fn - Async function to measure
 * @returns {Promise<{result: any, memoryUsed: number, peak: number}>} Result and memory stats
 */
export async function measureMemory(fn) {
  const baseline = process.memoryUsage();
  
  const result = await fn();
  
  const final = process.memoryUsage();
  const memoryUsed = final.rss - baseline.rss;
  const peak = final.rss;
  
  return { result, memoryUsed, peak };
}

/**
 * Measures both time and memory for function execution
 * @param {Function} fn - Async function to measure
 * @returns {Promise<{result: any, duration: number, memoryUsed: number, peak: number}>}
 */
export async function measurePerformance(fn) {
  const baseline = process.memoryUsage();
  const start = performance.now();
  
  const result = await fn();
  
  const duration = performance.now() - start;
  const final = process.memoryUsage();
  const memoryUsed = final.rss - baseline.rss;
  const peak = final.rss;
  
  return { result, duration, memoryUsed, peak };
}

/**
 * Creates a performance benchmark for repeated operations
 * @param {Function} fn - Function to benchmark
 * @param {number} iterations - Number of iterations
 * @returns {Promise<{avg: number, min: number, max: number, total: number}>} Timing statistics
 */
export async function benchmark(fn, iterations = 10) {
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const { duration } = await measureTime(fn);
    times.push(duration);
  }
  
  const total = times.reduce((sum, time) => sum + time, 0);
  const avg = total / iterations;
  const min = Math.min(...times);
  const max = Math.max(...times);
  
  return { avg, min, max, total, iterations };
}

/**
 * Generates large test data for performance testing
 * @param {number} pages - Number of pages to generate
 * @param {Object} options - Generation options
 * @returns {Object} Generated site structure
 */
export function generateLargeSite(pages = 1000, options = {}) {
  const {
    depth = 3,           // Directory depth
    includesCount = 10,  // Number of includes per page
    assetsCount = 50,    // Number of assets
    contentSize = 1000   // Average content size in characters
  } = options;
  
  const structure = {
    '_includes': generateIncludes(includesCount),
    'assets': generateAssets(assetsCount)
  };
  
  // Generate pages in nested directory structure
  for (let i = 0; i < pages; i++) {
    const path = generatePagePath(i, depth);
    structure[path] = generatePageContent(i, contentSize, includesCount);
  }
  
  return structure;
}

/**
 * Generates a large single page for testing
 * @param {number} sizeInMB - Target size in megabytes
 * @returns {string} Large page content
 */
export function generateLargePage(sizeInMB = 5) {
  const targetSize = sizeInMB * 1024 * 1024; // Convert to bytes
  const chunkSize = 1000; // Size of each content chunk
  const chunks = Math.ceil(targetSize / chunkSize);
  
  let content = `<!DOCTYPE html>
<html>
<head>
  <title>Large Test Page</title>
</head>
<body>
  <h1>Large Test Page (${sizeInMB}MB)</h1>
`;

  for (let i = 0; i < chunks; i++) {
    content += `
  <section id="section-${i}">
    <h2>Section ${i}</h2>
    <p>${'Lorem ipsum '.repeat(100)}</p>
    <ul>
      ${Array.from({ length: 10 }, (_, j) => `<li>Item ${i}-${j}</li>`).join('\n      ')}
    </ul>
  </section>
`;
  }
  
  content += `
</body>
</html>`;
  
  return content;
}

/**
 * Tracks resource usage during test execution
 */
export class ResourceTracker {
  constructor() {
    this.start();
  }
  
  start() {
    this.startTime = performance.now();
    this.startMemory = process.memoryUsage();
    this.measurements = [];
  }
  
  snapshot(label = 'snapshot') {
    const now = performance.now();
    const memory = process.memoryUsage();
    
    this.measurements.push({
      label,
      timestamp: now,
      duration: now - this.startTime,
      rss: memory.rss,
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      external: memory.external,
      memoryDelta: memory.rss - this.startMemory.rss
    });
  }
  
  finish() {
    this.snapshot('finish');
    const final = this.measurements[this.measurements.length - 1];
    
    return {
      totalDuration: final.duration,
      peakMemory: Math.max(...this.measurements.map(m => m.rss)),
      totalMemoryDelta: final.memoryDelta,
      measurements: this.measurements
    };
  }
}

/**
 * Performance assertion helpers
 */
export const PerformanceAssertions = {
  /**
   * Assert operation completes within time limit
   * @param {number} duration - Actual duration in ms
   * @param {number} maxDuration - Maximum acceptable duration in ms
   * @param {string} operation - Description of operation
   */
  withinTimeLimit(duration, maxDuration, operation = 'operation') {
    if (duration > maxDuration) {
      throw new Error(`${operation} took ${duration}ms, expected <${maxDuration}ms`);
    }
  },
  
  /**
   * Assert memory usage is within limits
   * @param {number} memoryUsed - Memory used in bytes
   * @param {number} maxMemory - Maximum acceptable memory in bytes
   * @param {string} operation - Description of operation
   */
  withinMemoryLimit(memoryUsed, maxMemory, operation = 'operation') {
    if (memoryUsed > maxMemory) {
      const usedMB = Math.round(memoryUsed / 1024 / 1024);
      const maxMB = Math.round(maxMemory / 1024 / 1024);
      throw new Error(`${operation} used ${usedMB}MB, expected <${maxMB}MB`);
    }
  },
  
  /**
   * Assert incremental build is faster than cold build
   * @param {number} incrementalTime - Incremental build time
   * @param {number} coldTime - Cold build time
   * @param {number} minImprovement - Minimum improvement ratio (default: 0.5)
   */
  incrementalImprovement(incrementalTime, coldTime, minImprovement = 0.5) {
    const ratio = incrementalTime / coldTime;
    if (ratio > minImprovement) {
      throw new Error(`Incremental build (${incrementalTime}ms) should be <${minImprovement * 100}% of cold build (${coldTime}ms), got ${Math.round(ratio * 100)}%`);
    }
  }
};

// Helper functions for generating test data

function generateIncludes(count) {
  const includes = {};
  
  for (let i = 0; i < count; i++) {
    includes[`_include-${i}.html`] = `
<div class="include-${i}">
  <h3>Include ${i}</h3>
  <p>This is include content ${i}</p>
  <slot name="content-${i}">Default content ${i}</slot>
</div>`;
  }
  
  includes['_layout.html'] = `
<!DOCTYPE html>
<html>
<head>
  <title><slot name="title">Default Title</slot></title>
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <header>
    <slot name="header">Default Header</slot>
  </header>
  <main>
    <slot>Default main content</slot>
  </main>
  <footer>
    <slot name="footer">Default Footer</slot>
  </footer>
</body>
</html>`;
  
  return includes;
}

function generateAssets(count) {
  const assets = {};
  
  // Generate CSS files
  assets['style.css'] = `
body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
h1, h2, h3 { color: #333; }
.container { max-width: 1200px; margin: 0 auto; }
`;
  
  // Generate image placeholders
  for (let i = 0; i < count; i++) {
    assets[`image-${i}.jpg`] = 'FAKE_IMAGE_DATA_' + 'x'.repeat(1000);
  }
  
  return assets;
}

function generatePagePath(index, depth) {
  const pathParts = [];
  let remaining = index;
  
  for (let i = 0; i < depth && remaining > 0; i++) {
    pathParts.push(`dir-${remaining % 10}`);
    remaining = Math.floor(remaining / 10);
  }
  
  pathParts.push(`page-${index}.html`);
  return pathParts.join('/');
}

function generatePageContent(index, contentSize, includesCount) {
  const includeRefs = Array.from({ length: Math.min(3, includesCount) }, (_, i) => 
    `<!--#include virtual="/_include-${i}.html" -->`
  ).join('\n  ');
  
  const contentChunks = Math.ceil(contentSize / 100);
  const content = Array.from({ length: contentChunks }, (_, i) =>
    `<p>Content chunk ${i} for page ${index}. ${'Lorem ipsum '.repeat(10)}</p>`
  ).join('\n  ');
  
  return `<div data-import="/_layout.html">
  <template data-target="title">Page ${index}</template>
  <template data-target="header">
    <h1>Page ${index} Header</h1>
  </template>
  
  ${includeRefs}
  
  <article>
    <h2>Page ${index} Content</h2>
    ${content}
  </article>
  
  <template data-target="footer">
    <p>Footer for page ${index}</p>
  </template>
</div>`;
}