---
title: "Ally: The Only A11y CLI with Real-Time Auto-Fix and Impact Scoring"
published: false
description: "An accessibility CLI that scans, explains, and auto-fixes issues using GitHub Copilot CLI with industry-first impact scoring"
tags: githubchallenge, accessibility, copilot, cli
---

## What I Built

**Ally** is the only accessibility CLI with **real-time auto-fix** and **impact scoring** — two features no competitor has.

### The Problem

Developers face thousands of accessibility violations with no clear prioritization. Traditional tools dump violations without context, leaving teams paralyzed by the sheer volume. Research shows this "overwhelm" is the #1 reason accessibility work gets deprioritized.

### The Solution

```bash
# Auto-fix violations as you save files (UNIQUE)
ally watch src/ --fix-on-save

# See impact scores (0-100) showing which issues hurt users most (UNIQUE)
ally scan ./src

# Interactive fix with approval
ally fix

# Generate compliance report
ally report
```

### Two Industry-First Features

| Feature | ally | axe-cli | pa11y | Lighthouse |
|---------|------|---------|-------|------------|
| **Impact Scoring (0-100)** | Yes | No | No | No |
| **Auto-Fix on Save** | Yes | No | No | No |
| AI Fixes (35+ patterns) | Yes | No | No | No |
| MCP Integration | Yes | No | No | No |
| Watch Mode | Yes | No | No | No |

### Category Submission

Building productivity tools

## My Experience with GitHub Copilot CLI

### How I Used Copilot CLI to Build Ally

I used GitHub Copilot CLI throughout the development process:

1. **Scaffolding** - Generated the initial CLI structure with Commander.js
2. **axe-core integration** - Copilot helped write the Puppeteer + axe-core scanner
3. **MCP server** - Built the custom MCP server with Copilot's assistance
4. **TypeScript types** - Generated comprehensive type definitions

### Advanced Copilot CLI Features Used

#### 1. Agentic Mode with Approval Flow

The `ally fix` command leverages Copilot CLI's agentic mode to:

- Analyze each accessibility violation
- Generate context-aware fixes
- Show diffs for approval before applying

```bash
$ ally fix

Fixing: Button.tsx:14 — missing accessible name

  - <button onClick={handleClick}>
  + <button onClick={handleClick} aria-label="Submit form">

  Apply this fix? [Y/n/skip] y
```

#### 2. Custom MCP Server

I built a custom MCP server that provides project-specific context to Copilot:

```json
{
  "mcpServers": {
    "ally-patterns": {
      "type": "local",
      "command": "node",
      "args": ["./mcp-server/dist/index.js"]
    }
  }
}
```

**MCP Tools exposed:**

- `get_component_patterns` - Existing ARIA patterns in your codebase
- `get_design_tokens` - Color palette for WCAG-compliant contrast fixes
- `get_fix_history` - Previously applied fixes for consistency
- `get_scan_summary` - Current scan results
- `get_wcag_guideline` - Full WCAG success criterion details
- `suggest_aria_pattern` - ARIA patterns for specific component types

This ensures Copilot generates fixes that match your project's existing patterns, not generic solutions.

#### 3. Session Persistence

Scan results are persisted to `.ally/scan.json`, allowing the explain and fix commands to work on the same data without re-scanning.

### The Technical Stack

| Layer | Tool | Why |
| ----- | ---- | --- |
| CLI | Commander.js | Fast, npm-publishable |
| Scanner | axe-core + Puppeteer | Industry-standard accessibility engine |
| AI | GitHub Copilot CLI | Agentic mode with file edits |
| Context | Custom MCP Server | Project-specific patterns |
| UX | chalk + ora + boxen | Polished terminal output |

## Impact

**Why accessibility matters:**

- 95.9% of top 1 million websites have WCAG failures
- 1 billion people worldwide have disabilities
- ADA lawsuits increased 400% from 2017-2023
- WCAG compliance is legally required in many countries

**What ally solves:**

- **Eliminates overwhelm** - Impact scoring shows what to fix first
- **Zero-friction fixes** - Auto-fix on save means no backlog accumulation
- **Pattern consistency** - MCP server ensures fixes match your codebase
- **Compliance documentation** - Generate reports for audits

## Full Command Reference

```bash
ally scan ./src              # Scan with impact scoring
ally watch --fix-on-save     # Auto-fix as you code
ally history                 # View progress over time
ally fix                     # Interactive fix approval
ally explain                 # WCAG explanations
ally report                  # Generate reports (MD/HTML/JSON/SARIF)
ally triage                  # Prioritize violations interactively
ally crawl <url>             # Multi-page website scanning
ally pr-check                # Post results to GitHub PRs
ally badge                   # Generate accessibility badges
ally learn <topic>           # Educational WCAG explainer
ally tree <url>              # View accessibility tree
ally doctor                  # Diagnose setup issues
```

## Try It Yourself

```bash
# Install
npm install -g ally-a11y

# Initialize in your project
ally init

# Scan your project
ally scan ./src

# See what's wrong
ally explain

# Fix with AI assistance
ally fix

# Generate report
ally report
```

**Requirements:**

- Node.js 18+
- GitHub Copilot CLI (optional, for AI-powered explain/fix)

## Links

- **GitHub:** [github.com/lizthegrey/ally](https://github.com/lizthegrey/ally)
- **npm:** [npmjs.com/package/ally-a11y](https://npmjs.com/package/ally-a11y)

---

*Built for the [GitHub Copilot CLI Challenge](https://dev.to/challenges/github-2026-01-21)*
