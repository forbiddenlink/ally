---
title: "I Built an AI-Powered Accessibility CLI That Actually Fixes Your Code"
published: false
description: "Meet Ally - a CLI that scans, explains, and fixes accessibility issues using GitHub Copilot CLI. No more guessing at WCAG compliance."
tags: githubcopilotclichallenge, accessibility, typescript, cli
cover_image: https://dev-to-uploads.s3.amazonaws.com/uploads/articles/ally-cover.png
---

**98% of websites fail basic accessibility standards.** That's over a billion people who can't fully use the web.

As developers, we know we *should* care about accessibility—but WCAG guidelines are dense, and fixing violations feels like a chore. What if there was a tool that could **find issues, explain them in plain English, and fix them automatically**—all from your terminal?

Meet **Ally**, your codebase's accessibility companion.

```bash
npm install -g ally-a11y
```

---

## Two Features No Other Tool Has

### 1. Real-Time Auto-Fix on Save

**Fixes accessibility issues as you save files** — zero manual intervention.

```bash
$ ally watch src/ --fix-on-save

✓ Auto-fix: ON (confidence ≥ 90%)
📄 Button.tsx changed
   ✓ Auto-applied 2 fixes
   • <button> → <button aria-label="Submit">
   • <img> → <img alt="Logo">

Score: 62 → 100 ✨
```

No other accessibility tool does this. Not axe-cli. Not pa11y. Not Lighthouse.

### 2. Impact Scoring (Industry-First)

**Shows which violations actually hurt users** — eliminates overwhelm.

```
[!!!] CRITICAL Impact: 96/100 (WCAG A)
    Links must have discernible text
    💡 Users cannot navigate your site
    👥 Affects: Screen reader users, Voice control users
    📊 Estimated: 15-20% of users
```

Instead of treating all violations equally, ally prioritizes by **real user impact**. Fix the highest-score issues first.

---

## How I Built This with Copilot CLI

GitHub Copilot CLI was instrumental in building ally. Here's how:

### Generating Fix Patterns

When I needed to create 35+ automated fix patterns, Copilot helped me think through edge cases:

```bash
gh copilot explain "What edge cases should I handle when adding
aria-label to a button that already has visible text?"
```

Copilot's response taught me about the `aria-labelledby` pattern and when to prefer it over `aria-label`—knowledge I turned into smarter fix patterns.

### Writing axe-core Integrations

The axe-core API documentation is extensive. Instead of reading it all:

```bash
gh copilot suggest "puppeteer code to run axe-core on a page
and filter results by WCAG level"
```

This saved hours of trial and error.

### Understanding WCAG Requirements

When writing the `ally learn` command, I used Copilot to translate WCAG jargon:

```bash
gh copilot explain "Explain WCAG 2.4.7 Focus Visible in
plain language for developers"
```

The plain-language explanations in ally are directly informed by these conversations.

### Debugging Complex Scenarios

When my color contrast checker was giving wrong results:

```bash
gh copilot explain "Why might APCA and WCAG 2.x give different
contrast pass/fail results?"
```

This led me to implement both algorithms and add experimental APCA support.

---

## What is Ally?

