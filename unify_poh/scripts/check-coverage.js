#!/usr/bin/env bun
/**
 * Coverage Threshold Validation Script
 * Enforces TDD quality gates: ≥95% global, ≥90% per file
 * 
 * Usage: bun run scripts/check-coverage.js
 * Exit codes: 0 = pass, 1 = coverage below threshold
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const GLOBAL_THRESHOLD = 95.0;
const PER_FILE_THRESHOLD = 90.0;
const COVERAGE_DIR = ".coverage";

/**
 * Parse Bun coverage report and validate thresholds
 */
async function checkCoverage() {
  const coverageFile = resolve(COVERAGE_DIR, "coverage.json");
  
  if (!existsSync(coverageFile)) {
    console.error("❌ Coverage report not found at:", coverageFile);
    console.error("Run 'bun test --coverage' first to generate coverage data");
    process.exit(1);
  }

  try {
    const coverage = JSON.parse(readFileSync(coverageFile, "utf8"));
    
    // Check global coverage
    const globalCoverage = calculateGlobalCoverage(coverage);
    console.log(`📊 Global Coverage: ${globalCoverage.toFixed(2)}%`);
    
    if (globalCoverage < GLOBAL_THRESHOLD) {
      console.error(`❌ Global coverage ${globalCoverage.toFixed(2)}% is below threshold ${GLOBAL_THRESHOLD}%`);
      process.exit(1);
    }

    // Check per-file coverage
    const fileFailures = [];
    for (const [filePath, fileData] of Object.entries(coverage)) {
      if (filePath.includes("node_modules") || filePath.includes("test")) {
        continue; // Skip test files and dependencies
      }
      
      const fileCoverage = calculateFileCoverage(fileData);
      if (fileCoverage < PER_FILE_THRESHOLD) {
        fileFailures.push({ path: filePath, coverage: fileCoverage });
      }
    }

    if (fileFailures.length > 0) {
      console.error(`❌ ${fileFailures.length} files below per-file threshold ${PER_FILE_THRESHOLD}%:`);
      fileFailures.forEach(({ path, coverage }) => {
        console.error(`  ${path}: ${coverage.toFixed(2)}%`);
      });
      process.exit(1);
    }

    console.log(`✅ All coverage thresholds met!`);
    console.log(`   Global: ${globalCoverage.toFixed(2)}% (≥${GLOBAL_THRESHOLD}%)`);
    console.log(`   Per-file: All files ≥${PER_FILE_THRESHOLD}%`);
    
  } catch (error) {
    console.error("❌ Error reading coverage report:", error.message);
    process.exit(1);
  }
}

/**
 * Calculate global coverage percentage across all files
 */
function calculateGlobalCoverage(coverage) {
  let totalStatements = 0;
  let coveredStatements = 0;

  for (const [filePath, fileData] of Object.entries(coverage)) {
    if (filePath.includes("node_modules") || filePath.includes("test")) {
      continue;
    }
    
    const { statements } = fileData.summary || fileData;
    if (statements) {
      totalStatements += statements.total || 0;
      coveredStatements += statements.covered || 0;
    }
  }

  return totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0;
}

/**
 * Calculate coverage percentage for a single file
 */
function calculateFileCoverage(fileData) {
  const { statements } = fileData.summary || fileData;
  if (!statements || statements.total === 0) {
    return 100; // Empty files are considered fully covered
  }
  
  return (statements.covered / statements.total) * 100;
}

// Run the coverage check
if (import.meta.main) {
  checkCoverage();
}

export { checkCoverage, GLOBAL_THRESHOLD, PER_FILE_THRESHOLD };