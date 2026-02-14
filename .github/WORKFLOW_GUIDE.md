# Ally GitHub Action - Workflow Guide

Complete guide to using the enhanced Ally GitHub Action with Quick Wins features for accessibility scanning in CI/CD pipelines.

## Table of Contents

1. [Setup](#setup)
2. [Basic Usage](#basic-usage)
3. [Quick Wins Features](#quick-wins-features)
4. [Real-World Examples](#real-world-examples)
5. [Reference](#reference)

## Setup

### Installation

Add Ally to your `.github/workflows/ally.yml`:

```yaml
name: Accessibility Check
on: [pull_request, push]

jobs:
  a11y:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - uses: ally-ai/ally@v1
        with:
          path: ./src
```

### Initial Configuration

1. **Create a baseline** on your main branch:
   ```yaml
   - uses: ally-ai/ally@v1
     with:
       path: ./src
       baseline: true
   ```

2. **Enable regressions detection** on PRs (once baseline exists):
   ```yaml
   - uses: ally-ai/ally@v1
     with:
       path: ./src
       compare-baseline: true
       fail-on-regression: true
   ```

## Basic Usage

### Simple Threshold Check

Scan for violations and fail if any critical issues found:

```yaml
- name: Accessibility Check
  uses: ally-ai/ally@v1
  with:
    path: ./src
    threshold: 0
    fail-on: critical
```

### Ignore Violations Below Threshold

Allow minor violations but fail on serious issues:

```yaml
- name: Accessibility Check
  uses: ally-ai/ally@v1
  with:
    path: ./src
    threshold: 10  # Allow up to 10 violations
    fail-on: serious,critical
```

## Quick Wins Features

### 1. Large Project Optimization (`max-files`)

Limit scanning to first N files for faster feedback on large projects:

```yaml
- name: Quick Scan
  uses: ally-ai/ally@v1
  with:
    path: ./src
    max-files: 100  # Scan only first 100 files
```

**When to use:**
- Monorepos with 1000+ components
- Need fast CI feedback (< 1 minute)
- Want quick validation before full scan
- Example: React Native/Flutter projects with 500+ screens

**Performance impact:**
- 100 files: ~30s
- 500 files: ~2m
- 1000+ files: ~5-10m (with max-files: 500)

### 2. Baseline & Regression Detection

#### Establish Baseline

Set the current scan as your accessibility baseline:

```yaml
- name: Set Accessibility Baseline
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  uses: ally-ai/ally@v1
  with:
    path: ./src
    baseline: true
```

#### Check for Regressions

Compare current scan against the saved baseline:

```yaml
- name: Check for Regressions
  uses: ally-ai/ally@v1
  id: regression
  with:
    path: ./src
    compare-baseline: true
    fail-on-regression: true
```

**Regression detection shows:**
- ✅ Files with improved accessibility
- ⚠️ Files where accessibility declined
- 📊 Score improvements/declines per file

#### Conditional Failure

Only fail if there are actual regressions (improvements don't block merge):

```yaml
- name: Check Regressions
  id: check
  uses: ally-ai/ally@v1
  with:
    path: ./src
    compare-baseline: true
  continue-on-error: true

- name: Fail on Regression
  if: failure() && steps.check.outputs.regressed > 0
  run: exit 1
```

### 3. Combined Workflow

Use all Quick Wins together for comprehensive CI coverage:

```yaml
- name: Quick Validation (First 100 files)
  uses: ally-ai/ally@v1
  with:
    path: ./src
    max-files: 100           # Fast feedback
    threshold: 5             # Allow minor issues
    fail-on: serious

- name: Regression Check (vs baseline)
  if: github.event_name == 'pull_request'
  uses: ally-ai/ally@v1
  with:
    path: ./src
    compare-baseline: true    # Compare to main branch baseline
    fail-on-regression: true  # Block if accessibility declined

- name: Full Scan (Only on merge)
  if: github.ref == 'refs/heads/main'
  uses: ally-ai/ally@v1
  with:
    path: ./src
    baseline: true             # Update baseline
    threshold: 0               # No violations allowed on main
```

## Real-World Examples

### Example 1: PR Validation with Regression Detection

```yaml
name: A11y Check
on: pull_request

jobs:
  accessibility:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      
      - name: Scan & Check Regressions
        id: a11y
        uses: ally-ai/ally@v1
        with:
          path: ./src
          compare-baseline: true
          fail-on-regression: true
        continue-on-error: true
      
      - name: Comment Results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const score = '${{ steps.a11y.outputs.score }}' || 'N/A';
            const improved = '${{ steps.a11y.outputs.improved }}' || '0';
            const regressed = '${{ steps.a11y.outputs.regressed }}' || '0';
            
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## ♿ Accessibility\n\n✅ Score: ${score}\n📈 Improved: ${improved}\n⚠️ Regressed: ${regressed}`
            });
```

### Example 2: Monorepo with Progressive Scanning

```yaml
name: Large Project A11y Scan
on: [pull_request, push]

jobs:
  quick-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      
      - name: Quick Scan (First 200 files)
        uses: ally-ai/ally@v1
        with:
          path: ./src
          max-files: 200
          threshold: 10
          fail-on: serious,critical
  
  full-scan:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    needs: quick-check
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      
      - name: Full Accessibility Scan
        uses: ally-ai/ally@v1
        with:
          path: ./src
          baseline: true  # Update baseline after full scan
          threshold: 0
```

### Example 3: Parallel Chunk Processing

For very large projects (5000+ files), scan in parallel chunks:

```yaml
name: Parallel A11y Scan
on: push

jobs:
  scan:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        chunk: [1, 2, 3, 4, 5]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      
      - name: Scan Chunk ${{ matrix.chunk }}
        uses: ally-ai/ally@v1
        with:
          path: ./src
          max-files: 1000
          threshold: 10

  aggregate:
    runs-on: ubuntu-latest
    needs: scan
    steps:
      - name: Set Full Baseline
        uses: ally-ai/ally@v1
        with:
          path: ./src
          baseline: true
```

### Example 4: Smart Scanning Based on Changes

```yaml
name: Smart A11y Check
on: pull_request

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      
      - name: Get Changed Files
        id: files
        run: |
          COUNT=$(git diff --name-only origin/main | wc -l)
          echo "count=$COUNT" >> $GITHUB_OUTPUT
      
      - name: Quick Scan (Few Changes)
        if: steps.files.outputs.count < 20
        uses: ally-ai/ally@v1
        with:
          path: ./src
          max-files: 100
          compare-baseline: true
          fail-on-regression: true
      
      - name: Full Scan (Many Changes)
        if: steps.files.outputs.count >= 20
        uses: ally-ai/ally@v1
        with:
          path: ./src
          compare-baseline: true
          fail-on-regression: true
```

## Reference

### Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | string | required | Directory to scan for accessibility issues |
| `threshold` | number | 0 | Max violations allowed before failure |
| `fail-on` | string | 'critical' | Fail on violations: `critical,serious,moderate` |
| `baseline` | boolean | false | Save current scan as baseline |
| `compare-baseline` | boolean | false | Compare to saved baseline |
| `fail-on-regression` | boolean | false | Fail if accessibility regresses |
| `max-files` | number | 0 (unlimited) | Limit scan to first N files |

### Outputs

| Output | Type | Description |
|--------|------|-------------|
| `score` | number | Overall accessibility score (0-100) |
| `violations` | number | Total accessibility violations found |
| `improved` | number | Files with improved accessibility (when comparing baseline) |
| `regressed` | number | Files with regressed accessibility (when comparing baseline) |
| `scanned` | number | Number of files scanned |

### Environment Variables

No additional environment variables required. Action uses `GITHUB_TOKEN` by default for PR comments.

## Tips & Best Practices

### ⚡ Performance Optimization

1. **Use `max-files` for PRs**, full scan on main branch:
   ```yaml
   max-files: ${{ github.event_name == 'pull_request' && 100 || 0 }}
   ```

2. **Cache results** to speed up subsequent runs:
   ```yaml
   - uses: actions/cache@v4
     with:
       path: .ally/
       key: ally-${{ github.ref }}
   ```

3. **Run in parallel** for large projects with matrix strategy

### 🎯 Effective Regression Detection

1. **Set baseline once** on main branch, then keep it updated
2. **Use `fail-on-regression: true`** to prevent accessibility decline
3. **Allow improvements** past the threshold (improvements don't block merge)
4. **Review regressed files** in PR comments before merging

### 📊 Reporting & Notifications

1. **Post results to PR** with GitHub Script (see Example 1)
2. **Upload artifact** for historical tracking:
   ```yaml
   - uses: actions/upload-artifact@v4
     with:
       name: a11y-report-${{ github.run_number }}
       path: .ally/ACCESSIBILITY.md
   ```

3. **Slack notifications** (with workflow status):
   ```yaml
   - uses: slackapi/slack-github-action@v1
     with:
       webhook-url: ${{ secrets.SLACK_WEBHOOK }}
       payload: |
         {
           "text": "A11y Check: ${{ steps.a11y.outputs.score }}/100"
         }
   ```

### 🔧 Troubleshooting

**Action not finding files:**
- Check `path` parameter matches your directory structure
- Use `ls -la` in workflow to debug directory layout

**Baseline not saving:**
- Ensure `baseline: true` runs on main branch after merge
- Check workflow permissions (needs write access)

**False regressions:**
- Increase `threshold` if expected minor issue variations
- Review baseline with `git diff .ally/`

## Questions?

See [README.md](../README.md) for comprehensive documentation and additional examples.
