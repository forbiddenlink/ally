# ally (ally-a11y)

Accessibility CLI, published under the npm package name `ally-a11y`: scans, explains, and auto-fixes a11y
issues (axe-core + Puppeteer), with impact scoring, pattern-learning auto-fix, and a
GitHub Copilot CLI / MCP integration. Also ships as a GitHub Action (`action.yml`).
Repo: github.com/forbiddenlink/ally.

## Stack

- TypeScript (`type: module`), Commander.js CLI, Node >= 20.17
- `@axe-core/puppeteer`, `axe-core`, `pa11y`, `puppeteer` for scanning
- `@octokit/rest` (PR checks), `simple-git`, `chokidar` (watch mode)
- pnpm-managed workspace, root CLI + `mcp-server/` (`ally-mcp-server`, `@modelcontextprotocol/sdk`)
- Biome for lint/format (`biome.json`); `pnpm lint` is actually `tsc --noEmit`
  (typecheck), not Biome or ESLint
- Tests: Node's built-in test runner (`node --test`) via `tsx`, coverage via `c8`

## Commands

```bash
pnpm install
pnpm run build:all      # tsc (root) + build the mcp-server workspace package
pnpm test               # node --test --import tsx test/*.test.ts
pnpm test:coverage
pnpm test:coverage:check  # c8 check-coverage: 70% lines/functions, 60% branches
pnpm test:e2e            # test/e2e/*.test.ts
pnpm run lint            # tsc --noEmit
pnpm biome:check
pnpm biome:fix
pnpm run check            # biome:check && lint && test && build
pnpm run benchmark        # benchmark/scan-speed.ts
node dist/cli.js scan test-fixtures
```

Package manager is pnpm, defined by the workspace config file. `mcp-server/` is a
workspace package - never install into it with a different package manager. Build it
via `pnpm --filter ally-mcp-server build` or `pnpm run build:all`.

## Layout

- `src/cli.ts` - Commander entry point; compiles to `dist/cli.js` (the published `ally` bin)
- `src/commands/` - one file per subcommand (19 total): `scan.ts`, `watch.ts`, `fix.ts`,
  `crawl.ts`, `scan-storybook.ts`, `tree.ts`, `explain.ts`, `learn.ts`, `triage.ts`,
  `report.ts`, `history.ts`, `stats.ts`, `badge.ts`, `pr-check.ts`, `audit-palette.ts`,
  `init.ts`, `doctor.ts`, `health.ts`, `completion.ts`
- `src/utils/` - `scanner.ts`, `fix-patterns.ts` (35+ auto-fix patterns), `browser.ts`,
  `impact-scores.ts`, `vpat-mappings.ts`/`vpat-template.ts`, `history.ts`/
  `history-tracking.ts`, `baseline.ts`, `config.ts`, `exec.ts`, `ai-alt-text.ts`, `copilot.ts`
- `mcp-server/src/index.ts` - MCP server exposing project a11y patterns to Copilot CLI;
  its scan/fix tools spawn `dist/cli.js`
- `test/` - unit tests per module; `test/e2e/` - end-to-end scan/watch workflow tests
- `benchmark/scan-speed.ts` - perf benchmark (`benchmark:ci` gates on a 20% threshold)
- `.ally/` - runtime output (baseline, cache, crawl results, scan/fix history) - not source
- `.history/` - large (~4MB) local editor history directory, not part of the project

## Conventions

- One command file per `src/commands/`.
- Spawn subprocesses with an argument array (`src/utils/exec.ts`). Never `execSync` a
  string built from scan output, URLs, or repo names.
- HTML is scanned with axe directly; component files (TSX) go through
  `applyHighConfidenceSourceFixes` instead, since axe cannot load TSX as a page.

## Claude/Copilot-specific

When asked for accessibility work in this repo, use `ally` rather than re-deriving
scan logic (there is also a personal, gitignored Cursor skill with the same
guidance under .cursor/, not tracked in the repo). Scan first; do not invent WCAG
failures. Sort fixes by impact (critical/serious before moderate/minor). For
unrendered `.tsx`/`.jsx`/`.vue`/`.svelte`, either scan a running URL
(`ally scan --url`) or apply only high-confidence source fixes - axe needs HTML.
`watch --fix-on-save` applies confidence >= 0.9 only.
