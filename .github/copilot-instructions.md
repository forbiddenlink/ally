# GitHub Copilot Custom Instructions for ally

This project is **ally**, an accessibility CLI tool that scans, explains, and fixes WCAG violations. When assisting with this codebase, Copilot should follow these guidelines.

## Project Context

ally combines axe-core accessibility scanning with AI-powered explanations and automated fixes. Key components:

- **src/commands/** - CLI command implementations (19 commands)
- **src/utils/** - Core utilities (scanner, fix-patterns, impact-scores)
- **mcp-server/** - MCP server providing 7 tools for Copilot context
- **test/** - Unit and E2E tests

## Accessibility-First Development

When writing or modifying code:

1. **WCAG Compliance** - All UI output must be accessible
   - Support NO_COLOR environment variable
   - Provide `--json` output for screen readers/automation
   - Use semantic structure (headers, lists) in output
   - Ensure contrast in any colored output

2. **Fix Patterns** - When adding new fix patterns to `fix-patterns.ts`:
   - Include confidence score (0.0-1.0)
   - Test both detection and transformation
   - Document WCAG criterion addressed
   - Consider false positives

3. **Impact Scoring** - When adding violations to `impact-scores.ts`:
   - Assign base score (1-100) based on user impact
   - Map to affected user groups
   - Include business context reasoning
   - Consider WCAG level (A > AA > AAA for priority)

## Code Style

- TypeScript strict mode
- ES Modules (import/export)
- Commander.js for CLI
- Puppeteer for browser automation
- Prefer composition over inheritance
- Explicit error handling with enhanced messages

## MCP Server Tools

The ally MCP server (`mcp-server/src/index.ts`) provides context:

| Tool | Purpose |
|------|---------|
| `get_component_patterns` | Analyze existing ARIA patterns |
| `get_design_tokens` | Extract colors for contrast checks |
| `get_fix_history` | Previous fixes for consistency |
| `get_scan_summary` | Current accessibility state |
| `get_wcag_guideline` | Full WCAG criterion details |
| `suggest_aria_pattern` | ARIA patterns by component type |
| `check_color_contrast` | Calculate WCAG contrast ratios |

When suggesting fixes, use these tools to ensure consistency with the codebase.

## Testing

- Unit tests in `test/*.test.ts`
- E2E tests in `test/e2e/*.test.ts`
- Run: `npm test` (unit), `npm run test:e2e` (E2E)
- Coverage: `npm run test:coverage`

## Common Tasks

### Adding a New Fix Pattern

```typescript
// In src/utils/fix-patterns.ts
{
  id: 'new-violation-id',
  detect: (html: string) => /pattern/.test(html),
  fix: (html: string) => html.replace(/old/, 'new'),
  confidence: 0.85,
  description: 'What this fixes',
}
```

### Adding a New Command

1. Create `src/commands/new-command.ts`
2. Export function matching Commander.js action signature
3. Register in `src/cli.ts`
4. Add help text with examples
5. Add tests

### Explaining a Violation

Use plain language. Structure:
1. What the issue is
2. Who it affects
3. Why it matters
4. How to fix it
5. WCAG reference

## Key Files

- `src/cli.ts` - CLI entry point, command registration
- `src/utils/scanner.ts` - axe-core integration
- `src/utils/fix-patterns.ts` - 35+ automated fix patterns
- `src/utils/impact-scores.ts` - Impact scoring engine
- `src/utils/enhanced-errors.ts` - User-friendly errors
