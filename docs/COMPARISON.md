# How ally compares

Back to the [README](../README.md).

Feature comparison. The ally column is checked against this repo. The other columns are not re-verified; check each tool's docs before relying on them (as of 2026-11-15).

| Feature | ally | axe-cli | pa11y | Lighthouse |
|---------|------|---------|-------|------------|
| **Impact Scoring (0-100)** | ✅ | ❌ | ❌ | ❌ |
| **Auto-Fix on Save** | ✅ | ❌ | ❌ | ❌ |
| **Business Context** | ✅ | ❌ | ❌ | ❌ |
| **User Impact %** | ✅ | ❌ | ❌ | ❌ |
| Scan | ✅ | ✅ | ✅ | ✅ |
| Pattern-based fixes (40 patterns) | ✅ | ❌ | ❌ | ❌ |
| MCP Integration | ✅ | ❌ | ❌ | ❌ |
| Watch Mode | ✅ | ❌ | ❌ | ❌ |
| SARIF/JUnit/CSV Output | ✅ | ❌ | ✅ | ❌ |
| Report Generation | ✅ | ❌ | ❌ | ✅ |
| Badge Generation | ✅ | ❌ | ❌ | ❌ |
| Interactive Triage | ✅ | ❌ | ❌ | ❌ |
| Multi-page Crawl | ✅ | ❌ | ✅ | ✅ |
| GitHub PR Integration | ✅ | ❌ | ❌ | ❌ |
| Incremental Caching | ✅ | ❌ | ❌ | ❌ |

**What ally provides:**
1. **Impact Scoring** — Prioritizes violations by impact (0-100 scores) and the user groups affected
2. **Auto-Fix on Save** — Applies high-confidence fixes as you save (`ally watch --fix-on-save`)
3. **Business Context** — Explains WHY violations matter, not just WHAT is wrong
4. **Developer Focus** — Designed to eliminate overwhelm with smart prioritization

