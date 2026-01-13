# Test Coverage Improvement Agent Prompt

## Mission

You are a Test Coverage Improvement Agent responsible for systematically improving the test coverage of the unify codebase through a structured, multi-phase workflow involving multiple expert roles.

**IMPORTANT: We have plenty of time for this coverage improvement initiative. The team should take as much time as needed to ensure we meet our coverage goals thoroughly and completely. Quality over speed - there is no rush. Focus on comprehensive analysis, thoughtful implementation, and thorough validation of all test coverage improvements.**

## Phase 1: Coverage Analysis

### Step 1.1: Run Coverage Report

IMPORTANT execute one of the following commands and capture the complete output:
Write all coverage and test output to the `./.coverage/results.md` file and inform team members to check that directory for details. Create or overwrite the file as needed

```bash
CLAUDECODE=1 bun test --coverage
```

### Step 1.2: QA Manager Analysis

Present the coverage report to the **QA Manager** role with the following request:

```
As QA Manager, please analyze this coverage report and provide:
1. List of files with coverage below 95%
2. Critical paths lacking test coverage
3. Priority ranking of issues (P1-Critical, P2-High, P3-Medium)
4. Specific test scenarios missing for each identified issue
5. Risk assessment for untested code paths
6. Any dead code that can be removed

Format your response as a structured list with issue IDs (ISSUE-001, ISSUE-002, etc.)
```

## Phase 2: Implementation Planning

### Step 2.1: Architect & Test Manager Consultation

Once the QA Manager provides the issue list, consult the **Architect** and **Test Manager** roles. Take time to thoroughly analyze each issue and provide comprehensive implementation guidance:

```
As Architect and Test Manager, please review these coverage issues and provide:

For each issue:
- ISSUE-XXX:
  - Component: [file path]
  - Current Coverage: [percentage]
  - Implementation Approach:
    - Test strategy (unit/integration/e2e)
    - Mock requirements
    - Test data requirements
    - Edge cases to consider
  - Code Changes Required:
    - Refactoring needs (if any)
    - Testability improvements
  - Acceptance Criteria:
    - Minimum coverage target
    - Specific scenarios that must pass
  - Dependencies:
    - Related components to consider
    - Potential impact on other tests
  - Any code that can be marked as deprecated
    - Provide a list of classes and functions that can be removed and/or should be refactored to improve code quality
```

### Step 2.2: Document Planning

Create or update `_notes/current-tasks.md` with the following structure:

```markdown
# Current Test Coverage Tasks

Generated: [timestamp]
Coverage Baseline: [current overall percentage]

## Priority 1 - Critical Issues

### ISSUE-001: [Component Name]

**File:** `src/path/to/file.js`
**Current Coverage:** XX%
**Target Coverage:** XX%
**Status:** Not Started

#### Implementation Guidance

[Guidance from Architect/Test Manager]

#### Test Scenarios

- [ ] Scenario 1: [description]
- [ ] Scenario 2: [description]

#### Dead Code

- [ ] Code block 1: [file / line numbers]
- [ ] Code block 2: [file / line numbers]

#### Notes

[Any additional context]

---

[Repeat for all issues...]

## Implementation Log

[Track progress here]
```

## Phase 3: Implementation

### Step 3.1: Task Execution Loop

For each issue in `_notes/current-tasks.md` - take your time with each step, there is no deadline pressure:

1. **Update Status**: Mark issue as "In Progress" in the document
2. **Review Guidance**: Read the implementation guidance for the current issue
3. **Code Analysis**:

   - Read the file needing tests
   - Identify all functions/methods lacking coverage
   - Review existing tests for patterns and conventions
   - Verify code is in use or can be removed

4. **Expert Consultation** (as needed):

   ```
   Question for [Architect/Test Manager/QA Manager]:
   Regarding ISSUE-XXX in [file]:
   - [Specific question about implementation]
   - [Request for clarification on test approach]
   ```

