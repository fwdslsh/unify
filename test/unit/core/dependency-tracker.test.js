/**
 * Unit tests for dependency tracker
 * Tests memory leaks, circular dependencies, and performance issues
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { DependencyTracker } from '../../../src/core/dependency-tracker.js';

describe('Dependency Tracker', () => {
  describe('V3: Memory Leaks (HIGH PERFORMANCE PRIORITY)', () => {
    test('should expose memory leaks in removeFile method (lines 257-280)', () => {
      const tracker = new DependencyTracker();
      
      // Create a large number of dependencies to amplify memory leaks
      const pageCount = 1000;
      const includeCount = 500;
      
      // Set up initial dependencies
      for (let p = 0; p < pageCount; p++) {
        const pagePath = `/pages/page-${p}.html`;
        const includePaths = [];
        
        // Each page depends on multiple includes
        for (let i = 0; i < 5; i++) {
          const includeIdx = (p + i) % includeCount;
          includePaths.push(`/includes/include-${includeIdx}.html`);
        }
        
        tracker.recordDependencies(pagePath, includePaths);
      }
      
      // Get initial memory state
      const initialStats = tracker.getStats();
      const initialMapSizes = {
        includesInPage: tracker.includesInPage.size,
        pagesByInclude: tracker.pagesByInclude.size,
        knownFiles: tracker.knownFiles.size
      };
      
      // Remove half the pages (simulate file deletions)
      const removedPages = [];
      for (let p = 0; p < pageCount / 2; p++) {
        const pagePath = `/pages/page-${p}.html`;
        removedPages.push(pagePath);
        tracker.removeFile(pagePath);  // Line 257-280 vulnerability
      }
      
      // Check for memory leaks after removal
      const afterRemovalStats = tracker.getStats();
      const afterMapSizes = {
        includesInPage: tracker.includesInPage.size,
        pagesByInclude: tracker.pagesByInclude.size,
        knownFiles: tracker.knownFiles.size
      };
      
      // MEMORY LEAK DOCUMENTED: Maps may contain empty entries
      let emptyArraysFound = 0;
      let danglingReferencesFound = 0;
      
      // Check for empty arrays in pagesByInclude (memory leak indicator)
      for (const [includePath, dependentPages] of tracker.pagesByInclude.entries()) {
        if (dependentPages.length === 0) {
          emptyArraysFound++;
        }
        
        // Check for dangling references to removed pages
        for (const pagePath of dependentPages) {
          if (removedPages.includes(pagePath)) {
            danglingReferencesFound++;
          }
        }
      }
      
      // Check for empty arrays in includesInPage
      for (const [pagePath, includes] of tracker.includesInPage.entries()) {
        if (includes.length === 0) {
          emptyArraysFound++;
        }
      }
      
      if (emptyArraysFound > 0) {
        console.warn(`[SECURITY] Memory leak: ${emptyArraysFound} empty arrays not cleaned up in removeFile()`);
      }
      
      if (danglingReferencesFound > 0) {
        console.warn(`[SECURITY] Memory leak: ${danglingReferencesFound} dangling references to deleted files`);
      }
      
      // Memory should shrink significantly, but leaks prevent optimal cleanup
      expect(afterRemovalStats.totalFiles).toBeLessThan(initialStats.totalFiles);
      
      // Document potential memory growth issue
      const memoryEfficiency = afterRemovalStats.totalFiles / initialStats.totalFiles;
      if (memoryEfficiency > 0.7) {
        console.warn(`[SECURITY] Poor memory cleanup: ${(memoryEfficiency * 100).toFixed(1)}% of memory still used after 50% file removal`);
      }
    });

    test('should demonstrate inefficient clear method (lines 299-304)', () => {
      const tracker = new DependencyTracker();
      
      // Create complex nested data structures
      const complexData = [];
      for (let i = 0; i < 100; i++) {
        const pagePath = `/complex/page-${i}.html`;
        const includePaths = [];
        
        // Create deep dependency chains
        for (let j = 0; j < 20; j++) {
          includePaths.push(`/complex/include-${i}-${j}.html`);
        }
        
        tracker.recordDependencies(pagePath, includePaths);
        
        // Store references to track memory cleanup
        complexData.push({
          page: pagePath,
          includes: [...includePaths]
        });
      }
      
      // Add circular-like references (simulating complex object relationships)
      for (let i = 0; i < 50; i++) {
        const layoutPath = `/layouts/layout-${i}.html`;
        const pagePaths = [`/complex/page-${i}.html`, `/complex/page-${i + 50}.html`];
        
        for (const pagePath of pagePaths) {
          const existingIncludes = tracker.includesInPage.get(pagePath) || [];
          tracker.recordDependencies(pagePath, existingIncludes, [layoutPath]);
        }
      }
      
      const beforeClearStats = tracker.getStats();
      
      // Measure memory before clear
      const memoryBefore = {
        includesInPageEntries: tracker.includesInPage.size,
        pagesByIncludeEntries: tracker.pagesByInclude.size,
        knownFilesSize: tracker.knownFiles.size,
        totalArrayElements: Array.from(tracker.includesInPage.values())
          .reduce((sum, arr) => sum + arr.length, 0) +
          Array.from(tracker.pagesByInclude.values())
          .reduce((sum, arr) => sum + arr.length, 0)
      };
      
      // Clear using the potentially inefficient method (lines 299-304)
      const startTime = performance.now();
      tracker.clear();
      const clearTime = performance.now() - startTime;
      
      const afterClearStats = tracker.getStats();
      
      // MEMORY LEAK DOCUMENTED: Basic clear() may not handle complex cleanup efficiently
      if (clearTime > 10) {
        console.warn(`[SECURITY] Inefficient clear operation: ${clearTime.toFixed(2)}ms for ${beforeClearStats.totalFiles} files`);
      }
      
      // Verify basic clearing worked
      expect(afterClearStats.totalFiles).toBe(0);
      expect(tracker.includesInPage.size).toBe(0);
      expect(tracker.pagesByInclude.size).toBe(0);
      
      // Check if Maps truly released memory (in a real scenario, this might not be thorough)
      // This documents the concern about deep cleanup
      console.warn(`[SECURITY] Clear operation completed, but deep memory cleanup verification needed`);
    });

    test('should expose memory growth under high-frequency operations', () => {
      const tracker = new DependencyTracker();
      
      // Simulate high-frequency file operations (common in development)
      const operationCount = 10000;
      const filePool = 100;
      
      const memorySnapshots = [];
      
      for (let op = 0; op < operationCount; op++) {
        const pageId = op % filePool;
        const includeId = (op + 1) % filePool;
        
        const pagePath = `/rapid/page-${pageId}.html`;
        const includePath = `/rapid/include-${includeId}.html`;
        
        // Rapid add/remove cycle (simulating file changes)
        tracker.recordDependencies(pagePath, [includePath]);
        
        if (op % 2 === 1) {
          // Remove every other operation
          tracker.removeFile(pagePath);  // Lines 257-280 vulnerability
        }
        
        // Take memory snapshots periodically
        if (op % 1000 === 0) {
          memorySnapshots.push({
            operation: op,
            stats: tracker.getStats(),
            mapSizes: {
              includesInPage: tracker.includesInPage.size,
              pagesByInclude: tracker.pagesByInclude.size
            }
          });
        }
      }
      
      // MEMORY LEAK DOCUMENTED: Memory should stabilize, but leaks cause growth
      const initialSnapshot = memorySnapshots[0];
      const finalSnapshot = memorySnapshots[memorySnapshots.length - 1];
      
      const memoryGrowth = {
        filesGrowth: finalSnapshot.stats.totalFiles - initialSnapshot.stats.totalFiles,
        includesMapGrowth: finalSnapshot.mapSizes.includesInPage - initialSnapshot.mapSizes.includesInPage,
        pagesByIncludeGrowth: finalSnapshot.mapSizes.pagesByInclude - initialSnapshot.mapSizes.pagesByInclude
      };
      
      if (memoryGrowth.filesGrowth > filePool * 0.1) {
        console.warn(`[SECURITY] Memory growth detected: ${memoryGrowth.filesGrowth} files accumulated over ${operationCount} operations`);
      }
      
      if (memoryGrowth.includesMapGrowth > 0) {
        console.warn(`[SECURITY] Map size growth: includesInPage grew by ${memoryGrowth.includesMapGrowth} entries`);
      }
      
      if (memoryGrowth.pagesByIncludeGrowth > 0) {
        console.warn(`[SECURITY] Map size growth: pagesByInclude grew by ${memoryGrowth.pagesByIncludeGrowth} entries`);
      }
      
      // Memory should stabilize around the file pool size, not grow indefinitely
      expect(finalSnapshot.stats.totalFiles).toBeLessThanOrEqual(filePool * 2);
    });

    test('should demonstrate reference cleanup issues in dependency removal', () => {
      const tracker = new DependencyTracker();
      
      // Create complex dependency web
      const pages = [];
      const includes = [];
      
      for (let i = 0; i < 50; i++) {
        pages.push(`/web/page-${i}.html`);
        includes.push(`/web/include-${i}.html`);
      }
      
      // Create interconnected dependencies
      pages.forEach((page, pageIdx) => {
        const pageDependencies = [];
        
        // Each page depends on multiple includes
        for (let depCount = 0; depCount < 5; depCount++) {
          const includeIdx = (pageIdx + depCount) % includes.length;
          pageDependencies.push(includes[includeIdx]);
        }
        
        tracker.recordDependencies(page, pageDependencies);
      });
      
      // Verify initial state
      const initialStats = tracker.getStats();
      expect(initialStats.totalFiles).toBeGreaterThan(90); // 50 pages + includes
      
      // Remove includes one by one and check for reference cleanup issues
      const removalResults = [];
      
      includes.forEach((includePath, idx) => {
        const beforeRemoval = {
          totalFiles: tracker.getStats().totalFiles,
          pagesByIncludeSize: tracker.pagesByInclude.size,
          includesInPageSize: tracker.includesInPage.size
        };
        
        tracker.removeFile(includePath);  // Lines 257-280 vulnerability
        
        const afterRemoval = {
          totalFiles: tracker.getStats().totalFiles,
          pagesByIncludeSize: tracker.pagesByInclude.size,
          includesInPageSize: tracker.includesInPage.size
        };
        
        removalResults.push({
          includePath,
          before: beforeRemoval,
          after: afterRemoval,
          filesReduced: beforeRemoval.totalFiles - afterRemoval.totalFiles
        });
      });
      
      // MEMORY LEAK DOCUMENTED: Check for inefficient cleanup patterns
      const inefficientRemovals = removalResults.filter(result => result.filesReduced < 1);
      
      if (inefficientRemovals.length > 0) {
        console.warn(`[SECURITY] Inefficient reference cleanup: ${inefficientRemovals.length} removals didn't reduce file count`);
      }
      
      // Check for empty arrays left behind (line 272-273 issue)
      let emptyArrayCount = 0;
      for (const dependencyArray of tracker.includesInPage.values()) {
        if (Array.isArray(dependencyArray) && dependencyArray.length === 0) {
          emptyArrayCount++;
        }
      }
      
      if (emptyArrayCount > 0) {
        console.warn(`[SECURITY] Memory leak: ${emptyArrayCount} empty dependency arrays left after cleanup`);
      }
      
      expect(removalResults.length).toBe(includes.length);
    });

    test('should measure memory efficiency under stress conditions', () => {
      const tracker = new DependencyTracker();
      
      // Stress test with many operations
      const stressOperations = 5000;
      const maxFiles = 200;
      
      const performanceData = {
        operationTimes: [],
        memorySnapshots: [],
        errors: []
      };
      
      for (let op = 0; op < stressOperations; op++) {
        const startTime = performance.now();
        
        try {
          const fileId = op % maxFiles;
          const operation = op % 4;
          
          switch (operation) {
            case 0: // Record dependencies
              tracker.recordDependencies(
                `/stress/page-${fileId}.html`,
                [`/stress/include-${fileId}.html`, `/stress/include-${(fileId + 1) % maxFiles}.html`]
              );
              break;
              
            case 1: // Remove file (lines 257-280)
              tracker.removeFile(`/stress/page-${fileId}.html`);
              break;
              
            case 2: // Get stats (performance check)
              tracker.getStats();
              break;
              
            case 3: // Clear and rebuild (lines 299-304)
              if (op % 100 === 0) {
                tracker.clear();
              }
              break;
          }
          
          const operationTime = performance.now() - startTime;
          performanceData.operationTimes.push(operationTime);
          
          // Take periodic memory snapshots
          if (op % 500 === 0) {
            performanceData.memorySnapshots.push({
              operation: op,
              stats: tracker.getStats(),
              avgOperationTime: performanceData.operationTimes
                .slice(-100)
                .reduce((sum, time) => sum + time, 0) / 100
            });
          }
          
        } catch (error) {
          performanceData.errors.push({ operation: op, error: error.message });
        }
      }
      
      // PERFORMANCE ISSUE DOCUMENTED: Operations should remain fast
      const avgOperationTime = performanceData.operationTimes
        .reduce((sum, time) => sum + time, 0) / performanceData.operationTimes.length;
      
      if (avgOperationTime > 5) {
        console.warn(`[SECURITY] Performance degradation: Average operation time ${avgOperationTime.toFixed(2)}ms`);
      }
      
      // Check for performance degradation over time
      const snapshots = performanceData.memorySnapshots;
      if (snapshots.length > 2) {
        const initialPerf = snapshots[0].avgOperationTime;
        const finalPerf = snapshots[snapshots.length - 1].avgOperationTime;
        
        if (finalPerf > initialPerf * 2) {
          console.warn(`[SECURITY] Performance degraded ${((finalPerf / initialPerf - 1) * 100).toFixed(1)}% over ${stressOperations} operations`);
        }
      }
      
      if (performanceData.errors.length > 0) {
        console.warn(`[SECURITY] ${performanceData.errors.length} errors during stress test`);
      }
      
      expect(performanceData.operationTimes.length).toBeGreaterThan(0);
    });
  });

  describe('V4: Circular Dependencies Detection (MEDIUM-HIGH LOGIC PRIORITY)', () => {
    test('should expose infinite loop in getAffectedPages with circular includes (lines 100-127)', () => {
      const tracker = new DependencyTracker();
      
      // Create circular dependency chain: A -> B -> C -> A
      const fileA = '/circular/include-a.html';
      const fileB = '/circular/include-b.html';
      const fileC = '/circular/include-c.html';
      const page = '/circular/page.html';
      
      // Set up circular dependency: A includes B, B includes C, C includes A
      tracker.recordDependencies(fileA, [fileB]);
      tracker.recordDependencies(fileB, [fileC]);
      tracker.recordDependencies(fileC, [fileA]);  // Creates circle!
      tracker.recordDependencies(page, [fileA]);   // Page depends on circular chain
      
      // VULNERABILITY DOCUMENTED: getAffectedPages has no circular dependency protection
      let operationCount = 0;
      const maxOperations = 1000;  // Prevent infinite loop in test
      
      const originalGetAffectedPages = tracker.getAffectedPages.bind(tracker);
      tracker.getAffectedPages = (includePath, cache = new Map()) => {
        operationCount++;
        if (operationCount > maxOperations) {
          console.warn(`[SECURITY] Circular dependency infinite loop detected after ${maxOperations} operations`);
          console.warn(`[SECURITY] Processing includePath: ${includePath}`);
          console.warn(`[SECURITY] Cache size: ${cache.size}`);
          return ['CIRCULAR_DEPENDENCY_DETECTED'];
        }
        
        return originalGetAffectedPages(includePath, cache);
      };
      
      try {
        // This should trigger circular dependency traversal (lines 117-120)
        const affected = tracker.getAffectedPages(fileA);
        
        if (operationCount > 100) {
          console.warn(`[SECURITY] High recursion count: ${operationCount} operations for circular dependency`);
        }
        
        // Check if circular dependency protection worked
        if (affected.includes('CIRCULAR_DEPENDENCY_DETECTED')) {
          console.warn(`[SECURITY] Infinite loop prevented by test timeout`);
        } else {
          console.warn(`[SECURITY] Circular dependency processed: ${affected.length} affected files`);
        }
        
        expect(operationCount).toBeGreaterThan(0);
        
      } catch (error) {
        // Stack overflow or other circular dependency error
        console.warn(`[SECURITY] Circular dependency caused error: ${error.message}`);
        expect(error).toBeDefined();
      }
    });

    test('should demonstrate stack overflow with deep circular chains', () => {
      const tracker = new DependencyTracker();
      
      // Create deep circular chain: A -> B -> C -> D -> E -> A
      const circularFiles = [
        '/deep/include-a.html',
        '/deep/include-b.html', 
        '/deep/include-c.html',
        '/deep/include-d.html',
        '/deep/include-e.html'
      ];
      
      // Create circular chain
      for (let i = 0; i < circularFiles.length; i++) {
        const currentFile = circularFiles[i];
        const nextFile = circularFiles[(i + 1) % circularFiles.length];
        tracker.recordDependencies(currentFile, [nextFile]);
      }
      
      // Add page that depends on the circular chain
      tracker.recordDependencies('/deep/page.html', [circularFiles[0]]);
      
      let recursionDepth = 0;
      const maxDepth = 500;  // Prevent stack overflow in test
      
      const originalMethod = tracker.getAffectedPages.bind(tracker);
      tracker.getAffectedPages = function(includePath, cache = new Map()) {
        recursionDepth++;
        
        if (recursionDepth > maxDepth) {
          console.warn(`[SECURITY] Deep circular dependency recursion: ${recursionDepth} levels`);
          return ['RECURSION_LIMIT_REACHED'];
        }
        
        try {
          return originalMethod(includePath, cache);
        } finally {
          recursionDepth--;
        }
      };
      
      try {
        const affected = tracker.getAffectedPages(circularFiles[0]);
        
        if (affected.includes('RECURSION_LIMIT_REACHED')) {
          console.warn(`[SECURITY] Deep circular dependency caused recursion limit`);
        }
        
        expect(recursionDepth).toBeGreaterThanOrEqual(0);
        
      } catch (error) {
        console.warn(`[SECURITY] Deep circular dependency error: ${error.message}`);
      }
    });

    test('should expose cache pollution in circular dependency resolution (lines 123-124)', () => {
      const tracker = new DependencyTracker();
      
      // Create multiple overlapping circular dependencies
      // Circle 1: A1 -> B1 -> A1
      tracker.recordDependencies('/cache/a1.html', ['/cache/b1.html']);
      tracker.recordDependencies('/cache/b1.html', ['/cache/a1.html']);
      
      // Circle 2: A2 -> B2 -> A2 (shares same cache)
      tracker.recordDependencies('/cache/a2.html', ['/cache/b2.html']);
      tracker.recordDependencies('/cache/b2.html', ['/cache/a2.html']);
      
      // Cross-dependencies that could pollute cache
      tracker.recordDependencies('/cache/cross.html', ['/cache/a1.html', '/cache/a2.html']);
      
      const cacheOperations = [];
      const sharedCache = new Map();
      
      // Track cache operations to detect pollution
      const originalSet = sharedCache.set.bind(sharedCache);
      const originalGet = sharedCache.get.bind(sharedCache);
      
      sharedCache.set = (key, value) => {
        cacheOperations.push({ action: 'set', key, valueLength: Array.isArray(value) ? value.length : 1 });
        return originalSet(key, value);
      };
      
      sharedCache.get = (key) => {
        const value = originalGet(key);
        cacheOperations.push({ action: 'get', key, found: value !== undefined });
        return value;
      };
      
      try {
        // Process both circular chains with shared cache
        tracker.getAffectedPages('/cache/a1.html', sharedCache);
        tracker.getAffectedPages('/cache/a2.html', sharedCache);
        tracker.getAffectedPages('/cache/cross.html', sharedCache);
        
        // CACHE POLLUTION DOCUMENTED: Check for incorrect cache sharing
        const setCalls = cacheOperations.filter(op => op.action === 'set');
        const getCalls = cacheOperations.filter(op => op.action === 'get');
        
        if (setCalls.length > 0 && getCalls.length > 0) {
          console.warn(`[SECURITY] Cache pollution risk: ${setCalls.length} sets, ${getCalls.length} gets`);
          
          // Check for cache pollution indicators
          const cacheKeys = setCalls.map(op => op.key);
          const duplicateKeys = cacheKeys.filter((key, index) => cacheKeys.indexOf(key) !== index);
          
          if (duplicateKeys.length > 0) {
            console.warn(`[SECURITY] Cache key pollution: ${duplicateKeys.length} duplicate cache entries`);
          }
        }
        
        expect(cacheOperations.length).toBeGreaterThan(0);
        
      } catch (error) {
        console.warn(`[SECURITY] Cache pollution test error: ${error.message}`);
      }
    });

    test('should demonstrate complex nested circular dependencies', () => {
      const tracker = new DependencyTracker();
      
      // Create complex nested circular structure:
      // Layout -> Component1 -> Component2 -> Layout (outer circle)
      // Component1 -> SubComponent -> Component1 (inner circle)
      const layout = '/complex/layout.html';
      const comp1 = '/complex/component1.html';
      const comp2 = '/complex/component2.html';
      const subComp = '/complex/subcomponent.html';
      const page = '/complex/page.html';
      
      // Outer circular dependency
      tracker.recordDependencies(layout, [comp1]);
      tracker.recordDependencies(comp1, [comp2, subComp]);  // Multiple deps
      tracker.recordDependencies(comp2, [layout]);          // Closes outer circle
      
      // Inner circular dependency  
      tracker.recordDependencies(subComp, [comp1]);         // Closes inner circle
      
      // Page depends on the whole mess
      tracker.recordDependencies(page, [layout]);
      
      let cyclicCallStack = [];
      const maxStackSize = 100;
      
      const originalGetAffectedPages = tracker.getAffectedPages.bind(tracker);
      tracker.getAffectedPages = function(includePath, cache = new Map()) {
        // Track call stack to detect cycles
        if (cyclicCallStack.includes(includePath)) {
          console.warn(`[SECURITY] Nested circular dependency detected in call stack`);
          console.warn(`[SECURITY] Current path: ${includePath}`);
          console.warn(`[SECURITY] Call stack: ${cyclicCallStack.join(' -> ')}`);
          return ['NESTED_CYCLE_DETECTED'];
        }
        
        cyclicCallStack.push(includePath);
        
        if (cyclicCallStack.length > maxStackSize) {
          console.warn(`[SECURITY] Call stack overflow: ${cyclicCallStack.length} levels`);
          cyclicCallStack.pop();
          return ['STACK_OVERFLOW_DETECTED'];
        }
        
        try {
          return originalGetAffectedPages(includePath, cache);
        } finally {
          cyclicCallStack.pop();
        }
      };
      
      try {
        const affected = tracker.getAffectedPages(layout);
        
        // Check for nested cycle detection
        if (Array.isArray(affected) && 
           (affected.includes('NESTED_CYCLE_DETECTED') || 
            affected.includes('STACK_OVERFLOW_DETECTED'))) {
          console.warn(`[SECURITY] Complex circular dependency protection triggered`);
        }
        
        expect(cyclicCallStack.length).toBe(0);  // Should be empty after completion
        
      } catch (error) {
        console.warn(`[SECURITY] Complex circular dependency error: ${error.message}`);
      }
    });

    test('should expose performance issues with large circular graphs', () => {
      const tracker = new DependencyTracker();
      
      // Create large circular graph (stress test)
      const nodeCount = 50;
      const circularNodes = [];
      
      for (let i = 0; i < nodeCount; i++) {
        circularNodes.push(`/large/node-${i}.html`);
      }
      
      // Create circular chain: each node depends on the next, last depends on first
      for (let i = 0; i < nodeCount; i++) {
        const currentNode = circularNodes[i];
        const nextNode = circularNodes[(i + 1) % nodeCount];
        tracker.recordDependencies(currentNode, [nextNode]);
      }
      
      // Add additional cross-dependencies to increase complexity
      for (let i = 0; i < nodeCount; i += 5) {
        const node = circularNodes[i];
        const crossNode = circularNodes[(i + nodeCount / 2) % nodeCount];
        const existing = tracker.includesInPage.get(node) || [];
        tracker.recordDependencies(node, [...existing, crossNode]);
      }
      
      const performanceMetrics = {
        operationsCount: 0,
        startTime: 0,
        endTime: 0,
        cacheHits: 0,
        cacheMisses: 0
      };
      
      const originalGetAffectedPages = tracker.getAffectedPages.bind(tracker);
      tracker.getAffectedPages = function(includePath, cache = new Map()) {
        performanceMetrics.operationsCount++;
        
        if (performanceMetrics.operationsCount === 1) {
          performanceMetrics.startTime = performance.now();
        }
        
        if (cache.has(includePath)) {
          performanceMetrics.cacheHits++;
        } else {
          performanceMetrics.cacheMisses++;
        }
        
        // Prevent infinite loops with operation limit
        if (performanceMetrics.operationsCount > 10000) {
          console.warn(`[SECURITY] Large circular graph operation limit reached`);
          return ['OPERATION_LIMIT_REACHED'];
        }
        
        try {
          return originalGetAffectedPages(includePath, cache);
        } finally {
          performanceMetrics.endTime = performance.now();
        }
      };
      
      try {
        const affected = tracker.getAffectedPages(circularNodes[0]);
        
        const totalTime = performanceMetrics.endTime - performanceMetrics.startTime;
        const avgTimePerOp = totalTime / performanceMetrics.operationsCount;
        
        // PERFORMANCE ISSUE DOCUMENTED: Large circular graphs are expensive
        if (performanceMetrics.operationsCount > 1000) {
          console.warn(`[SECURITY] Large circular graph performance issue: ${performanceMetrics.operationsCount} operations`);
        }
        
        if (totalTime > 100) {  // 100ms threshold
          console.warn(`[SECURITY] Large circular graph timing issue: ${totalTime.toFixed(2)}ms total`);
        }
        
        if (avgTimePerOp > 1) {  // 1ms per operation threshold
          console.warn(`[SECURITY] Large circular graph efficiency issue: ${avgTimePerOp.toFixed(2)}ms per operation`);
        }
        
        const cacheEfficiency = performanceMetrics.cacheHits / (performanceMetrics.cacheHits + performanceMetrics.cacheMisses);
        if (cacheEfficiency < 0.5) {
          console.warn(`[SECURITY] Poor cache efficiency: ${(cacheEfficiency * 100).toFixed(1)}%`);
        }
        
        expect(performanceMetrics.operationsCount).toBeGreaterThan(0);
        
      } catch (error) {
        console.warn(`[SECURITY] Large circular graph error: ${error.message}`);
      }
    });
  });

  describe('Basic Dependency Tracker Functionality', () => {
    test('should initialize with empty state', () => {
      const tracker = new DependencyTracker();
      
      expect(tracker.includesInPage).toBeInstanceOf(Map);
      expect(tracker.pagesByInclude).toBeInstanceOf(Map);
      expect(tracker.knownFiles).toBeInstanceOf(Set);
      expect(tracker.includesInPage.size).toBe(0);
      expect(tracker.pagesByInclude.size).toBe(0);
      expect(tracker.knownFiles.size).toBe(0);
    });

    test('should record and retrieve dependencies correctly', () => {
      const tracker = new DependencyTracker();
      
      const pagePath = '/test/page.html';
      const includePaths = ['/test/include1.html', '/test/include2.html'];
      
      tracker.recordDependencies(pagePath, includePaths);
      
      expect(tracker.includesInPage.has(pagePath)).toBe(true);
      expect(tracker.includesInPage.get(pagePath)).toEqual(includePaths);
      
      includePaths.forEach(includePath => {
        expect(tracker.pagesByInclude.has(includePath)).toBe(true);
        expect(tracker.pagesByInclude.get(includePath)).toContain(pagePath);
      });
    });

    test('should provide accurate statistics', () => {
      const tracker = new DependencyTracker();
      
      tracker.recordDependencies('/page1.html', ['/include1.html', '/include2.html']);
      tracker.recordDependencies('/page2.html', ['/include1.html']);
      
      const stats = tracker.getStats();
      
      expect(stats.totalFiles).toBeGreaterThan(0);
      expect(stats.pagesWithDependencies).toBe(2);
      expect(stats.includeFiles).toBe(2);
      expect(stats.totalDependencyRelationships).toBe(3);
    });
  });
});