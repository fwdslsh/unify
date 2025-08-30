# Development Best Practices

## Context

Global development guidelines for Agent OS CLI projects.

<conditional-block context-check="core-principles">
IF this Core Principles section already read in current context:
  SKIP: Re-reading this section
  NOTE: "Using Core Principles already in context"
ELSE:
  READ: The following principles

## Core Principles

### KISS Principle (Keep It Simple, Stupid)
- Implement code in the fewest lines possible
- Avoid over-engineering solutions
- Choose straightforward approaches over clever ones
- Prefer simple, obvious solutions over complex, clever ones
- When in doubt, choose the approach that's easier to understand and maintain
- Remember: code is read far more often than it's written
- For CLI tools, favor predictable behavior over clever shortcuts

### Optimize for Readability
- Prioritize code clarity over micro-optimizations
- Write self-documenting code with clear variable names
- Add comments for "why" not "what"
- Use descriptive command names and clear help text

### DRY (Don't Repeat Yourself)
- Extract repeated business logic to private methods
- Create reusable CLI utilities and argument parsers
- Create utility functions for common operations

### File Structure
- Keep files focused on a single responsibility
- Group related functionality together
- Use consistent naming conventions
- Organize CLI commands in dedicated modules

### SOLID Principles
- Single Responsibility Principle (SRP): each module or class should have one reason to change — keeps code focused and easier to test.
- Open/Closed Principle (OCP): entities should be open for extension but closed for modification — prefer extension via composition or interfaces.
- Liskov Substitution Principle (LSP): subclasses should be replaceable for their base types without surprising behavior — ensures safe polymorphism.
- Interface Segregation Principle (ISP): prefer many small, client-specific interfaces over large general-purpose ones — reduces unnecessary coupling.
- Dependency Inversion Principle (DIP): depend on abstractions, not concretions — improves testability and flexibility.

### YAGNI (You Aren't Gonna Need It)
- Avoid implementing features or abstractions before they are necessary. Premature generalization increases complexity and maintenance cost.
- When designing, prefer the simplest solution that satisfies current requirements; refactor to generalize only when concrete needs appear.
- Practical tips:
  - Start with a concrete, well-tested implementation.
  - Add abstractions when you have at least two independent reasons to change the same code.
  - Use feature flags or small refactors to evolve architecture incrementally.
</conditional-block>

<conditional-block context-check="dependencies" task-condition="choosing-external-library">
IF current task involves choosing an external library:
  IF Dependencies section already read in current context:
    SKIP: Re-reading this section
    NOTE: "Using Dependencies guidelines already in context"
  ELSE:
    READ: The following guidelines
ELSE:
  SKIP: Dependencies section not relevant to current task

## Dependencies

### Minimize External Dependencies
- **Avoid external dependencies unless the functionality is too complex or time-consuming to implement ourselves**
- Prefer implementing simple utilities in-house rather than adding dependencies
- Consider maintenance burden: each dependency adds potential security vulnerabilities and version conflicts
- Evaluate if the dependency provides significant value beyond what could be reasonably implemented
- For CLI tools, prefer single-file executables when possible

### Choose Libraries Wisely
When adding third-party dependencies:
- Select the most popular and actively maintained option
- Prefer libraries that work well with Bun's bundling capabilities
- Check the library's GitHub repository for:
  - Recent commits (within last 6 months)
  - Active issue resolution
  - Number of stars/downloads
  - Clear documentation
  - Compatibility with Bun runtime
</conditional-block>

## CLI-Specific Best Practices

### Command Design
- Follow Unix philosophy: do one thing well
- Use consistent naming patterns for commands and flags
- Provide clear, helpful error messages with suggested fixes
- Support common conventions like `--help`, `--version`, `--verbose`
- Exit with appropriate status codes (0 for success, non-zero for errors)

### User Experience
- Provide progress indicators for long-running operations
- Use colors and formatting to improve readability (with --no-color fallback)
- Implement confirmation prompts for destructive actions
- Support both interactive and non-interactive modes
- Provide examples in help text

### Configuration
- Support configuration files (JSON, YAML, or TOML)
- Allow environment variable overrides
- Implement a clear precedence: CLI args > env vars > config file > defaults
- Validate configuration early and provide clear error messages

### Error Handling
- Catch and handle errors gracefully
- Provide actionable error messages
- Log errors to stderr, output to stdout
- Use appropriate exit codes
- Implement proper cleanup on interruption (SIGINT, SIGTERM)

### Testing
- Test CLI commands end-to-end with real arguments
- Mock external dependencies and file system operations
- Test error conditions and edge cases
- Verify exit codes and output formatting
- Use temporary directories for file-based tests