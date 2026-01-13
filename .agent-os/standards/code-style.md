# Code Style Guide

## Context

Global code style rules for Agent OS CLI projects.

<conditional-block context-check="general-formatting">
IF this General Formatting section already read in current context:
  SKIP: Re-reading this section
  NOTE: "Using General Formatting rules already in context"
ELSE:
  READ: The following formatting rules

## General Formatting

### Indentation
- Use tabs
- Maintain consistent indentation throughout files
- Align nested structures for readability

### Naming Conventions
- **Methods and Variables**: Use camel case (e.g., `userProfile`, `calculateTotal`)
- **Classes and Modules**: Use PascalCase (e.g., `UserProfile`, `PaymentProcessor`)
- **Constants**: Use UPPER_SNAKE_CASE (e.g., `MAX_RETRY_COUNT`)
- **CLI Commands**: Use kebab-case (e.g., `build-project`, `deploy-app`)
- **CLI Flags**: Use kebab-case with double dashes (e.g., `--output-dir`, `--no-color`)

### String Formatting
- Use single quotes for strings: `'Hello World'`
- Use double quotes only when interpolation is needed
- Use template literals for multi-line strings or complex interpolation

### Code Comments
- Add brief comments above non-obvious business logic
- Document complex algorithms or calculations
- Explain the "why" behind implementation choices
- Never remove existing comments unless removing the associated code
- Update comments when modifying code to maintain accuracy
- Keep comments concise and relevant
</conditional-block>

## CLI-Specific Formatting

### Command Structure
- Organize commands in a clear hierarchy
- Use consistent command naming patterns
- Group related subcommands under parent commands
- Implement help text for all commands and options

### Error Messages
- Use consistent error message formatting
- Include actionable suggestions when possible
- Use colors for better visibility (with fallback support)
- Prefix error messages with clear indicators

### Output Formatting
- Use structured output formats (JSON, YAML) when appropriate
- Implement table formatting for list-based data
- Support both human-readable and machine-readable output
- Use consistent spacing and alignment

<conditional-block task-condition="javascript" context-check="javascript-style">
IF current task involves writing or updating JavaScript:
  IF javascript-style.md already in context:
    SKIP: Re-reading this file
    NOTE: "Using JavaScript style guide already in context"
  ELSE:
    <context_fetcher_strategy>
      IF current agent is Claude Code AND context-fetcher agent exists:
        USE: @agent:context-fetcher
        REQUEST: "Get JavaScript style rules from code-style/javascript-style.md"
        PROCESS: Returned style rules
      ELSE:
        READ: @.agent-os/standards/code-style/javascript-style.md
    </context_fetcher_strategy>
ELSE:
  SKIP: JavaScript style guide not relevant to current task
</conditional-block>

<conditional-block task-condition="typescript" context-check="typescript-style">
IF current task involves writing or updating TypeScript:
  IF typescript-style.md already in context:
    SKIP: Re-reading this file
    NOTE: "Using TypeScript style guide already in context"
  ELSE:
    <context_fetcher_strategy>
      IF current agent is Claude Code AND context-fetcher agent exists:
        USE: @agent:context-fetcher
        REQUEST: "Get TypeScript style rules from code-style/typescript-style.md"
        PROCESS: Returned style rules
      ELSE:
        READ: @.agent-os/standards/code-style/typescript-style.md
    </context_fetcher_strategy>
ELSE:
  SKIP: TypeScript style guide not relevant to current task
</conditional-block>
