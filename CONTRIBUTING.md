# Contributing to Ally

Thank you for considering contributing to Ally! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## Getting Started

### Prerequisites

- Node.js 18+ (18.x, 20.x, or 22.x)
- npm 8+
- Git

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork:

   ```bash
   git clone https://github.com/YOUR_USERNAME/ally.git
   cd ally
   ```

3. Add upstream remote:

   ```bash
   git remote add upstream https://github.com/forbiddenlink/ally.git
   ```

## Development Setup

```bash
# Install dependencies
npm install
cd mcp-server && npm install && cd ..

# Build the project
npm run build:all

# Run tests
npm test

# Run type checking
npm run lint

# Test CLI locally
node dist/cli.js --help
```

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check existing issues. When creating a new issue, include:

- **Clear title and description**
- **Steps to reproduce**
- **Expected vs actual behavior**
- **Environment** (OS, Node.js version, ally version)
- **Screenshots** (if applicable)
- **Sample code or files** (if helpful)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear title**
- **Provide detailed description** of the proposed functionality
- **Explain why** this enhancement would be useful
- **List similar features** in other tools (if any)

### Pull Requests

1. Create a new branch from `main`:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following our [coding standards](#coding-standards)

3. Add tests for new functionality

4. Ensure all tests pass:

   ```bash
   npm test
   npm run lint
   ```

5. Commit your changes with clear messages:

   ```bash
   git commit -m "feat: add new scanning feature"
   ```

6. Push to your fork and create a pull request

## Coding Standards

### TypeScript

- Use TypeScript strict mode (already configured)
- Include JSDoc comments for public APIs
- Avoid `any` types - use proper types or `unknown`
- Use `async/await` over callbacks

### Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Add trailing commas in multiline objects/arrays
- Use arrow functions for callbacks
- Use descriptive variable names

### Commit Messages

Follow conventional commits:

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation changes
- `test:` adding or updating tests
- `refactor:` code refactoring
- `perf:` performance improvements
- `chore:` maintenance tasks

Examples:

```text
feat: add Firefox browser support to scanner
fix: handle timeout errors in crawl command
docs: update README with new command examples
test: add tests for color contrast calculation
```

### File Organization

```
src/
  cli.ts              # Main CLI entry point
  commands/           # Command implementations
    scan.ts
    fix.ts
    ...
  types/              # TypeScript type definitions
    index.ts
  utils/              # Utility functions
    scanner.ts
    ui.ts
    ...
test/                 # Test files (*.test.ts)
mcp-server/           # MCP server implementation
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests for a specific file
node --test --import tsx test/scanner.test.ts

# Run tests with verbose output
NODE_OPTIONS='--test-reporter=spec' npm test
```

### Writing Tests

- Place tests in the `test/` directory
- Name test files with `.test.ts` extension
- Use Node.js built-in test runner
- Follow AAA pattern (Arrange, Act, Assert)

Example:

```typescript
import { test } from 'node:test';
import assert from 'node:assert';

test('scanner should detect missing alt text', async () => {
  // Arrange
  const scanner = new AccessibilityScanner();
  await scanner.init();

  // Act
  const result = await scanner.scanHtmlString('<img src="test.png">');

  // Assert
  assert.strictEqual(result.violations.length, 1);
  assert.strictEqual(result.violations[0].id, 'image-alt');

  await scanner.close();
});
```

### Test Coverage

We aim for:

- 80%+ code coverage overall
- 100% coverage for critical paths
- All commands should have basic smoke tests

## Pull Request Process

1. **Update Documentation**: If you change functionality, update README.md
2. **Add Tests**: New features require tests
3. **Update CHANGELOG**: Add entry describing your changes (if significant)
4. **Check CI**: Ensure all CI checks pass
5. **Request Review**: Tag maintainers for review
6. **Address Feedback**: Respond to review comments promptly

### PR Checklist

- [ ] Tests pass locally
- [ ] Code follows style guidelines
- [ ] Documentation updated
- [ ] Commit messages follow convention
- [ ] No merge conflicts
- [ ] Changes are focused and atomic

## Development Commands

```bash
# Build
npm run build          # Build main CLI
npm run build:all      # Build CLI + MCP server

# Development
npm run dev            # Watch mode - rebuild on changes

# Testing
npm test               # Run all tests
npm run test:coverage  # Run tests with coverage

# Linting
npm run lint           # Type check with TypeScript

# Release (maintainers only)
npm version patch      # Bump version
npm publish           # Publish to npm
```

## Project Structure

### Key Files

- `src/cli.ts` - CLI entry point and command registration
- `src/commands/` - Command implementations
- `src/utils/scanner.ts` - Core accessibility scanner
- `src/utils/browser.ts` - Browser abstraction layer
- `mcp-server/src/index.ts` - MCP server for Copilot CLI integration
- `package.json` - Main package configuration
- `tsconfig.json` - TypeScript configuration

### Design Decisions

- **ES Modules**: Project uses ESM (`.js` imports, `"type": "module"`)
- **Dual Browser Support**: Puppeteer (default) + Playwright (optional)
- **Progressive Enhancement**: Core features work without Copilot CLI
- **Zero Dependencies Goal**: Minimize production dependencies

## Getting Help

- **Questions**: Open a GitHub Discussion
- **Bugs**: Open a GitHub Issue
- **Security**: See SECURITY.md
- **Chat**: (Add Discord/Slack link if available)

## License

By contributing to Ally, you agree that your contributions will be licensed under the MIT License.

## Recognition

Contributors are listed in:

- GitHub contributors page
- Release notes for significant contributions
- README acknowledgments section (for major features)

Thank you for contributing! 🎉
