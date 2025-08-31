# Specification Compliance Check

## Overview
This command performs comprehensive specification compliance analysis against both the DOM Specification (specs/dom-spec.md) and Application Specification (specs/app-spec.md). 

## Process Flow

### 1. Initial Assessment
- Read and analyze current implementation against specs/dom-spec.md and specs/app-spec.md
- Generate compliance report identifying gaps, issues, and implementation status
- Create detailed review document at _notes/detailed-review.md with section-by-section analysis

### 2. Agent Coordination
**Architect**: Review architectural compliance and identify structural gaps
**TDD Specialist**: Analyze test coverage and create test plans for missing functionality
**Code Reviewer**: Assess implementation quality and identify code-level issues
**PM**: Create actionable checklist from findings and coordinate workflow

### 3. Deliverables
- **_notes/detailed-review.md**: Comprehensive analysis of current state vs specifications
- **_notes/detailed-review-checklist.md**: Actionable task list with priorities and dependencies
- **Test coverage gaps**: Identification of missing test scenarios
- **Implementation roadmap**: Prioritized list of required changes

## Execution Steps

### Phase 1: Specification Analysis
1. **Read specifications thoroughly**
   - specs/dom-spec.md: DOM Cascade v1 algorithm requirements
   - specs/app-spec.md: CLI commands, build options, and behavior requirements

2. **Map current implementation**
   - Review src/core/ components for DOM processing
   - Analyze src/cli/ for command-line interface compliance
   - Check test coverage in test/unit/ and test/integration/

3. **Generate compliance matrix**
   - IMPLEMENTED: Features working correctly per spec
   - PARTIALLY_IMPLEMENTED: Features exist but missing aspects
   - NEEDS_INVESTIGATION: Status unclear, requires testing
   - NOT_IMPLEMENTED: Missing functionality

### Phase 2: Agent Analysis
1. **Architect review** architectural compliance:
   - DOM Cascade v1 algorithm implementation
   - Area-based composition system
   - Layout hierarchy processing
   - Component scoping boundaries

2. **TDD Specialist** test analysis:
   - Unit test coverage gaps
   - Integration test failures
   - Missing test scenarios
   - Performance test requirements

3. **Code Reviewer** quality assessment:
   - Implementation quality vs specification
   - Error handling completeness
   - Security compliance
   - Performance considerations

### Phase 3: Checklist Generation
**PM creates detailed-review-checklist.md with**:
- **P0 Critical items**: Blocking issues preventing spec compliance
- **P1 High priority**: Important features affecting functionality
- **P2 Medium priority**: Enhancement and optimization items
- **Dependencies**: Task relationships and ordering
- **Test requirements**: Coverage needed for each item
- **Success criteria**: Definition of done for each task

## Key Focus Areas

### DOM Specification Compliance
- **Minimal Attribute Surface**: data-unify attribute processing
- **Area-based Composition**: .unify-* class matching system
- **Head & Assets Merging**: Layer ordering and deduplication
- **Linter Rule Set**: U001-U008 rule implementation

### Application Specification Compliance
- **CLI Commands**: build, serve, watch, init command functionality
- **Directory Options**: --source, --output, glob pattern processing
- **Build Options**: --clean, --minify, --fail-on security integration
- **DOM Cascade System**: Full v1 algorithm implementation

## Expected Outputs

### Compliance Report Structure
```
# Detailed Implementation Review

## Executive Summary
- Current compliance percentage
- Critical blocking issues
- Implementation quality assessment
- Test coverage status

## App Specification Review
- CLI Commands: [STATUS]
- Directory Options: [STATUS] 
- Build Options: [STATUS]
- DOM Cascade System: [STATUS]

## DOM Specification Review
- Minimal Attribute Surface: [STATUS]
- Area-based Composition: [STATUS]
- Head & Assets Merging: [STATUS]
- Linter Rule Set: [STATUS]

## Priority Action Items
- Critical (P0): Blocking issues
- Important (P1): High priority features
- Final Production Quality (P2): Optimization items
```

### Checklist Structure
```
# Detailed Review Implementation Checklist

## Critical Priority Items (Blocking)
- [x] Task: Description
  - Current: Status
  - File: Location
  - Test: Test coverage
  - Acceptance: Success criteria
  - Status: COMPLETED/IN_PROGRESS/NOT_STARTED
  - Dependencies: Prerequisites
  - Priority: P0/P1/P2
```

## Success Criteria
- **All specification sections** marked as FULLY_COMPLIANT
- **Complete test suite** with >95% coverage
- **Performance targets met**: <100ms complex builds
- **Security requirements** fully implemented
- **Production readiness** achieved

## Quality Gates
1. All P0 critical items must be resolved before P1 work begins
2. Each implementation must have corresponding tests
3. Code review approval required for all changes
4. Integration tests must validate real-world scenarios
5. No performance regression allowed

This process ensures systematic specification compliance through coordinated agent expertise and comprehensive validation.