# Product Mission

## Pitch

Unify is a Unix-philosophy static site generator that helps frontend developers build maintainable static sites by providing DOM Cascade specification compliance for component-based composition without framework complexity.

## Users

### Primary Customers

- **Frontend developers**: Seeking Unix-style tools that do one thing exceptionally well and chain easily with other tools
- **Development teams**: Wanting component-based static sites without the overhead and complexity of modern frontend frameworks
- **SSG maintainers**: Who want to integrate DOM Cascade specification into their existing tools

### User Personas

**Frontend Developer** (25-40 years old)
- **Role:** Senior Frontend Developer / Technical Lead
- **Context:** Building static sites for marketing, documentation, or content-focused projects
- **Pain Points:** Framework complexity for simple sites, vendor lock-in, runtime dependencies, poor toolchain performance
- **Goals:** Fast builds, maintainable component architecture, framework-free output

**Documentation Team Lead** (30-45 years old)
- **Role:** Developer Experience Engineer / Technical Writer
- **Context:** Managing complex documentation sites with multiple contributors and varying technical skill levels
- **Pain Points:** Complex build systems, difficulty maintaining consistent layouts, slow iteration cycles
- **Goals:** Easy content authoring, reusable components, fast preview cycles

## The Problem

### Framework Complexity for Static Content

Modern frontend frameworks add unnecessary complexity, runtime dependencies, and vendor lock-in for static content sites. Teams spend more time configuring build systems than creating content.

**Our Solution:** Unix-philosophy static site generator that does component composition exceptionally well with zero runtime dependencies.

### Lack of Standardized Component Composition

Static site generators use proprietary templating systems that don't work across tools, creating vendor lock-in and limiting portability of design systems.

**Our Solution:** Implement the open DOM Cascade specification for standardized component composition that works in browsers and across tools.

### Poor Development Experience for Static Sites

Existing tools either lack live reload capabilities or have slow build times that interrupt the development flow, especially for larger sites with many components.

**Our Solution:** Fast incremental builds with intelligent dependency tracking and live reload via Server-Sent Events.

## Differentiators

### DOM Cascade Specification Compliance

Unlike proprietary templating systems used by other static site generators, Unify implements the open DOM Cascade specification. This results in portable component architecture that works in browsers without build steps and can be adopted by other tools.

### Bun-Native Performance Architecture

Unlike Node.js-based generators, Unify is built on Bun's native APIs (HTMLRewriter, fs.watch, Bun.serve) for maximum performance. This results in 3-5x faster build times and near-instantaneous live reload.

### Unix Philosophy Design

Unlike monolithic frameworks, Unify focuses solely on static site generation and component composition, making it easy to integrate with other tools in a Unix-style pipeline. This results in a more maintainable and flexible toolchain.

## Key Features

### Core Features

- **DOM Cascade v1 Compliance:** Standards-based component composition using CSS class-based area matching (.unify-*)
- **Server-Side Includes:** Apache SSI syntax support (`<!--#include>`) for flexible component inclusion and support for legacy sites
- **Incremental Builds:** Intelligent dependency tracking enables fast rebuilds by processing only changed files
- **Security-Hardened Processing:** Comprehensive path validation with 100% test coverage prevents traversal attacks
- **Cross-Platform Executables:** Standalone binaries for Linux, macOS, and Windows eliminate runtime dependencies

### Development Features

- **Live Development Server:** Hot reload via Server-Sent Events with intelligent change detection
- **Markdown Processing:** YAML frontmatter support with automatic head synthesis and layout discovery
- **Asset Intelligence:** Automatic discovery, tracking, and copying of referenced assets
- **HTML Minification:** Production-ready output with configurable minification and pretty URLs
- **Comprehensive Testing:** 425+ tests with 93%+ coverage ensure reliability and specification compliance