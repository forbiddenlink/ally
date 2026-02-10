# ally

> Your codebase's accessibility ally. Scans, explains, and fixes a11y issues using GitHub Copilot CLI.

![Accessibility](https://img.shields.io/badge/a11y-first-blue)
![Built with Copilot CLI](https://img.shields.io/badge/built%20with-Copilot%20CLI-purple)
![npm](https://img.shields.io/npm/v/ally-a11y)

## What It Does

```
ally scan ./src          →  Finds issues (contrast, alt, ARIA, keyboard)
ally explain             →  Copilot explains each issue + impact
ally fix                 →  Copilot generates fixes, you approve each (35+ patterns)
ally report              →  Generates reports (Markdown/HTML/JSON/SARIF/JUnit/CSV)
ally triage              →  Interactive issue categorization
ally crawl <url>         →  Multi-page website scanning
ally tree <url>          →  View accessibility tree
ally pr-check            →  Post results to GitHub PR
ally badge               →  Generate accessibility score badges
ally watch               →  Continuous accessibility testing
ally learn               →  Educational WCAG explainer
```

## Quick Demo

```bash
$ ally scan ./src

   __ _  | | _   _
  / _` | | || | | |
 | (_| | | || |_| |
  \__,_| |_| \__, |
             |___/  v1.0.0

✔ Found 47 HTML files
✔ Scanned 47 files

📄 Button.tsx
   [!!!] CRITICAL - missing accessible name
📄 Hero.jsx
   [!!!] CRITICAL - image missing alt text
📄 Nav.tsx
   [!!] SERIOUS - keyboard trap in dropdown

   ╭───────── Scan Results ─────────╮
   │   Accessibility Score: 62/100  │
   │   !!! CRITICAL: 3              │
   │   !!  SERIOUS:  5              │
   ╰────────────────────────────────╯

$ ally fix

📝 Fixing: Button.tsx:14 — missing accessible name

  - <button onClick={handleClick}>
  + <button onClick={handleClick} aria-label="Submit form">

  Apply this fix? [Y/n/skip] y ✓

✅ Fixed 3/3 critical issues. Score: 62 → 78/100
```

## Installation

```bash
npm install -g ally-a11y

# Initialize in your project
ally init

# For AI-powered fixes, also install GitHub Copilot CLI
npm install -g @github/copilot-cli
copilot auth login
```

## Commands

### `ally init`

Initialize ally in your project. Creates configuration files for MCP integration.

```bash
ally init           # Set up ally in current directory
ally init --force   # Overwrite existing configuration
ally init --hooks   # Also generate pre-commit hook
```

**Creates:**
- `.ally/` directory for scan results
- `.copilot/mcp-config.json` for Copilot CLI integration
- `.husky/pre-commit` (with `--hooks` flag) for automated scanning

### `ally stats`

Show your accessibility progress dashboard with score animation and history.

```bash
ally stats    # View score, trends, and progress over time
```

**Features:**
- Animated score display
- Progress history tracking
- Motivational feedback

### `ally scan [path]`

Scans HTML files for accessibility violations using axe-core.

```bash
ally scan ./src              # Scan local HTML files
ally scan --url http://localhost:3000  # Scan a running app
ally scan -v                 # Verbose (show all issues)
ally scan -o ./reports       # Custom output directory
ally scan --threshold 5      # Exit with error if >5 violations (CI mode)
ally scan --ci               # CI mode: minimal output
ally scan --format sarif     # SARIF output for GitHub Code Scanning
ally scan --fail-on critical,serious  # Fail only on specific severities
```

**CI Integration:**
```yaml
# GitHub Actions example
- run: ally scan ./src --threshold 0

# GitHub Code Scanning integration
- run: ally scan ./src --format sarif -o results.sarif
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

**Granular CI Control:**
```bash
# Fail only on critical issues
ally scan ./src --fail-on critical

# Fail on critical and serious issues
ally scan ./src --fail-on critical,serious

# Valid severities: critical, serious, moderate, minor
```

**Output:** Creates `.ally/scan.json` with detailed violation data.

### `ally explain`

Explains each violation in plain language with WCAG references.

```bash
ally explain                 # Explain all issues
ally explain -s critical     # Only critical issues
ally explain -l 5            # Limit to 5 issues
```

### `ally fix`

Fixes issues using GitHub Copilot CLI's agentic mode with approval for each change.

```bash
ally fix                     # Interactive (approve each fix)
ally fix --auto              # Auto-apply all fixes
ally fix --dry-run           # Preview without changing files
ally fix -s serious          # Only fix serious+ issues
```

**Features:**
- Shows diff before applying
- Approve/reject each change
- Tracks fix history for consistency
- Uses MCP server for project-specific patterns

### `ally report`

Generates an accessibility report for your repository.

```bash
ally report                  # ACCESSIBILITY.md (default)
ally report -f html          # HTML report
ally report -f json          # JSON report
ally report -o a11y-report.md
```

**Output:** Creates committable report with:
- Accessibility score badge
- Violations by severity
- WCAG compliance status
- Next steps

### `ally badge`

Generate accessibility score badges for your README or documentation.

```bash
ally badge                        # Print shields.io URL
ally badge --format markdown      # Markdown image syntax
ally badge --format svg           # Raw SVG content
ally badge --format svg --output badge.svg  # Save SVG to file
```

**Formats:**
- `url` (default) - Shields.io badge URL
- `markdown` - Ready-to-paste markdown: `![Ally Score](https://...)`
- `svg` - Raw SVG for self-hosting

**Example output:**
```markdown
![Ally Score](https://img.shields.io/badge/a11y-92%2F100-brightgreen)
```

### `ally watch`

Continuous accessibility testing during development. Re-scans when files change.

```bash
ally watch ./src                  # Watch directory for changes
ally watch ./src --debounce 500   # Custom debounce delay (ms)
ally watch ./src --clear          # Clear terminal between scans
```

**Options:**
- `--debounce <ms>` - Delay before re-scanning after changes (default: 300)
- `--clear` - Clear terminal before each scan for cleaner output

**Features:**
- File system watcher with smart debouncing
- Only re-scans changed files
- Shows score diff after each change

### `ally learn`

Educational WCAG explainer. Understand violations and accessibility concepts.

```bash
ally learn color-contrast         # Learn about color-contrast violations
ally learn aria-label             # Learn about ARIA labeling
ally learn --list                 # List all available topics
```

**Usage:**
- Pass a violation ID from scan results to learn about that specific issue
- Includes WCAG success criteria, techniques, and real-world impact
- Provides code examples and fix patterns

**Example:**
```bash
$ ally learn image-alt

📚 image-alt — Images must have alternate text

WCAG: 1.1.1 Non-text Content (Level A)

Why it matters:
  Screen reader users cannot perceive images without alt text.
  Alt text also helps when images fail to load.

Good examples:
  <img src="logo.png" alt="Acme Corp logo">
  <img src="chart.png" alt="Q4 revenue: $2.3M, up 15%">
  <img src="decorative.png" alt="" role="presentation">
```

### `ally crawl <url>`

Crawl an entire website following links and scan each page.

```bash
ally crawl https://example.com                  # Crawl with defaults
ally crawl https://example.com --depth 3        # Follow links 3 levels deep
ally crawl https://example.com --limit 50       # Scan up to 50 pages
ally crawl https://example.com --no-same-origin # Follow external links too
```

**Options:**
- `--depth <n>` - Maximum crawl depth (default: 2)
- `--limit <n>` - Maximum pages to scan (default: 10)
- `--same-origin` - Only follow links to same origin (default)

### `ally tree <url>`

Display the accessibility tree for a URL. Shows how screen readers see your page.

```bash
ally tree https://example.com           # View a11y tree
ally tree https://example.com -d 10     # Show deeper tree
ally tree https://example.com -r button # Filter to button roles
ally tree https://example.com --json    # Output as JSON
```

**Output:**
- Visual ASCII tree with proper box-drawing characters
- Color-coded roles (landmarks=blue, headings=yellow, interactive=green)
- Shows ARIA roles, names, and properties

### `ally triage`

Interactively categorize and prioritize accessibility issues.

```bash
ally triage    # Start interactive triage session
```

**Features:**
- Arrow-key navigation through violations
- Categorize each issue: Fix now / Backlog / Ignore
- Saves `.allyignore` for ignored rules
- Creates `.ally/fix-queue.json` for quick fixes
- Creates `.ally/backlog.json` for deferred items

### `ally pr-check`

Post accessibility results to a GitHub Pull Request.

```bash
ally pr-check                     # Auto-detect PR in GitHub Actions
ally pr-check --pr 123            # Specify PR number manually
ally pr-check --fail-on critical  # Fail CI on critical issues
```

**Features:**
- Posts formatted comment with score and violations
- Works with GitHub CLI (`gh`)
- Auto-detects PR number in GitHub Actions
- Supports `--fail-on` for CI gates

## Configuration

Ally supports configuration files. Create `.allyrc.json` in your project root:

```json
{
  "scan": {
    "standard": "wcag22aa",
    "threshold": 5,
    "failOn": ["critical", "serious"],
    "ignore": ["**/node_modules/**"]
  },
  "report": {
    "format": "markdown",
    "output": "ACCESSIBILITY.md"
  },
  "fix": {
    "autoApprove": ["image-alt", "html-has-lang"]
  }
}
```

**Supported files:**
- `.allyrc.json`
- `.allyrc` (JSON format)
- `ally.config.js` (CommonJS)

## MCP Server Integration

Ally includes a custom MCP server that provides project-specific context to Copilot CLI:

```json
// .copilot/mcp-config.json
{
  "mcpServers": {
    "ally-patterns": {
      "type": "local",
      "command": "node",
      "args": ["./node_modules/ally-a11y/mcp-server/dist/index.js"]
    }
  }
}
```

**Available Tools:**
- `get_component_patterns` - Analyzes existing ARIA patterns in your components
- `get_design_tokens` - Extracts color palette for WCAG-compliant contrast fixes
- `get_fix_history` - Returns previously applied fixes for consistency
- `get_scan_summary` - Current scan results summary
- `get_wcag_guideline` - Get full WCAG success criterion details
- `suggest_aria_pattern` - Get ARIA patterns for specific component types

## Why Ally?

| Feature | ally | axe-cli | pa11y |
|---------|------|---------|-------|
| Scan | ✅ | ✅ | ✅ |
| AI Explanations | ✅ | ❌ | ❌ |
| AI Fixes (35+ patterns) | ✅ | ❌ | ❌ |
| Approval Flow | ✅ | ❌ | ❌ |
| MCP Integration | ✅ | ❌ | ❌ |
| Report Generation | ✅ | ❌ | ❌ |
| Watch Mode | ✅ | ❌ | ❌ |
| SARIF/JUnit/CSV Output | ✅ | ❌ | ✅ |
| Badge Generation | ✅ | ❌ | ❌ |
| Educational Content | ✅ | ❌ | ❌ |
| Interactive Triage | ✅ | ❌ | ❌ |
| Multi-page Crawl | ✅ | ❌ | ✅ |
| A11y Tree View | ✅ | ❌ | ❌ |
| GitHub PR Integration | ✅ | ❌ | ❌ |
| Config File Support | ✅ | ✅ | ✅ |
| Incremental Caching | ✅ | ❌ | ❌ |

## GitHub Action

Use ally in your CI/CD pipeline with our official GitHub Action:

```yaml
- uses: lizthegrey/ally@v1
  with:
    path: ./src
    threshold: 0  # Fail if any violations
```

**Inputs:**
- `path` - Directory to scan (default: `.`)
- `threshold` - Max violations before failing (default: `0`)
- `url` - Scan a URL instead of files

**Outputs:**
- `score` - Accessibility score (0-100)
- `violations` - Total violations found

## Accessible CLI

Ally practices what it preaches. The CLI respects accessibility preferences:

```bash
NO_COLOR=1 ally scan ./src   # Disable colors
ALLY_NO_COLOR=1 ally scan    # Alternative env var
```

## Requirements

- Node.js 18+
- GitHub Copilot CLI (optional, for AI-powered explain/fix)
- Copilot subscription (Individual, Business, or Enterprise)

## Contributing

PRs welcome! Please ensure your changes pass accessibility guidelines.

## License

MIT

---

Built with [GitHub Copilot CLI](https://github.com/features/copilot/cli) for the [GitHub Copilot CLI Challenge](https://dev.to/challenges/github-2026-01-21).