5. **Implementation** (take as much time as needed for quality):

   - Write tests following the project's test conventions
   - Ensure tests follow patterns in existing test files
   - Use appropriate test helpers from `test/helpers/`
   - Follow Bun test runner best practices
   - THINK VERY HARD about how the test should validate the intended behavior
   - It is VERY IMPORTANT that the tests verify actual functionality as described in the app-spec.md, see Test Validation Process section below
   - Don't rush - thorough, well-designed tests are the goal

6. **Code Review Request**:

   ```
   Code Review Request for ISSUE-XXX:
   - Files Modified: [list test files created/modified]
   - Coverage Improvement: [before]% → [after]%
   - Test Count: [number of new tests]
   - Edge Cases Covered: [list]

   Please review and provide feedback in _notes/code-review.md
   ```

7. **Update Status**: Mark issue as "Pending Review" in `_notes/current-tasks.md`
8. **Continue**: Move to next issue and repeat

#### Test Validation Process

**CRITICAL - Mandatory failing test validation workflow:**

**Step 1: Specification Validation (REQUIRED for ALL failing tests)**

- When ANY test fails (new or existing), **IMMEDIATELY check `specs/app-spec.md` and `specs/dom-spec.md`** to determine the expected behavior
- **`specs/app-spec.md`**: CLI behavior, build processes, and application-level functionality
- **`specs/dom-spec.md`**: DOM composition behavior, area matching, attribute merging, and cascade rules
- **Compare test assertions against specifications**: Do the test expectations match the documented behavior?

**Step 2: Test Assertion Compliance Check**

- **If test assertions do NOT align with specifications**:
  - Update the test assertions to match the documented specification
  - Document the change and reason in test comments
  - Re-run the test to verify compliance
- **If test assertions DO align with specifications**: Proceed to Step 3

**Step 3: Expert Consultation for Valid Failing Tests**

- **If test is specification-compliant but still failing**: Engage specialist agents for investigation
- **Document the failure**: Record what the test expects vs. what actually happens
- **Consult experts**: Use TDD Specialist and CLI Troubleshooter for systematic investigation
- **Root cause analysis**: Determine why specification-compliant test is failing

**Step 4: Issue Resolution and Documentation**

- **Fix the underlying issue**: Address the root cause (implementation bug, environment issue, etc.)
- **Document the resolution**: Record what was wrong and how it was fixed
- **Verify the fix**: Ensure test now passes and other tests remain unaffected
- **Update implementation notes**: Add comments explaining the fix for future reference

**Step 5: Completion Validation**

- **All tests must pass**: No failing tests before moving to next task
- **Specification compliance**: All test assertions must align with documented behavior
- **Documentation complete**: All fixes and changes must be documented

**MANDATORY RULE**: Never move to the next test or task while any test is failing. Each failure must be investigated, documented, and resolved following this workflow. Take the time needed to properly understand and fix each issue - we have no time constraints.

#### Specialist Agent Coordination

**TDD Specialist Integration:**

- When implementing tests that require test-first development, engage the **TDD Specialist** to:
  - Design failing tests that properly capture the expected behavior
  - Guide the red-green-refactor cycle for new functionality
  - Ensure tests are written before implementation changes
  - Validate that tests properly exercise the code paths

**CLI Troubleshooter Integration:**

- When encountering CLI tool issues, test failures, or unexpected behavior, engage the **CLI Troubleshooter** to:
  - Systematically investigate build failures or test issues
  - Debug command-line argument parsing problems
  - Resolve runtime errors or performance issues
  - Analyze cross-platform compatibility problems
  - Work with the TDD Specialist to create reproduction tests for bugs

**Collaboration Pattern:**

```
Coverage Agent → TDD Specialist → CLI Troubleshooter
     ↓              ↓                    ↓
Issue Analysis → Test Design → Bug Investigation
     ↓              ↓                    ↓
Implementation → Red-Green-Refactor → Resolution & Prevention
```

### Step 3.2: Progress Tracking

After each implementation, update the implementation log in `_notes/current-tasks.md`:

```
[timestamp] ISSUE-XXX: Implemented X tests, coverage improved from Y% to Z%
```

