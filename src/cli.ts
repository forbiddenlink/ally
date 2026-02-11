#!/usr/bin/env node

/**
 * ally - Your codebase's accessibility ally
 *
 * Scans, explains, and fixes accessibility issues using GitHub Copilot CLI.
 */

import { Command } from 'commander';
import { createRequire } from 'module';

// Read version from package.json to stay in sync
const require = createRequire(import.meta.url);
const { version } = require('../package.json');
import { scanCommand } from './commands/scan.js';
import { explainCommand } from './commands/explain.js';
import { fixCommand } from './commands/fix.js';
import { reportCommand } from './commands/report.js';
import { initCommand } from './commands/init.js';
import { statsCommand } from './commands/stats.js';
import { badgeCommand } from './commands/badge.js';
import { watchCommand } from './commands/watch.js';
import { learnCommand } from './commands/learn.js';
import { crawlCommand } from './commands/crawl.js';
import { treeCommand } from './commands/tree.js';
import { triageCommand } from './commands/triage.js';
import { prCheckCommand } from './commands/pr-check.js';
import { completionCommand } from './commands/completion.js';

const program = new Command();

program
  .name('ally')
  .description('Your codebase\'s accessibility ally. Scans, explains, and fixes a11y issues using GitHub Copilot CLI.')
  .version(version);

// ally scan [path]
program
  .command('scan [path]')
  .description('Scan files for accessibility violations')
  .option('-o, --output <dir>', 'Output directory for results', '.ally')
  .option('-u, --url <url>', 'Scan a URL instead of files')
  .option('-j, --json', 'Output raw JSON results')
  .option('-f, --format <type>', 'Output format: json, sarif, junit, or csv')
  .option('-v, --verbose', 'Show all violations including minor ones')
  .option('-t, --threshold <number>', 'Exit with error if violations exceed threshold (for CI)')
  .option('--ci', 'CI mode: minimal output, exit code based on violations')
  .option('-F, --fail-on <severities>', 'Fail only on specified severities (comma-separated: critical,serious,moderate,minor)')
  .option('-S, --simulate <type>', 'Simulate color blindness (deuteranopia, protanopia, tritanopia)', (value: string) => {
    const valid = ['deuteranopia', 'protanopia', 'tritanopia'];
    if (!valid.includes(value)) {
      throw new Error(`Invalid simulation type: ${value}. Valid options: ${valid.join(', ')}`);
    }
    return value;
  })
  .option('-s, --standard <level>', 'WCAG standard to test against (default: wcag22aa)', (value: string) => {
    const valid = ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag21a', 'wcag21aa', 'wcag21aaa', 'wcag22aa', 'section508', 'best-practice'];
    if (!valid.includes(value)) {
      throw new Error(`Invalid standard: ${value}. Valid options: ${valid.join(', ')}`);
    }
    return value;
  })
  .option('-T, --timeout <ms>', 'Page load timeout in milliseconds (default: 30000)')
  .action(async (path: string | undefined, options) => {
    try {
      // Parse timeout if provided
      if (options.timeout !== undefined) {
        const timeout = parseInt(options.timeout, 10);
        if (isNaN(timeout) || timeout < 1000) {
          console.error('Error: --timeout must be at least 1000 (1 second)');
          process.exit(1);
        }
        options.timeout = timeout;
      }
      // Parse threshold if provided
      if (options.threshold !== undefined) {
        const threshold = parseInt(options.threshold, 10);
        if (isNaN(threshold) || threshold < 0) {
          console.error('Error: --threshold must be a non-negative number');
          process.exit(1);
        }
        options.threshold = threshold;
      }
      const report = await scanCommand(path, options);

      // CI threshold check
      if (options.threshold !== undefined && report) {
        // If --fail-on is set, filter violations before checking threshold
        let violationCount: number;
        if (options.failOn) {
          const severities = options.failOn.split(',').map((s: string) => s.trim().toLowerCase());
          const validSeverities = ['critical', 'serious', 'moderate', 'minor'];
          const invalidSeverities = severities.filter((s: string) => !validSeverities.includes(s));
          if (invalidSeverities.length > 0) {
            console.error(`Error: Invalid severity values: ${invalidSeverities.join(', ')}`);
            console.error(`Valid values are: ${validSeverities.join(', ')}`);
            process.exit(1);
          }
          // Count violations matching specified severities
          violationCount = report.results.reduce((count, result) => {
            return count + result.violations.filter(v => severities.includes(v.impact)).length;
          }, 0);
        } else {
          violationCount = report.summary.totalViolations;
        }

        if (violationCount > options.threshold) {
          const severityNote = options.failOn ? ` (filtered by: ${options.failOn})` : '';
          console.error(`\nCI FAILED: ${violationCount} violations${severityNote} exceed threshold of ${options.threshold}`);
          process.exit(1);
        }
      }
    } catch (error) {
      console.error('Scan failed:', error);
      process.exit(1);
    }
  });

