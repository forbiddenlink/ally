# ally

> **The only accessibility CLI with real-time auto-fix and impact scoring.**

[![npm version](https://img.shields.io/npm/v/ally-a11y)](https://www.npmjs.com/package/ally-a11y)
[![CI](https://github.com/forbiddenlink/ally/actions/workflows/ci.yml/badge.svg)](https://github.com/forbiddenlink/ally/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/forbiddenlink/ally/branch/main/graph/badge.svg)](https://codecov.io/gh/forbiddenlink/ally)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
![Accessibility](https://img.shields.io/badge/a11y-first-blue)

---

## Table of Contents

- [Key Features](#two-features-no-other-tool-has)
- [Quick Start](#installation)
- [Commands](#commands)
- [Strategic Features (Feb 2026)](#strategic-features-feb-2026)
- [Configuration](#configuration)
- [CI/CD Integration](#github-action)
- [Why Ally?](#why-ally)
- [FAQ](#faq)
- [Contributing](#contributing)

---

## Two Features No Other Tool Has

### 1. Real-Time Auto-Fix (`watch --fix-on-save`)

**Fixes accessibility issues as you save files** — zero manual intervention.

```bash
$ ally watch src/ --fix-on-save

✓ Auto-fix: ON (confidence ≥ 90%)
📄 Button.tsx changed
   ✓ Auto-applied 2 fixes
   • <button> → <button aria-label="Submit">
   • <img> → <img alt="Logo">
   
No issues found (score: 100) ✨
```

**Why it's unique:**
- 🔥 **Instant fixes** — No "fix later" backlog
- 🎯 **High confidence** — Only applies fixes ≥90% confidence
- ⚡ **Zero friction** — Edit files normally, ally handles the rest
- 🤖 **Pattern learning** — Learns from your fix history

### 2. Impact Scoring (Industry-First)

**Shows which violations actually hurt users** — eliminates developer overwhelm.

```bash
$ ally scan ./src

[!!!] CRITICAL Impact: 96/100 (WCAG A)
    Links must have discernible text
    💡 Users cannot navigate your site, unable to determine link 
        destinations or purposes
    👥 Affects: Screen reader users, Voice control users
    📊 Estimated: 15-20% of users
    File: Button.tsx:14
    → a[href="#"]
```

**Why developers love it:**
- 💯 **Prioritization** — No more guessing what to fix first
- 💡 **Business context** — Understand why violations block users
- 👥 **User impact** — See who's affected (screen readers, low vision, etc.)
- 📊 **Metrics** — Estimated % of users impacted
- 🏷️ **WCAG levels** — A, AA, or AAA compliance

**Research-backed:** Solves the #1 developer pain point — feeling overwhelmed by too many violations.

---

## What It Does

**Core commands (19 total):**
```bash
# Scanning
ally scan ./src          # Scan for violations with impact scores
ally watch --fix-on-save # Auto-fix issues as you save files
ally crawl <url>         # Multi-page website scanning
ally scan-storybook      # Scan Storybook components
ally tree <url>          # View accessibility tree

# Fixing & Learning
ally fix                 # Interactive fix approval (35+ patterns)
ally explain             # WCAG explanations + Copilot integration
ally learn <violation>   # Educational deep-dive on violations
ally triage              # Prioritize violations interactively

# Reporting & Progress
ally report              # Generate reports (MD/HTML/JSON/SARIF/CSV)
ally history             # View progress over time with trends
ally stats               # Accessibility progress dashboard
ally badge               # Generate score badges
ally pr-check            # Post results to GitHub PRs

# Design Systems
ally audit-palette       # Audit color palette for contrast

# Setup & Diagnostics
ally init                # Initialize ally in your project
ally doctor              # Diagnose configuration issues
ally health              # Quick accessibility health check
ally completion          # Shell tab completion
``` 

---

## Quick Demo

**With Impact Scoring:**
```bash
$ ally scan ./src

✔ Found 47 HTML files
✔ Scanned 47 files

📄 Button.tsx
   [!!!] CRITICAL Impact: 98/100 (WCAG A)
       Buttons must have discernible text
       💡 Users cannot activate buttons, blocking core actions
       👥 Affects: Screen reader users, Voice control users
       📊 Estimated: 15-20% of users
       → button

   ╭───────── Scan Results ─────────╮
   │   Accessibility Score: 62/100  │
   │   !!! CRITICAL: 3              │
   │   !!  SERIOUS:  5              │
   ╰────────────────────────────────╯
```

**Interactive Fix:**
```bash
$ ally fix

📝 Fixing: Button.tsx:14 — missing accessible name

  - <button onClick={handleClick}>
  + <button onClick={handleClick} aria-label="Submit form">

  Apply this fix? [Y/n/skip] y ✓

✅ Fixed 3/3 critical issues. Score: 62 → 78/100
```

**Auto-Fix on Save:**
```bash
$ ally watch src/ --fix-on-save

✓ Watching 47 files for changes...
📄 Button.tsx changed
   ✓ Auto-applied 2 fixes (confidence ≥ 90%)
   Score: 62 → 78/100 ✨
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

### `ally history` 🆕

**View scan history and progress trends** - Track your accessibility improvements over time.

```bash
ally history                 # View recent scans and trends
ally history --limit 20      # Show last 20 scans
ally history --branch main   # Filter by git branch
ally history --verbose       # Show detailed information
```

**Features:**
- **Current score** with change from previous scan
- **Trend analysis** (improving/declining/stable)
- **Streak tracking** (consecutive improving scans)
- **Statistics**: Best, average, and worst scores
- **Progress metrics**: Total scans, issues fixed
- **Sparkline visualization** of score history
- **Git integration**: Shows branch and commit for each scan
- **Motivational messages** based on your progress

**Example Output:**
```
╭───── 📊 Accessibility Progress ─────╮
│                                     │
│   Current Score: 85/100 +7          │
│                                     │
│   Trend: ↗ improving                │
│   Streak: 3 scans improving/stable  │
│                                     │
│   Statistics:                       │
│     Best:    92/100                 │
│     Average: 78/100                 │
│     Worst:   45/100                 │
│                                     │
│   Progress:                         │
│     Total scans: 15                 │
│     Issues fixed: 23 fixed          │
│     First scan: 2 weeks ago         │
│     Last scan: just now             │
│                                     │
╰─────────────────────────────────────╯

Score History:
▁▃▄▅▅▆▆▇▇██
45                                         92

Recent Scans (last 5):

#15 just now 85/100 (5 issues, 47 files) [main@a1b2c3d]
#14 2 hours ago 78/100 (8 issues, 47 files) [main@e4f5g6h]
#13 1 day ago 75/100 (10 issues, 45 files) [feature/a11y@i7j8k9l]

💡 Great momentum! You've improved for 3 consecutive scans. Keep it up!
```

### `ally scan [path]`

Scans HTML files for accessibility violations using axe-core. **Violations are sorted by impact score** (0-100) showing which issues hurt users most.

```bash
ally scan ./src              # Scan with impact scoring
ally scan --url http://localhost:3000  # Scan a running app
ally scan -v                 # Verbose (show all issues with impact data)
ally scan -o ./reports       # Custom output directory
ally scan --threshold 5      # Exit with error if >5 violations (CI mode)
ally scan --ci               # CI mode: minimal output
ally scan --format sarif     # SARIF output for GitHub Code Scanning
ally scan --fail-on critical,serious  # Fail only on specific severities
```

**Impact Scoring Features:**
- **0-100 score** per violation based on user impact
- **Business reasoning** (e.g., "Users cannot navigate your site")
- **Affected user groups** (screen readers, low vision, keyboard-only, etc.)
- **Estimated % impact** (e.g., "15-20% of users")
- **WCAG level** (A, AA, or AAA)
- **Context-aware** (checkout pages score higher for form issues)
- **Auto-sorted** by impact (highest first)

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

Explains each violation in plain language with WCAG references. Shows built-in explanations and suggests Copilot CLI commands for deeper analysis.

```bash
ally explain                 # Explain all issues
ally explain -s critical     # Only critical issues
ally explain -l 5            # Limit to 5 issues
```

### `ally fix`

Applies accessibility fixes using 35+ pattern-based transformations. Optionally integrates with GitHub Copilot CLI for complex fixes.

```bash
ally fix                     # Interactive (approve each fix)
ally fix --auto              # Auto-apply high-confidence fixes
ally fix --dry-run           # Preview without changing files
ally fix -s serious          # Only fix serious+ issues
```

**Features:**
- 35+ automated fix patterns (image-alt, button-name, ARIA, etc.)
- Shows diff before applying
- Approve/reject each change
- Tracks fix history for consistency
- Optional Copilot CLI integration for complex cases

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

### `ally watch` \ud83d\udd25 KILLER FEATURE

**Real-time accessibility testing with auto-fix on save.** The only tool that fixes violations as you code.

```bash
ally watch ./src                        # Watch directory for changes
ally watch ./src --fix-on-save          # AUTO-FIX violations as files save
ally watch ./src --debounce 500         # Custom debounce delay (ms)
ally watch ./src --clear                # Clear terminal between scans
ally watch ./src --fix-on-save --verbose # Show all fixes applied
```

**`--fix-on-save` Options:**
- Applies **35+ fix patterns** automatically
- Only fixes with **\u226590% confidence** (safe defaults)
- Shows **diff** of each auto-fix in terminal
- Tracks **stats** (files changed, fixes applied)
- **Rescans** file after applying fixes
- Works with **all file types** (HTML, JSX, Vue, Svelte, etc.)

**Why It's Unique:**
- \ud83d\udd25 **Zero friction** \u2014 Just save files normally
- \ud83c\udfaf **High confidence** \u2014 No breaking changes
- \u26a1 **Instant feedback** \u2014 See score improve in real-time
- \ud83e\udd16 **Pattern learning** \u2014 Learns from your fix history
- \ud83d\ude80 **Market-first** \u2014 No competitor has this

**Example session:**
```bash
$ ally watch src/ --fix-on-save

\u2713 Auto-fix: ON (confidence \u2265 90%)
\u2713 Watching 47 files...

\ud83d\udcc4 Button.tsx changed
   \u2713 Auto-applied 2 fixes:
   \u2022 button-name: Added aria-label=\"Submit\"
   \u2022 image-alt: Added alt=\"Logo\"
   Score: 62 \u2192 78/100 (+16)

\ud83d\udcc4 Hero.jsx changed  
   \u2713 Auto-applied 1 fix:
   \u2022 html-has-lang: Added lang=\"en\"
   Score: 78 \u2192 85/100 (+7)

\ud83c\udf89 All violations fixed! Score: 100/100
```

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

### `ally scan-storybook`

Scan Storybook stories for accessibility issues. Automatically discovers and tests all stories.

```bash
ally scan-storybook                           # Scan localhost:6006
ally scan-storybook -u http://localhost:9009  # Custom Storybook URL
ally scan-storybook --filter "Button*"        # Filter stories by pattern
ally scan-storybook -f json -o ./reports      # Output as JSON
```

**Options:**
- `-u, --url` - Storybook URL (default: http://localhost:6006)
- `-T, --timeout` - Page load timeout in ms (default: 10000)
- `-f, --filter` - Filter stories by name pattern
- `-F, --format` - Output format (default, json, csv)
- `-s, --standard` - WCAG standard (default: wcag22aa)

### `ally audit-palette`

Audit a design system color palette for contrast issues. Supports JSON/CSS/SCSS palette files.

```bash
ally audit-palette colors.json              # Audit palette file
ally audit-palette tokens.css --apca        # Include APCA contrast values
ally audit-palette palette.scss --level aaa # Require AAA compliance
ally audit-palette colors.json -f csv       # Output as CSV
```

**Options:**
- `-f, --format` - Output format (default, json, csv)
- `-l, --level` - Minimum WCAG level to pass (aa, aaa)
- `--large-text` - Use large text thresholds (3:1 for AA)
- `--apca` - Include APCA Lc values in output

### `ally doctor`

Diagnose installation and configuration issues. Run this if ally isn't working as expected.

```bash
ally doctor    # Check installation health
```

**Checks:**
- Node.js version compatibility
- Required dependencies installed
- Browser automation setup (Puppeteer/Playwright)
- Configuration file validity
- MCP server connectivity

### `ally health`

Quick accessibility health check similar to `npm audit`. Get a fast overview of your project's accessibility status.

```bash
ally health                       # Quick scan with summary
ally health -p ./src              # Scan specific path
ally health -s wcag21aa           # Use specific standard
ally health -i .ally/scan.json    # Use existing scan results
```

### `ally completion`

Generate shell completion scripts for tab completion of commands and options.

```bash
ally completion bash >> ~/.bashrc    # Bash completion
ally completion zsh >> ~/.zshrc      # Zsh completion
ally completion fish > ~/.config/fish/completions/ally.fish
```

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

**Two industry-first features** no other tool has:

| Feature | ally | axe-cli | pa11y | Lighthouse |
|---------|------|---------|-------|------------|
| **Impact Scoring (0-100)** | ✅ | ❌ | ❌ | ❌ |
| **Auto-Fix on Save** | ✅ | ❌ | ❌ | ❌ |
| **Business Context** | ✅ | ❌ | ❌ | ❌ |
| **User Impact %** | ✅ | ❌ | ❌ | ❌ |
| Scan | ✅ | ✅ | ✅ | ✅ |
| AI Fixes (35+ patterns) | ✅ | ❌ | ❌ | ❌ |
| MCP Integration | ✅ | ❌ | ❌ | ❌ |
| Watch Mode | ✅ | ❌ | ❌ | ❌ |
| SARIF/JUnit/CSV Output | ✅ | ❌ | ✅ | ❌ |
| Report Generation | ✅ | ❌ | ❌ | ✅ |
| Badge Generation | ✅ | ❌ | ❌ | ❌ |
| Interactive Triage | ✅ | ❌ | ❌ | ❌ |
| Multi-page Crawl | ✅ | ❌ | ✅ | ✅ |
| GitHub PR Integration | ✅ | ❌ | ❌ | ❌ |
| Incremental Caching | ✅ | ❌ | ❌ | ❌ |

**What makes ally unique:**
1. **Impact Scoring** — The only tool that prioritizes violations by real user impact (0-100 scores)
2. **Auto-Fix on Save** — The only CLI with real-time fixing as you code
3. **Business Context** — Explains WHY violations matter, not just WHAT is wrong
4. **Developer Focus** — Designed to eliminate overwhelm with smart prioritization

## GitHub Action

Use ally in your CI/CD pipeline with our official GitHub Action:

```yaml
- uses: forbiddenlink/ally@v1
  with:
    path: ./src
    threshold: 0              # Fail if any violations
    compare-baseline: true    # Check for regressions
    fail-on-regression: true  # Block PRs that decrease accessibility
```

**Quick Wins Features in GitHub Action:**
- 🚀 **`max-files`** — Limit scanning to first N files for faster feedback on large projects
- 📊 **`baseline`** — Save current scan as accessibility baseline (set on main branch)
- 🔄 **`compare-baseline`** — Compare against baseline and detect regressions
- ⛔ **`fail-on-regression`** — Fail workflow if accessibility regresses

**Full Input Reference:**

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | string | `.` | Directory or URL to scan |
| `threshold` | number | 0 | Max violations before failure |
| `fail-on` | string | `critical` | Violation levels: `critical,serious,moderate,minor` |
| `max-files` | number | 0 | Limit scan to first N files (Quick Win) |
| `baseline` | boolean | false | Save as baseline for regression tracking (Quick Win) |
| `compare-baseline` | boolean | false | Compare against saved baseline (Quick Win) |
| `fail-on-regression` | boolean | false | Fail if accessibility regresses (Quick Win) |

**Output Reference:**

| Output | Type | Description |
|--------|------|-------------|
| `score` | number | Overall accessibility score (0-100) |
| `violations` | number | Total accessibility violations found |
| `improved` | number | Files with improved accessibility (when comparing baseline) |
| `regressed` | number | Files with regressed accessibility (when comparing baseline) |

**📚 Workflow Documentation:**
- [Ally Workflow Guide](.github/WORKFLOW_GUIDE.md) — Complete guide with real-world examples
- [Example Workflows](.github/workflows/ally-a11y.yml) — 5 production-ready workflow templates
  - Basic PR validation with regressions
  - Large project with file limiting
  - Monorepo with progressive scanning
  - Parallel chunk processing
  - Smart scanning based on changes

## Accessible CLI

Ally practices what it preaches. The CLI respects accessibility preferences:

```bash
NO_COLOR=1 ally scan ./src   # Disable colors
ALLY_NO_COLOR=1 ally scan    # Alternative env var
```

## Performance

Ally is optimized for speed and resource efficiency:

### Scanning Speed
- **Cold start:** ~1-2 seconds (browser launch)
- **Per file:** ~0.75-1 second average
- **Parallel scanning:** 4 files concurrent by default
- **File caching:** Unchanged files skipped automatically

### Performance Examples
```bash
# Small project (10 files)
$ ally scan ./src
✔ Completed in ~8-10 seconds

# Medium project (50 files)  
$ ally scan ./src
✔ Completed in ~45-60 seconds

# Large project (200+ files)
$ ally scan ./src
✔ Completed in ~3-5 minutes
```

### Optimization Tips
```bash
# Skip unchanged files (automatic unless --no-cache)
ally scan --no-cache ./src        # Force full rescan

# Adjust parallel batch size for your system
# Default is 4 files parallel - increase for powerful machines
ally scan ./src                   # Uses default batch size

# Scan specific directories instead of entire project
ally scan ./src/components        # Much faster than ./

# Use --url to scan already-built output
ally scan --url http://localhost:3000
```

### Memory Usage
- Browser instance: ~80-150 MB
- Cache index: ~50 KB per 100 scanned files
- Results in memory: Minimal (streamed to disk)

## Strategic Features (Feb 2026)

### 🔥 Large Project Optimization

**Handle massive codebases without timeouts** using the `--max-files` flag.

```bash
# Scan only first 50 files (quick feedback)
ally scan . --max-files 50

# Why use this?
# • Unblocks large projects (1000+ files)
# • Get quick feedback before full scan
# • Progressive analysis workflow
```

**Perfect for:**
- Monorepos with thousands of files
- CI environments with tight timeouts
- Initial accessibility assessment of large codebases
- Progressive improvement workflows

---

### 📊 Baseline & Regression Detection

**Track accessibility improvements and prevent regressions** with built-in baseline comparison.

```bash
# Week 1: Set baseline
ally scan . --baseline
# ✓ Baseline saved! Future scans will track improvements...

# Week 2: Compare against baseline
ally scan . --compare-baseline
# 📊 Regression Analysis
# ✅ 5 improvements, 0 regressions, 2 unchanged

# CI Mode: Fail if regressions detected
ally scan . --compare-baseline --fail-on-regression
# Exit code 0 (no regressions) or 1 (regressions found)
```

**Features:**
- **Track Progress** — See score improvements over time
- **Prevent Regressions** — Block PRs if accessibility declines
- **Team Accountability** — Visible metrics for accessibility work
- **CI/CD Integration** — Perfect for GitHub Actions, GitLab CI, etc.

**Usage in CI/CD:**
```yaml
# GitHub Actions example
- name: Check accessibility regressions
  run: ally scan . --compare-baseline --fail-on-regression
  
# Fails the build if any accessibility regresses
# Passes if improvements or unchanged
```

**Commands:**
```bash
ally scan . --baseline                    # Create/update baseline
ally scan . --compare-baseline            # Compare & show analysis
ally scan . --compare-baseline --fail-on-regression  # CI gate
```

---

### 🎯 New Scan Flags

**Four powerful new flags for large projects and CI integration:**

| Flag | Purpose | Example |
|------|---------|---------|
| `--max-files <n>` | Limit to first N files | `ally scan . --max-files 100` |
| `--baseline` | Save current scan as baseline | `ally scan . --baseline` |
| `--compare-baseline` | Compare against saved baseline | `ally scan . --compare-baseline` |
| `--fail-on-regression` | Exit 1 if regressions detected | `ally scan . --compare-baseline --fail-on-regression` |

**Composable flags:**
```bash
# Use together for powerful CI/CD workflows
ally scan . --max-files 200 --compare-baseline --fail-on-regression
```

---

### Combined Workflow Example

**Real team workflow:**

```bash
# Monday: Establish baseline on main branch
git checkout main
ally scan . --baseline
# ✓ Baseline saved (85/100 score)

# Wednesday: Feature branch work
git checkout feature/a11y-fixes
ally scan . --compare-baseline
# 📊 Regression Analysis
# ✅ 3 improvements (85 → 88)
# ✅ Ready to merge!

# CI/CD: Always check for regressions
ally scan . --compare-baseline --fail-on-regression
# ✓ No regressions (or ✗ Build fails if regressions)
```

---

## Requirements

- Node.js 18+
- GitHub Copilot CLI (optional, for AI-powered explain/fix)
- Copilot subscription (Individual, Business, or Enterprise)

## FAQ

### Does ally work with all frameworks?

Yes! Ally scans static HTML output, so it works with React, Vue, Angular, Svelte, plain HTML, and any other framework that generates HTML.

### Do I need GitHub Copilot CLI?

Basic scanning works without Copilot CLI. The `explain` and `fix` commands require Copilot CLI for AI-powered analysis.

### Is my data sent anywhere?

No. All scanning happens locally using axe-core. Only when using Copilot CLI features does data go to GitHub's API.

### Can I use this in CI/CD?

Yes! We provide a GitHub Action, and the CLI has a `--ci` mode for pipeline integration.

### Does it support WCAG 2.0, 2.1, 2.2?

Yes! Use the `--standard` flag to specify which WCAG level (A, AA, AAA) and version (2.0, 2.1, 2.2) to test against.

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

For understanding the codebase structure, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Security

For security issues, see [SECURITY.md](SECURITY.md).

## License

MIT © Liz Fong-Jones

## Acknowledgments

- Built with [axe-core](https://github.com/dequelabs/axe-core) - Industry-standard accessibility testing engine
- Powered by [GitHub Copilot CLI](https://githubnext.com/projects/copilot-cli) - AI pair programmer
- Uses [Puppeteer](https://pptr.dev/) and [Playwright](https://playwright.dev/) for browser automation

---

**Made with care for the accessibility community**

*Simplifying WCAG compliance, one fix at a time.*
