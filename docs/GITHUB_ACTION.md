# GitHub Action

Back to the [README](../README.md).

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
| `path` | string | `.` | Path to scan |
| `threshold` | number | 0 | Max violations before failure |
| `url` | string | (none) | URL to scan instead of files |
| `output` | string | `.ally` | Output directory for reports |
| `max-files` | number | (none) | Limit scan to first N files (Quick Win) |
| `baseline` | boolean | false | Save as baseline for regression tracking (Quick Win) |
| `compare-baseline` | boolean | false | Compare against saved baseline (Quick Win) |
| `fail-on-regression` | boolean | false | Fail if accessibility regresses (Quick Win) |

`threshold` is a raw violation count. Severity-based filtering
(`ally scan --fail-on critical`) is a CLI-only flag; the Action does not currently
expose it as an input.

**Output Reference:**

| Output | Type | Description |
|--------|------|-------------|
| `score` | number | Overall accessibility score (0-100) |
| `violations` | number | Total accessibility violations found |
| `report` | string | Path to the generated report |
| `improved` | number | Files with improved accessibility (when comparing baseline) |
| `regressed` | number | Files with regressed accessibility (when comparing baseline) |

**📚 Workflow Documentation:**
- [Ally Workflow Guide](../.github/WORKFLOW_GUIDE.md) — Complete guide with real-world examples
- [Example Workflows](../.github/workflows/ally-a11y.yml) — 5 production-ready workflow templates
  - Basic PR validation with regressions
  - Large project with file limiting
  - Monorepo with progressive scanning
  - Parallel chunk processing
  - Smart scanning based on changes

