# ally

> Your codebase's accessibility ally. Scans, explains, and fixes a11y issues using GitHub Copilot CLI.

![Accessibility](https://img.shields.io/badge/a11y-first-blue)
![Built with Copilot CLI](https://img.shields.io/badge/built%20with-Copilot%20CLI-purple)
![npm](https://img.shields.io/npm/v/ally-a11y)

## What It Does

```
ally scan ./src          →  Finds issues (contrast, alt, ARIA, keyboard)
ally explain             →  Copilot explains each issue + impact
ally fix                 →  Copilot generates fixes, you approve each
ally report              →  Generates ACCESSIBILITY.md report card
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
```

**Creates:**
- `.ally/` directory for scan results
- `.copilot/mcp-config.json` for Copilot CLI integration

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
```

**CI Integration:**
```yaml
# GitHub Actions example
- run: ally scan ./src --threshold 0
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

## Why Ally?

| Feature | ally | axe-cli | pa11y |
|---------|------|---------|-------|
| Scan | ✅ | ✅ | ✅ |
| AI Explanations | ✅ | ❌ | ❌ |
| AI Fixes | ✅ | ❌ | ❌ |
| Approval Flow | ✅ | ❌ | ❌ |
| MCP Integration | ✅ | ❌ | ❌ |
| Report Generation | ✅ | ❌ | ❌ |

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