Ally combines [axe-core](https://github.com/dequelabs/axe-core) (the industry-standard accessibility engine) with GitHub Copilot CLI's agentic mode:

1. **Scan** - Find accessibility violations in HTML files or live URLs
2. **Explain** - Get plain-language explanations of what's wrong
3. **Fix** - Apply AI-generated fixes with your approval
4. **Report** - Generate documentation for stakeholders

### Quick Demo

```bash
$ ally scan ./src
```

```
   __ _  | | _   _
  / _` | | || | | |
 | (_| | | || |_| |
  \__,_| |_| \__, |
             |___/  v1.0.0

✔ Found 47 HTML files
✔ Scanned 47 files

📄 Button.tsx
   [!!!] CRITICAL Impact: 98/100 (WCAG A)
       Buttons must have discernible text
       💡 Users cannot activate buttons
       👥 Affects: Screen reader users, Voice control users
       📊 Estimated: 15-20% of users

   ╭───────── Scan Results ─────────╮
   │   Accessibility Score: 62/100  │
   │   !!! CRITICAL: 3              │
   │   !!  SERIOUS:  5              │
   ╰────────────────────────────────╯
```

### Interactive Fix

```bash
$ ally fix
```

```
📝 Fixing: Button.tsx:14 — missing accessible name

  - <button onClick={handleClick}>
  + <button onClick={handleClick} aria-label="Submit form">

  Apply this fix? [Y/n/skip] y ✓

✅ Fixed 3/3 critical issues. Score: 62 → 78/100
```

---

## The Secret Sauce: MCP Server

Ally includes a Model Context Protocol (MCP) server that gives Copilot **deep context about your project**:

```json
{
  "mcpServers": {
    "ally": {
      "command": "node",
      "args": ["./node_modules/ally-a11y/mcp-server/dist/index.js"]
    }
  }
}
```

The MCP server provides **7 specialized tools**:

| Tool | What It Does |
|------|--------------|
| `get_component_patterns` | Analyzes existing ARIA patterns in your codebase |
| `get_design_tokens` | Extracts colors and checks contrast |
| `get_fix_history` | Remembers previous fixes for consistency |
| `get_scan_summary` | Current accessibility state |
| `get_wcag_guideline` | Full WCAG criterion details |
| `suggest_aria_pattern` | ARIA patterns for 8 component types |
| `check_color_contrast` | Calculate contrast with AA/AAA pass/fail |

This means Copilot's fixes **match your codebase conventions**, not generic suggestions.

---

## Progress Tracking with Sparklines

Track your accessibility journey over time:

```bash
$ ally history

╭────── 📊 Accessibility Progress ──────╮
│                                       │
│   Current Score: 85/100 +12           │
│   Trend: ↗ improving                  │
│   Streak: 5 scans improving           │
│                                       │
╰───────────────────────────────────────╯

Score History:
▁▂▃▄▄▅▆▆▇█
42                                    85
```

---

## 19 Commands for Every Workflow

| Command | Description |
|---------|-------------|
| `ally scan` | Scan with impact scores |
| `ally watch --fix-on-save` | Auto-fix as you code |
| `ally fix` | Interactive fix approval |
| `ally explain` | AI-powered explanations |
| `ally learn` | WCAG educational deep-dives |
| `ally history` | Progress tracking with sparklines |
| `ally crawl` | Multi-page site scanning |
| `ally tree` | Accessibility tree visualization |
| `ally audit-palette` | Design system color audit |
| `ally health` | Quick accessibility check |
| `ally badge` | Generate README badges |
| `ally report` | Generate ACCESSIBILITY.md |
| `ally pr-check` | Post results to GitHub PRs |
| `ally triage` | Interactive prioritization |
| `ally stats` | Progress dashboard |
| `ally doctor` | Diagnose setup issues |
| `ally init` | Project initialization |
| `ally scan-storybook` | Scan Storybook components |
| `ally completion` | Shell tab completion |

---

## CI/CD Integration

### GitHub Action

```yaml
- uses: lizthegrey/ally-action@v1
  with:
    path: ./dist
    fail-on-regression: true
    compare-baseline: true
```

### Baseline Regression Detection

```bash
# Set baseline on main branch
ally scan ./src --baseline

# On feature branches, detect regressions
ally scan ./src --compare-baseline --fail-on-regression
```

---

## Why I Built This

I've been building web apps for years, and accessibility always felt like an afterthought. I'd run an audit, get a wall of cryptic errors, Google each one, and manually fix them.

Existing tools are great at *finding* issues, but terrible at *explaining* and *fixing* them.

Ally is different:
- **Impact scoring** tells you what to fix first
- **Auto-fix on save** eliminates the backlog
- **Educational content** teaches you why it matters
- **MCP integration** makes Copilot fixes project-aware

---

## Get Started

```bash
# Install globally
npm install -g ally-a11y

# Initialize
ally init

# Scan
ally scan ./src

# Fix interactively
ally fix

# Or auto-fix while coding
ally watch src/ --fix-on-save
```

---

## Links

- **GitHub:** [github.com/lizthegrey/ally](https://github.com/lizthegrey/ally)
- **npm:** [npmjs.com/package/ally-a11y](https://npmjs.com/package/ally-a11y)

---

This project was built for the [GitHub Copilot CLI Challenge](https://dev.to/challenges/github-2026-01-21). It demonstrates:

- **Deep Copilot CLI integration** — MCP server, agentic fix mode, custom agent profile
- **Exceptional UX** — impact scoring, auto-fix, progress tracking
- **Real innovation** — two industry-first features

Let's make the web accessible for everyone.

Have questions? Drop them in the comments below!
