# ally

Accessibility CLI that scans for WCAG issues with axe-core, scores each by impact, and applies pattern-based fixes. It also provides an MCP server.

[![npm version](https://img.shields.io/npm/v/ally-a11y)](https://www.npmjs.com/package/ally-a11y)
[![CI](https://github.com/forbiddenlink/ally/actions/workflows/ci.yml/badge.svg)](https://github.com/forbiddenlink/ally/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/forbiddenlink/ally/branch/main/graph/badge.svg)](https://codecov.io/gh/forbiddenlink/ally)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.17-brightgreen)](https://nodejs.org/)

---

## Key features

**Real-time auto-fix.** `ally watch src/ --fix-on-save` applies fixes as you save, only when confidence is at least 90%.

```bash
$ ally watch src/ --fix-on-save

✓ Auto-fix: ON (confidence ≥ 90%)
📄 Button.tsx changed
   ✓ Auto-applied 2 fixes
   • <button> → <button aria-label="Submit">
   • <img> → <img alt="Logo">
```

**Impact scoring.** Each violation gets a 0-100 impact score, a plain-language reason, and the user groups it affects, so you know what to fix first.

```bash
$ ally scan ./src

[!!!] CRITICAL Impact: 96/100 (WCAG A)
    Links must have discernible text
    👥 Affects: Screen reader users, Voice control users
    File: Button.tsx:14
```

## Install

```bash
npm install -g ally-a11y
ally init            # set up ally in your project
```

`explain` and `fix` can use GitHub Copilot CLI for AI-powered analysis (optional):

```bash
npm install -g @github/copilot-cli
copilot auth login
```

Requires Node.js 20.17+.

## Commands

```bash
# Scanning
ally scan ./src          # Scan for violations with impact scores
ally watch --fix-on-save # Auto-fix issues as you save files
ally crawl <url>         # Multi-page website scanning
ally scan-storybook      # Scan Storybook components
ally tree <url>          # View accessibility tree

# Fixing & learning
ally fix                 # Interactive fix approval (40 patterns)
ally explain             # WCAG explanations + Copilot integration
ally learn <violation>   # Educational deep-dive on violations
ally triage              # Prioritize violations interactively

# Reporting & progress
ally report              # Generate reports (MD/HTML/JSON/SARIF/CSV)
ally history             # View progress over time with trends
ally stats               # Accessibility progress dashboard
ally badge               # Generate score badges
ally pr-check            # Post results to GitHub PRs

# Design systems
ally audit-palette       # Audit color palette for contrast

# Setup & diagnostics
ally init                # Initialize ally in your project
ally doctor              # Diagnose configuration issues
ally health              # Quick accessibility health check
ally completion          # Shell tab completion
```

Options and examples for every command are in [docs/COMMANDS.md](docs/COMMANDS.md).

## Documentation

- [Command reference](docs/COMMANDS.md)
- [GitHub Action](docs/GITHUB_ACTION.md) and the [workflow guide](.github/WORKFLOW_GUIDE.md)
- [Configuration, MCP server, performance and baselines](docs/GUIDES.md)
- [How ally compares to axe-cli, pa11y and Lighthouse](docs/COMPARISON.md)
- [WCAG coverage](docs/WCAG_COVERAGE.md)
- [Architecture](docs/ARCHITECTURE.md)

## Accessible CLI

Set `NO_COLOR=1` (or `ALLY_NO_COLOR=1`) to disable colors.

## FAQ

**Does ally work with all frameworks?** Ally scans static HTML output, so it works with React, Vue, Angular, Svelte, plain HTML, and any other framework that generates HTML.

**Do I need GitHub Copilot CLI?** Basic scanning works without it. The `explain` and `fix` commands use it for AI-powered analysis.

**Is my data sent anywhere?** All scanning happens locally using axe-core. Only when using Copilot CLI features does data go to GitHub's API.

**Can I use this in CI/CD?** Yes. There is a [GitHub Action](docs/GITHUB_ACTION.md), and the CLI has a `--ci` mode.

**Does it support WCAG 2.0, 2.1, 2.2?** Use the `--standard` flag to choose the level (A, AA, AAA) and version (2.0, 2.1, 2.2).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).

## License

MIT © Elizabeth Stein

## Acknowledgments

- Built with [axe-core](https://github.com/dequelabs/axe-core)
- Optional AI explanations through [GitHub Copilot CLI](https://githubnext.com/projects/copilot-cli)
- Uses [Puppeteer](https://pptr.dev/) for browser automation, with optional [Playwright](https://playwright.dev/) support for Firefox and WebKit
