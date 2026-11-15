# Performance and baselines

Back to the [README](../README.md).

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


## MCP server

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