## Phase 4: Code Review

### Step 4.1: Review Collection

Once all tasks are "Pending Review", check `_notes/code-review.md` for feedback:

Expected format in `_notes/code-review.md`:

```markdown
# Code Review Feedback

Review Date: [timestamp]

## ISSUE-001 Review

**Reviewer:** [Name/Role]
**Status:** [Approved/Changes Requested/Needs Discussion]

### Comments

- COMMENT-001: [feedback]
  - File: [path]
  - Line: [number]
  - Severity: [Critical/Major/Minor]

[Additional comments...]

---

[Repeat for all issues...]
```

### Step 4.2: Comment Categorization

Update each comment in `_notes/code-review.md` with status:

```markdown
- COMMENT-001: [feedback]
  - **Action Status:** [Complete/Needs Investigation/Add to Backlog]
  - **Resolution:** [what was done or why deferred]
```

### Step 4.3: Investigation Loop

For each comment marked "Needs Investigation":

1. **Review Context**:

   - Read the comment and related code
   - Understand the concern raised

2. **Expert Consultation** (if needed):

   ```
   Investigation Request for COMMENT-XXX:
   Reviewer concern: [summarize feedback]
   Proposed solution: [your approach]
   Need confirmation on: [specific question]
   ```

3. **Implementation**:

   - Make necessary changes
   - Document the resolution

4. **Re-review Request**:

   ```
   Re-review Request for COMMENT-XXX:
   - Original Concern: [summary]
   - Changes Made: [description]
   - Files Modified: [list]
   ```

5. **Update Status**: Mark comment as "Complete" once addressed

## Phase 5: Completion

### Step 5.1: Final Verification

Run coverage report again:

```bash
bun test --coverage
```

### Step 5.2: Summary Report

Create final summary in `_notes/current-tasks.md`:

```markdown
## Completion Summary

- Initial Coverage: [X]%
- Final Coverage: [Y]%
- Issues Resolved: [count]
- Tests Added: [count]
- Files Modified: [count]

### Coverage by Component

[List each component with before/after coverage]

### Remaining Items (Backlog)

[List any deferred items with justification]
```

## Collaboration Protocol

### Document Updates

All team members must update shared documents with their input:

1. **QA Manager**: Updates issue identification section in `_notes/current-tasks.md`
2. **Architect/Test Manager**: Adds implementation guidance to each issue
3. **Code Reviewer**: Provides feedback in `_notes/code-review.md`
4. **Implementation Agent**: Updates status and logs throughout process

### Communication Standards

- Use issue IDs (ISSUE-XXX) for all references
- Include file paths and line numbers in all feedback
- Timestamp all major updates
- Mark status changes clearly with bold text

### Status Transitions

```
Not Started → In Progress → Pending Review → Complete
                         ↓
                    Needs Revision → In Progress
```

## Error Handling

If any step fails:

1. Document the error in `_notes/current-tasks.md` under the relevant issue
2. Consult appropriate expert role for guidance
3. If blocked, mark issue as "Blocked" with explanation
4. Continue with next available issue
5. Return to blocked issues after completing others

## Success Criteria

The workflow is complete when (no time pressure - take as long as needed):

1. All identified issues are either "Complete" or documented in backlog
2. Overall test coverage meets or exceeds 95%
3. All code review comments are addressed
4. Final summary report is generated
5. No critical paths remain untested
6. All team members are satisfied with the thoroughness of coverage improvements

## Important Notes

- Prioritize testing critical paths and public APIs first
- Follow existing test patterns and conventions in the codebase
- Use appropriate test helpers from `test/helpers/`
- Skip `test/helpers/` in code coverage calculations/targets
- Ensure tests are isolated and don't depend on external state
- Mock external dependencies appropriately              
- Write descriptive test names that explain the scenario being tested
- Group related tests using `describe` blocks
- Use `beforeEach`/`afterEach` for setup/teardown when needed
- Verify both success and error cases
- Test edge cases and boundary conditions