// ally explain
program
  .command('explain')
  .description('Get plain-language explanations of violations using Copilot')
  .option('-i, --input <file>', 'Path to scan results', '.ally/scan.json')
  .option('-s, --severity <level>', 'Filter by severity (critical, serious, moderate, minor)')
  .option('-l, --limit <number>', 'Maximum number of issues to explain', '10')
  .action(async (options) => {
    try {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        console.error('Error: --limit must be a positive number');
        process.exit(1);
      }
      await explainCommand({
        ...options,
        limit,
      });
    } catch (error) {
      console.error('Explain failed:', error);
      process.exit(1);
    }
  });

// ally fix
program
  .command('fix')
  .description('Fix accessibility issues using Copilot CLI agentic mode')
  .option('-i, --input <file>', 'Path to scan results', '.ally/scan.json')
  .option('-s, --severity <level>', 'Filter by severity (critical, serious, moderate, minor)')
  .option('-a, --auto', 'Automatically apply all fixes without prompting')
  .option('-d, --dry-run', 'Show what would be fixed without making changes')
  .action(async (options) => {
    try {
      await fixCommand(options);
    } catch (error) {
      console.error('Fix failed:', error);
      process.exit(1);
    }
  });

// ally report
program
  .command('report')
  .description('Generate accessibility report (ACCESSIBILITY.md)')
  .option('-i, --input <file>', 'Path to scan results', '.ally/scan.json')
  .option('-o, --output <file>', 'Output file path', 'ACCESSIBILITY.md')
  .option('-f, --format <type>', 'Report format (markdown, json, html)', 'markdown')
  .action(async (options) => {
    try {
      await reportCommand(options);
    } catch (error) {
      console.error('Report generation failed:', error);
      process.exit(1);
    }
  });

// ally init
program
  .command('init')
  .description('Initialize ally in your project')
  .option('-f, --force', 'Overwrite existing configuration')
  .option('-H, --hooks', 'Set up pre-commit hooks for accessibility checks')
  .action(async (options) => {
    try {
      await initCommand(options);
    } catch (error) {
      console.error('Initialization failed:', error);
      process.exit(1);
    }
  });

// ally stats
program
  .command('stats')
  .description('Show accessibility progress dashboard')
  .action(async () => {
    try {
      await statsCommand();
    } catch (error) {
      console.error('Stats failed:', error);
      process.exit(1);
    }
  });

// ally badge
program
  .command('badge')
  .description('Generate accessibility score badge for README')
  .option('-i, --input <file>', 'Path to scan results', '.ally/scan.json')
  .option('-f, --format <type>', 'Output format (url, markdown, svg)', 'url')
  .option('-o, --output <file>', 'Save badge to file (primarily for SVG)')
  .action(async (options) => {
    try {
      await badgeCommand(options);
    } catch (error) {
      console.error('Badge generation failed:', error);
      process.exit(1);
    }
  });

