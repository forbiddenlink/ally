# Architecture

This document describes the architecture of ally, an accessibility CLI tool.

## Project Overview

Ally is a comprehensive accessibility testing and remediation CLI built with TypeScript. It uses axe-core for accessibility scanning and integrates with GitHub Copilot CLI for AI-powered explanations and fixes.

## Directory Structure

```
ally/
├── src/
│   ├── cli.ts              # Main CLI entry point (Commander.js)
│   ├── commands/           # Command implementations
│   │   ├── scan.ts         # Core scanning logic
│   │   ├── fix.ts          # Auto-fix with 35+ patterns
│   │   ├── watch.ts        # File watcher with fix-on-save
│   │   ├── report.ts       # Report generation
│   │   ├── crawl.ts        # Multi-page website crawling
│   │   ├── tree.ts         # Accessibility tree visualization
│   │   └── ...             # Other commands
│   ├── utils/
│   │   ├── scanner.ts      # axe-core + Puppeteer integration
│   │   ├── fix-patterns.ts # 35+ auto-fix patterns
│   │   ├── impact-scores.ts # Violation severity scoring
│   │   ├── history.ts      # Progress tracking
│   │   └── ...             # Other utilities
│   └── types/
│       └── index.ts        # TypeScript interfaces
├── mcp-server/             # MCP server for Copilot integration
│   └── src/
│       └── index.ts        # 7 MCP tools
├── test/                   # Unit tests
├── test-fixtures/          # HTML fixtures for testing
├── benchmark/              # Performance benchmarks
└── demo/                   # Demo files and video script
```

## Key Components

### CLI Entry Point (`src/cli.ts`)

Uses Commander.js to define all commands. Each command maps to a module in `src/commands/`.

### Scanner (`src/utils/scanner.ts`)

Core scanning engine that:
1. Launches headless browser via Puppeteer
2. Loads HTML files or URLs
3. Injects and runs axe-core
4. Returns structured violation data with impact scores

```typescript
// Simplified flow
async function scanFile(filePath: string): Promise<ScanResult> {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(`file://${filePath}`);
  const results = await new AxePuppeteer(page).analyze();
  return processResults(results);
}
```

### Fix Patterns (`src/utils/fix-patterns.ts`)

Contains 35+ pattern-based transformations for common violations:

- `image-alt`: Adds descriptive alt text
- `button-name`: Adds aria-label to buttons
- `html-has-lang`: Adds lang attribute to <html>
- `link-name`: Adds accessible name to links
- And more...

### Impact Scoring (`src/utils/impact-scores.ts`)

Calculates 0-100 impact scores for violations based on:
- WCAG level (A > AA > AAA)
- User groups affected
- Estimated percentage of users impacted
- Business context (checkout pages score higher for form issues)

### MCP Server (`mcp-server/src/index.ts`)

Exposes 7 tools for GitHub Copilot CLI integration:
1. `get_component_patterns` - Analyze ARIA patterns in codebase
2. `get_design_tokens` - Extract colors with contrast checking
3. `get_fix_history` - Previous fixes for consistency
4. `get_scan_summary` - Current scan state
5. `get_wcag_guideline` - Full WCAG criterion details
6. `suggest_aria_pattern` - ARIA patterns for components
7. `check_color_contrast` - Calculate contrast ratios

## Data Flow

### Scan → Fix → Report Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  HTML/URL   │────▶│   Scanner   │────▶│   Report    │
│   Input     │     │  (axe-core) │     │  (.ally/)   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Impact    │
                    │   Scoring   │
                    └─────────────┘
                           │
                           ▼
                    ┌─────────────┐     ┌─────────────┐
                    │ Fix Engine  │────▶│  Modified   │
                    │ (patterns)  │     │   Files     │
                    └─────────────┘     └─────────────┘
```

### Watch Mode with Fix-on-Save

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   File      │────▶│   Watcher   │────▶│   Scanner   │
│   Change    │     │  (chokidar) │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  Auto-Fix   │
                                        │ (≥90% conf) │
                                        └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │   Re-scan   │
                                        │   & Report  │
                                        └─────────────┘
```

## Testing Strategy

### Unit Tests (`test/*.test.ts`)

Tests for individual utilities and commands:
- `scanner.test.ts` - axe-core integration
- `fix-patterns.test.ts` - Fix pattern accuracy
- `config.test.ts` - Configuration loading
- `scan.test.ts` - Scan command behavior
- `fix.test.ts` - Fix command behavior
- `report.test.ts` - Report generation

### E2E Tests (`test/e2e/*.test.ts`)

Full workflow tests using real browser automation:
- Scan → Fix → Report workflow
- Watch mode with fix-on-save
- Multi-page crawling

### Test Fixtures (`test-fixtures/`)

HTML files with intentional accessibility issues:
- `bad-a11y.html` - Multiple violations
- `good-a11y.html` - Clean file for comparison
- `auto-fix-test.html` - Fixable violations

## Browser Support

| Browser | Version | Status |
|---------|---------|--------|
| Chromium | 120+ | Fully supported (default) |
| Firefox | 115+ | Supported via Playwright |
| WebKit | Latest | Experimental |

The default browser is Chromium via Puppeteer. For other browsers, ally can use Playwright when available.

## Configuration

Ally supports configuration via:
- `.allyrc.json` - JSON configuration
- `.allyrc` - JSON format without extension
- `ally.config.js` - CommonJS module

Configuration schema:
```typescript
interface AllyConfig {
  scan?: {
    standard?: 'wcag2a' | 'wcag2aa' | 'wcag21a' | 'wcag21aa' | 'wcag22aa';
    threshold?: number;
    failOn?: Array<'critical' | 'serious' | 'moderate' | 'minor'>;
    ignore?: string[];
  };
  report?: {
    format?: 'markdown' | 'html' | 'json' | 'sarif' | 'junit' | 'csv';
    output?: string;
  };
  fix?: {
    autoApprove?: string[];
  };
}
```

## Output Formats

| Format | File | Use Case |
|--------|------|----------|
| JSON | `scan.json` | Default, full data |
| SARIF | `scan.sarif` | GitHub Code Scanning |
| JUnit | `scan.xml` | CI test reporting |
| CSV | `scan.csv` | Spreadsheet analysis |
| Markdown | `ACCESSIBILITY.md` | Documentation |
| HTML | `report.html` | Visual reports |

## Performance

The benchmark suite (`benchmark/scan-speed.ts`) compares ally against:
- pa11y
- axe-cli

Key optimizations:
- Incremental caching (`src/utils/cache.ts`)
- Single browser instance for batch scans
- Parallel file processing where possible

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests: `npm test`
4. Run linting: `npm run lint`
5. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.
