# Product Roadmap

## Phase 0: Already Completed (v0.6.0)

The following features have been implemented in the current v0.6.0 release:

- [x] **DOM Cascade v1 specification compliance** - Complete implementation with area matching, head merging, and attribute merging
- [x] **Server-side includes** - Both `<!--#include>` and `<include>` tag syntax support
- [x] **Live development server** - Hot reload via Server-Sent Events with sub-second updates
- [x] **Markdown processing** - YAML frontmatter support with head synthesis
- [x] **Asset tracking** - Intelligent copying of referenced assets
- [x] **Security hardened path validation** - 100% test coverage with comprehensive attack protection
- [x] **Cross-platform executable builds** - Linux, macOS, Windows standalone binaries
- [x] **Comprehensive test suite** - 425+ tests with 93%+ function coverage
- [x] **HTML minification and pretty URLs** - Production-ready optimization features
- [x] **Incremental builds** - Dependency tracking for fast rebuilds

## Phase 1: Stabilization & Performance (v0.6.x)

**Goal:** Polish existing features, fix remaining issues, and optimize performance for production use
**Success Criteria:** <100ms build times for typical sites, bug-free DOM Cascade processing

### Features

- [ ] Build-time performance profiling - Identify and optimize bottlenecks in large sites `S`
- [ ] Enhanced build logging - Better progress indicators and performance suggestions `S` 
- [ ] Memory usage optimization - Reduce memory footprint for large site builds `M`
- [ ] Bug fixes from DOM Cascade v0.6.0 refactor - Address any edge cases discovered in testing `S`

### Dependencies

- Bun runtime 1.2.0+ stable release
- DOM Cascade specification v1 finalization

## Phase 2: Developer Experience Enhancement (v0.7.x)

**Goal:** Improve development workflow and debugging capabilities
**Success Criteria:** Sub-second live reload, comprehensive error reporting, design-time preview support

### Features

- [ ] Dedicated lint subcommand - DOM Cascade validation with actionable error messages `M`
- [ ] Enhanced error reporting - Source maps and context for build failures `S`
- [ ] Browser preview script - Real-time DOM Cascade rendering without build step `L`
- [ ] Component dependency visualization - Understand layout and fragment relationships `M`
- [ ] Hot module replacement - More granular live reload for faster iteration `L`
- [ ] VS Code extension integration - Syntax highlighting and validation `XL`

### Dependencies

- User feedback from v0.6.x adoption
- DOM Cascade browser implementation readiness

## Phase 3: Ecosystem Integration (v0.8.x)

**Goal:** Enable Unify as drop-in templating system for other SSGs and expand tool ecosystem
**Success Criteria:** Successful integration with 2+ major SSGs, published integration API

### Features

- [ ] Templating system export API - Enable other SSGs to use DOM Cascade processing `XL`
- [ ] Theme system - Shareable design systems with DOM Cascade components `XL`
- [ ] Migration tools - Convert from other SSGs to DOM Cascade format `L`

### Dependencies

- Community adoption and feedback
- SSG maintainer partnership agreements
- Theme marketplace platform decisions