# Detailed Implementation Review Instructions

## Overview

This command initiates a comprehensive, systematic review of the current unify implementation against the formal specifications. The review must be **evidence-based**, relying solely on actual test results and code analysis.

## Objective

Produce a complete status report in `_notes/detailed-review.md` that maps every section of both specification documents to:
- Current implementation status
- Test coverage details  
- Code location and quality
- Gaps and issues identified

## Review Process

### Phase 1: Preparation

1. **Read the specifications completely**
   - `specs/app-spec.md` - CLI behavior, options, build pipeline
   - `specs/dom-spec.md` - DOM composition behavior, cascade rules

2. **Initialize the report**
   - Create `_notes/detailed-review.md` with the template structure (see below)
   - Document review date, reviewer, and methodology

### Phase 2: Systematic Section Review

For **each section** in both specification documents:

#### Step 1: Specification Analysis
- Read the section completely
- Identify all requirements, behaviors, and rules
- Note any acceptance criteria or success metrics

#### Step 2: Test Coverage Investigation  
- Search for related test files using patterns from the section
- Run specific tests: `bun test -t "pattern"` 
- Document test results with exact pass/fail counts
- Identify missing test coverage

#### Step 3: Code Implementation Review
- Locate implementing code using file/function search
- Analyze code quality and completeness
- Check for TODO comments or incomplete implementations
- Verify code matches specification requirements

#### Step 4: Status Assessment
- Assign status based on **evidence only**:
  - `NOT_STARTED` - No implementation found
  - `IN_PROGRESS` - Partial implementation, failing tests
  - `IMPLEMENTED` - Code exists, tests passing
  - `FULLY_COMPLIANT` - Complete implementation, comprehensive tests
  - `NEEDS_INVESTIGATION` - Unclear status, requires deeper analysis

#### Step 5: Documentation
- Update the report section immediately
- Include specific file paths, line numbers, test names
- Document exact test results with timestamps
- Note any discrepancies between spec and implementation

### Phase 3: Validation

1. **Run full test suite**: `bun test`
2. **Document complete results** with pass/fail breakdown
3. **Cross-reference** test failures with spec sections
4. **Identify priority gaps** for immediate attention

## Report Template Structure

```markdown
# Detailed Implementation Review

**Date**: [Current Date]
**Reviewer**: [Name/Agent]
**Test Suite Results**: [X pass, Y fail, Z total]
**Review Methodology**: Section-by-section analysis with test verification

## Executive Summary

[High-level status overview]

## App Specification Review (specs/app-spec.md)

### [Section Name] - [Status]

**Specification Requirements:**
- [Requirement 1]
- [Requirement 2]

**Implementation Analysis:**
- **Code Location**: `path/to/file.js:line-range`
- **Key Functions**: `functionName()`, `anotherFunction()`
- **Implementation Quality**: [Assessment]

**Test Coverage:**
- **Test Files**: `test/path/test.js`
- **Test Results**: [X pass, Y fail] at [timestamp]
- **Coverage Gaps**: [Missing test scenarios]

**Status Details:**
[Detailed explanation of current state]

**Issues Identified:**
- [Issue 1 with file:line reference]
- [Issue 2 with test failure details]

---

## DOM Specification Review (specs/dom-spec.md)

[Same structure repeated for each DOM spec section]

## Cross-Specification Analysis

**Integration Issues:**
[Issues spanning multiple spec sections]

**Architecture Compliance:**
[Overall adherence to architectural principles]

## Priority Action Items

1. **Critical**: [High-priority issues blocking functionality]
2. **Important**: [Significant gaps affecting quality]
3. **Enhancement**: [Non-critical improvements]

## Test Suite Analysis

**Overall Health**: [Assessment]
**Key Failures**: [Critical test failures with details]
**Performance**: [Test execution timing]
**Coverage Gaps**: [Major untested areas]
```

## Critical Guidelines

### Evidence-Based Assessment
- **Never guess** - if unsure, mark as `NEEDS_INVESTIGATION`
- **Always verify** - run tests, check code, don't assume
- **Document sources** - include file paths, line numbers, test names
- **Timestamp results** - test results can change

### Code Analysis Standards
- Check actual implementation, not just function signatures
- Look for error handling, edge cases, validation
- Verify compliance with architectural patterns
- Note any deviations from specification

### Test Analysis Standards
- Run tests multiple times if results seem inconsistent
- Check for flaky tests or timing issues
- Verify test scenarios match specification requirements
- Document both unit and integration test coverage

### Status Assignment Criteria

**NOT_STARTED**
- No code found implementing the requirement
- No related tests exist

**IN_PROGRESS** 
- Partial implementation exists
- Tests exist but are failing
- Code structure present but incomplete

**IMPLEMENTED**
- Working code that handles the basic requirement
- Tests passing for normal scenarios
- May lack edge case handling or full compliance

**FULLY_COMPLIANT**
- Complete implementation matching all spec details
- Comprehensive test coverage including edge cases
- Code quality meets project standards

### Update Protocol

1. **Work incrementally** - complete each section before moving on
2. **Commit frequently** - save progress in the report file
3. **Cross-reference** - link related sections across specifications
4. **Flag blockers** - immediately escalate critical gaps

## Execution Command

To run this review:

1. Execute: `task detailed-review`
2. Follow the systematic process above
3. Update `_notes/detailed-review.md` continuously
4. Flag any critical issues for immediate attention

## Success Criteria

- Every specification section has been reviewed
- All test results are documented with timestamps
- All implementation code has been located and assessed
- Priority action items are clearly identified
- Report is ready for development planning

The review is complete when every requirement in both specifications has a clear, evidence-based status assessment.