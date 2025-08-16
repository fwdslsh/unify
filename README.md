# unify - an SSG for a more peaceful future


<img src="example/src/imgs/green-icon-64.png" alt="unify banner" style="float: left; margin-right: 16px;" />

A modern, lightweight static site generator that brings the power of server-side includes, markdown processing, and live development to your workflow. Build maintainable static sites with component-based architecture—no more copying and pasting headers, footers, and navigation across multiple pages!

> So simple, it shouldn't be this powerful!

## ✨ Perfect for Frontend Developers

- **Zero Learning Curve**: Uses familiar Apache SSI syntax (`<!--#include file="header.html" -->`) and modern DOM templating (`<include>`, `data-slot`, `<template>`)
- **Modern Tooling**: Built with ESM modules, powered by **Bun** for maximum performance
- **Live Development**: Built-in dev server with live reload via Server-Sent Events
- **Multi-Format Support**: HTML, Markdown with YAML frontmatter, and static assets
- **Convention-Based**: Files starting with `_` are non-emitting partials/layouts by convention
- **SEO Optimized**: Automatic sitemap.xml generation
- **Framework-Free**: Pure HTML and CSS output—no build complexity or JavaScript frameworks required
- **High Performance**: Native Bun APIs with HTMLRewriter, fs.watch, and Bun.serve
- **Cross-Platform**: Standalone executables for Linux, macOS, and Windows

## 🚀 Quick Start

### Installation

```bash
# Install Bun (required runtime)
curl -fsSL https://bun.sh/install | bash

# Option 1: Install globally via Bun
bun add -g @fwdslsh/unify

# Option 2: Install cross-platform binary (Linux, macOS, Windows)
curl -fsSL https://raw.githubusercontent.com/fwdslsh/unify/main/install.sh | bash

# Option 3: User installation (to ~/.local/bin)
curl -fsSL https://raw.githubusercontent.com/fwdslsh/unify/main/install.sh | bash -s -- --user

# Basic usage with defaults (src => dist)
unify build                    # Build from src/ to dist/
unify serve                    # Serve with live reload on port 3000
unify watch                    # Watch for changes and rebuild
unify init                     # Initialize new project

# Advanced usage with custom options
unify build --pretty-urls --base-url https://mysite.com
unify build --copy "./assets/**/*.*" --clean
unify serve --port 8080 --host 0.0.0.0
```

## 🏎️ Bun-Native Performance

unify is built exclusively for Bun and uses native APIs for maximum performance:

| Feature | Implementation | Performance |
|---------|----------------|-------------|
| HTML Processing | HTMLRewriter | **Ultra-fast DOM processing** |
| File Watching | fs.watch | **Native file system events** |
| Dev Server | Bun.serve | **High-performance HTTP server** |
| Build Caching | Bun.hash | **Native cryptographic hashing** |
| Cold Start | Bun native | **~800ms startup time** |

## 📁 Quick Example

```html
<!-- src/index.html -->
<!--#include virtual="/_includes/header.html" -->
<main>
  <h1>Welcome!</h1>
  <p>Build maintainable sites with includes and layouts.</p>
</main>
<!--#include virtual="/_includes/footer.html" -->
```

```html
<!-- Alternative modern DOM syntax -->
<include src="/_includes/header.html"></include>
<main>
  <template data-slot="title">My Page Title</template>
  <h1>Welcome!</h1>
  <p>Use data-slot attributes and templates for advanced layouts.</p>
</main>
<include src="/_includes/footer.html"></include>
```

See the [Getting Started Guide](docs/getting-started.md) for a complete tutorial.

## 📚 Documentation

- **[Getting Started](docs/getting-started.md)** - Your first unify site
- **[CLI Reference](docs/cli-reference.md)** - Complete command documentation  
- **[Include Syntax](docs/include-syntax.md)** - Apache SSI and DOM templating
- **[Layouts & Templates](docs/layouts-slots-templates.md)** - Advanced templating features
- **[Docker Usage](docs/docker-usage.md)** - Container deployment guide
- **[Architecture](docs/unify-architecture.md)** - Technical deep dive

## ⚡ Core Commands

```bash
# Build your site (default command)
unify
unify build

# Development server with live reload
unify serve

# Watch for changes without serving
unify watch

# Initialize new project
unify init

# Get help
unify --help
```

See [CLI Reference](docs/cli-reference.md) for all options.

## 🎯 Why unify?

- **Simple**: Familiar HTML and Apache SSI syntax with modern templating
- **Fast**: Incremental builds and smart dependency tracking  
- **Modern**: ESM modules, live reload, cross-platform binaries
- **Flexible**: Works with HTML, Markdown, and convention-based architecture
- **Portable**: Runs on Bun (optimal), Node.js, and Deno
- **Secure**: Path traversal prevention and input validation
- **Developer-Friendly**: Built-in development server with comprehensive error handling

## 🔒 Security

- **Path traversal prevention**: All file operations validated against source boundaries
- **Input validation**: CLI arguments and file paths sanitized
- **Static output**: No client-side template execution vulnerabilities
- **Secure serving**: Development server restricted to output directory

## 🧪 Testing

unify has comprehensive test coverage:

- **Security tests**: Path traversal and validation
- **CLI tests**: All commands and options
- **Build process tests**: Complete workflows
- **Error handling tests**: Graceful degradation

## 🔗 Cross-Platform Support

### Runtime Requirements

- **Bun**: Minimum version 1.2.19 (recommended for best performance)
- **Node.js**: 14+ with native ESM support
- **Deno**: Latest stable version

### Installation Options

#### 1. Cross-Platform Binary (Recommended)

Download and install standalone executables for Linux, macOS, and Windows:

```bash
# System-wide installation
curl -fsSL https://raw.githubusercontent.com/fwdslsh/unify/main/install.sh | bash

# User installation (to ~/.local/bin)
curl -fsSL https://raw.githubusercontent.com/fwdslsh/unify/main/install.sh | bash -s -- --user

# Specific version
curl -fsSL https://raw.githubusercontent.com/fwdslsh/unify/main/install.sh | bash -s -- --version v0.4.3

# Manual download from GitHub Releases
# https://github.com/fwdslsh/unify/releases
```

#### 2. Via Package Manager

```bash
# Bun (fastest execution)
bun add -g @fwdslsh/unify
bun unify serve

# npm/Node.js
npm install -g @fwdslsh/unify
unify serve

# Deno
deno run --allow-read --allow-write --allow-net npm:@fwdslsh/unify serve
```

### Supported Platforms

| Platform | Architecture | Binary | Package Manager |
|----------|-------------|--------|-----------------|
| Linux | x86_64, ARM64 | ✅ | ✅ |
| macOS | x86_64, ARM64 (Apple Silicon) | ✅ | ✅ |
| Windows | x86_64, ARM64 | ✅ | ✅ |

The cross-platform binaries are compiled from Bun and include all dependencies, requiring no additional runtime installation.

## 🗺️ Roadmap

See our [detailed roadmap](ROADMAP.md) for completed features, current development, and future plans.

## 🤝 Contributing

We welcome contributions! See our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
git clone https://github.com/fwdslsh/unify
cd unify
bun install
bun test
bun run build
```

### CI/CD Workflows

Our GitHub Actions workflows are optimized for performance and cost efficiency. See [CI/CD Workflows Documentation](docs/cicd-workflows.md) for details on:

- Fast test feedback loops
- Docker build validation on PRs
- Automated publishing on releases

---

_Built with ❤️ for frontend developers who love simple, powerful tools._
