---
title: Installation - unify Documentation
description: Complete installation guide for unify static site generator. Multiple installation methods including npm, bun, and pre-built binaries.
---

# Installation

Multiple installation methods are available for unify, from global package installation to standalone binaries. Choose the method that best fits your development workflow.

> **📋 Requirements**
>
> **Recommended:** Bun 1.2.0+ for optimal performance  
> **Alternative:** Node.js 18+ or Deno 1.30+

## Recommended: Bun Installation

Unify is built with Bun's native APIs for maximum performance. Install Bun first if you haven't already:

```bash
# Install Bun (Unix/Linux/macOS)
curl -fsSL https://bun.sh/install | bash

# Or on Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"

# Verify Bun installation
bun --version
```

### Global Installation with Bun

```bash
# Install unify globally
bun add -g @fwdslsh/unify

# Verify installation
unify --version

# Check available commands
unify --help
```

### Project-Level Installation

```bash
# Add to existing project
bun add -d @fwdslsh/unify

# Run via bun
bunx unify build

# Or add npm script in package.json
{
  "scripts": {
    "build": "unify build",
    "dev": "unify serve",
    "watch": "unify watch"
  }
}
```

## NPX Usage (No Installation)

Run unify without installing it globally using npx:

```bash
# Run directly with npx
npx @fwdslsh/unify build

# Start development server
npx @fwdslsh/unify serve

# Watch for changes
npx @fwdslsh/unify watch
```

## Alternative Runtimes

### Node.js Installation

```bash
# Global installation with npm
npm install -g @fwdslsh/unify

# Or with Yarn
yarn global add @fwdslsh/unify

# Project-level with npm
npm install --save-dev @fwdslsh/unify
```

> **⚠️ Performance Note**
>
> While unify works with Node.js, Bun provides significantly better performance with native HTMLRewriter, built-in bundling, and faster I/O operations.

### Deno Usage

```bash
# Run directly from registry
deno run -A npm:@fwdslsh/unify build

# Install globally (Deno 1.30+)
deno install -gA npm:@fwdslsh/unify
```

## Pre-built Binaries

Standalone executables are available for major platforms, with no runtime dependencies:

### Download Pre-built Binaries

```bash
# Linux x64
curl -L https://github.com/fwdslsh/unify/releases/latest/download/unify-linux -o unify
chmod +x unify

# macOS (ARM64)
curl -L https://github.com/fwdslsh/unify/releases/latest/download/unify-macos -o unify
chmod +x unify

# Windows x64
curl -L https://github.com/fwdslsh/unify/releases/latest/download/unify-windows.exe -o unify.exe
```

### Install Script (Unix-like systems)

```bash
# Automatic installation to /usr/local/bin
curl -fsSL https://raw.githubusercontent.com/fwdslsh/unify/main/install.sh | bash

# Or specify custom directory
curl -fsSL https://raw.githubusercontent.com/fwdslsh/unify/main/install.sh | bash -s -- ~/.local/bin
```

## Docker Installation

Use the official Docker image for containerized environments:

```bash
# Pull latest image
docker pull fwdslsh/unify:latest

# Build current directory
docker run --rm -v $(pwd):/workspace fwdslsh/unify build

# Start development server (with port mapping)
docker run --rm -v $(pwd):/workspace -p 3000:3000 fwdslsh/unify serve --host 0.0.0.0
```

## Development Installation

To contribute to unify or run the latest development version:

```bash
# Clone repository
git clone https://github.com/fwdslsh/unify.git
cd unify

# Install dependencies
bun install

# Run development version
bun src/cli.js build

# Run tests
bun test

# Build cross-platform binaries
bun run build:linux
bun run build:macos
bun run build:windows
```

## Verification

After installation, verify unify is working correctly:

```bash
# Check version
unify --version

# View help
unify --help

# Test basic functionality
mkdir test-site && cd test-site
echo "<h1>Hello, unify!</h1>" > index.html
unify build
cat dist/index.html
```

## Updating unify

### Package Manager Updates

```bash
# Update via Bun
bun update @fwdslsh/unify

# Update via npm
npm update @fwdslsh/unify -g

# Update via Yarn
yarn global upgrade @fwdslsh/unify
```

### Binary Updates

```bash
# Re-run install script (Unix-like systems)
curl -fsSL https://raw.githubusercontent.com/fwdslsh/unify/main/install.sh | bash

# Or download manually from releases page
# https://github.com/fwdslsh/unify/releases
```

## Troubleshooting Installation

### Common Issues

```bash
# Permission denied (Unix-like systems)
sudo bun add -g @fwdslsh/unify
# or use a version manager like nvm

# Command not found after global install
echo $PATH  # Ensure global bin directory is in PATH
which unify  # Check if binary is installed

# Version conflicts
bun remove -g @fwdslsh/unify && bun add -g @fwdslsh/unify
```

### Environment Debugging

```bash
# Check runtime information
unify --version --verbose

# Debug mode for detailed output
DEBUG=1 unify build --verbose

# Check system requirements
bun --version  # Should be 1.2.0+
node --version # Should be 18+ (if using Node.js)
```

> **🚀 Ready to Build**
>
> Installation complete! Continue with the [Project Structure](/unify/docs/project-structure) guide to learn how to organize your unify project.