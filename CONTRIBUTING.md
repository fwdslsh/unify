# Contributing to unify

Thank you for your interest in contributing to unify! This guide will help you get started with development and understand our contribution process.

## 🚀 Quick Start

### Prerequisites

- **Bun** 1.0+ (latest recommended)
- **git**

### Development Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/fwdslsh/unify.git
cd cli

# 2. Install dependencies
bun install

# 3. Link for global testing
bun link

# 4. Run tests
bun test

# 5. Build example project
bun run build
```

### Verify Installation

```bash
# Check unify is working
unify --version

# Test with example project
cd example/
unify build --source src --output test-dist
unify serve --source src
```

## 🏗️ Development Workflow

### Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow the existing code style
   - Add tests for new functionality
   - Update documentation as needed

3. **Test your changes**
   ```bash
   # Run the test suite
   bun test
   
   # Test with example projects
   cd example/
   unify build --source src --output test-dist
   
   # Test advanced features
   cd advanced/
   unify build --source src --output test-dist
   ```

4. **Commit and push**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   git push origin feature/your-feature-name
   ```

5. **Create pull request**
   - Describe what your changes do
   - Reference any related issues
   - Include testing notes

### Code Style Guidelines

We use ESLint and Prettier for code formatting:

```bash
# Check code style
bun run lint

# Fix auto-fixable issues
bun run lint:fix

# Format code
bun run format
```

**Key conventions:**
- Use **ES modules** (`import`/`export`)
- Include `.js` extensions in imports
- Use **descriptive variable names**
- Add **JSDoc comments** for public functions
- Follow **async/await** patterns for promises

### Testing

#### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test test/unit/include-processor.test.js

# Run tests with coverage
bun run test:coverage

# Run integration tests
bun run test:integration
```

#### Test Categories

- **Unit tests** (`test/unit/`): Test individual modules
- **Integration tests** (`test/integration/`): Test complete workflows
- **Security tests** (`test/security/`): Test security features

#### Writing Tests

```javascript
// test/unit/my-feature.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { myFunction } from '../../src/core/my-feature.js';

describe('myFunction', () => {
  it('should handle basic case', () => {
    const result = myFunction('input');
    assert.strictEqual(result, 'expected-output');
  });
});
```

### Performance Testing

```bash
# Benchmark build performance
bun run benchmark

# Profile memory usage
bun --inspect src/cli.js build --source example/src

# Test with large sites
bun run test:large
```

## 📝 Documentation

### Types of Documentation

- **README.md**: Overview and quick start
- **docs/**: Detailed guides and references
- **JSDoc comments**: Inline code documentation
- **CHANGELOG.md**: Version history

### Documentation Guidelines

- **Clear examples**: Show practical usage
- **Step-by-step instructions**: Don't assume knowledge
- **Cross-references**: Link related concepts
- **Keep updated**: Update docs with code changes

### Building Documentation

```bash
# Generate API documentation
bun run docs:api

# Serve documentation locally
bun run docs:serve

# Check for broken links
bun run docs:check
```

## 🐛 Reporting Issues

### Before Submitting

1. **Search existing issues** to avoid duplicates
2. **Test with latest version** (`bun update`)
3. **Try minimal reproduction** case
4. **Check documentation** for solutions

### Issue Template

**Bug reports should include:**
- unify version (`unify --version`)
- Bun version (`bun --version`)
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Minimal code example

**Feature requests should include:**
- Use case description
- Proposed solution
- Alternatives considered
- Implementation willingness

## 🔧 Architecture Overview

### Core Modules

```
src/
├── cli/              # Command-line interface
├── core/             # Core processing logic
│   ├── include-processor.js
│   ├── markdown-processor.js
│   ├── file-processor.js
│   └── unified-html-processor.js
├── server/           # Development server
├── utils/            # Shared utilities
└── bin/              # CLI entry point
```

### Key Concepts

- **Include Processing**: Apache SSI-style includes
- **Dependency Tracking**: Smart rebuilds based on file changes
- **Asset Tracking**: Only copy referenced assets
- **DOM Templating**: Modern template and slot syntax
- **Live Reload**: Server-Sent Events for development

### Adding New Features

1. **Core logic** goes in `src/core/`
2. **CLI integration** in `src/cli/`
3. **Server features** in `src/server/`
4. **Utilities** in `src/utils/`
5. **Tests** in appropriate `test/` subdirectory

## 🎯 Contribution Guidelines

### What We're Looking For

**High Priority:**
- Bug fixes and stability improvements
- Performance optimizations
- Better error messages and debugging
- Documentation improvements
- Test coverage expansion

**Medium Priority:**
- New templating features
- Developer experience improvements
- Integration with popular tools
- Example projects and tutorials

**Future Considerations:**
- Plugin system architecture
- Advanced SEO features
- Build optimization tools
- Visual development tools

### Code Review Process

1. **Automated checks** must pass (tests, linting)
2. **Core maintainer review** for architecture and approach
3. **Community feedback** on user-facing changes
4. **Documentation review** for completeness
5. **Final approval** and merge

### Release Process

We follow [semantic versioning](https://semver.org/):

- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features, backward compatible
- **Patch** (0.0.1): Bug fixes, backward compatible

## 🤝 Community

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and community chat
- **Pull Requests**: Code contributions and reviews

### Code of Conduct

We follow the [Contributor Covenant](https://www.contributor-covenant.org/):

- **Be respectful** and inclusive
- **Focus on constructive** feedback
- **Help newcomers** get started
- **Acknowledge contributions** from everyone

## 📊 Metrics and Goals

### Quality Metrics

- **Test coverage**: >90% for core modules
- **Build performance**: <1s for typical sites
- **Error rate**: <1% on common operations
- **Documentation coverage**: 100% for public APIs

### Community Goals

- **Response time**: <48 hours for issues
- **Review time**: <1 week for pull requests
- **Release frequency**: Monthly minor releases
- **Backward compatibility**: Maintain for 6 months

## 🎓 Learning Resources

### Understanding the Codebase

- Start with `src/cli.js` to understand entry points
- Read `src/core/file-processor.js` for build logic
- Explore `test/` for usage examples
- Check `example/` for real-world usage

### Related Technologies

- **Bun native APIs**: For file processing and performance
- **ESM Modules**: For modern JavaScript
- **Apache SSI**: For include syntax
- **Server-Sent Events**: For live reload
- **HTMLRewriter**: For high-performance HTML manipulation

### External Dependencies

We minimize dependencies but use:
- **markdown-it**: Markdown processing  
- **gray-matter**: Frontmatter parsing

## 🚢 Deployment and Release

### Preparing a Release

1. **Update version** in `package.json`
2. **Update CHANGELOG.md** with changes
3. **Run full test suite** `bun test`
4. **Test with examples** to verify functionality
5. **Create release tag** and GitHub release

### Publishing

```bash
# Ensure you're on main branch
git checkout main
git pull origin main

# Run tests
bun test

# Publish to npm
bun publish

# Create GitHub release
gh release create v0.x.x --generate-notes
```

---

**Thank you for contributing to unify!** Every contribution, no matter how small, makes the project better for everyone. 🙏