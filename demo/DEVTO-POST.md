---
title: "I Built an AI-Powered Accessibility CLI That Actually Fixes Your Code"
published: false
description: "Meet Ally - a CLI that scans, explains, and fixes accessibility issues using GitHub Copilot CLI. No more guessing at WCAG compliance."
tags: githubcopilotchallenge, accessibility, typescript, cli
cover_image: https://dev-to-uploads.s3.amazonaws.com/uploads/articles/ally-cover.png
---

**98% of websites fail basic accessibility standards.** That's over a billion people who can't fully use the web. As developers, we know we *should* care about accessibility—but let's be honest, WCAG guidelines are dense, and fixing violations feels like a chore.

What if there was a tool that could **find issues, explain them in plain English, and fix them automatically**—all from your terminal?

Meet **Ally**, your codebase's accessibility companion.

## What is Ally?

Ally is a CLI tool that combines [axe-core](https://github.com/dequelabs/axe-core) (the industry-standard accessibility engine) with GitHub Copilot CLI's agentic mode to:

1. **Scan** - Find accessibility violations in HTML files or live URLs
2. **Explain** - Get plain-language explanations of what's wrong and why it matters
3. **Fix** - Apply AI-generated fixes with your approval
4. **Report** - Generate documentation for stakeholders

```bash
npm install -g ally-a11y
```

## The Problem I Solved

I've been building web apps for years, and accessibility always felt like an afterthought. I'd run an audit, get a wall of cryptic errors, Google each one, and manually fix them. Hours later, I'd still miss something.

The existing tools are great at *finding* issues, but terrible at *explaining* and *fixing* them. That's where Ally comes in.

## Quick Demo

Here's what using Ally looks like:

### Scan for Issues

```bash
$ ally scan ./src
```

```
   __ _  | | _   _
  / _` | | || | | |
 | (_| | | || |_| |
  \__,_| |_| \__, |
             |___/  v1.0.0

✔ Found 3 HTML files
✔ Scanned 3 files

📄 index.html - 4 issues found
  [!!!] CRITICAL: Images must have alternative text
  [!!]  SERIOUS:  Color contrast ratio too low
  [!!]  SERIOUS:  Form inputs must have labels
  [!]   MODERATE: HTML must have lang attribute

   ╭───────── Scan Results ─────────╮
   │   Accessibility Score: 42/100  │
   │   !!! CRITICAL: 1              │
   │   !!  SERIOUS:  2              │
   │   !   MODERATE: 1              │
   ╰────────────────────────────────╯
```

### Explain in Plain English

Don't know what "WCAG 1.1.1 Non-text Content" means? Neither did I.

```bash
$ ally explain
```

```
image-alt: Images must have alternate text

Why this matters:
Screen readers announce images to blind users. Without alt text,
they hear "image" with no context. Your hero image could be
describing your product—but right now it's invisible to 15% of users.

Who this affects:
• Blind users using screen readers (NVDA, JAWS, VoiceOver)
• Users with images disabled (slow connections)
• Search engines indexing your content

How to fix:
Add descriptive alt text that conveys the image's purpose.

WCAG Reference: 1.1.1 Non-text Content (Level A)
```

### Fix with AI

This is where it gets magical:

```bash
$ ally fix
```

```
Ally A11y Fixer (via GitHub Copilot)

╭────────────────────────────────────────────────╮
│ Fix 1 of 4: image-alt                          │
├────────────────────────────────────────────────┤
│                                                │
│  - <img src="hero.jpg">                        │
│  + <img src="hero.jpg"                         │
│  +   alt="Team collaborating in office">      │
│                                                │
╰────────────────────────────────────────────────╯
Apply this fix? [Y]es / [n]o / [s]kip / [q]uit: y
✓ Fix applied

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✓ 4 fixes applied successfully!
  Score improved: 42 → 92 (+50 points!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Key feature:** You approve each fix individually. No black-box automation—you're always in control.

## What Makes Ally Different?

### 1. MCP Server Integration

This is the secret sauce. Ally includes a Model Context Protocol (MCP) server that gives Copilot **deep context about your project**:

```json
// .copilot/mcp-config.json
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
| `get_component_patterns` | Analyzes ARIA patterns in your codebase |
| `get_design_tokens` | Extracts colors and checks contrast |
| `get_fix_history` | Remembers previous fixes for consistency |
| `get_scan_summary` | Current accessibility state |
| `get_wcag_guideline` | Full WCAG criterion details |
| `suggest_aria_pattern` | ARIA patterns for 8 component types |
| `check_color_contrast` | Calculate contrast with AA/AAA pass/fail |

This means Copilot's fixes **match your codebase conventions**, not generic suggestions.

### 2. GitHub Code Scanning Integration

Export to SARIF format for GitHub's security tab:

```bash
ally scan ./src --format sarif > results.sarif
```

Accessibility issues appear alongside security vulnerabilities in your PRs.

### 3. Color Blindness Simulation

See your site as users with color vision deficiencies see it:

```bash
ally scan --url https://example.com --simulate deuteranopia
```

This takes a screenshot simulating red-green color blindness.

### 4. Multi-Page Crawling

Scan your entire site, not just one page:

```bash
ally crawl https://example.com --depth 3 --limit 50
```

### 5. Educational Content

Don't just fix issues—understand them:

```bash
$ ally learn color-contrast

╭──────────────── color-contrast ────────────────╮
│                                                │
│   Color Contrast Requirements                  │
│                                                │
│   WCAG Criterion: 1.4.3 Contrast (Minimum)     │
│   Level: AA                                    │
│                                                │
╰────────────────────────────────────────────────╯

Normal text: 4.5:1 minimum contrast ratio
Large text (18pt+): 3:1 minimum contrast ratio

Why it matters:
Low contrast text is difficult to read for users with
low vision, color blindness, or in bright environments...
```

## CI/CD Integration

Add Ally to your GitHub Actions:

```yaml
# .github/workflows/a11y.yml
name: Accessibility Check

on: [push, pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install -g ally-a11y
      - run: ally scan ./dist --threshold 80
```

Or add a pre-commit hook:

```bash
ally init --hooks
```

## The Full Command List

| Command | Description |
|---------|-------------|
| `ally scan` | Scan files or URLs for violations |
| `ally explain` | AI-powered explanations |
| `ally fix` | Apply fixes with approval flow |
| `ally report` | Generate ACCESSIBILITY.md |
| `ally stats` | Progress dashboard |
| `ally badge` | Generate score badges for README |
| `ally watch` | Continuous testing during dev |
| `ally learn` | WCAG educational content |
| `ally crawl` | Multi-page site scanning |
| `ally tree` | Accessibility tree visualization |
| `ally init` | Project initialization |

## Why Accessibility Matters

- **Legal compliance:** ADA, Section 508, and EAA require accessible websites
- **Market reach:** 1+ billion people have disabilities—that's a huge market
- **SEO benefits:** Accessibility improvements often boost search rankings
- **Better UX:** Accessible sites are better for everyone

## Get Started

```bash
# Install globally
npm install -g ally-a11y

# Scan your project
ally scan ./src

# See what's wrong
ally explain

# Fix it
ally fix

# Generate a report
ally report
```

## Links

- **GitHub:** [github.com/lizthegrey/ally](https://github.com/lizthegrey/ally)
- **npm:** [npmjs.com/package/ally-a11y](https://npmjs.com/package/ally-a11y)

## Built For

This project was built for the [GitHub Copilot CLI Challenge](https://dev.to/challenges/github-2026-01-21). It demonstrates:

- **Copilot CLI integration** with agentic fix mode
- **MCP server** providing project-specific context
- **Real-world utility** solving actual developer pain

---

Let's make the web accessible for everyone.

Have questions? Drop them in the comments below.

---

*Cover image: Ally CLI scanning a website for accessibility issues*