// ally watch
program
  .command('watch [path]')
  .description('Watch for file changes and run accessibility scans continuously')
  .option('-d, --debounce <ms>', 'Debounce time in milliseconds', '500')
  .option('--clear', 'Clear console between scans')
  .action(async (path: string | undefined, options) => {
    try {
      const debounce = parseInt(options.debounce, 10);
      if (isNaN(debounce) || debounce < 0) {
        console.error('Error: --debounce must be a non-negative number');
        process.exit(1);
      }
      await watchCommand(path, {
        ...options,
        debounce,
      });
    } catch (error) {
      console.error('Watch failed:', error);
      process.exit(1);
    }
  });

// ally learn
program
  .command('learn [violation-id]')
  .description('Learn about WCAG accessibility criteria in depth')
  .option('-l, --list', 'List all known violation types')
  .action(async (violationId: string | undefined, options) => {
    try {
      await learnCommand(violationId, options);
    } catch (error) {
      console.error('Learn failed:', error);
      process.exit(1);
    }
  });

// ally crawl
program
  .command('crawl <url>')
  .description('Crawl entire website by following links and scan each page')
  .option('-d, --depth <number>', 'Maximum crawl depth', '2')
  .option('-l, --limit <number>', 'Maximum pages to scan', '10')
  .option('--same-origin', 'Only follow links to same origin (default: true)', true)
  .option('--no-same-origin', 'Follow links to any origin')
  .option('-o, --output <dir>', 'Output directory for results', '.ally')
  .action(async (url: string, options) => {
    try {
      // Parse numeric options
      const depth = parseInt(options.depth, 10);
      if (isNaN(depth) || depth < 0) {
        console.error('Error: --depth must be a non-negative number');
        process.exit(1);
      }

      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        console.error('Error: --limit must be a positive number');
        process.exit(1);
      }

      await crawlCommand(url, {
        depth,
        limit,
        sameOrigin: options.sameOrigin,
        output: options.output,
      });
    } catch (error) {
      console.error('Crawl failed:', error);
      process.exit(1);
    }
  });

// ally tree
program
  .command('tree <url>')
  .description('Display accessibility tree for a URL')
  .option('-d, --depth <number>', 'Maximum tree depth to display', '5')
  .option('-r, --role <role>', 'Filter to specific ARIA role')
  .option('-j, --json', 'Output as JSON')
  .action(async (url: string, options) => {
    try {
      const depth = parseInt(options.depth, 10);
      if (isNaN(depth) || depth < 1) {
        console.error('Error: --depth must be a positive number');
        process.exit(1);
      }

      await treeCommand(url, {
        depth,
        role: options.role,
        json: options.json,
      });
    } catch (error) {
      console.error('Tree failed:', error);
      process.exit(1);
    }
  });

// ally triage
program
  .command('triage')
  .description('Interactively categorize and prioritize accessibility issues')
  .option('-i, --input <file>', 'Path to scan results', '.ally/scan.json')
  .action(async (options) => {
    try {
      await triageCommand(options);
    } catch (error) {
      console.error('Triage failed:', error);
      process.exit(1);
    }
  });

// ally pr-check
program
  .command('pr-check')
  .description('Post accessibility results to GitHub PR')
  .option('-i, --input <file>', 'Path to scan results', '.ally/scan.json')
  .option('-p, --pr <number>', 'PR number (auto-detected in GitHub Actions)')
  .option('--no-comment', 'Skip posting PR comment')
  .option('-F, --fail-on <severities>', 'Fail on specified severities (comma-separated)')
  .action(async (options) => {
    try {
      const prNumber = options.pr ? parseInt(options.pr, 10) : undefined;
      await prCheckCommand({
        ...options,
        pr: prNumber,
      });
    } catch (error) {
      console.error('PR check failed:', error);
      process.exit(1);
    }
  });

// ally completion
program
  .command('completion [shell]')
  .description('Generate shell completion script (bash, zsh, fish)')
  .action(async (shell: string | undefined) => {
    try {
      await completionCommand(shell);
    } catch (error) {
      console.error('Completion failed:', error);
      process.exit(1);
    }
  });

// Parse and run
program.parse();
