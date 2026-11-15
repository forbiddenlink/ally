# Command reference

Moved out of the README. Back to the [README](../README.md).

## Commands

## `ally init`

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

## `ally stats`

Show your accessibility progress dashboard with score animation and history.

```bash
ally stats    # View score, trends, and progress over time
```

**Features:**

- Animated score display
- Progress history tracking
- Motivational feedback

## `ally history` 🆕

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

```text
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

## `ally scan [path]`

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

## `ally explain`

Explains each violation in plain language with WCAG references. Shows built-in explanations and suggests Copilot CLI commands for deeper analysis.

```bash
ally explain                 # Explain all issues
ally explain -s critical     # Only critical issues
ally explain -l 5            # Limit to 5 issues
```

## `ally fix`

Applies accessibility fixes using 34 pattern-based transformations. Optionally integrates with GitHub Copilot CLI for complex fixes.

```bash
ally fix                     # Interactive (approve each fix)
ally fix --auto              # Auto-apply high-confidence fixes
ally fix --dry-run           # Preview without changing files
ally fix -s serious          # Only fix serious+ issues
```

**Features:**

- 34 automated fix patterns (image-alt, button-name, ARIA, etc.)
- Shows diff before applying
- Approve/reject each change
- Tracks fix history for consistency
- Optional Copilot CLI integration for complex cases

## `ally report`

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

## `ally badge`

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

## `ally watch` \ud83d\udd25 KILLER FEATURE

**Real-time accessibility testing with auto-fix on save.** The only tool that fixes violations as you code.

```bash
ally watch ./src                        # Watch directory for changes
ally watch ./src --fix-on-save          # AUTO-FIX violations as files save
ally watch ./src --debounce 500         # Custom debounce delay (ms)
ally watch ./src --clear                # Clear terminal between scans
ally watch ./src --fix-on-save --verbose # Show all fixes applied
```

**`--fix-on-save` Options:**
- Applies **34 fix patterns** automatically
- Only fixes with **\u226590% confidence** (safe defaults)
- Shows **diff** of each auto-fix in terminal
- Tracks **stats** (files changed, fixes applied)
- **Rescans** HTML after applying fixes
- Watches **HTML, HTM, TSX, JSX, Vue, and Svelte**. HTML files get a full axe scan. Component files get high-confidence source fixes (axe needs rendered HTML — use `ally scan --url` for that).

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

## `ally learn`

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

## `ally crawl <url>`

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

## `ally tree <url>`

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

## `ally triage`

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

## `ally pr-check`

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

## `ally scan-storybook`

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

## `ally audit-palette`

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

## `ally doctor`

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

## `ally health`

Quick accessibility health check similar to `npm audit`. Get a fast overview of your project's accessibility status.

```bash
ally health                       # Quick scan with summary
ally health -p ./src              # Scan specific path
ally health -s wcag21aa           # Use specific standard
ally health -i .ally/scan.json    # Use existing scan results
```

## `ally completion`

Generate shell completion scripts for tab completion of commands and options.

```bash
ally completion bash >> ~/.bashrc    # Bash completion
ally completion zsh >> ~/.zshrc      # Zsh completion
ally completion fish > ~/.config/fish/completions/ally.fish
```

