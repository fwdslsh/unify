# unify - an SSG for a more peaceful future


<img src="example/src/imgs/green-icon-64.png" alt="unify banner" style="float: left; margin-right: 16px;" />

A modern, lightweight static site generator that brings the power of server-side includes, markdown processing, and live development to your workflow. Build maintainable static sites with component-based architecture—no more copying and pasting headers, footers, and navigation across multiple pages!


## ✨ Perfect for Frontend Developers

- **Zero Learning Curve**: Uses familiar Apache SSI syntax (`<!--#include file="header.html" -->`) or intuitive `<slot>`, `<template>`, and `<include>` elements.
- **Modern Tooling**: Built with ESM modules, powered by **Bun** for maximum performance
- **Live Development**: Built-in dev server with live reload via Server-Sent Events
- **Multi-Format Support**: HTML, Markdown with frontmatter, and static assets
- **SEO Optimized**: Automatic sitemap generation
- **Framework-Free**: Pure HTML and CSS output—no build complexity or JavaScript frameworks required
- **High Performance**: Native Bun API support with HTMLRewriter, fs.watch, and Bun.serve
- **Cross-Platform**: Compile to standalone executables for Linux, macOS, and Windows

## 🚀 Quick Start

### Installation

```bash
# Install Bun (required runtime)
curl -fsSL https://bun.sh/install | bash

# Install unify globally
bun add -g @fwdslsh/unify

# Basic usage with defaults (src => dist)
unify build                    # Build from src/ to dist/
unify serve                    # Serve with live reload on port 3000
unify watch                    # Watch for changes and rebuild

# Create cross-platform executable
bun run build:executable

# Advanced usage with custom options
unify build --pretty-urls --base-url https://mysite.com
unify serve --port 8080
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
<!--#include virtual="/.components/header.html" -->
<main>
  <h1>Welcome!</h1>
  <p>Build maintainable sites with includes and components.</p>
</main>
<!--#include virtual="/.components/footer.html" -->
```

See the [Getting Started Guide](docs/getting-started.md) for a complete tutorial.

## 📚 Documentation

- **[Getting Started](docs/getting-started.md)** - Your first unify site
- **[CLI Reference](docs/cli-reference.md)** - Complete command documentation
- **[Docker Usage](docs/docker-usage.md)** - Container deployment guide
- **[Template Elements](docs/template-elements-in-markdown.md)** - Advanced templating
- **[Architecture](docs/ARCHITECTURE.md)** - Technical deep dive

## ⚡ Core Commands

```bash
# Build your site (default command)
unify
unify build

# Development server with live reload
unify serve

# Get help
unify --help
```

See [CLI Reference](docs/cli-reference.md) for all options.

## 🎯 Why unify?

- **Simple**: Familiar HTML and Apache SSI syntax
- **Fast**: Incremental builds and smart dependency tracking  
- **Modern**: ESM modules, live reload, Docker support
- **Flexible**: Works with HTML, Markdown, and modern templating
- **Portable**: Runs on Node.js, Deno, and Bun
- Dependency tracking and change impact analysis
- Built-in development server
- Docker support with multi-stage builds

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

- **Node.js** 14+ (native ESM support)
- **Bun**: `bun run @fwdslsh/unify serve` (faster execution)
- **Deno**: `deno run --allow-read --allow-write --allow-net npm:@fwdslsh/unify`

## 🗺️ Roadmap

See our [detailed roadmap](ROADMAP.md) for completed features, current development, and future plans.

## 🤝 Contributing

We welcome contributions! See our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
git clone https://github.com/fwdslsh/unify
cd cli
npm install
npm test
npm run example
```

### CI/CD Workflows

Our GitHub Actions workflows are optimized for performance and cost efficiency. See [CI/CD Workflows Documentation](docs/cicd-workflows.md) for details on:
- Fast test feedback loops
- Docker build validation on PRs
- Automated publishing on releases

---

_Built with ❤️ for frontend developers who love simple, powerful tools._
