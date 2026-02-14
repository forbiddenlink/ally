# Ally A11y CLI - Demo Video Script

**Total Duration:** 90 seconds
**Target:** GitHub Copilot CLI Challenge submission
**Recording Date:** February 2026

---

## Pre-Recording Setup

### Quick Start
```bash
# Run the preparation script
./demo/prepare-demo.sh
```

### Manual Setup
```bash
# Clean terminal state
cd /Volumes/LizsDisk/ally
clear

# Ensure build is current
npm run build:all

# Clear history for fresh stats animation
rm -rf .ally/history.json .ally/fix-history.json

# Set terminal font size to 18-20pt for readability
# Use a dark theme (recommended: One Dark, Dracula)
# Terminal width: 100 columns, height: 30 rows
```

### Files to Have Ready
- `demo/demo-site.html` - Demo website with accessibility issues
- Browser open to GitHub Code Scanning (for SARIF scene)
- `.ally/history.json` cleared for fresh stats animation

### Recording Software
- **Recommended:** OBS Studio or ScreenFlow
- **Resolution:** 1920x1080 (YouTube standard)
- **Frame rate:** 30fps
- **Audio:** Record narration separately, add in post

---

## Scene 1: Hook (0:00 - 0:10)

### Visual
Terminal with Ally banner displayed

### Commands
```bash
ally --version
```

### Narration (10 seconds)
> "98% of websites fail accessibility standards. That's over a billion users
> who can't use the web. Meet Ally—your codebase's accessibility companion,
> powered by GitHub Copilot CLI."

### Key Visual Elements
- Ally logo/banner in terminal
- Version number visible

---

## Scene 2: The Problem (0:10 - 0:25)

### Visual
Scan revealing accessibility violations

### Commands
```bash
# Scan the demo directory with issues
ally scan ./demo
```

