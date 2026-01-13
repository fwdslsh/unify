# JavaScript + JSDoc Style (for Bun CLI Projects)

This file documents our preferred code style for Bun-based CLI applications using plain JavaScript with JSDoc for optional typing and IDE hints. We prefer plain JS + JSDoc for CLI tools to keep builds simple, reduce tooling friction, and target single-file/executable deployments.

## Philosophy

- Keep runtime simple: prefer shipping a single executable or bundled artifact where possible
- Use plain JavaScript (ES modules) as the primary language surface
- Add JSDoc comments to document types and shapes for editors and linters
- Prefer Bun-native APIs and runtime features over Node-only libraries
- Optimize for fast startup time and minimal resource usage
- Design for cross-platform compatibility (Windows, macOS, Linux)

## File layout and extensions

- Use `.js` for all source files.
- Use `.mjs` only for very specific interop needs if the runtime requires it — prefer consistent ESM `.js` modules.
- Keep entrypoints small and focused. Aim for a single entrypoint that can be bundled into one artifact for deployment.

## Module system

- Use ESM (import/export) everywhere. Examples:

  ```javascript
  import http from 'http' // avoid mixing require/import
  ```

- Keep exports explicit and well-documented with JSDoc.

## JSDoc: typing and documentation

- Use JSDoc to document public function signatures, important data shapes, and return types.
- JSDoc is for IDE assistance, lightweight validation, and runtime documentation — not a replacement for compile-time guarantees.

Example:

```javascript
/**
 * Fetches user by id.
 * @param {string} id - user id
 * @returns {Promise<{id: string, name: string}>}
 */
export async function getUser(id) {
  // ...implementation
}
```

- Use typedefs for complex objects:

```javascript
/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   email?: string
 * }} User
 */

/**
 * @param {User} user
 */
export function formatUser(user) {
  return `${user.name} <${user.email ?? 'no-email'}>`
}
```

## Prefer Bun native APIs

- Where possible, prefer Bun's native/standard APIs to reduce third-party dependencies and to get better build/output sizes and start-up time. Examples include:
  - `Bun.file`, `Bun.write`, `Bun.read` for file helpers
  - `Bun.spawn` / `Bun.run` for subprocesses
  - `Bun.serve` / `fetch` for HTTP servers and client requests
  - Bun's standard timers and other runtime utilities

- When a feature is not provided natively or Bun's API is immature, pick small, well-maintained polyfills that are compatible with Bun and tree-shake well.

## CLI Application Structure

### Entry Points
- CLI applications should have a clear main entry point (e.g., `bin/cli.js`)
- Use shebang lines for direct execution: `#!/usr/bin/env bun`
- Keep entry points minimal, delegating to command modules

### Command Organization
- Organize commands in a `commands/` directory
- Each command should be its own module with clear exports
- Use consistent naming: `commands/build.js`, `commands/deploy.js`

### Single-Executable Deployments
- Target single executable via `bun build --compile` when practical
- Keep runtime configuration external (env vars, config files)
- Bundle dependencies to avoid runtime installation
- Ensure cross-platform compatibility

Deployment checklist:
- [ ] Entry point is executable with shebang
- [ ] All dependencies bundled or vendored
- [ ] Configuration externalized
- [ ] Cross-platform testing completed

## CLI Contract

### Inputs
- Command-line arguments via `process.argv` or argument parsing libraries
- Configuration files (JSON, YAML, TOML)
- Environment variables
- Standard input (when applicable)

### Outputs
- Structured output to stdout (human-readable or JSON/YAML)
- Error messages to stderr
- Appropriate exit codes (0 for success, non-zero for errors)
- Progress indicators and status updates

### Error Handling
- Throw on programmer errors with clear stack traces
- Return structured error objects for user errors
- Use appropriate exit codes for different error types
- Provide actionable error messages with suggestions

## Testing and types

- Keep tests in plain JS; use JSDoc to help with test assertions and mocks.
- Prefer lightweight test runners that work in Bun (or can run in Node if required). Keep tests fast and deterministic.

## Linting and formatting

- Use a shared ESLint config tuned for modern ESM and Bun (turn off Node-specific rules that conflict with Bun globals).
- Use Prettier for formatting. Keep rules conservative to avoid noisy diffs.
- Configure editor settings to recognize JSDoc for completion and hover information.

## CLI Patterns and Examples

### Command Definition
```javascript
/**
 * @typedef {Object} BuildOptions
 * @property {string} output - Output directory
 * @property {boolean} watch - Enable watch mode
 * @property {string[]} include - Files to include
 */

/**
 * Build command implementation
 * @param {BuildOptions} options - Build configuration
 * @returns {Promise<void>}
 */
export async function buildCommand(options) {
  // Implementation
}
```

### Argument Parsing
```javascript
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    output: { type: 'string', short: 'o' },
    watch: { type: 'boolean', short: 'w' },
    help: { type: 'boolean', short: 'h' }
  },
  allowPositionals: true
});
```

### Error Handling
```javascript
/**
 * @typedef {Object} CLIResult
 * @property {boolean} success - Whether operation succeeded
 * @property {string} [error] - Error message if failed
 * @property {any} [data] - Result data if succeeded
 */

/**
 * Safe command execution wrapper
 * @param {Function} command - Command to execute
 * @param {any[]} args - Command arguments
 * @returns {Promise<CLIResult>}
 */
export async function safeExecute(command, ...args) {
  try {
    const data = await command(...args);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

## Edge cases and notes

- Large codebases that need strict type enforcement may still choose TypeScript. If TypeScript is required, document the cost and run a separate standard that includes build steps and type checks.
- If you must import Node-specific APIs not available in Bun, explicitly document the compatibility layer and test the bundle.

## CLI Testing Patterns

### Command Testing
```javascript
import { expect, test } from 'bun:test';
import { spawn } from 'bun';

test('build command creates output directory', async () => {
  const result = await spawn({
    cmd: ['bun', 'run', 'cli.js', 'build', '--output', './dist'],
    cwd: './test-fixtures/sample-project'
  });
  
  expect(result.exitCode).toBe(0);
  expect(await Bun.file('./test-fixtures/sample-project/dist').exists()).toBe(true);
});
```

### Mock External Dependencies
```javascript
/**
 * Mock file system operations for testing
 */
export const mockFs = {
  async readFile(path) {
    return mockFileContents[path] || null;
  },
  async writeFile(path, content) {
    mockFileContents[path] = content;
  }
};
```

## Quick Checklist Before Committing

- [ ] All source files use `.js` and ESM import/export
- [ ] Public APIs documented with JSDoc typedefs
- [ ] CLI commands have help text and examples
- [ ] Error messages are actionable and user-friendly
- [ ] Exit codes are appropriate for different scenarios
- [ ] Entry point can be bundled into single executable
- [ ] Cross-platform compatibility tested
- [ ] ESLint and Prettier configured and passing