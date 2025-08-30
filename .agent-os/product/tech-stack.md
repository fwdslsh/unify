# Technical Stack

## Runtime & Framework
- **application_framework:** Bun >=1.2.0
- **javascript_framework:** Native ES Modules (no transpilation)
- **import_strategy:** Native ES imports with Bun runtime

## Dependencies
- **core_dependencies:**
  - gray-matter 4.0.3 (YAML frontmatter processing)
  - linkedom 0.18.12 (DOM manipulation for server-side)
  - markdown-it 14.1.0 (Markdown processing)
  - minimatch 9.0.3 (file pattern matching)
- **database_system:** File-based (no database required)

## UI & Styling
- **css_framework:** Framework-free (generates pure HTML/CSS)
- **ui_component_library:** DOM Cascade specification compliant components
- **fonts_provider:** User configurable
- **icon_library:** User configurable

## Build & Development
- **build_system:** Bun native APIs (HTMLRewriter, fs.watch, Bun.serve)
- **testing_framework:** Bun test runner with 425+ tests, 93%+ coverage
- **minification:** Built-in HTML minification
- **asset_processing:** Intelligent asset tracking and copying

## Distribution & Deployment
- **executable_builds:** Cross-platform standalone binaries via `bun build --compile`
  - Linux x64
  - macOS ARM64  
  - Windows x64
- **application_hosting:** Static hosting (any CDN or web server)
- **asset_hosting:** Integrated with static hosting
- **deployment_solution:** CI/CD compatible, supports any static hosting platform

## Development Tools
- **live_reload:** Server-Sent Events based hot reload
- **development_server:** Bun.serve with intelligent change detection
- **security:** Path traversal prevention with comprehensive validation
- **logging:** Configurable log levels with security event monitoring

## Repository & Ecosystem
- **code_repository_url:** https://github.com/fwdslsh/unify
- **package_registry:** npm (@fwdslsh/unify)
- **specification:** DOM Cascade v1 compliant
- **ecosystem_integration:** Unix-philosophy tool chaining support