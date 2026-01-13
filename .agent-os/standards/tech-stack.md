# Tech Stack

## Context

Global tech stack defaults for Agent OS CLI projects, overridable in project-specific `.agent-os/product/tech-stack.md`.

## Core Runtime
- Runtime: Bun latest stable
- Language: JavaScript with JSDoc or TypeScript (project choice)
- Type System: JSDoc annotations or TypeScript strict mode
- Build Tool: Bun's native bundler for single-file executables
- Import Strategy: ES modules
- Package Manager: Bun
- Node Compatibility: Bun runtime (Node.js compatibility layer)

## CLI Frameworks & Libraries
- Argument Parsing: Commander.js, Yargs, or native Bun.argv
- Terminal UI: Chalk for colors, Ora for spinners, Inquirer for prompts
- File System: Bun's native file APIs (`Bun.file`, `Bun.write`)
- Process Management: Bun's `spawn()` for subprocesses
- Configuration: Cosmiconfig or native JSON/TOML parsing
- Logging: Winston, Pino, or custom structured logging

## Data & Storage
- Config Files: JSON, YAML, or TOML format
- Local Database: SQLite with better-sqlite3 or Bun's native SQLite
- Remote Database: PostgreSQL (if network access required)
- File Formats: Support for JSON, CSV, YAML, XML as needed
- Caching: Simple file-based caching or in-memory maps

## Development & Testing
- Tests: Bun's native test runner or Vitest
- Linting: ESLint with Bun-compatible rules
- Formatting: Prettier
- Documentation: JSDoc comments and README files
- CLI Testing: Command-line integration tests

## Distribution & Deployment
- Packaging: Single executable via `bun build --compile`
- Package Registry: npm for library distribution
- Installation: npm global install or direct executable download
- Update Mechanism: Self-updating via package managers or built-in updater
- Platform Support: Cross-platform (Windows, macOS, Linux)

## Monitoring & Observability
- Error Tracking: Structured error logging to files or stderr
- Usage Analytics: Optional, privacy-respecting telemetry
- Performance Monitoring: Built-in timing for long operations
- Debug Mode: Verbose logging with `--debug` flag
- Health Checks: Basic connectivity and dependency validation