### Expected Output
```
   __ _  | | _   _
  / _` | | || | | |
 | (_| | | || |_| |
  \__,_| |_| \__, |
             |___/  v1.0.0

  Your codebase's accessibility ally

✔ Found 1 HTML file (using wcag22aa)
✔ Scanned 1 files

📄 demo-site.html
   6 issues found

  [!!!] CRITICAL
      Images must have alternative text
      → img[src$="hero-banner.jpg"]
      → img[src$="icon-speed.svg"]
      ... and 2 more

  [!!!] CRITICAL
      Buttons must have discernible text
      → button

  [!!] SERIOUS
      Elements must meet minimum color contrast ratio thresholds
      → 8 elements affected

  [!!] SERIOUS
      <html> element must have a lang attribute
      → html

  [!!] SERIOUS
      ARIA commands must have an accessible name
      → 3 social icon buttons

  [!!] SERIOUS
      Links must have discernible text
      → a[href$="pricing"]

   ╭───────── Scan Results ─────────╮
   │   Accessibility Score: 0/100   │
   │   !!! CRITICAL: 2              │
   │   !!  SERIOUS:  4              │
   │   Total issues: 6              │
   ╰────────────────────────────────╯
```

### Narration (15 seconds)
> "Here's a typical startup website. Looks fine visually, but watch what
> happens when we scan it with Ally. Six violations found—a score of zero.
> Images without alt text, buttons screen readers can't understand, and
> contrast issues affecting low-vision users."

### Key Visual Elements
- Severity colors (red for critical, orange for serious)
- Score of 42 prominently displayed
- Problem indicators with CSS selectors

---

## Scene 3A: The Solution - Explain (0:25 - 0:35)

### Visual
AI-powered explanation of violations

### Commands
```bash
ally explain
```

### Expected Output
```
Ally A11y Explainer (via GitHub Copilot)

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
Add descriptive alt text: <img src="hero.jpg" alt="Team collaborating
around a whiteboard">

WCAG Reference: 1.1.1 Non-text Content (Level A)
```

### Narration (10 seconds)
> "Don't know WCAG by heart? Ally explains each issue in plain language—why
> it matters, who it affects, and exactly how to fix it."

---

## Scene 3B: The Solution - Fix (0:35 - 0:55)

### Visual
Agentic fix mode with approval flow (THE WOW MOMENT)

### Commands
```bash
ally fix
```

### Expected Output
```
   __ _  | | _   _
  / _` | | || | | |
 | (_| | | || |_| |
  \__,_| |_| \__, |
             |___/  v1.0.0

Ally A11y Fixer (via GitHub Copilot)

- Analyzing violations and generating fixes...

╭────────────────────────────────────────────────╮
│ Fix 1 of 6: image-alt                          │
│ Images must have alternative text              │
├────────────────────────────────────────────────┤
│                                                │
│  - <img src="hero-banner.jpg">                 │
│  + <img src="hero-banner.jpg"                  │
│  +   alt="TechStartup hero banner showing      │
│  +   modern office workspace">                 │
│                                                │
╰────────────────────────────────────────────────╯
Apply this fix? [Y]es / [n]o / [s]kip / [q]uit: y
✓ Fix applied

╭────────────────────────────────────────────────╮
│ Fix 2 of 6: button-name                        │
│ Buttons must have discernible text             │
├────────────────────────────────────────────────┤
│                                                │
│  - <button class="cta-button"></button>        │
│  + <button class="cta-button"                  │
│  +   aria-label="Get started">                 │
│  +   Get Started                               │
│  + </button>                                   │
│                                                │
╰────────────────────────────────────────────────╯
Apply this fix? [Y]es / [n]o / [s]kip / [q]uit: y
✓ Fix applied

... (apply remaining fixes)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✓ 6 fixes applied successfully!
  Score improved: 0 → 85 (+85 points!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Narration (20 seconds)
> "Now for the magic. Ally's fix command uses Copilot's agentic mode to
> generate context-aware fixes. But here's what makes it trustworthy—you
> approve each fix individually. Y to apply, N to skip, S to see the next
> suggestion. Watch that score climb from zero to 85."

### Key Visual Elements
- Diff highlighting (red/green) in boxen frames
- Interactive prompt [Y/n/s/q] - THE WOW MOMENT
- Score animation at the end: 0 → 85
- Success checkmarks after each fix

---

## Scene 3C: The Solution - Report (0:55 - 1:05)

### Visual
Report generation and stats dashboard

### Commands
```bash
ally report
ally stats
```

### Expected Output (report)
```
Ally A11y Report Generator

Generating ACCESSIBILITY.md...

✓ Report saved to ACCESSIBILITY.md

Contents:
• Executive summary with score
• Violations by severity
• Remediation timeline
• WCAG compliance matrix
```

### Expected Output (stats)
```
┌─────────────────────────────────────────┐
│       Ally Accessibility Dashboard       │
├─────────────────────────────────────────┤
│                                         │
│  Current Score:  █████████████░░ 85%    │
│                                         │
│  Progress This Week:                    │
│  Mon ░░░░  0                            │
│  Tue ▂▂▂▂ 25                            │
│  Wed ▄▄▄▄ 52                            │
│  Thu ████ 85  ← Today                   │
│                                         │
│  Issues Fixed: 6                        │
│  Remaining:    0                        │
│                                         │
└─────────────────────────────────────────┘
```

### Narration (10 seconds)
> "Generate documentation for stakeholders with a single command. Track your
> progress over time—Ally remembers your history and celebrates your wins."

### Key Visual Elements
- Animated progress bar
- Historical chart
- boxen UI borders

---

## Scene 4: The Differentiator - MCP Server (1:05 - 1:20)

### Visual
MCP server providing project context to Copilot

### Commands
```bash
# Show MCP config
cat .copilot/mcp-config.json

# Demonstrate MCP-powered context
ally scan demo/demo-site.html --json | head -20
```

### Narration (15 seconds)
> "What sets Ally apart? Our MCP server gives Copilot deep project context—
> your design tokens, your component patterns, your fix history. Seven tools
> that make Copilot's fixes match YOUR codebase, not generic suggestions."

### Key Visual Elements
- MCP config file shown
- List of 7 tools flashing:
  - get_component_patterns
  - get_design_tokens
  - get_fix_history
  - get_scan_summary
  - get_wcag_guideline
  - suggest_aria_pattern
  - check_color_contrast

### Optional Bonus Visual
Quick flash of these commands:
```bash
ally crawl https://example.com --depth 2
ally tree https://example.com
ally badge --format markdown
```

---

## Scene 5: Call to Action (1:20 - 1:30)

### Visual
Installation command and GitHub stars

### Commands
```bash
npm install -g ally-a11y
```

### On-Screen Text (add in post)
```
github.com/forbiddenlink/ally
npm install -g ally-a11y

Make the web accessible for everyone.
```

### Narration (10 seconds)
> "Ally. Scan, explain, fix, report. Install it today, and let's make the
> web work for everyone. Link in the description."

---

## Bonus Scenes (if time/separate video)

### Color Blindness Simulation
```bash
ally scan demo/demo-site.html --simulate deuteranopia
# Opens browser with simulated view + screenshot saved
```

### Accessibility Tree
```bash
ally tree https://example.com
# Shows hierarchical a11y tree
```

### CI Integration
```bash
ally scan ./src --format sarif > results.sarif
# Show results.sarif briefly
# Cut to GitHub Code Scanning UI with violations displayed
```

---

## Post-Production Notes

### Audio
- Background music: Upbeat, optimistic, royalty-free
- Recommended: Epidemic Sound or Artlist subscription
- Mix: Music at 20%, voice at 100%

### Text Overlays
- Add captions for accessibility (practice what we preach!)
- Scene titles in bottom-left
- Key stats in corner callouts

### Transitions
- Quick cuts between commands (no slow fades)
- Speed up typing if needed (1.5x)
- Keep terminal output on screen for 2-3 seconds to read

### Thumbnail
- "ALLY" in large text
- Accessibility icon (universal access symbol)
- "Fix A11y with AI" tagline
- Score badge showing improvement: 0 → 85

---

## Recording Checklist

- [ ] Terminal font size increased
- [ ] Demo site file ready
- [ ] Clean .ally/history.json
- [ ] Build is current (`npm run build:all`)
- [ ] Quiet recording environment
- [ ] Screen recording started
- [ ] Audio recording ready
- [ ] Timer visible (for pacing)
- [ ] Practice run completed

---

## Timing Reference

| Scene | Start | End | Duration | Content |
|-------|-------|-----|----------|---------|
| 1 | 0:00 | 0:10 | 10s | Hook - "98% of websites fail" |
| 2 | 0:10 | 0:25 | 15s | Problem - Scan reveals issues |
| 3A | 0:25 | 0:35 | 10s | Explain command |
| 3B | 0:35 | 0:55 | 20s | Fix with approval flow |
| 3C | 0:55 | 1:05 | 10s | Report + Stats |
| 4 | 1:05 | 1:20 | 15s | MCP differentiator |
| 5 | 1:20 | 1:30 | 10s | CTA |

**Total: 90 seconds**
